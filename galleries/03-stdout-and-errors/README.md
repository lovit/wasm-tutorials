# 03. 출력과 오류를 화면으로

`print` 한 것을 화면으로 돌리고, 오류를 stdout 과 갈라 받고, `input()` 까지 되게 만든다.

![예제 화면. 위쪽에 준비됐다는 안내가 있고, 그 아래 print 여러 줄·stderr 로 쓰기·오류 내기·input 쓰기 네 개의 예시 버튼이 있다. 파이썬 코드 입력칸에 sys 와 warnings 를 쓰는 코드가 들어 있고, 그 아래 미리 넣어 둘 입력칸은 비어 있다. 실행 버튼 옆에 코드에 파일 이름 붙이기와 트레이스백에서 내부 프레임 감추기 체크박스가 둘 다 켜져 있다. 아래쪽 어디로 갔나 절에는 stdout 칸에 "이건 stdout 으로 갑니다" 한 줄이, 빨간 테두리의 stderr 칸에 "이건 stderr 로 갑니다" 와 user_code.py:6 UserWarning 두 줄이 나뉘어 들어 있다. 맨 아래 돌려준 값은 (없음) 이다.](screenshot.png)

> 이 문서의 측정값은 Chrome 151.0.7922.34 (headless, macOS) 에서 2026-08-23 에 Pyodide 314.0.5 로 확인한 것이다.

## 무엇을 배우나

- `setStdout({ batched })` 와 `setStderr({ batched })` 로 파이썬의 출력을 화면으로 돌린다
- `setStdin({ stdin })` 은 동기 콜백이다. 그래서 사용자에게 물어보고 기다릴 수 없다
- `runPython(code, { filename })` 을 주면 트레이스백에 소스 줄이 나온다. 안 주면 줄 번호만 나온다
- `PythonError` 는 원본 예외를 들고 있지 않다. 포맷된 문자열뿐이다

## 실행 방법

```bash
mise run serve
```

브라우저로 `http://localhost:4173/galleries/03-stdout-and-errors/` 를 연다. 예시 버튼을 눌러 코드를 바꿔 가며 실행해 보면 된다.

## 핵심 코드

### 1. 스트림 셋을 페이지로 끌어온다

```js
pyodide.setStdout({ batched: (line) => append(outBox, line) });
pyodide.setStderr({ batched: (line) => append(errBox, line) });
```

이 두 줄이면 `print` 가 콘솔 대신 화면으로 온다. 브라우저 기본값이 `setStdout({ batched: console.log })` 라서 아무것도 안 하면 콘솔로 가는 것이다.

`batched` 는 줄 단위로 준다. 개행은 떼고 온다. 그래서 붙일 때 다시 넣어 준다.

```js
function append(box, line) {
  box.textContent += `${line}\n`;
}
```

바이트 하나씩 받는 `raw` 와 저수준 `write` 도 있지만, 화면에 글자를 찍는 용도로는 `batched` 가 맞다.

**개행이 없으면 흘려보내지 않는다.** `input()` 예시를 돌려 보면 이렇게 나온다.

```text
이름을 넣어 주세요: 나이는요? 홍길동 님, 41 살이시군요.
```

세 줄이 한 줄로 붙었다. `input("이름을 넣어 주세요: ")` 의 프롬프트는 개행으로 끝나지 않아서 버퍼에 남아 있다가 다음 출력에 딸려 나온 것이다. 진짜 터미널에서도 같은 일이 일어나지만, 거기서는 커서가 그 자리에 있으니 자연스럽게 보인다. 화면에 옮기면 어색해진다. 신경 쓰인다면 `write` 핸들러를 직접 만들어 개행 없이도 흘려보내면 된다.

### 2. stdin 은 동기라서 기다릴 수 없다

```js
pyodide.setStdin({
  stdin: () => (pending.length ? pending.shift() : (prompt('input() 이 값을 기다립니다') ?? '')),
});
```

이 콜백은 값을 **바로** 돌려줘야 한다. Promise 를 돌려줄 수 없다. `runPython` 이 동기로 도는 중이고, 그 안의 `input()` 이 이 콜백을 부르는 것이라 기다릴 방법이 없다.

그래서 브라우저에서 `input()` 을 쓰는 길은 둘뿐이다. 값을 미리 받아 두고 하나씩 꺼내 주거나, 브라우저를 통째로 멈추는 `prompt()` 를 쓰거나. 이 예제는 입력칸이 비어 있을 때만 `prompt()` 로 넘어간다.

제대로 하려면 파이썬을 워커로 옮기고 `Atomics.wait` 으로 기다려야 한다. 그건 [17. 워커로 옮기기](../17-web-worker/)와 [19. 멈추기와 기다리기](../19-interrupt-and-run-sync/)의 주제다.

### 3. 이름을 주면 소스 줄이 살아난다

```js
const options = namedToggle.checked ? { filename: 'user_code.py' } : {};
```

같은 오류를 이름 없이 돌리면 이렇게 나온다.

```text
Traceback (most recent call last):
  File "<exec>", line 9, in <module>
  File "<exec>", line 6, in run
  File "<exec>", line 2, in divide
ZeroDivisionError: division by zero
```

이름을 주면 이렇게 나온다.

```text
Traceback (most recent call last):
  File "user_code.py", line 9, in <module>
    run()
    ~~~^^
  File "user_code.py", line 6, in run
    return divide(1, 0)
  File "user_code.py", line 2, in divide
    return a / b
           ~~^~~
ZeroDivisionError: division by zero
```

