# 04. 값이 오가는 규칙

어떤 값은 복사돼 건너오고 어떤 값은 손잡이만 온다. 그 경계가 어디인지 직접 넣어 보며 확인한다.

![예제 화면. 위쪽에 준비됐다는 안내가 있고, 파이썬 표현식 예시 버튼들이 줄지어 있다. 표현식 입력칸에 dict 리터럴이 들어 있고, 아래 toJs 옵션 상자에 depth 슬라이더가 1 에 맞춰져 있다. 결과 표에는 자바스크립트가 받은 것이 PyProxy 파이썬 dict, toJs 결과 종류가 평범한 객체, toJs 결과가 { "a": «PyProxy dict» }, 변환하며 만든 프록시 1개가 적혀 있다. 아래쪽에는 자바스크립트 값 열세 개가 파이썬에서 어떤 타입으로 보이는지 표로, 그 아래에는 정수가 number 에서 bigint 로 갈리는 경계를 찾은 표가 있다.](screenshot.png)

> 이 문서의 측정값은 Chrome 151.0.7922.34 (headless, macOS) 에서 2026-08-23 에 Pyodide 314.0.5 로 잰 것이다. 이 규칙은 버전에 따라 바뀐 적이 있으니 옛 자료를 그대로 믿지 말자.

## 무엇을 배우나

- 무엇이 복사되고 무엇이 손잡이로 오는지. 양쪽 방향 모두
- `toJs()` 의 `depth` 로 얼마나 깊이 바꿀지 정한다
- `dict` 는 이제 `Map` 이 아니라 평범한 객체로 온다. 옛 문서와 다르다
- `null` 은 `jsnull`, `undefined` 는 `None`. 둘이 갈린다
- 정수가 `number` 에서 `bigint` 로 넘어가는 자리

## 실행 방법

```bash
mise run serve
```

브라우저로 `http://localhost:4173/galleries/04-type-conversions/` 를 연다. 예시 버튼을 눌러 보거나 표현식을 직접 고쳐 넣으면 된다.

## 핵심 코드

### 1. 값으로 오는 것과 손잡이로 오는 것

Chrome 151 에서 확인한 결과다.

| 파이썬        | 자바스크립트가 받는 것 |
| ------------- | ---------------------- |
| `42`          | `number`               |
| `2**70`       | `bigint`               |
| `1.5`         | `number`               |
| `"안녕"`      | `string`               |
| `True`        | `boolean`              |
| `None`        | `undefined`            |
| `[1, 2, 3]`   | `PyProxy (list)`       |
| `(1, 2)`      | `PyProxy (tuple)`      |
| `{"a": 1}`    | `PyProxy (dict)`       |
| `{1, 2}`      | `PyProxy (set)`        |
| `b"ab"`       | `PyProxy (bytes)`      |
| `lambda x: x` | `PyProxy (function)`   |

규칙은 단순하다. 자바스크립트 쪽에 대응하는 값이 있고 통째로 옮겨도 뜻이 변하지 않는 것은 복사된다. 나머지는 손잡이만 온다.

손잡이는 WebAssembly 힙 안의 파이썬 객체를 가리키는 표다. 그래서 값이 바뀌면 양쪽에서 같이 바뀌고, 자바스크립트 GC 가 못 걷어서 다 쓰면 놓아 줘야 한다. 그 이야기는 [05. PyProxy 의 수명](../05-pyproxy-lifetime/)에서 이어진다.

프록시인지 아닌지는 클래스에 직접 물어본다.

```js
const isProxy = value instanceof pyodide.ffi.PyProxy;
```

### 2. depth 가 어디까지 바꿀지 정한다

`toJs()` 는 기본으로 끝까지 파고들어 전부 바꾼다. `depth` 를 주면 거기서 멈춘다.

```js
if (depth >= 0) options.depth = depth;
```

`{"a": {"b": [1, 2]}}` 를 넣고 슬라이더를 움직여 보면 이렇게 갈린다.

