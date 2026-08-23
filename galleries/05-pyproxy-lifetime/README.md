# 05. PyProxy 의 수명

안 놓아 준 손잡이가 무엇을 붙잡고 있는지, 놓으면 무엇이 돌아오고 무엇이 안 돌아오는지 숫자로 본다.

![예제 화면. 손잡이 하나가 참조 하나다 절에는 살아 있는 손잡이 201개, TARGET 의 참조 수 203 이 표로 나와 있다. 안 놓으면 힙이 자란다 절에는 잡고 있는 덩이 0개, WebAssembly 힙 51.94 MiB, 방금 한 일로 힙은 줄지 않는다는 설명이 적혀 있다. 놓는 세 가지 방법 표에는 그냥 두기가 안 돌아왔다고, destroy 와 try/finally 와 using 은 돌아왔다고 나온다. 맨 아래에는 놓은 손잡이를 다시 쓰면 Object has already been destroyed 오류가 나고 두 번 놓기는 조용히 지나간다는 결과가 있다.](screenshot.png)

> 이 문서의 측정값은 Chrome 151.0.7922.34 (headless, macOS) 에서 2026-08-23 에 Pyodide 314.0.5 로 잰 것이다.

## 무엇을 배우나

- 손잡이 하나가 파이썬 쪽 참조 하나를 붙잡는다
- 안 놓으면 WebAssembly 힙이 자란다. 그리고 놓아도 힙은 줄지 않는다
- `destroy()`, `try/finally`, `using` 세 가지 방법과 각각의 조건
- 놓은 손잡이를 다시 쓰면 나는 오류, 두 번 놓는 것은 괜찮다는 것

## 실행 방법

```bash
mise run serve
```

브라우저로 `http://localhost:4173/galleries/05-pyproxy-lifetime/` 를 연다. 버튼을 눌러 누수를 만들고 숫자가 어떻게 움직이는지 보면 된다.

## 핵심 코드

### 1. 손잡이 하나가 참조 하나다

파이썬 전역에 dict 를 하나 두고, 그것을 가리키는 손잡이를 만든다.

```js
function leakHandles(pyodide) {
  for (let i = 0; i < 100; i += 1) held.push(pyodide.globals.get('TARGET'));
  showRefs(pyodide);
}
```

`held` 배열이 곧 누수다. 손잡이를 만들어 놓고 놓지 않는 것이 전부다.

참조 수는 파이썬에게 물어본다.

```js
function refCount(pyodide) {
  return pyodide.runPython('sys.getrefcount(TARGET)');
}
```

Chrome 151 에서 확인한 결과다.

| 한 일          | 살아 있는 손잡이 | `TARGET` 의 참조 수 |
| -------------- | ---------------- | ------------------- |
| 아무것도 안 함 | 0개              | 2                   |
| 100개 만들기   | 100개            | 102                 |
| 한 번 더       | 200개            | 202                 |
| 전부 놓기      | 0개              | 2                   |

정확히 하나씩 붙고 하나씩 떨어진다. 손잡이가 "그 객체를 아직 쓰고 있다" 고 파이썬에게 말하고 있는 것이다. 그래서 놓지 않으면 파이썬 쪽에서 그 객체를 치울 수 없다.

`getrefcount` 가 처음부터 2 인 것은 자기 인자로 받은 것도 한 번 세기 때문이다. 절대값이 아니라 늘고 주는 폭을 보면 된다.

### 2. 안 놓으면 힙이 자란다

작은 dict 로는 티가 안 난다. 큰 것을 잡아 본다.

```js
function allocBlobs(pyodide) {
  const before = heapBytes(pyodide);
  for (let i = 0; i < 5; i += 1) blobs.push(pyodide.runPython('bytearray(2 * 1024 * 1024)'));
  const after = heapBytes(pyodide);

  if (before === null || after === null) {
    showHeap(pyodide, '10 MiB 를 잡았습니다. 힙 크기는 재지 못했습니다');
    return;
  }
  // 매번 자라지는 않는다. 이미 늘려 둔 자리에 들어가면 힙은 그대로다.
  showHeap(
    pyodide,
    after > before
      ? `10 MiB 를 잡았고 힙이 ${formatBytes(after - before)} 늘었습니다`
      : '10 MiB 를 잡았지만 힙은 그대로입니다. 이미 늘려 둔 자리에 들어갔습니다',
  );
}
```

힙 크기는 이렇게 본다.

```js
function heapBytes(pyodide) {
  return pyodide._module?.HEAP8?.length ?? null;
}
```

