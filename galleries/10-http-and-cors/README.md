# 10. 왜 requests 가 안 되는가

같은 주소를 다섯 가지 길로 두드려 보고, 무엇이 어디서 막히는지 층으로 갈라 본다.

![예제 화면. 어디로 보낼까 상자에 같은 출처·CORS 열린 곳·CORS 안 열린 곳 세 주소가 라디오로 있고 주소 입력칸이 그 아래 있다. 두드려 본 결과에는 pyfetch 가 200 에 10287자, open_url 도 10287자, requests 도 200 에 10287자이며 urllib3.contrib.emscripten.response 를 썼다고 나온다. urllib.request 는 TLS not supported in this environment 로, raw socket 은 timed out 으로 실패했다. 아래 층으로 갈라 보기에는 소켓이 예외 없이 연결된 것처럼 보이지만 주고받으면 시간만 흐른다는 것, TLS 가 막혔고 OPENSSL_VERSION 이 OpenSSL (stub) 이라는 것, 그 위의 http.client 와 urllib.request 도 함께 막힌다는 것, requests 는 urllib3 가 우회해 돈다는 것이 다섯 줄로 적혀 있다.](screenshot.png)

> 이 문서의 측정값은 Chrome 151.0.7922.34 (headless, macOS) 에서 2026-08-23 에 Pyodide 314.0.5, requests 2.33.1, urllib3 2.6.3 으로 확인한 것이다.

## 무엇을 배우나

- 브라우저 안의 파이썬은 소켓을 쓸 수 없다. 그 위에 선 것들이 함께 막힌다
- `ssl` 은 스텁이다. 진짜 TLS 를 못 한다
- `requests` 는 이제 그냥 된다. urllib3 가 브라우저 쪽으로 우회해 주기 때문이다
- CORS 가 열려 있느냐가 되고 안 되고를 가른다

## 실행 방법

```bash
mise run serve
```

브라우저로 `http://localhost:4173/galleries/10-http-and-cors/` 를 연다. 주소를 골라 두드려 보면 된다.

## 핵심 코드

### 1. requests 는 이제 그냥 된다

이 예제의 제목이 낡았다. 널리 퍼진 이야기는 "브라우저에서는 `requests` 가 안 되니 `pyodide_http.patch_all()` 을 불러야 한다" 인데, Pyodide 314.0.5 에서는 아무것도 안 해도 된다.

```python
def try_requests(url: str) -> str:
    """평범한 requests. 314 에서는 urllib3 가 브라우저 쪽으로 우회해 준다."""
    import requests

    response = requests.get(url, timeout=10)
    return f"{response.status_code}, {len(response.text)}자 ({type(response.raw).__module__})"
```

응답 객체가 어디서 왔는지 함께 찍어 보면 이유가 드러난다.

```text
requests         200, 10287자 (urllib3.contrib.emscripten.response)  (4 ms)
```

`urllib3.contrib.emscripten` 이다. urllib3 가 Emscripten 전용 통로를 갖게 되면서, 소켓 대신 브라우저의 fetch 와 XMLHttpRequest 로 나간다. `requests` 는 urllib3 위에 서 있으니 덩달아 된다.

`pyodide_http` 는 이 일이 있기 전에 같은 문제를 밖에서 풀던 도구다. 지금도 있고 쓸 수 있지만, 새로 쓰는 코드에는 필요 없다.

### 2. 그런데 urllib.request 는 안 된다

같은 표준 라이브러리인데 이쪽은 막힌다.

```python
def try_urllib(url: str) -> str:
    """표준 라이브러리. 소켓과 TLS 를 거치려 한다."""
    import urllib.request

    with urllib.request.urlopen(url, timeout=10) as response:
        return f"{response.status}"
```

```text
urllib.request   실패 — RuntimeError: TLS not supported in this environment
```

`urllib.request` 는 `http.client` 를 쓰고, `http.client` 는 소켓과 `ssl` 을 쓴다. 그 아래가 막혀 있으니 함께 막힌다. urllib3 처럼 우회로를 따로 만든 것이 아니다.

