# 07. 함수를 양쪽으로 넘기기

파이썬 함수를 자바스크립트가 부르고 자바스크립트 함수를 파이썬이 부른다. 그 사이에서 인자와 손잡이가 어떻게 되는지 본다.

![예제 화면. 손잡이 만드는 방법을 고르는 라디오 셋과 손잡이 만들기·불러 보기·키워드 인자로 불러 보기·모아 둔 것 놓기·반환값으로 받아 부르기 버튼이 있다. 호출 기록에는 once 방식으로 맡긴 뒤 첫 호출은 성공하고 두 번째는 OnceProxy can only be called once 로 실패했으며, 반환값으로 받은 것은 두 번 다 성공했다고 찍혀 있다. 아래 표에는 파이썬이 모아 둔 프록시 1개, greet 을 가리키는 참조 수 2, 자바스크립트가 든 참조는 있음이지만 이미 죽었다고 나온다. 파이썬에서 자바스크립트를 부른 결과에는 위치 인자는 그대로 가고 키워드 인자는 object Object 로 묶여 갔다고 나오며, 키워드 안의 dict 는 TypeError 로 실패하고 to_js 로 감싼 것은 성공했다. 맨 아래 통로 확인에는 js.report 는 AttributeError 이고 import report 는 된다고 나온다.](screenshot.png)

> 이 문서의 측정값은 Chrome 151.0.7922.34 (headless, macOS) 에서 2026-08-23 에 Pyodide 314.0.5 로 확인한 것이다.

## 무엇을 배우나

- 인자로 넘긴 손잡이와 반환값으로 넘긴 손잡이는 수명이 다르다
- `create_once_callable` 은 한 번만 부를 수 있다. 부르고 나면 알아서 놓인다
- 자바스크립트에서 파이썬 함수에 키워드 인자를 넘기려면 `callKwargs`
- 파이썬의 키워드 인자는 자바스크립트에서 진짜 객체 하나로 묶여 간다. 06번이 위치 인자로 하던 것과는 다른 길이다

## 실행 방법

```bash
mise run serve
```

브라우저로 `http://localhost:4173/galleries/07-callbacks-both-ways/` 를 연다. 만드는 방법을 바꿔 가며 두 번씩 눌러 보면 된다.

## 핵심 코드

### 1. 빌린 손잡이와 넘겨준 손잡이

06번에서 파이썬 함수를 `addEventListener` 에 그냥 넘겼더니 첫 클릭부터 죽었다. 그런데 같은 함수를 **반환값**으로 넘기면 멀쩡하다. 무엇이 다른가.

```python
def hand_over(kind: str) -> None:
    """세 가지 방법으로 손잡이를 만들어 자바스크립트에게 맡긴다.

    반환하지 않고 인자로 넘기는 것이 중요하다. 인자로 넘긴 파이썬 객체는 그 호출이
    끝나면 자동으로 회수되는 빌린 손잡이다. 반환값으로 넘기면 그렇지 않다.
    """
```

인자로 넘긴 것은 **빌려주는 것**이다. 그 호출이 도는 동안만 쓰라고 준 것이라, 호출이 끝나면 Pyodide 가 회수한다. 자바스크립트가 붙잡아 두었다면 그건 이미 죽은 손잡이다.

반환값은 **넘겨주는 것**이다. 회수하지 않으므로 몇 번이든 부를 수 있고, 대신 다 쓰면 받은 쪽이 놓아야 한다.

```js
function callReturned() {
  const returned = call('return_handle');
  try {
    callLog.textContent += `\n반환값으로 받아 부르기 → ${returned('마루')}`;
    callLog.textContent += `\n한 번 더 → ${returned('마루')}`;
  } finally {
    returned.destroy();
  }
}
```

Chrome 151 에서 확인한 결과다.

| 넘긴 방법 | 첫 호출 | 둘째 호출 |
| --- | --- | --- |
| 인자로, 감싸지 않고 | `This borrowed proxy was automatically destroyed` | 같은 오류 |
| 인자로, `create_proxy` | 된다 | 된다 |
| 인자로, `create_once_callable` | 된다 | `OnceProxy can only be called once` |
| 반환값으로 | 된다 | 된다 |

이 표가 06번의 수수께끼를 푼다. `addEventListener(button, "click", on_click)` 은 함수를 인자로 넘기는 것이라 빌린 손잡이가 된다. 그래서 `create_proxy` 로 감싸 "이건 빌려주는 게 아니라 넘겨주는 것" 이라고 말해 줘야 했다.

### 2. once 는 한 번뿐이다

`create_once_callable` 로 감싸 맡기면 첫 호출은 되고 두 번째는 이렇게 막힌다.

