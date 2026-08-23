# 02. CPython 을 브라우저로 옮기기

[앞 문서](01-how-wasm-works.md)가 WASM 이라는 바닥을 봤다면, 이 문서는 그 위에 파이썬을 어떻게 세웠는지를 본다.

> 이 문서의 측정값은 Chrome 151.0.7922.34 (headless, macOS) 에서 2026-08-23 에 Pyodide 314.0.5 로 잰 것이다.

## 반은 컴파일, 반은 흉내다

CPython 은 C 로 쓰여 있다. C 를 WASM 으로 바꿔 주는 도구가 Emscripten 이고, 그래서 "CPython 을 Emscripten 으로 빌드한 것" 이 Pyodide 다. 이렇게만 말하면 컴파일러 이야기로 들리는데, 실제로는 그게 절반이다.

나머지 절반은 **없는 운영체제를 자바스크립트로 흉내 내는 일** 이다. CPython 소스에는 파일을 열고, 시간을 재고, 환경변수를 읽고, 프로세스를 만드는 코드가 잔뜩 들어 있다. 브라우저에는 그런 게 없다. Emscripten 은 그 자리마다 자바스크립트 구현을 끼워 넣는다. `open()` 을 부르면 진짜 파일이 아니라 자바스크립트 객체를 뒤진다.

그래서 파이썬은 자기가 유닉스 위에 있다고 믿는다. 물어보면 이렇게 답한다.

```text
os.name                 posix
os.uname()              sysname='Emscripten', nodename='emscripten', release='5.0.3', machine='wasm32'
platform.machine()      wasm32
sysconfig EXT_SUFFIX    .cpython-314-wasm32-emscripten.so
```

`sys.platform` 이 `emscripten` 으로 나오는 것을 [01. 처음 만나는 Pyodide](../../galleries/01-hello-pyodide/) 에서 봤다. 리눅스도 macOS 도 아닌 제3의 운영체제 이름이 하나 더 있는 셈이고, 파이썬 입장에서는 그게 사실이다.

## 파일시스템은 메모리 위의 흉내다

기본 파일시스템은 MEMFS 다. 이름 그대로 메모리 위에 만든 것이고, 파이썬에서 보면 진짜와 구별되지 않는다.

```text
/ 아래           ['dev', 'home', 'lib', 'proc', 'tmp']
os.statvfs('/')  f_bsize=4096, f_frsize=4096, f_blocks=1000…
/proc 있나        True
```

블록 크기까지 그럴듯하게 답한다. 다만 흉내의 깊이는 얕다. `/proc` 안에 들어가 보면 `['self']` 하나뿐이다.

그리고 새로고침하면 전부 사라진다. 애초에 디스크에 닿은 적이 없기 때문이다.

[08. 파일 다루기](../../galleries/08-file-system/) 가 이 지점을 다룬다. 남기고 싶으면 IndexedDB 위에 얹힌 IDBFS 를 마운트하고 `FS.syncfs()` 를 직접 불러야 한다. 자동으로 되지 않는다. 자동으로 하려면 파이썬이 쓸 때마다 비동기 저장을 기다려야 하는데, 동기 함수인 `write()` 안에서 그럴 방법이 없다.

## 없는 것들

브라우저에 없는 것은 파이썬에도 없다. 무엇이 어떻게 없는지를 직접 물어봤다.

| 부른 것                      | 결과                                                          |
| ---------------------------- | ------------------------------------------------------------- |
| `os.fork()`                  | `OSError: [Errno 52] Function not implemented`                |
| `subprocess.run(["ls"])`     | `OSError: [Errno 138] emscripten does not support processes.` |
| `threading` 으로 스레드 시작 | `RuntimeError: can't start new thread`                        |
| `socket` 으로 주고받기       | `TimeoutError` 또는 `BlockingIOError`                         |
| `SSLContext.wrap_socket()`   | `RuntimeError: TLS not supported in this environment`         |
| `ssl.wrap_socket`            | `AttributeError` — 3.12 에서 없어진 함수다                    |
| `import resource`            | `ModuleNotFoundError`                                         |
| `signal.alarm`               | `AttributeError`                                              |
| `os.cpu_count()`             | `1`                                                           |