### 3. 진짜 벽은 소켓이다

가장 아래층을 직접 두드려 보면 이상한 일이 벌어진다.

```python
def try_socket(url: str) -> str:
    """가장 낮은 층. 여기가 진짜 벽이다."""
    host = url.split("//")[-1].split("/")[0] or "example.com"
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(3)
    try:
        sock.connect((host, 80))
        sock.sendall(f"GET / HTTP/1.0\r\nHost: {host}\r\n\r\n".encode())
        data = sock.recv(64)
        return f"{len(data)}바이트 받음"
    finally:
        sock.close()
```

**`connect()` 도 `sendall()` 도 예외를 내지 않는다.** 그런데 `recv()` 에서 시간만 흐른다.

```text
raw socket       실패 — TimeoutError: timed out
```

이게 이 예제에서 가장 조심할 자리다. 깨끗하게 "못 한다" 고 말해 주면 그 자리에서 알아챌 텐데, 되는 척하다가 멈춘다. 소켓을 쓰는 라이브러리를 브라우저로 옮기면 오류가 아니라 정지로 나타난다. 타임아웃을 안 걸어 뒀으면 영영 기다린다.

### 4. TLS 는 스텁이다

```python
        context = ssl.create_default_context()
        raw = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        context.wrap_socket(raw, server_hostname="example.com")
```

`create_default_context()` 까지는 된다. `SSLContext` 객체가 나온다. 그런데 감싸려 하면 막힌다.

```text
RuntimeError: TLS not supported in this environment
ssl.OPENSSL_VERSION 이 'OpenSSL (stub)' 이다.
```

Pyodide 314 부터 OpenSSL 을 빼고 껍데기만 남겼다. 상수와 클래스는 있어서 `import ssl` 도 되고 설정도 되는데, 실제로 암호를 다루려는 순간 거절한다. 여기서도 "있는 것처럼 보이다가 안 되는" 모양이다.

굳이 이렇게 둔 까닭이 있다. `import ssl` 이 실패하면 그것을 조건부로 import 하는 수많은 라이브러리가 통째로 못 올라온다. 껍데기를 남겨 두면 TLS 를 실제로 쓰지 않는 코드 경로는 그대로 돌아간다.

### 5. 층으로 보면 이렇다

```text
1. 소켓        예외 없이 연결된 것처럼 보인다
   그런데 보내고 받으려 하면 아무것도 오지 않고 시간만 흐른다.
2. TLS         막힘 — RuntimeError: TLS not supported in this environment
   ssl.OPENSSL_VERSION 이 'OpenSSL (stub)' 이다.
3. http.client / urllib.request   위 둘을 쓰므로 함께 막힌다
4. requests    urllib3 가 브라우저 쪽으로 우회해서 돈다
5. pyfetch     처음부터 브라우저의 fetch 다
```

규칙은 하나다. **브라우저가 대신 보내 주는 길만 열려 있다.** 파이썬이 직접 선을 잡으려 하면 막힌다.

그래서 고를 것은 셋뿐이다. 비동기가 괜찮으면 `pyfetch`, 동기여야 하면 `open_url`, 기존 코드를 그대로 옮기고 싶으면 `requests`.

### 6. CORS 가 나머지를 가른다

브라우저가 대신 보내 주는 길이라는 말은, 브라우저의 규칙을 그대로 따른다는 뜻이다. 그중 가장 자주 걸리는 것이 CORS 다. Chrome 151 에서 확인한 결과다.

| 주소 | pyfetch | open_url | requests | urllib.request | raw socket |
| --- | --- | --- | --- | --- | --- |
| 같은 출처 | 200 | 된다 | 주소에 스킴이 없다며 거절 | 같은 이유로 거절 | 시간 초과 |
| CORS 열린 곳 | 200 | 된다 | 200 | TLS 막힘 | 시간 초과 |
| CORS 안 열린 곳 | `AbortError: Failed to fetch` | `NetworkError` | `ConnectionError` | TLS 막힘 | 시간 초과 |

