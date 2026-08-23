"""양쪽으로 함수를 넘겨 본다.

report 는 자바스크립트 쪽에서 registerJsModule 로 만들어 준 모듈이다.
js 의 속성이 아니라 최상위 모듈이라서 `import report` 로 가져온다.
"""

import sys
from collections.abc import Callable
from typing import Any

import js
import report
from pyodide.ffi import JsException, create_once_callable, create_proxy, to_js

# 만들어 둔 프록시. 놓아 주려면 어딘가에 담아 둬야 한다.
# once 로 만든 것도 담는다. 부르면 알아서 놓이지만, 부르지 않고 버리면 GC 가 걷어 갈
# 때까지 남는다. 결정적으로 놓으려면 우리가 들고 있어야 한다.
_made: list[Any] = []


def greet(name: str, greeting: str = "안녕", excited: bool = False) -> str:
    """자바스크립트가 부를 파이썬 함수. 기본값 있는 인자가 있다."""
    mark = "!" if excited else "."
    return f"{greeting}, {name}{mark}"


def hand_over(kind: str) -> None:
    """세 가지 방법으로 손잡이를 만들어 자바스크립트에게 맡긴다.

    반환하지 않고 인자로 넘기는 것이 중요하다. 인자로 넘긴 파이썬 객체는 그 호출이
    끝나면 자동으로 회수되는 빌린 손잡이다. 반환값으로 넘기면 그렇지 않다.
    """
    if kind == "plain":
        # 감싸지 않고 그냥 넘긴다. report.remember 가 끝나는 순간 회수된다.
        report.remember(greet)
        return

    handle = create_once_callable(greet) if kind == "once" else create_proxy(greet)
    _made.append(handle)
    report.remember(handle)


def return_handle() -> Callable[..., str]:
    """같은 함수를 반환값으로 넘긴다. 이건 빌린 것이 아니라 넘겨준 것이다."""
    return greet


def release_all() -> str:
    """모아 둔 프록시를 전부 놓는다.

    once 는 이미 불렸으면 그때 스스로 놓였다. 그런 것에 다시 destroy 를 부르면
    던지므로 세지 않고 넘긴다.
    """
    released = 0
    already = 0
    for handle in _made:
        try:
            handle.destroy()
            released += 1
        except Exception:
            already += 1
    _made.clear()
    return f"{released}개를 놓았고 {already}개는 이미 놓여 있었습니다"


def greet_refcount() -> int:
    """greet 을 가리키는 참조 수. 손잡이가 하나 붙으면 하나 는다."""
    return sys.getrefcount(greet)


def held_count() -> int:
    return len(_made)


def call_js_positional() -> str:
    """자바스크립트 함수를 위치 인자로 부른다."""
    return report.describe("가", "여어")


def call_js_keyword() -> str:
    """키워드 인자로 부른다. 자바스크립트에는 키워드 인자가 없으므로 무언가로 바뀐다."""
    return report.describe("나", greeting="여어", excited=True)


def nested_dict_as_keyword() -> str:
    """키워드로 넘긴 값 안에 dict 가 있으면 어떻게 되는지."""
    try:
        # 보여 주려는 것은 이 한 줄이다. 나머지를 함께 감싸면 오타까지 실패로 삼킨다.
        request = js.Request.new("/x", method="POST", headers={"X": "1"})
    except JsException as exc:
        return f"실패 — {str(exc).splitlines()[0]}"
    return f"성공: {request.method}"


def nested_to_js_as_keyword() -> str:
    """같은 것을 to_js 로 감싸 넘기면."""
    try:
        request = js.Request.new("/x", method="POST", headers=to_js({"X": "1"}))
    except JsException as exc:
        return f"실패 — {str(exc).splitlines()[0]}"
    return f"성공: {request.headers.get('X')}"


def channel_report() -> str:
    """넘겨 둔 값을 어디서 꺼내는지. registerJsModule 이 특히 헷갈린다."""
    lines: list[str] = []

    def check(label: str, make: Callable[[], object]) -> None:
        try:
            lines.append(f"{label}: {make()}")
        except Exception as exc:
            lines.append(
                f"{label}: {type(exc).__name__} — {str(exc).splitlines()[0][:60]}"
            )

    # globals.set 으로 넣은 것은 파이썬 전역에 그대로 있다.
    check("globals.set 으로 넣은 것", lambda: globals().get("FROM_SET", "(없음)"))
    # registerJsModule 은 최상위 모듈이 된다. js 의 속성이 아니다.
    check("js.report 로 꺼내기", lambda: js.report.name)
    check("import report 로 꺼내기", lambda: report.name)
    return "\n".join(lines)