```text
OnceProxy can only be called once
```

쓸모가 분명한 자리가 있다. `setTimeout` 콜백, `Promise` 의 `then`, 일회성 이벤트처럼 정확히 한 번만 불릴 것이 확실한 곳이다. 부르고 나면 알아서 놓이므로 `destroy()` 를 기억할 필요가 없다.

정말 그런지는 참조 수로 볼 수 있다. 화면의 `greet 을 가리키는 참조 수` 가 손잡이 하나마다 하나씩 오른다.

```python
def greet_refcount() -> int:
    """greet 을 가리키는 참조 수. 손잡이가 하나 붙으면 하나 는다."""
    return sys.getrefcount(greet)
```

`once` 로 만들면 하나 오르고, 한 번 부르고 나면 도로 내려온다. 아무도 `destroy()` 를 부르지 않았는데 그렇다.

**다만 부르지 않고 버리면 이야기가 다르다.** 만들어 놓고 안 부르면 참조가 그대로 남는다. GC 가 언젠가 걷어 가기는 하지만 언제일지 알 수 없다. 그래서 이 예제는 `once` 로 만든 것도 함께 모아 둔다.

```python
    handle = create_once_callable(greet) if kind == "once" else create_proxy(greet)
    _made.append(handle)
    report.remember(handle)
```

이미 불려서 스스로 놓인 것에 다시 `destroy()` 를 부르면 던지므로, 놓을 때 그것을 갈라 센다.

```python
        try:
            handle.destroy()
            released += 1
        except Exception:
            already += 1
```

한 가지 주의할 것이 있다. `OnceProxy` 에는 `callKwargs` 가 없다.

```text
handle.callKwargs is not a function
```

키워드 인자를 넘겨야 하는 콜백이라면 `create_proxy` 를 써야 한다.

### 3. 자바스크립트에서 키워드 인자를 넘기려면

자바스크립트에는 키워드 인자가 없다. 그래서 파이썬 함수의 기본값 인자를 지정하려면 전용 통로가 필요하다.

```js
line = withKeywords
  ? handle.callKwargs('마루', { greeting: '반가워', excited: true })
  : handle('마루');
```

위치 인자를 먼저 주고 마지막에 객체 하나로 키워드를 준다. `greet(name, greeting="안녕", excited=False)` 를 이렇게 부르면 `반가워, 마루!` 가 나온다.

### 4. 반대 방향은 저절로 묶인다

파이썬에서 자바스크립트 함수를 키워드 인자로 부르면 어떻게 될까.

```python
def call_js_keyword() -> str:
    """키워드 인자로 부른다. 자바스크립트에는 키워드 인자가 없으므로 무언가로 바뀐다."""
    return report.describe("나", greeting="여어", excited=True)
```

결과다.

```text
위치 인자로: 이름=가 / 나머지 1개: "여어"
키워드 인자로: 이름=나 / 나머지 1개: [object Object] {"greeting":"여어","excited":true}
```

**키워드들이 모여 객체 하나가 되어 마지막 인자로 붙는다.** 그리고 그 객체는 손잡이가 아니라 진짜 자바스크립트 객체다. 화면에 `[object Object]` 로 찍히는 것이 그 증거다. 손잡이였다면 `[object PyProxy]` 로 나온다.

06번과 이어 보면 재미있다. 거기서는 dict 를 **위치 인자**로 넘겼다.

```python
js.Request.new("/x", {"method": "POST"})
```

그것도 됐는데 이유가 다르다. 위치 인자로 넘긴 dict 는 손잡이 그대로 건너가고, 브라우저가 그 손잡이에서 속성을 읽어 가는 것이다. 키워드로 넘기면 아예 진짜 객체가 되어 애초에 손잡이가 아니다. 같은 결과에 다른 길인 셈이다.

그 안에 dict 를 넣으면 둘 다 막힌다.

```python
        request = js.Request.new("/x", method="POST", headers={"X": "1"})
```

```text
TypeError: Failed to construct 'Request': Failed to read the 'headers' property from 'RequestInit':
The provided value cannot be converted to a sequence.
```

바깥은 진짜 객체가 됐지만 안쪽 dict 는 손잡이로 남는다. 브라우저가 거기서 진짜 레코드를 요구하니 막힌다. 한 겹만 벗겨진 셈이다.

```python
    request = js.Request.new("/x", method="POST", headers=to_js({"X": "1"}))
```

안쪽을 `to_js()` 로 감싸면 된다. 규칙은 단순하다. **키워드 인자의 바깥 한 겹은 저절로 되고, 그 안은 손수 해야 한다.**