| depth     | 결과                    | 만들어진 프록시 |
| --------- | ----------------------- | --------------- |
| -1 (기본) | `{ a: { b: [1, 2] } }`  | 0개             |
| 1         | `{ a: «PyProxy dict» }` | 1개             |

깊이를 얕게 잡으면 안쪽이 프록시로 남는다. 큰 자료를 통째로 복사하고 싶지 않을 때 쓴다. 대신 남은 프록시를 놓아 줘야 한다.

그 프록시를 어디서 찾느냐가 문제인데, 배열을 하나 주면 거기 담아 준다.

```js
const made = [];
const options = noProxy ? { create_pyproxies: false } : { pyproxies: made };
```

다 쓰고 나서 담긴 것을 비우면 된다.

```js
made.forEach((proxy) => proxy.destroy());
```

아예 안 만들게 할 수도 있다. `create_pyproxies: false` 를 주면 바꿀 수 없는 것을 만났을 때 프록시를 만드는 대신 실패한다.

```text
pyodide.ffi.ConversionError: No conversion known for x.
```

값만 오가야 하는 자리라면 이 편이 안전하다. 조용히 새는 대신 그 자리에서 터진다.

### 3. 두 옵션을 같이 주면 런타임이 죽는다

`create_pyproxies: false` 와 얕은 `depth` 를 같이 주면, 예외가 아니라 fatal error 가 난다.

```text
Pyodide internal error: Argument to hiwire_get is falsy (but error indicator is not set).
```

그 뒤로는 무엇을 실행하든 `Pyodide already fatally failed and can no longer be used.` 만 돌아온다. 새로고침 말고는 되살릴 방법이 없다.

조건을 좁혀 보면 이렇다. `depth` 가 전부 변환하기에 충분하면 멀쩡하고, 하나라도 프록시로 남아야 하는 순간 죽는다. 둘 중 하나만 주는 것은 둘 다 정상이다. Pyodide 314.0.5 에서 확인했다.

예제에서는 아예 부르지 않는다. "변환 못 하면 실패시키기" 를 켜면 depth 슬라이더가 잠긴다.

```js
if (noProxy && depth >= 0) {
  addMetricRow(pyResult, 'toJs()', '이 조합은 부르지 않습니다. 아래 설명을 보세요');
  return;
}
```

라이브러리가 늘 예외로 물러서 주지는 않는다는 것을 기억해 둘 만하다. WebAssembly 런타임은 한 번 무너지면 그 자리에서 끝이라, 자바스크립트에서 하던 것처럼 `try` 로 감싸 두면 되겠지 하고 넘기기 어렵다.

### 4. dict 는 이제 객체로 온다

여기가 옛 자료와 가장 크게 다른 곳이다. 웹에 널린 예제는 `toJs()` 가 `dict` 를 `Map` 으로 준다고 말한다. Pyodide 314.0.5 에서는 평범한 객체로 온다.

```js
if (asMapToggle.checked) options.dict_converter = (entries) => new Map(entries);
```

`Map` 이 필요하면 `dict_converter` 로 직접 지정해야 한다. 반대로 예전에는 객체를 받으려고 `dict_converter: Object.fromEntries` 를 주는 것이 관용구였는데, 이제는 그게 기본이라 줄 필요가 없다.

객체로 오는 것에는 대가가 있다. 자바스크립트 객체의 키는 문자열뿐이라 키가 문자열로 강제된다.

| 파이썬          | `toJs()` 결과        |
| --------------- | -------------------- |
| `{1: "a"}`      | `{"1": "a"}`         |
| `{1.5: "a"}`    | `{"1.5": "a"}`       |
| `{True: "a"}`   | `{"true": "a"}`      |
| `{None: "a"}`   | `{"undefined": "a"}` |
| `{(2, 3): "b"}` | `ConversionError`    |