줄 번호만 있던 것이 실제 소스와 캐럿까지 붙는다. 파이썬이 트레이스백을 만들 때 파일 이름으로 소스를 찾아 읽기 때문이다. 기본 이름 `<exec>` 는 꺾쇠로 감싸여 있는데, 그건 "이건 진짜 파일이 아니다" 라는 관례라 파이썬이 찾으러 가지 않는다.

이름을 하나 주는 것만으로 사용자가 읽을 수 있는 오류가 된다. 값이 큰 데 비해 손이 거의 안 든다.

경고에도 같이 적용된다. 화면의 stderr 칸에 `user_code.py:6: UserWarning` 이라고 나오는 것이 그 결과다.

### 4. 내부 프레임은 남의 이야기다

이름을 줘도 트레이스백 앞에 이런 것이 두 프레임 붙는다.

```text
  File "/lib/python314.zip/_pyodide/_base.py", line 523, in eval_code
    .run(globals, locals)
  File "/lib/python314.zip/_pyodide/_base.py", line 357, in run
    coroutine = eval(self.code, globals, locals)
```

Pyodide 가 코드를 실행하려고 거친 자기 프레임이다. 쓰는 사람 코드와 무관하니 걷어내는 편이 낫다.

```js
    const frame = line.match(/^ {2}File "([^"]+)"/);
    if (frame) {
      skipping = frame[1].includes('_pyodide/_base.py');
      if (skipping) continue;
    } else if (skipping) {
      // 프레임 아래 딸린 소스 줄과 캐럿까지 함께 버린다.
      continue;
    }
```

프레임 한 줄만 지우면 그 아래 딸린 소스 줄과 캐럿이 남아 떠돈다. 그래서 상태를 하나 들고 다음 프레임이 나올 때까지 함께 버린다.

### 5. 예외 객체는 남아 있지 않다

```js
function showTraceback(error) {
  const text = trimToggle.checked ? trimInternalFrames(error.message) : error.message;
  const box = renderPythonError(errBox, text);
  box.textContent = `${text}\n\n예외 종류: ${error.type ?? '(알 수 없음)'}`;
}
```

`error.message` 에서 문자열을 꺼내는 것 말고 할 수 있는 일이 별로 없다. `PythonError` 가 원본 파이썬 예외 객체를 들고 있지 않기 때문이다. 들고 있으면 그 예외에 매달린 스택 프레임이 통째로 살아남아 샌다.

대신 `error.type` 으로 예외 클래스 이름은 알 수 있다. `ZeroDivisionError` 인지 `KeyError` 인지에 따라 다르게 처리하고 싶을 때 쓴다.

원본 객체가 꼭 필요하면 `sys.last_exc` 로 꺼낼 수 있다. 다만 그것도 `PyProxy` 라서 다 쓰면 놓아 줘야 하고, 놓지 않으면 스택 프레임 전체가 그대로 남는다. 문서가 권하는 것은 포맷을 파이썬 안에서 끝내고 문자열만 받아 오는 쪽이다.

## 직접 해볼 것

- "코드에 파일 이름 붙이기" 를 껐다 켜며 같은 오류를 내 보자. 트레이스백이 얼마나 달라지는지 확인한다
- "트레이스백에서 내부 프레임 감추기" 도 껐다 켜 보자. Pyodide 가 무엇을 거쳐 코드를 돌리는지 볼 수 있다
- `input` 예시를 고르고 "미리 넣어 둘 입력" 을 비운 뒤 실행해 보자. `prompt()` 창이 뜨고 그동안 페이지가 멈춘다
- 미리 넣어 둘 입력에 한 줄만 넣고 `input()` 을 두 번 부르는 코드를 돌려 보자. 두 번째에서 `prompt()` 로 넘어간다
- `print("a", end="")` 만 있는 코드를 돌려 보자. 아무것도 안 보인다. 개행이 없으면 흘려보내지 않는다
- `import sys; sys.stdout.write("x")` 를 돌려 보자. `print` 를 안 써도 같은 자리로 온다. 스트림 자체를 바꾼 것이기 때문이다
- 무한 루프를 돌려 보자. 페이지가 멈추고 되돌릴 방법이 없다. 새로고침해야 한다. 그 문제는 19번에서 다룬다

## 막히는 지점

| 증상 | 원인 |
| --- | --- |
| `print` 한 것이 화면에 안 나온다 | `setStdout` 을 부르기 전에 실행했다. 부르는 순서를 보자 |
| 마지막 줄만 안 나온다 | 개행으로 끝나지 않았다. `batched` 는 개행에서 흘려보낸다 |
| `input()` 에서 페이지가 멈춘다 | `prompt()` 로 넘어갔다. 미리 넣어 둘 입력에 값을 채우면 안 멈춘다 |
| 트레이스백에 소스가 안 나온다 | `filename` 을 안 줬다. 꺾쇠로 감싼 이름을 줘도 안 나온다 |
| `error.value` 같은 것으로 예외를 꺼내려 했는데 없다 | `PythonError` 는 원본 객체를 들고 있지 않다. `error.type` 과 `error.message` 뿐이다 |
| 모르는 프레임이 트레이스백 위에 붙는다 | Pyodide 내부 프레임이다. 걷어내도 된다 |

## 더 읽을 것

`PyProxy` 가 왜 GC 로 안 걷히는지, `sys.last_exc` 를 꺼내면 무엇이 남는지는 [원리 문서](../../docs/tutorials/README.md)에서 다룬다.

## 다음 예제

[04. 값이 오가는 규칙](../04-type-conversions/) — 파이썬과 자바스크립트 사이에서 무엇이 복사되고 무엇이 손잡이로 오는지.