여기서 하나가 다른 것들과 성격이 다르다. **`os.system("ls")` 는 예외를 내지 않고 `-1` 을 돌려준다.** 셸에서 명령이 실패했을 때와 똑같은 모양이라, 명령이 없거나 실패한 줄 알기 쉽다. 실제로는 명령을 실행할 수단 자체가 없다.

[10. 왜 requests 가 안 되는가](../../galleries/10-http-and-cors/) 의 소켓도 같은 종류의 함정이다. `connect()` 가 예외 없이 성공한다. 없는 호스트에 대고 해도 성공한다. Emscripten 이 소켓 자리에 WebSocket 을 열어 두기 때문이고, 콘솔에 `WebSocket connection to 'ws://…' failed` 가 남는 것이 그 흔적이다. 막히는 것은 주고받으려는 순간이다.

이 두 가지가 브라우저 파이썬을 다룰 때 가장 조심할 자리다. 깨끗하게 "못 한다" 고 말해 주는 것들은 오히려 쉽다. 트레이스백에 이유가 적혀 있으니 그대로 읽으면 된다. 어려운 것은 되는 척하는 쪽이다.

## 그런데 되는 것도 있다

없는 것만 나열하면 실제보다 나쁘게 들린다. 흉내가 제법 잘 되는 것도 있다.

```text
mmap.mmap(-1, 16)       <mmap.mmap closed=False, length=16, …>
select.select([],[],[],0)  ([], [], [])
os.getpid()             42
time.tzname             ('UTC+0900', 'UTC+0900')
```

`mmap` 은 익명 매핑이라면 된다. 어차피 선형 메모리 안에서 자리를 잡는 일이라 흉내 낼 것이 별로 없다. `os.getpid()` 는 42 를 준다 — 프로세스가 없으니 지어낸 값이지만, 그 값을 로그 파일 이름에나 쓰는 코드는 아무 일 없이 돈다.

시간대가 `UTC+0900` 으로 나온 것은 눈여겨볼 만하다. 브라우저의 시간대를 읽어 파이썬에 심어 주는 `pyodide-unix-timezones` 가 하는 일이다. 정말 따라가는지 브라우저 쪽 시간대를 바꿔 가며 확인했다.

| 브라우저 시간대  | `time.tzname`              | 파이썬이 본 시각 |
| ---------------- | -------------------------- | ---------------- |
| Asia/Seoul       | `('UTC+0900', 'UTC+0900')` | 23:10            |
| Europe/Berlin    | `('UTC+0100', 'UTC+0200')` | 16:10            |
| America/New_York | `('UTC-0500', 'UTC-0400')` | 10:10            |

베를린과 뉴욕에서 이름이 두 개로 갈리는 것이 눈에 띈다. 표준시와 서머타임이다. 오프셋 하나만 받아 적은 것이 아니라 진짜 시간대 데이터를 심는다는 뜻이다. `os.environ["TZ"]` 는 계속 비어 있으니 환경변수로 넘기는 방식도 아니다.

## 이 층이 예제로 어떻게 드러나는가

| 이 문서의 이야기 | 확인한 예제 |
| --- | --- |
| `sys.platform == "emscripten"` | [01. 처음 만나는 Pyodide](../../galleries/01-hello-pyodide/) |
| 트레이스백이 그대로 살아 있다 | [03. 찍고 읽고 터뜨리기](../../galleries/03-stdout-and-errors/) |
| 파이썬 객체는 WASM 힙 안에 있다 | [05. 손잡이의 수명](../../galleries/05-pyproxy-lifetime/) |
| MEMFS 는 새로고침에 사라진다 | [08. 파일 다루기](../../galleries/08-file-system/) |
| 네이티브 확장은 이 ABI 로 빌드돼야 한다 | [09. PyPI 에서 설치하기](../../galleries/09-packages-micropip/) |
| 소켓, TLS, 스레드, 프로세스가 없다 | [10. 왜 requests 가 안 되는가](../../galleries/10-http-and-cors/) |

## 다음

- [01. WebAssembly 는 어떻게 도는가](01-how-wasm-works.md) — 이 아래층
- [패키지 목록](../packages.md) — 어떤 패키지가 이 ABI 로 빌드돼 있는가
- [용어 대응표](../glossary.md)