`True` 가 `"true"` 로, `None` 이 `"undefined"` 로 바뀌는 것을 눈여겨보자. 그러면 파이썬에서 서로 다르던 키가 자바스크립트에서 같아지는 일이 생긴다. 그때는 조용히 하나로 합쳐지지 않고 그 자리에서 막힌다.

```text
pyodide.ffi.ConversionError: Key collision when converting Python dictionary to JavaScript. Key: 'true'
```

다행이다. 조용히 값 하나가 사라지는 것보다 낫다. 키가 문자열이 아닌 dict 를 넘길 때는 애초에 `Map` 을 쓰는 편이 안전하다.

### 5. null 과 undefined 는 갈린다

자바스크립트 값을 파이썬 코드 안에 끼워 넣을 수는 없다. 모듈로 등록해 두고 파이썬이 이름으로 꺼내 가게 한다.

```js
pyodide.registerJsModule('jsvalues', { get: (label) => JS_VALUES[label] });
```

파이썬 쪽에서는 그냥 `import jsvalues` 로 쓴다. 그렇게 꺼내 본 결과다.

| 자바스크립트             | 파이썬 타입 | 파이썬에서 본 값     |
| ------------------------ | ----------- | -------------------- |
| `1`                      | `int`       | `1`                  |
| `2 ** 53`                | `float`     | `9007199254740992.0` |
| `1.5`                    | `float`     | `1.5`                |
| `'hi'`                   | `str`       | `'hi'`               |
| `true`                   | `bool`      | `True`               |
| `null`                   | `JsNull`    | `jsnull`             |
| `undefined`              | `NoneType`  | `None`               |
| `[1, 2]`                 | `JsProxy`   | 프록시               |
| `{ a: 1 }`               | `JsProxy`   | 프록시               |
| `new Map([['a', 1]])`    | `JsProxy`   | 프록시               |
| `new Set([1])`           | `JsProxy`   | 프록시               |
| `() => 1`                | `JsProxy`   | 프록시               |
| `new Uint8Array([1, 2])` | `JsProxy`   | 프록시               |

**`null` 이 `None` 이 아니다.** 0.28 부터 바뀐 것인데, 옛 코드는 `null` 도 `None` 으로 온다고 가정한다. 그래서 `if value is None` 이 조용히 어긋난다.

옛 동작으로 돌리는 스위치는 `loadPyodide({ convertNullToNone: true })` 다. 314.0.5 에 아직 살아 있는 것을 확인했다. 이름 그대로 호환용이라 새로 쓰는 코드는 지금 규칙에 맞추는 편이 낫다. `toJs()` 에 주는 옵션이 아니라는 점을 조심하자. 거기 넣으면 조용히 무시된다.

`dict` 를 다시 `Map` 으로 돌리는 `toJsLiteralMap` 도 같은 성격의 스위치다.

`2 ** 53` 이 `int` 가 아니라 `float` 로 오는 것도 눈에 띈다. 자바스크립트 숫자는 전부 실수라, 안전한 정수 범위를 넘으면 정수로 볼 근거가 없어진다.

방향이 반대인 것도 짚어 두자. 자바스크립트 배열은 파이썬에서 `JsProxy` 다. 값으로 바꾸려면 `to_py()` 를 부른다. `toJs()` 의 거울상이고 `depth` 도 똑같이 받는다.

```python
import jsvalues

arr = jsvalues.get("[1, 2]")   # JsProxy
arr.to_py()                    # [1, 2] — 진짜 list
```

`{ a: 1 }` 은 `to_py()` 하면 `dict` 가 되고, `new Map(...)` 도 `dict` 가 된다. 자바스크립트 쪽 구분이 파이썬 쪽에서는 사라지는 셈이다.

### 6. 정수 경계는 페이지가 찾는다

"2의 53승쯤" 이라고 적어 두는 대신 이진 탐색으로 찾게 했다.

```js
let low = 2 ** 52;
let high = 2 ** 53;
while (high - low > 1) {
  const middle = Math.floor((low + high) / 2);
  if (kindOf(String(middle)) === 'number') low = middle;
  else high = middle;
}
```

