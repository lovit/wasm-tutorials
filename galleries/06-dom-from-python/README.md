# 06. 파이썬에서 DOM 만지기

화면을 만드는 코드를 전부 파이썬 쪽에 두고, 이벤트 핸들러를 넘길 때 손잡이 규칙이 어떻게 걸리는지 본다.

![예제 화면. 핸들러를 붙이는 방법을 고르는 라디오 버튼 세 개가 있고, 아래 할 일 입력칸과 넣기·전부 지우기 버튼이 있다. 목록에는 장 보기(create_proxy), 빨래 개기(wrappers), 설거지(그냥 넘기기) 세 항목이 각각 어느 방법으로 붙였는지 표시와 함께 들어 있다. 그 아래 표에는 화면에 있는 항목 3개, 파이썬이 들고 있는 핸들러 2개가 적혀 있다. 회색 출력 상자에는 가장 최근 오류로 borrowed proxy 오류가 보인다. 맨 아래 옵션 넘기기 결과에는 평평한 dict 는 POST 로 되고, to_js 기본은 되고, 중첩 dict 와 옛 관용구는 TypeError 로 실패했다고 나온다.](screenshot.png)

> 이 문서의 측정값은 Chrome 151.0.7922.34 (headless, macOS) 에서 2026-08-23 에 Pyodide 314.0.5 로 확인한 것이다.

## 무엇을 배우나

- `import js` 로 파이썬이 DOM 을 직접 만든다
- 파이썬 함수를 이벤트 핸들러로 그냥 넘기면 첫 클릭부터 죽는다
- `create_proxy` 로 수명을 붙잡고, 떼어 낼 때 놓는다
- `pyodide.ffi.wrappers` 가 그 일을 대신해 준다. 대신 등록할 때 쓴 객체를 그대로 들고 있어야 한다
- 파이썬 딕셔너리를 옵션 자리에 넘길 때 되는 것과 안 되는 것

## 실행 방법

```bash
mise run serve
```

브라우저로 `http://localhost:4173/galleries/06-dom-from-python/` 를 연다. 붙이는 방법을 바꿔 가며 항목을 넣고 지워 보면 된다.

## 핵심 코드

### 0. 파이썬은 파일로 뺀다

지금까지는 파이썬을 자바스크립트 문자열 안에 넣었다. 이 예제부터는 `src/main.py` 로 뺀다.

```js
const source = await fetch('src/main.py').then((response) => response.text());
// 이 손잡이는 페이지가 사는 동안 계속 쓰므로 일부러 안 놓는다. 놓으면 파이썬 전역이 사라진다.
todoGlobals = pyodide.runPython(`${source}\n\nglobals()`);
```

`globals()` 를 마지막에 두는 것이 요령이다. 파일을 실행한 뒤의 전역 사전이 넘어오므로, 자바스크립트가 거기서 함수를 이름으로 꺼내 쓸 수 있다.

꺼낸 것도 손잡이라 놓아 줘야 한다.

```js
function call(todo, name, ...args) {
  const fn = todo.get(name);
  try {
    return fn(...args);
  } finally {
    fn.destroy();
  }
}
```

파일로 빼면 얻는 것이 많다. 편집기가 하이라이트해 주고, `ruff` 가 검사해 주고, 튜토리얼의 코드 조각이 소스 링크를 받는다. 문자열 안에서는 셋 다 안 된다.

### 1. 그냥 넘기면 첫 클릭부터 죽는다

```python
    if mode == "plain":
        # 이러면 첫 클릭부터 죽는다. 왜인지는 튜토리얼에 적었다.
        button.addEventListener("click", on_click)
```

"그냥 넘기기" 로 만든 항목의 지우기 버튼을 누르면 이렇게 나온다.

```text
This borrowed proxy was automatically destroyed at the end of a function call.
Try using create_proxy or create_once_callable.
For more information about the cause of this error, use `pyodide.setDebug(true)`
```

세 번째 줄은 [05번](../05-pyproxy-lifetime/)에서 켜 본 그 스위치다.

흔히 "두 번째 클릭부터 죽는다" 고 하는데 아니다. 첫 클릭부터 죽는다.

까닭은 이렇다. `addEventListener` 에 파이썬 함수를 넘기면 그 호출을 위해 손잡이가 하나 만들어진다. 이걸 borrowed proxy 라고 부른다. 빌려준 것이라 `addEventListener` 호출이 끝나는 순간 자동으로 회수된다. 브라우저가 들고 있는 것은 이미 죽은 손잡이다.

05번에서 본 `Object has already been destroyed` 와 같은 일이지만 메시지가 다르다. 우리가 놓은 것이 아니라 Pyodide 가 자동으로 회수한 것이라, 무엇을 해야 하는지까지 알려 준다.

### 2. create_proxy 로 붙잡는다

```python
    elif mode == "proxy":
        proxy = create_proxy(on_click)
        button.addEventListener("click", proxy)
        _handlers[item_id] = (mode, button, proxy)
```

