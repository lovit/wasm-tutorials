"""파이썬이 화면을 직접 만든다. 이 파일 안에 DOM 조작이 전부 들어 있다.

host 는 자바스크립트 쪽에서 registerJsModule 로 만들어 준 모듈이다. js 의 속성이
아니라 최상위 모듈이라서 `import host` 로 가져온다.
"""

from collections.abc import Callable

import host
import js
from js import Object
from pyodide.ffi import create_proxy, jsnull, to_js
from pyodide.ffi.wrappers import add_event_listener, remove_event_listener

# 붙여 둔 핸들러를 여기 모아 둔다. 항목을 지울 때 여기서 꺼내 놓아 준다.
# 세지 않으면 새는 것이 눈에 안 보인다.
#
# 함수와 버튼을 함께 들고 있어야 한다. wrappers 는 (elt.js_id, event, listener) 로 기억하는데
# 둘 다 붙잡지 않으면 열쇠가 어긋난다. 함수는 add_item 마다 새로 만들어지는 클로저이고,
# js_id 는 그 객체의 손잡이가 살아 있는 동안만 같은 번호를 준다. 전부 놓았다가 다시 꺼내면
# 같은 DOM 노드인데도 새 번호를 받는다.
_handlers: dict[str, tuple[str, object, object]] = {}
_next_id = 0

MODE_LABELS = {
    "plain": "그냥 넘기기",
    "proxy": "create_proxy",
    "wrappers": "wrappers",
}


def add_item(text: str, mode: str) -> str:
    """항목 하나를 만들어 목록에 붙인다. 지우기 버튼의 핸들러는 mode 에 따라 달라진다."""
    global _next_id
    _next_id += 1
    item_id = f"item-{_next_id}"

    item = js.document.createElement("li")
    item.id = item_id

    label = js.document.createElement("span")
    label.textContent = text
    label.className = "item-text"

    tag = js.document.createElement("span")
    tag.textContent = MODE_LABELS[mode]
    tag.className = "item-mode"

    button = js.document.createElement("button")
    button.type = "button"
    button.textContent = "지우기"

    def on_click(_event: object) -> None:
        remove_item(item_id)

    if mode == "plain":
        # 이러면 첫 클릭부터 죽는다. 왜인지는 튜토리얼에 적었다.
        button.addEventListener("click", on_click)
    elif mode == "proxy":
        proxy = create_proxy(on_click)
        button.addEventListener("click", proxy)
        _handlers[item_id] = (mode, button, proxy)
    else:
        # wrappers 가 프록시를 대신 만들어 들고 있는다.
        add_event_listener(button, "click", on_click)
        _handlers[item_id] = (mode, button, on_click)

    item.append(label, tag, button)
    js.document.getElementById("todo-list").append(item)
    # 화면이 바뀐 것을 자바스크립트 쪽에 알린다. 그래야 개수 표가 따라온다.
    host.changed()
    return item_id


def remove_item(item_id: str) -> None:
    """항목을 지우면서 붙여 둔 핸들러도 함께 놓아 준다."""
    element = js.document.getElementById(item_id)
    # 못 찾으면 None 이 아니라 jsnull 이다. is None 으로 쓰면 이 가드가 영영 안 걸린다.
    if element is jsnull:
        _handlers.pop(item_id, None)
        return

    entry = _handlers.pop(item_id, None)
    if entry is not None:
        mode, button, handle = entry
        if mode == "proxy":
            # 떼어 내고 놓는다. 둘 중 하나만 하면 샌다.
            button.removeEventListener("click", handle)
            handle.destroy()
        else:
            remove_event_listener(button, "click", handle)

    element.remove()
    host.changed()


def clear_all() -> None:
    for item_id in list(_handlers):
        remove_item(item_id)
    list_element = js.document.getElementById("todo-list")
    # 자식이 없으면 firstChild 는 None 이 아니라 jsnull 이다. 자바스크립트의 null 은
    # 314 부터 None 과 갈린다. is not None 으로 쓰면 이 반복문이 안 끝나고
    # AttributeError: 'JsNull' object has no attribute 'remove' 로 터진다.
    while (child := list_element.firstChild) is not jsnull:
        child.remove()
    host.changed()


def handler_count() -> int:
    return len(_handlers)


def fetch_options_report() -> str:
    """옵션을 넘기는 네 가지 방법이 각각 어떻게 되는지."""
    lines: list[str] = []

    def check(label: str, make: Callable[[], object]) -> None:
        try:
            lines.append(f"{label}: {make()}")
        except Exception as exc:
            lines.append(f"{label}: 실패 — {str(exc).splitlines()[0]}")

    check("평평한 dict", lambda: js.Request.new("/x", {"method": "POST"}).method)
    check(
        "중첩 dict",
        lambda: js.Request.new("/x", {"method": "POST", "headers": {"X": "1"}}).method,
    )
    check(
        "to_js 기본",
        lambda: js.Request.new(
            "/x", to_js({"method": "POST", "headers": {"X": "1"}})
        ).headers.get("X"),
    )
    check(
        "옛 관용구 Object.fromEntries(to_js(...))",
        lambda: Object.fromEntries(to_js({"X": "1"})),
    )
    return "\n".join(lines)