밑줄로 시작하는 것에서 알 수 있듯 공개 API 가 아니다. Emscripten 이 만든 내부 모듈을 들여다보는 것이라, 다음 버전에서 없어져도 할 말이 없다. 실제 앱에서 이렇게 재면 안 된다. 여기서는 눈에 보이게 하려고 쓴다.

없어졌을 때 `0` 으로 물러서지 않고 `null` 을 주는 것이 중요하다. `0` 이면 화면에 "힙은 그대로입니다" 가 떠서 이 예제의 결론과 정반대로 읽힌다. 못 재는 것과 안 자란 것은 다르다.

| 한 일                    | WebAssembly 힙 |
| ------------------------ | -------------- |
| 시작                     | 30.00 MiB      |
| 10 MiB 잡기              | 36.00 MiB      |
| 10 MiB 더 잡기           | 51.94 MiB      |
| 전부 놓고 `gc.collect()` | 51.94 MiB      |

**놓아도 힙이 안 줄어든다.** 파이썬 쪽 메모리는 확실히 돌아왔다. 참조 수가 제자리로 갔고 `gc.collect()` 도 돌렸다. 그런데 브라우저가 잡고 있는 덩어리는 그대로다.

WebAssembly 의 선형 메모리는 늘어나기만 하고 줄어들지 않기 때문이다. 파이썬이 "이 자리 이제 안 써" 라고 해도 그 자리는 파이썬 힙 안에서 재사용될 뿐, 브라우저에게 반납되지 않는다. 시작값 30 MiB 는 Pyodide 가 `INITIAL_MEMORY` 로 잡아 둔 값이다.

표의 마지막 행이 그 재사용을 보여 준다. 놓고 나서 같은 만큼 다시 잡아도 힙이 더 늘지 않는다. 자리는 확실히 비었던 것이다.

그러니 누수를 "메모리가 얼마 남았나" 로 감시하려 들면 늦다. 한 번 자란 것은 탭을 닫기 전까지 그대로다. 세어야 할 것은 힙이 아니라 살아 있는 손잡이 수다.

### 3. 놓는 세 가지 방법

```js
addWay('destroy()', '언제나 됩니다', () => {
  const handle = pyodide.globals.get('TARGET');
  handle.destroy();
});
```

가장 단순하지만 중간에 예외가 나면 건너뛴다. 그래서 예외가 날 수 있는 자리에서는 `finally` 로 감싼다.

```js
addWay('try / finally', '언제나 됩니다', () => {
  const handle = pyodide.globals.get('TARGET');
  try {
    return handle.type;
  } finally {
    handle.destroy();
  }
});
```

`using` 은 스코프를 벗어날 때 알아서 놓아 준다. `PyProxy` 에 `[Symbol.dispose]` 가 있어서 되는 것이다. 다만 이건 자바스크립트 문법이라 조심할 것이 있다.

```js
function makeUsingRunner() {
  // CSP 에 unsafe-eval 이 없으면 new Function 자체가 던진다. 그때는 문법 지원 여부와
  // 무관하게 못 쓰는 것이라 결과는 같다.
  try {
    return new Function(
      'get',
      `{
        using handle = get();
        return handle.type;
      }`,
    );
  } catch {
    return null;
  }
}
```

**파일에 그냥 쓰면 안 된다.** 문법이라 모르는 브라우저에서는 파일 전체가 파싱 단계에서 죽는다. 기능 감지 배너를 띄울 틈도 없다. 그래서 문자열로 두었다가 쓸 수 있을 때만 함수로 만든다. 실패하면 `null` 이 돌아오고, 화면에는 "이 브라우저는 지원하지 않습니다" 가 뜬다.

Chrome 151 에서 확인한 결과다.

| 방법            | 참조 수가 돌아왔나      |
| --------------- | ----------------------- |
| 그냥 두기       | 안 돌아왔다 (202 → 203) |
| `destroy()`     | 돌아왔다                |
| `try / finally` | 돌아왔다                |
| `using`         | 돌아왔다                |

여러 개를 한꺼번에 놓는 방법도 있다. 파이썬 쪽에서 `from pyodide.ffi import destroy_proxies` 로 꺼내 쓴다. 자바스크립트 쪽 `pyodide.ffi` 에는 없으니 헷갈리지 말자. `toJs({ pyproxies })` 와 짝이라 [04번](../04-type-conversions/)에서 자바스크립트 쪽 방식을 이미 봤다.

### 4. 놓은 손잡이를 다시 쓰면