`create_proxy` 는 "이건 빌려주는 게 아니라 내가 붙잡고 있겠다" 는 뜻이다. 그래서 놓는 것도 우리 책임이다.

```python
        if mode == "proxy":
            # 떼어 내고 놓는다. 둘 중 하나만 하면 샌다.
            button.removeEventListener("click", handle)
            handle.destroy()
```

떼어 내기만 하고 안 놓으면 손잡이가 남고, 놓기만 하고 안 떼면 브라우저가 죽은 손잡이를 부른다. 둘 다 해야 한다.

화면의 표가 그걸 보여 준다. 항목을 지울 때마다 "파이썬이 들고 있는 핸들러" 가 하나씩 준다. 안 놓으면 화면에서는 사라졌는데 이 숫자가 그대로다.

### 3. wrappers 가 대신해 준다

```python
    else:
        # wrappers 가 프록시를 대신 만들어 들고 있는다.
        add_event_listener(button, "click", on_click)
        _handlers[item_id] = (mode, button, on_click)
```

`pyodide.ffi.wrappers` 의 `add_event_listener` 는 손잡이를 자기가 만들어 자기 사전에 넣어 둔다. `remove_event_listener` 로 떼면 그때 놓아 준다. `create_proxy` 를 직접 부르지 않아도 된다.

다만 함정이 하나 있다. 이걸 만드느라 두 번 밟았고, 둘 다 열쇠가 어긋나는 이야기다.

`wrappers` 는 붙여 둔 손잡이를 `(elt.js_id, event, listener)` 를 열쇠로 기억한다. 떼어 낼 때 그 셋이 전부 맞아야 찾는다.

**첫째, 함수를 다시 만들면 안 된다.** `on_click` 은 `add_item` 이 불릴 때마다 새로 만들어지는 클로저다. 같은 코드로 다시 만든 함수는 다른 객체라 못 찾는다.

**둘째, element 도 붙잡고 있어야 한다.** 이게 뜻밖이었다. 버튼을 `querySelector` 로 다시 꺼내 넘겼더니 이렇게 났다.

```text
등록된 열쇠: [(-1287434124, 'click', <function add_item.<locals>.on_click at 0x1275358>)]
찾는 열쇠:   (2058376860, 'click', <function add_item.<locals>.on_click at 0x1275358>)
```

함수는 같은 객체인데 `js_id` 가 다르다. 같은 DOM 노드인데도 그렇다.

Pyodide 문서는 "같은 자바스크립트 객체로 만든 두 `JsProxy` 는 같은 `js_id` 를 갖는다" 고 한다. 맞는 말인데 조건이 하나 빠져 있다. **그 객체의 손잡이가 하나라도 살아 있는 동안만** 그렇다. 재 보면 이렇다.

| 상황                                                | `js_id`    |
| --------------------------------------------------- | ---------- |
| 손잡이를 붙잡은 채 다시 꺼내기                      | 같다       |
| 함수 안에서 잠깐 꺼내 쓰기                          | 같다       |
| 붙잡은 것을 전부 놓고 `gc.collect()` 뒤 다시 꺼내기 | **다르다** |

`add_item` 이 끝나면 그 안의 `button` 손잡이가 사라진다. 그 뒤에 다시 꺼내면 같은 버튼인데 새 번호를 받는다. 그래서 등록할 때 쓴 그 손잡이를 들고 있어야 한다.

```python
        add_event_listener(button, "click", on_click)
        _handlers[item_id] = (mode, button, on_click)
```

`create_proxy` 를 직접 쓰면 이 문제가 없다. `removeEventListener` 는 브라우저 API 라 DOM 노드 자체로 비교하지, 손잡이 번호를 쓰지 않기 때문이다. 편해 보이는 쪽에 대신 다른 조건이 붙는 셈이다.

### 4. null 은 None 이 아니다. 실제로 걸린다

목록을 비우는 코드를 이렇게 썼다가 터졌다.

```python
    while list_element.firstChild is not None:
        list_element.firstChild.remove()
```

```text
AttributeError: 'JsNull' object has no attribute 'remove'
```

자식이 없으면 `firstChild` 는 자바스크립트의 `null` 이고, 314 부터 그건 `None` 이 아니라 `jsnull` 이다. [04번](../04-type-conversions/)에서 표로 봤던 그 규칙인데, 실제로 걸리는 자리는 이렇게 평범하다. 조건이 영영 참이라 반복문이 안 끝나고, 없는 것에 `.remove()` 를 부르다 터진다.

고친 모습이다.

```python
    while (child := list_element.firstChild) is not jsnull:
        child.remove()
```

같은 파일 안에서 한 번 더 걸렸다. 항목을 지울 때 이렇게 막아 뒀는데 그 가드가 영영 안 걸린다.

```python
    # 못 찾으면 None 이 아니라 jsnull 이다. is None 으로 쓰면 이 가드가 영영 안 걸린다.
    if element is jsnull:
```