### 5. 값을 넘기는 통로

파이썬과 자바스크립트 사이에 값을 두는 자리가 여럿이다. 어디에 남는지 알아야 나중에 찾을 수 있다.

```python
    # globals.set 으로 넣은 것은 파이썬 전역에 그대로 있다.
    check("globals.set 으로 넣은 것", lambda: globals().get("FROM_SET", "(없음)"))
    # registerJsModule 은 최상위 모듈이 된다. js 의 속성이 아니다.
    check("js.report 로 꺼내기", lambda: js.report.name)
    check("import report 로 꺼내기", lambda: report.name)
```

```text
globals.set 으로 넣은 것: globals.set 으로 넣은 값
js.report 로 꺼내기: AttributeError — report
import report 로 꺼내기: report 모듈
```

| 통로 | 어디에 남나 | 언제 쓰나 |
| --- | --- | --- |
| `globals.set(이름, 값)` | 파이썬 전역 | 값 하나를 오래 두고 쓸 때 |
| `runPython(코드, { globals })` | 그 실행에만 | 이번 실행에만 필요한 값 |
| `registerJsModule(이름, 객체)` | 최상위 모듈. `import 이름` | 자바스크립트 기능 묶음을 파이썬에 열어 줄 때 |
| `pyodide.toPy(값)` | 손잡이. 다 쓰면 놓는다 | 자바스크립트 값을 파이썬 자료로 바꿔 넘길 때 |

`registerJsModule` 이 헷갈리기 쉽다. 이름을 `report` 로 등록했다고 `js.report` 가 되는 게 아니다. 최상위 모듈이 되므로 `import report` 로 가져와야 한다.

## 직접 해볼 것

- 세 가지 방법으로 손잡이를 맡기고 각각 두 번씩 눌러 보자. 표의 "자바스크립트가 든 참조" 가 "부를 수 있음" 에서 "이미 죽었음" 으로 바뀌는 것을 본다
- `once` 로 맡긴 뒤 참조 수를 보고, 한 번 부른 뒤 다시 보자. 아무도 놓지 않았는데 하나 내려간다
- `create_once_callable` 로 맡기고 "키워드 인자로 불러 보기" 를 눌러 보자. `callKwargs` 가 없다는 오류가 난다
- "그냥 넘기기" 로 맡긴 뒤 "반환값으로 받아 부르기" 를 눌러 보자. 같은 파이썬 함수인데 이쪽은 된다
- `create_proxy` 로 여러 번 맡기고 "모아 둔 것 놓기" 를 눌러 보자. 몇 개를 놓았는지 나온다
- `src/main.py` 의 `greet` 기본값을 바꾸고 새로고침해 보자. `callKwargs` 없이 부른 결과가 달라진다
- "어디에 남는지 확인" 을 눌러 `js.report` 가 `AttributeError` 인 것을 보자. `src/main.py` 의 `channel_report` 에서 그 줄을 지우고 새로고침하면 나머지만 나온다

## 막히는 지점

| 증상 | 원인 |
| --- | --- |
| `This borrowed proxy was automatically destroyed` | 함수를 인자로 그냥 넘겼다. `create_proxy` 로 감싸자 |
| `OnceProxy can only be called once` | `create_once_callable` 은 한 번뿐이다. 여러 번 부를 것이면 `create_proxy` |
| `callKwargs is not a function` | `OnceProxy` 에는 없다. `create_proxy` 를 쓰자 |
| 키워드로 넘긴 dict 가 `TypeError` | 바깥 한 겹만 저절로 바뀐다. 안쪽은 `to_js()` 로 감싸자 |
| `js.모듈이름` 이 `AttributeError` | `registerJsModule` 은 최상위 모듈을 만든다. `import 모듈이름` |
| 반환값으로 받은 손잡이가 새는 것 같다 | 넘겨받은 것이라 자동 회수가 없다. 다 쓰면 `destroy()` |
| `once` 를 만들고 안 불렀는데 참조가 남는다 | 부를 때 놓이는 것이라, 안 부르면 GC 를 기다린다. 버릴 것 같으면 `destroy()` |
| 이미 불린 `once` 에 `destroy()` 를 불렀더니 던진다 | 그때 이미 놓였다. `try` 로 감싸 넘기면 된다 |

## 더 읽을 것

빌린 손잡이와 넘겨준 손잡이가 내부적으로 어떻게 다른지는 [원리 문서](../../docs/tutorials/README.md)에서 다룬다.

## 다음 예제

[08. 파일 다루기](../08-file-system/) — 브라우저 안의 가짜 파일시스템에 파일을 올리고 내려받고 남긴다.