```js
try {
  handle.type;
  lines.push('다시 썼는데 아무 일도 없었습니다. 뜻밖입니다.');
} catch (error) {
  lines.push(`다시 쓰기: ${error.constructor.name}: ${error.message}`);
}
```

이렇게 나온다.

```text
Error: Object has already been destroyed
For more information about the cause of this error, use `pyodide.setDebug(true)`
```

메시지가 알려 주는 대로 `pyodide.setDebug(true)` 를 켜면 한 줄이 더 붙는다.

```text
Object has already been destroyed
The object was of type "dict" and had repr "{'note': '손잡이가 이 dict 를 붙잡는다'}"
```

붙는 것은 **무엇을** 놓았는지다. 타입과 `repr` 이 나온다. 어디서 놓았는지는 알려 주지 않는다. `error.stack` 을 봐도 거기 담긴 것은 다시 쓴 자리의 스택이고, 그건 `setDebug` 를 꺼도 똑같다.

그래도 값이 있다. 비슷한 손잡이 여럿을 다루다 보면 "그래서 지금 죽은 게 어느 쪽이냐" 가 먼저 궁금해진다. `repr` 이 그걸 바로 알려 준다.

두 번 놓는 것은 괜찮다.

```js
try {
  handle.destroy();
  lines.push('두 번 놓기: 조용히 지나갑니다.');
} catch (error) {
  lines.push(`두 번 놓기: ${error.message}`);
}
```

이미 놓았으면 할 일이 없을 뿐이다. 그래서 `finally` 에서 마음 놓고 부를 수 있다. 앞선 예제들이 `value?.destroy?.()` 를 아무 데서나 부르는 것도 이 때문이다.

## 직접 해볼 것

- "손잡이 100개 만들고 안 놓기" 를 여러 번 눌러 보자. 참조 수가 정확히 100씩 오른다
- "모아 둔 것 전부 놓기" 를 누르고 다시 세어 보자. 정확히 제자리로 돌아온다
- "10 MiB 잡고 안 놓기" 를 대여섯 번 눌러 보자. 누를 때마다 자라지는 않는다. 몇 번에 한 번씩 계단처럼 뛴다
- 그 뒤에 "잡은 것 놓기" 를 누르고 다시 잡아 보자. 이번에는 힙이 안 는다. 놓아 준 자리가 파이썬 힙 안에서 재사용되기 때문이다
- 그 뒤에 "잡은 것 놓기" 를 눌러 보자. 힙은 그대로다. 여기가 이 예제의 요점이다
- 개발자 도구 콘솔에서 `pyodide` 를 꺼내 보자. 없다. 모듈 스코프 안에 있어서 전역에 안 올라간다
- 그래서 `setDebug` 를 켜려면 소스를 고쳐야 한다. `src/main.js` 에서 `getPyodide()` 를 받은 다음 줄에 `pyodide.setDebug(true)` 를 넣고 새로고침한 뒤 "놓고 나서 다시 써 보기" 를 눌러 보자. 무엇을 놓았는지가 한 줄 더 붙는다

## 막히는 지점

| 증상 | 원인 |
| --- | --- |
| `Object has already been destroyed` | 놓은 손잡이를 다시 썼다. 무엇을 놓았는지 알고 싶으면 `pyodide.setDebug(true)` |
| 놓았는데 메모리가 안 줄어든다 | 정상이다. WebAssembly 선형 메모리는 반납되지 않는다 |
| 참조 수가 안 돌아온다 | 어딘가에 손잡이가 남아 있다. 배열이나 클로저에 담아 두지 않았는지 보자 |
| `pyodide.ffi.destroy_proxies` 가 없다 | 자바스크립트 쪽이 아니라 파이썬 쪽 `pyodide.ffi` 에 있다 |
| `using` 을 썼더니 파일이 통째로 안 돈다 | 문법이라 미지원 브라우저에서 파싱이 먼저 깨진다. 기능 감지로 감쌀 수 없다 |
| 손잡이를 안 만들었는데도 힙이 크다 | 시작값이 30 MiB 다. Pyodide 가 처음부터 그만큼 잡는다 |

## 더 읽을 것

`PyProxy` 가 왜 GC 로 안 걷히는지, 선형 메모리가 왜 반납되지 않는지는 [원리 문서](../../docs/tutorials/README.md)에서 다룬다.

## 다음 예제

[06. 파이썬에서 DOM 만지기](../06-dom-from-python/) — 이벤트 핸들러를 넘길 때 손잡이 규칙이 어떻게 걸리는지.