`getElementById` 도 못 찾으면 `null` 을 준다. `is None` 으로 썼더니 이미 지워진 항목에 `.remove()` 를 부르다 터졌다.

옛 파이썬 코드를 브라우저로 옮길 때 가장 자주 밟을 자리다. DOM API 는 "없음" 을 `null` 로 돌려주는 것이 널려 있다. `getElementById`, `querySelector`, `parentNode`, `nextSibling` 전부 그렇다.

### 5. 딕셔너리를 옵션으로 넘기기

"확인해 보기" 를 누르면 네 가지 방법을 한꺼번에 돌려 본다. Chrome 151 에서 나온 결과다.

| 넘기는 방법 | 결과 |
| --- | --- |
| 평평한 dict `{"method": "POST"}` | 된다 |
| 중첩 dict `{"headers": {"X": "1"}}` | `TypeError: Failed to construct 'Request': Failed to read the 'headers' property from 'RequestInit': The provided value cannot be converted to a sequence.` |
| `to_js({...})` | 된다 |
| `Object.fromEntries(to_js({...}))` | `TypeError: object is not iterable` |

두 가지가 널리 알려진 것과 다르다.

**평평한 딕셔너리는 조용히 무시되지 않는다.** 자료마다 "파이썬 dict 를 옵션으로 넘기면 무시된다" 고 하는데, 314.0.5 에서는 제대로 읽힌다. `{"method": "HEAD"}` 를 넘기면 실제로 HEAD 요청이 나간다(본문 길이가 0 이 된다). dict 를 감싼 손잡이가 속성 읽기를 지원하기 때문이다.

**중첩되면 실패한다.** 브라우저가 `headers` 자리에서 진짜 레코드나 시퀀스를 요구하는데, 손잡이는 그 모양이 아니다. 조용히 무시되는 것이 아니라 요란하게 터진다. 그 편이 낫다.

**옛 관용구가 이제 깨진다.** 여기저기 퍼져 있는 `Object.fromEntries(to_js({...}))` 는 `to_js` 가 `Map` 을 주던 시절의 코드다. [04번](../04-type-conversions/)에서 본 대로 이제는 평범한 객체를 주므로, `fromEntries` 에 넣을 것이 없어 터진다.

그래서 지금 맞는 방법은 둘이다. 평평한 옵션은 그냥 넘기고, 중첩된 것은 `to_js()` 를 거친다. `dict_converter` 를 줄 필요도 없어졌다.

## 직접 해볼 것

- 세 가지 방법으로 항목을 하나씩 넣고 지워 보자. "그냥 넘기기" 만 지워지지 않는다
- 항목을 여러 개 넣고 "파이썬이 들고 있는 핸들러" 를 세어 보자. "그냥 넘기기" 로 만든 것은 애초에 세지 않는다. 붙잡지 않았으니 셀 것이 없다
- `create_proxy` 로 만든 항목을 지우고 표를 보자. 정확히 하나씩 준다
- 개발자 도구에서 목록의 `<li>` 하나를 직접 지우고, 그다음 항목을 하나 더 넣어 보자. 표가 다시 그려지면서 화면 항목 수와 핸들러 수가 어긋나 있다. 그게 누수다
- "확인해 보기" 를 누른 뒤 `src/main.py` 의 `fetch_options_report` 를 열어 무엇을 시험하는지 읽어 보자
- `src/main.py` 의 `clear_all` 에서 `jsnull` 을 `None` 으로 바꾸고 "전부 지우기" 를 눌러 보자. 4절의 오류가 그대로 난다

## 막히는 지점

| 증상 | 원인 |
| --- | --- |
| `This borrowed proxy was automatically destroyed` | 파이썬 함수를 그냥 넘겼다. `create_proxy` 나 `wrappers` 를 쓰자 |
| 화면에서는 지워졌는데 핸들러 수가 안 준다 | 떼어 내기만 하고 안 놓았다 |
| `remove_event_listener` 가 `KeyError` | 열쇠 셋 중 하나가 어긋났다. 등록할 때 쓴 함수와 element 손잡이를 그대로 들고 있어야 한다 |
| `'JsNull' object has no attribute ...` | `null` 을 `None` 으로 비교했다. `jsnull` 과 비교하자 |
| 중첩 dict 를 옵션으로 넘겼더니 `TypeError` | `to_js()` 를 거쳐 넘기자 |
| `Object.fromEntries(to_js(...))` 가 터진다 | 옛 관용구다. `to_js()` 만으로 충분하다 |
| `import host` 가 안 된다 | `registerJsModule` 로 등록한 이름은 `js` 의 속성이 아니라 최상위 모듈이다 |

## 더 읽을 것

손잡이가 왜 자동으로 회수되는지, `js_id` 가 손잡이 수명에 따라 왜 달라지는지는 [원리 문서](../../docs/tutorials/README.md)에서 다룬다.

## 다음 예제

[07. 함수를 양쪽으로 넘기기](../07-callbacks-both-ways/) — 파이썬 함수를 자바스크립트에, 자바스크립트 함수를 파이썬에.
