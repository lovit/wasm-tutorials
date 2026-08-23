"""브라우저 안의 파이썬이 네트워크를 쓰는 여러 길을 나란히 시험한다."""

import socket
import ssl
import time
import urllib.request
from collections.abc import Callable
from urllib.parse import urlparse

import js
import requests
from pyodide.http import open_url, pyfetch

TARGETS = {
    "같은 출처": "/galleries/_shared/base.css",
    "CORS 열린 곳": "https://pypi.org/pypi/jamo/json",
    "CORS 안 열린 곳": "https://example.com/",
}


def brief(exc: Exception) -> str:
    return f"{type(exc).__name__}: {str(exc).partition(chr(0x0A))[0][:110]}"


def host_and_port(url: str) -> tuple[str, int]:
    """주소에서 호스트와 포트를 뽑는다. 상대 경로면 지금 페이지 기준으로 채운다.

    조용한 대체값을 두지 않는다. 못 뽑으면 그렇다고 말하는 편이, 엉뚱한 데를 두드려 놓고
    그 결과를 이 주소의 결과인 양 보여 주는 것보다 낫다.
    """
    if "//" in url:
        text = url
    elif url.startswith("/"):
        text = f"//{js.location.host}{url}"  # 경로만 준 것이니 지금 페이지의 호스트다
    else:
        text = f"//{url}"  # example.com 처럼 호스트만 준 것
    parsed = urlparse(text, scheme=js.location.protocol.rstrip(":"))
    try:
        host, port = parsed.hostname, parsed.port
    except ValueError as exc:
        # urlparse 의 포트 오류 메시지는 우리가 붙인 // 까지 드러내서 읽는 사람을 헷갈리게 한다.
        raise ValueError(f"주소에서 호스트를 못 뽑았습니다: {url}") from exc
    if not host:
        raise ValueError(f"주소에서 호스트를 못 뽑았습니다: {url}")
    return host, port or (443 if parsed.scheme == "https" else 80)


async def try_pyfetch(url: str) -> str:
    """Pyodide 가 주는 길. 브라우저의 fetch 를 그대로 쓴다."""
    response = await pyfetch(url)
    return f"{response.status}, {len(await response.string())}자"


def try_open_url(url: str) -> str:
    """동기로 받는 길. 안쪽은 XMLHttpRequest 다."""
    return f"{len(open_url(url).read())}자"


def try_requests(url: str) -> str:
    """평범한 requests. 314 에서는 urllib3 가 브라우저 쪽으로 우회해 준다."""
    response = requests.get(url, timeout=3)
    return f"{response.status_code}, {len(response.text)}자 ({type(response.raw).__module__})"


def try_urllib(url: str) -> str:
    """표준 라이브러리. 소켓과 TLS 를 거치려 한다."""
    with urllib.request.urlopen(url, timeout=3) as response:
        return f"{response.status}"


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


SYNC_WAYS: dict[str, Callable[[str], str]] = {
    "open_url": try_open_url,
    "requests": try_requests,
    "urllib.request": try_urllib,
    "raw socket": try_socket,
}


async def probe(url: str) -> str:
    """다섯 가지 길로 같은 주소를 두드려 보고 결과를 나란히 적는다."""
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

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(2)
        try:
            sock.connect(("example.com", 80))
            made = "예외 없이 연결된다"
        except Exception as exc:
            made = f"막힘 — {brief(exc)}"
            sent = "연결이 안 됐으니 보내지 않았다"
        else:
            try:
                sock.sendall(b"GET / HTTP/1.0\r\n\r\n")
                sent = "예외 없음"
            except Exception as exc:
                sent = brief(exc)

    # 없는 호스트에도 connect 가 되는 것이 WebSocket 설명의 근거다. 말로만 적지 않고 재 본다.
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as ghost:
        ghost.settimeout(2)
        try:
            ghost.connect(("no-such-host.invalid", 80))
            nowhere = "없는 호스트에도 연결된다"
        except Exception as exc:
            nowhere = f"막힘 — {brief(exc)}"
    lines.append(f"1. 소켓        {made}. {nowhere}")
    lines.append(f"   그런데 보내려 하면 곧바로 막힌다 — {sent}")
    lines.append(
        "   콘솔에 WebSocket connection to 'ws://…' failed 가 남는 것이 그 흔적이다."
    )

    # 컨텍스트 만들기와 감싸기를 갈라 잡는다. 한꺼번에 잡으면 어디서 막혔는지 못 적는다.
    context = ssl.create_default_context()
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as raw:
            context.wrap_socket(raw, server_hostname="example.com")
        tls = "된다"
    except Exception as exc:
        tls = f"컨텍스트는 만들어지는데 감싸는 데서 막힘 — {brief(exc)}"
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