Chrome 151 에서 나온 경계다.

| 값                 | 자바스크립트 타입 |
| ------------------ | ----------------- |
| `2**52`            | `number`          |
| `9007199254740990` | `number`          |
| `9007199254740991` | `bigint`          |
| `2**53`            | `bigint`          |
| `2**70`            | `bigint`          |

`9007199254740991` 은 `Number.MAX_SAFE_INTEGER` 다. 그 값부터 `bigint` 로 오고, 그보다 작은 것은 `number` 로 온다. 경계가 "안전한 정수의 마지막 값" 자체를 포함한다는 것이 조금 의외인데, 그래야 넘어온 `number` 를 계산에 써도 어긋나지 않는다.

실무에서는 이게 성가실 수 있다. `bigint` 와 `number` 는 섞어서 산술할 수 없어서 `1n + 1` 이 `TypeError` 다. 큰 정수를 다룰 자리라면 받는 쪽에서 타입을 한 번 확인하는 편이 낫다.

## 직접 해볼 것

- 예시 버튼을 순서대로 눌러 보자. 복사되는 것과 손잡이로 오는 것이 갈리는 자리를 확인한다
- `{"a": {"b": [1, 2]}}` 를 넣고 depth 를 -1, 2, 1, 0 으로 바꿔 보자. 프록시가 몇 개 생기는지 함께 본다
- "dict 를 Map 으로" 를 켜고 꺼 보자. 기본이 무엇인지 확인한다
- `{None: "a", "undefined": "b"}` 를 넣어 보자. 키가 충돌해서 `ConversionError` 가 난다
- `lambda x: x` 를 넣고 "변환 못 하면 실패시키기" 를 켜 보자. 조용히 프록시가 생기는 대신 오류가 난다. 그때 depth 슬라이더가 잠기는 것도 확인한다
- 자기를 담은 리스트를 넣어 보자. `(lambda l: (l.append(l), l)[1])([])` 로 만들 수 있다. 파이썬 `repr` 이 `[[...]]` 로 접는 것처럼 화면도 접는다
- `2**53 - 2` 와 `2**53 - 1` 을 넣어 보자. 딱 한 칸 차이로 타입이 갈린다
- `float("nan")` 이나 `float("inf")` 를 넣어 보자. 무엇으로 오는지 확인한다

## 막히는 지점

| 증상 | 원인 |
| --- | --- |
| `toJs()` 가 `Map` 을 안 준다 | 314 에서는 객체가 기본이다. `dict_converter` 로 지정하자 |
| `ConversionError: Key collision` 이 난다 | 자바스크립트 객체 키는 문자열이라 `True` 와 `"true"` 가 같은 키가 됐다 |
| `if value is None` 이 안 걸린다 | 자바스크립트 `null` 은 `None` 이 아니라 `jsnull` 이다 |
| `1n + 1` 이 `TypeError` | `bigint` 와 `number` 는 섞어 쓸 수 없다 |
| `toJs()` 를 했는데 안쪽이 프록시다 | `depth` 를 얕게 줬다. 그 프록시는 놓아 줘야 한다 |
| `Pyodide already fatally failed` 만 나온다 | `create_pyproxies: false` 와 얕은 `depth` 를 같이 줬다. 새로고침해야 한다 |
| 튜플을 키로 쓴 dict 가 안 넘어온다 | 자바스크립트 쪽에 대응하는 키가 없다. `Map` 을 쓰거나 키를 바꾸자 |

## 더 읽을 것

`PyProxy` 가 왜 GC 로 안 걷히는지, 큰 버퍼를 복사 없이 넘기는 법은 [원리 문서](../../docs/tutorials/README.md)에서 다룬다.

## 다음 예제

[05. PyProxy 의 수명](../05-pyproxy-lifetime/) — 놓아 주지 않으면 무슨 일이 나는지 눈으로 본다.