CORS 에 막히면 세 통로가 저마다 다른 오류를 낸다. 공통점은 **왜 막혔는지 파이썬 쪽에서 알 수 없다는 것**이다. 브라우저는 보안상 그 이유를 스크립트에 알려 주지 않는다. 개발자 도구 콘솔에만 진짜 이유가 찍힌다.

```text
Access to fetch at 'https://example.com/' from origin 'http://127.0.0.1:4173' has been blocked by CORS policy
```

그래서 이 예제를 "CORS 안 열린 곳" 으로 돌리면 콘솔에 빨간 줄이 남는다. 고장이 아니라 이 예제가 보여 주려는 것이다.

같은 출처 주소에서 `requests` 가 거절하는 것도 눈여겨보자. 상대 경로에는 스킴이 없어서다. 브라우저 쪽 통로인 `pyfetch` 와 `open_url` 은 상대 경로를 현재 주소 기준으로 풀어 주는데, `requests` 는 그러지 않는다.

## 직접 해볼 것

- 세 주소를 차례로 두드려 보자. 다섯 통로가 각각 어떻게 갈리는지 표로 확인한다
- "CORS 안 열린 곳" 을 돌리고 개발자 도구 콘솔을 보자. 화면의 오류보다 훨씬 자세하다
- 주소칸에 아무 사이트나 넣어 보자. 대부분 CORS 에 막힌다. 열어 둔 API 는 드물다
- `src/main.py` 의 `try_socket` 에서 `settimeout(3)` 을 지우고 돌려 보자. 영영 기다린다
- "층으로 갈라 보기" 를 눌러 보자. 소켓이 연결된 것처럼 보이는 것을 확인한다
- "없는 것들" 을 눌러 보자. 프로세스와 스레드도 못 만든다
- 09번에서 `micropip` 이 PyPI 에 물어보던 것을 떠올리자. 그게 되는 이유가 여기 있다

## 막히는 지점

| 증상 | 원인 |
| --- | --- |
| `TLS not supported in this environment` | `ssl` 이 스텁이다. 소켓 기반 통로 대신 `pyfetch` 나 `requests` 를 쓰자 |
| 요청이 응답 없이 멈춘다 | 소켓을 쓰는 길이다. 예외 대신 정지로 나타난다 |
| `AbortError: Failed to fetch` | CORS 에 막혔다. 콘솔에 진짜 이유가 있다 |
| 상대 경로가 `requests` 에서 안 된다 | 스킴이 없다. `pyfetch` 나 `open_url` 을 쓰거나 절대 주소로 쓰자 |
| `pyodide_http.patch_all()` 을 불러야 하나 | 314 에서는 필요 없다. urllib3 가 이미 우회한다 |
| `threading` 이나 `subprocess` 가 안 된다 | 브라우저에 스레드도 프로세스도 없다. 워커는 17번에서 다룬다 |

## 더 읽을 것

브라우저에서 무엇이 왜 없는지는 [원리 문서](../../docs/tutorials/README.md)에서 다룬다.

## 여기까지

기초편 열 개가 끝났다. 여기까지 오면 이런 것들을 안다.

- 런타임을 띄우고 그 대가가 얼마인지 (01, 02)
- 출력과 오류를 화면으로 돌리는 법 (03)
- 값이 오가는 규칙과 손잡이의 수명 (04, 05)
- 파이썬으로 화면을 만지고 함수를 주고받는 법 (06, 07)
- 파일을 다루고 패키지를 얹고 네트워크를 쓰는 법 (08, 09, 10)

관통하는 것이 하나 있다. **브라우저 안의 파이썬은 파이썬이 아니라 브라우저의 규칙을 따른다.** 손잡이를 놓아 줘야 하는 것도, 파일이 새로고침에 사라지는 것도, 소켓이 조용히 멈추는 것도 전부 같은 이야기다. 파이썬 문법은 그대로인데 그 아래가 다르다.

응용편에서는 이것들 위에 실제로 쓸 만한 것을 얹는다. [갤러리 목록](../)으로 돌아가자.
