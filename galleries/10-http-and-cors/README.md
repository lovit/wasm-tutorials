# 10. 왜 requests 가 안 되는가

같은 주소를 다섯 가지 길로 두드려 보고, 무엇이 어디서 막히는지 층으로 갈라 본다.

![예제 화면. 어디로 보낼까 상자에 같은 출처·CORS 열린 곳·CORS 안 열린 곳 세 주소가 라디오로 있고 주소 입력칸이 그 아래 있다. 두드려 본 결과에는 pyfetch 가 200 에 10287자, open_url 도 10287자, requests 도 200 에 10287자이며 urllib3.contrib.emscripten.response 를 썼다고 나온다. urllib.request 는 TLS not supported in this environment 로, raw socket 은 TimeoutError 로 실패했다. 아래 층으로 갈라 보기에는 소켓이 없는 호스트에도 예외 없이 연결되지만 보내려 하면 곧바로 TimeoutError 가 나고 콘솔에 WebSocket connection to ws:// failed 가 남는다는 것, TLS 는 컨텍스트까지는 만들어지고 감싸는 데서 막히며 OPENSSL_VERSION 이 OpenSSL (stub) 이라는 것, 그 위의 http.client 와 urllib.request 도 함께 막힌다는 것, requests 는 urllib3 가 우회해 돈다는 것이 다섯 줄로 적혀 있다.](screenshot.png)

> 이 문서의 측정값은 Chrome 151.0.7922.34 (headless, macOS) 에서 2026-08-23 에 Pyodide 314.0.5, requests 2.33.1, urllib3 2.6.3 으로 확인한 것이다.

## 무엇을 배우나

- 브라우저 안의 파이썬은 소켓을 쓸 수 없다. `connect()` 는 되는 척하고 주고받는 데서 막힌다
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

    response = requests.get(url, timeout=3)
    return f"{response.status_code}, {len(response.text)}자 ({type(response.raw).__module__})"
```

응답 객체가 어디서 왔는지 함께 찍어 보면 이유가 드러난다.

```text
requests         200, 10287자 (urllib3.contrib.emscripten.response)  (345 ms)
```

걸린 시간은 볼 때마다 다르다. 처음 한 번은 300ms 를 넘고 그다음부터는 한 자릿수로 떨어진다. urllib3 가 Emscripten 통로를 처음 쓸 때 준비하는 몫이라, 이 예제에서 유의미한 것은 숫자가 아니라 괄호 안이다.

`urllib3.contrib.emscripten` 이다. urllib3 가 Emscripten 전용 통로를 갖게 되면서, 소켓 대신 브라우저의 fetch 와 XMLHttpRequest 로 나간다. `requests` 는 urllib3 위에 서 있으니 덩달아 된다.

`pyodide_http` 는 이 일이 있기 전에 같은 문제를 밖에서 풀던 도구다. 지금도 있고 쓸 수 있지만, 새로 쓰는 코드에는 필요 없다.

### 2. 그런데 urllib.request 는 안 된다

같은 표준 라이브러리인데 이쪽은 막힌다.

```python
def try_urllib(url: str) -> str:
    """표준 라이브러리. 소켓과 TLS 를 거치려 한다."""
    import urllib.request

    with urllib.request.urlopen(url, timeout=3) as response:
        return f"{response.status}"
```

```text
urllib.request   실패 — RuntimeError: TLS not supported in this environment
```

`urllib.request` 는 `http.client` 를 쓰고, `http.client` 는 소켓과 `ssl` 을 쓴다. 그 아래가 막혀 있으니 함께 막힌다. urllib3 처럼 우회로를 따로 만든 것이 아니다.

### 3. connect() 는 성공한다. 그게 함정이다

가장 아래층을 직접 두드려 보면 이상한 일이 벌어진다.

```python
def try_socket(url: str) -> str:
    """가장 낮은 층. 여기가 진짜 벽이다."""
    host, port = host_and_port(url)
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(3)
        # connect 는 예외를 내지 않는다. 뒤에서 WebSocket 을 열고 그것을 소켓인 척한다.
        # 주고받으려는 순간에야 막힌다.
        sock.connect((host, port))
        sock.sendall(f"GET / HTTP/1.0\r\nHost: {host}\r\n\r\n".encode())
        return f"{len(sock.recv(64))}바이트 받음"
```

**`connect()` 가 예외를 내지 않는다.** 없는 호스트에 대고 해도 그렇다.

```text
[없는 호스트]
  connect: 예외 없음 (0ms)
```

Emscripten 이 소켓 자리에 WebSocket 을 대신 열어 주기 때문이다. 콘솔을 보면 흔적이 남는다.

```text
WebSocket connection to 'ws://example.com/' failed: WebSocket is closed before the connection is established
```

그러니 상대편이 WebSocket 서버가 아닌 이상 아무것도 오갈 수 없다. 막히는 것은 주고받으려는 순간이고, 기다리지는 않는다.

| 타임아웃 | `connect()` | `sendall()` | `recv()` |
| --- | --- | --- | --- |
| 3초로 걸어 둠 | 예외 없음 (4 ms) | `TimeoutError: timed out` (0 ms) | 여기까지 못 온다 |
| 안 걸어 둠 | 예외 없음 (0 ms) | 예외 없음 (0 ms) | `BlockingIOError: Resource temporarily unavailable` (0 ms) |

둘 다 0 ms 다. 타임아웃 값과 상관없이 곧바로 끝난다.

이게 이 예제에서 가장 조심할 자리다. 깨끗하게 "못 한다" 고 말해 주면 그 자리에서 알아챌 텐데, 연결은 됐다고 해 놓고 주고받는 순간 정체 모를 오류를 낸다. 소켓을 쓰는 라이브러리를 브라우저로 옮기면 `TimeoutError` 나 `BlockingIOError` 로 나타나므로, 네트워크가 느린 줄 알고 엉뚱한 데를 짚기 쉽다.

### 4. TLS 는 스텁이다

```python
    context = ssl.create_default_context()
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as raw:
            context.wrap_socket(raw, server_hostname="example.com")
```

`create_default_context()` 까지는 된다. `SSLContext` 객체가 나온다. 그런데 감싸려 하면 막힌다.

```text
RuntimeError: TLS not supported in this environment
ssl.OPENSSL_VERSION 이 'OpenSSL (stub)' 이다.
```

Pyodide 314 부터 OpenSSL 을 빼고 껍데기만 남겼다. 상수와 클래스는 있어서 `import ssl` 도 되고 설정도 되는데, 실제로 암호를 다루려는 순간 거절한다. 여기서도 "있는 것처럼 보이다가 안 되는" 모양이다.

왜 이렇게 뒀는지는 두 갈래다. OpenSSL 을 뺀 것은 용량 때문이다. 314.0.0 릴리스 노트가 `ssl` 을 쓸 때 3MB 넘게 아낀다고 적고 있다. 그러고도 껍데기를 남긴 것은 호환 때문이다. Pyodide 안의 `_ssl.py` 에 이렇게 적혀 있다.

```text
Provides stub implementations of the _ssl C extension module so that code
importing from _ssl does not fail. Actual SSL operations are not supported.
```

`import ssl` 이 실패하면 그것을 조건부로 import 하는 수많은 라이브러리가 통째로 못 올라온다. 껍데기를 남겨 두면 TLS 를 실제로 쓰지 않는 코드 경로는 그대로 돌아간다.

### 5. 층으로 보면 이렇다

```text
1. 소켓        예외 없이 연결된다. 없는 호스트에도 그렇다
   그런데 보내려 하면 곧바로 막힌다 — TimeoutError: timed out
   콘솔에 WebSocket connection to 'ws://…' failed 가 남는 것이 그 흔적이다.
2. TLS         컨텍스트는 만들어지는데 감싸는 데서 막힘 — RuntimeError: TLS not supported in this environment
   ssl.OPENSSL_VERSION 이 'OpenSSL (stub)' 이다.
3. http.client / urllib.request   위 둘을 쓰므로 함께 막힌다
4. requests    urllib3 가 브라우저 쪽으로 우회해서 돈다
5. pyfetch     처음부터 브라우저의 fetch 다
```

규칙은 하나다. **브라우저가 대신 보내 주는 길만 열려 있다.** 파이썬이 직접 선을 잡으려 하면 막힌다.

그래서 고를 것은 셋뿐이다. 비동기가 괜찮으면 `pyfetch`, 동기여야 하면 `open_url`, 기존 코드를 그대로 옮기고 싶으면 `requests`.

다만 뒤의 둘은 동기라서 응답이 올 때까지 화면이 멈춘다. 이 예제도 두드리는 동안 잠깐 얼어 있다. 그래서 `timeout` 을 3초로 잡아 뒀는데, 그 말은 최악의 경우 3초 동안 아무것도 못 누른다는 뜻이다. 워커로 빼는 이야기는 [17. 워커로 옮기기](../17-web-worker/)에서 한다.

### 6. CORS 가 나머지를 가른다

브라우저가 대신 보내 주는 길이라는 말은, 브라우저의 규칙을 그대로 따른다는 뜻이다. 그중 가장 자주 걸리는 것이 CORS 다. Chrome 151 에서 확인한 결과다.

| 주소 | pyfetch | open_url | requests | urllib.request | raw socket |
| --- | --- | --- | --- | --- | --- |
| 같은 출처 | 200 | 된다 | 주소에 스킴이 없다며 거절 | 같은 이유로 거절 | `TimeoutError` |
| CORS 열린 곳 | 200 | 된다 | 200 | TLS 막힘 | `TimeoutError` |
| CORS 안 열린 곳 | `AbortError: Failed to fetch` | `NetworkError` | `ConnectionError` | TLS 막힘 | `TimeoutError` |

CORS 에 막히면 세 통로가 저마다 다른 오류를 낸다. 공통점은 **왜 막혔는지 파이썬 쪽에서 알 수 없다는 것**이다. 브라우저는 보안상 그 이유를 스크립트에 알려 주지 않는다. 개발자 도구 콘솔에만 진짜 이유가 찍힌다.

```text
Access to fetch at 'https://example.com/' from origin 'http://127.0.0.1:4173' has been blocked by CORS policy
```

그래서 이 예제를 "CORS 안 열린 곳" 으로 돌리면 콘솔에 빨간 줄이 남는다. 고장이 아니라 이 예제가 보여 주려는 것이다.

어느 주소를 고르든 노란 줄도 하나 남는다. 소켓을 두드리느라 생긴 `WebSocket connection to 'ws://…' failed` 다. §3 에서 본 그것이다.

같은 출처 주소에서 `requests` 가 거절하는 것도 눈여겨보자. 상대 경로에는 스킴이 없어서다. 브라우저 쪽 통로인 `pyfetch` 와 `open_url` 은 상대 경로를 현재 주소 기준으로 풀어 주는데, `requests` 는 그러지 않는다.

## 직접 해볼 것

- 세 주소를 차례로 두드려 보자. 다섯 통로가 각각 어떻게 갈리는지 표로 확인한다
- "CORS 안 열린 곳" 을 돌리고 개발자 도구 콘솔을 보자. 화면의 오류보다 훨씬 자세하다
- 주소칸에 아무 사이트나 넣어 보자. 대부분 CORS 에 막힌다. 열어 둔 API 는 드물다
- `src/main.py` 의 `try_socket` 에서 `settimeout(3)` 을 지우고 돌려 보자. `TimeoutError` 대신 `BlockingIOError` 가 난다. 어느 쪽이든 기다리지는 않는다
- 콘솔을 열어 둔 채 아무 주소나 두드려 보자. 소켓이 두드린 호스트가 `ws://` 로 찍힌다
- "층으로 갈라 보기" 를 눌러 보자. 소켓이 연결되고 보내는 데서 막히는 것을 확인한다
- "없는 것들" 을 눌러 보자. 프로세스와 스레드도 못 만든다
- 09번에서 `micropip` 이 PyPI 에 물어보던 것을 떠올리자. 그게 되는 이유가 여기 있다

## 막히는 지점

| 증상 | 원인 |
| --- | --- |
| `TLS not supported in this environment` | `ssl` 이 스텁이다. 소켓 기반 통로 대신 `pyfetch` 나 `requests` 를 쓰자 |
| `connect()` 는 됐는데 `sendall`/`recv` 에서 터진다 | 소켓 자리에 WebSocket 이 열린 것이다. 소켓을 쓰는 길은 브라우저에 없다 |
| 두드리는 동안 화면이 멈춘다 | `open_url` 과 `requests` 는 동기다. 워커는 17번에서 다룬다 |
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
