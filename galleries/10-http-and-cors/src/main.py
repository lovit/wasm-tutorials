"""브라우저 안의 파이썬이 네트워크를 쓰는 여러 길을 나란히 시험한다."""

import socket
import ssl
import time
from collections.abc import Callable

from pyodide.http import open_url, pyfetch

TARGETS = {
    "같은 출처": "/galleries/_shared/base.css",
    "CORS 열린 곳": "https://pypi.org/pypi/jamo/json",
    "CORS 안 열린 곳": "https://example.com/",
}


def brief(exc: Exception) -> str:
    return f"{type(exc).__name__}: {str(exc).partition(chr(10))[0][:110]}"


async def try_pyfetch(url: str) -> str:
    """Pyodide 가 주는 길. 브라우저의 fetch 를 그대로 쓴다."""
    response = await pyfetch(url)
    return f"{response.status}, {len(await response.string())}자"


def try_open_url(url: str) -> str:
    """동기로 받는 길. 안쪽은 XMLHttpRequest 다."""
    return f"{len(open_url(url).read())}자"


def try_requests(url: str) -> str:
    """평범한 requests. 314 에서는 urllib3 가 브라우저 쪽으로 우회해 준다."""
    import requests

    response = requests.get(url, timeout=10)
    return f"{response.status_code}, {len(response.text)}자 ({type(response.raw).__module__})"


def try_urllib(url: str) -> str:
    """표준 라이브러리. 소켓과 TLS 를 거치려 한다."""
    import urllib.request

    with urllib.request.urlopen(url, timeout=10) as response:
        return f"{response.status}"


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


SYNC_WAYS: dict[str, Callable[[str], str]] = {
    "open_url": try_open_url,
    "requests": try_requests,
    "urllib.request": try_urllib,
    "raw socket": try_socket,
}


async def probe(url: str) -> str:
    """네 가지 길로 같은 주소를 두드려 보고 결과를 나란히 적는다."""
    lines = []

    started = time.monotonic()
    try:
        result = await try_pyfetch(url)
        lines.append(
            f"pyfetch          {result}  ({(time.monotonic() - started) * 1000:.0f} ms)"
        )
    except Exception as exc:
        lines.append(f"pyfetch          실패 — {brief(exc)}")

    for name, fn in SYNC_WAYS.items():
        started = time.monotonic()
        try:
            result = fn(url)
            lines.append(
                f"{name:<16} {result}  ({(time.monotonic() - started) * 1000:.0f} ms)"
            )
        except Exception as exc:
            lines.append(f"{name:<16} 실패 — {brief(exc)}")

    return "\n".join(lines)


def layers() -> str:
    """무엇이 어디서 막히는지 층으로 정리한다."""
    lines = ["아래에서 위로 쌓인다. 아래가 막히면 그 위도 다 막힌다.", ""]

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(2)
    try:
        sock.connect(("example.com", 80))
        made = "예외 없이 연결된 것처럼 보인다"
    except Exception as exc:
        made = f"막힘 — {brief(exc)}"
    finally:
        sock.close()
    lines.append(f"1. 소켓        {made}")
    lines.append("   그런데 보내고 받으려 하면 아무것도 오지 않고 시간만 흐른다.")

    try:
        context = ssl.create_default_context()
        raw = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        context.wrap_socket(raw, server_hostname="example.com")
        tls = "된다"
    except Exception as exc:
        tls = f"막힘 — {brief(exc)}"
    lines.append(f"2. TLS         {tls}")
    lines.append(f"   ssl.OPENSSL_VERSION 이 {ssl.OPENSSL_VERSION!r} 이다.")

    lines.append("3. http.client / urllib.request   위 둘을 쓰므로 함께 막힌다")
    lines.append("4. requests    urllib3 가 브라우저 쪽으로 우회해서 돈다")
    lines.append("5. pyfetch     처음부터 브라우저의 fetch 다")
    return "\n".join(lines)


def missing() -> str:
    """네트워크 말고도 없는 것들."""
    lines = []
    for label, fn in [
        ("프로세스 만들기", _try_subprocess),
        ("스레드 만들기", _try_thread),
    ]:
        try:
            lines.append(f"{label}: {fn()}")
        except Exception as exc:
            lines.append(f"{label}: 막힘 — {brief(exc)}")
    return "\n".join(lines)


def _try_subprocess() -> str:
    import subprocess

    subprocess.run(["ls"], check=False)
    return "된다"


def _try_thread() -> str:
    import threading

    thread = threading.Thread(target=lambda: None)
    thread.start()
    return "된다"
