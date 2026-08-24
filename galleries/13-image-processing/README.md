# 13. 이미지를 옮기는 값

픽셀 백만 개를 파이썬과 자바스크립트 사이로 옮긴다. 복사하느냐 마느냐로 천 배가 갈린다.

![예제 화면. 위쪽 상자에 다 쟀다는 안내가 있다. 이미지 고르기 절에는 파일 고르기 칸과 예제 그림 그리기 버튼이 있고, 그 아래 원본 캔버스에 주황에서 파랑으로 넘어가는 그라디언트 위에 흰 원 여섯 개와 Pyodide 글자가 있다. 오른쪽 캔버스에는 같은 그림의 윤곽만 검은 바탕에 남아 있다. 아래에 흑백 반전 윤곽 포스터화 네 버튼이 있다. 돌려받는 두 가지 길 표에는 256×256 이 256 KiB 에 getBuffer 0.006 ms 와 toJs 20.1 ms, 512×512 가 1.00 MiB 에 0.002 ms 와 69.4 ms, 1024×1024 가 4.00 MiB 에 0.004 ms 와 370.2 ms, 2048×2048 이 16.00 MiB 에 0.004 ms 와 1672.3 ms 로 적혀 있다. 맨 아래 뷰를 들고 있으면 생기는 일 상자에는 뷰의 byteLength 가 16777216 이었다가 파이썬이 80 MiB 를 잡았다 놓은 뒤 0 이 되고 ArrayBuffer 가 떨어져 나갔다고 나오며, 다시 얻으면 16777216 로 돌아온다고 적혀 있다.](screenshot.png)

> 이 문서의 측정값은 Chrome 151.0.7922.34 (headless, macOS) 에서 2026-08-24 에 Pyodide 314.0.5, numpy 2.4.6, Pillow 12.2.0 으로 잰 것이다. 시간은 기계 상태에 따라 달라진다.

## 무엇을 배우나

- 캔버스 픽셀을 파이썬으로 넘기고 다시 받아 그리는 길
- **`getBuffer()` 는 크기와 상관없이 일정하고 `toJs()` 는 크기에 비례해 느려진다**
- 두 방향이 대칭이 아니다. 오는 쪽은 복사가 없고 가는 쪽은 복사를 피할 수 없다
- 제로카피의 대가. 뷰를 들고 있으면 조용히 빈 껍데기가 된다

## 실행 방법

```bash
mise run serve
```

<http://localhost:4173/galleries/13-image-processing/> 를 연다. 파일이 없으면 예제 그림으로 해 보면 된다.

## 핵심 코드

### 1. 두 방향은 대칭이 아니다

캔버스가 준 픽셀을 파이썬으로 보낼 때는 이렇게 한다.

```js
// 여기가 JS -> 파이썬 방향이다. 이쪽은 복사를 피할 수 없다. 캔버스가 준 픽셀은
// JS 힙에 있고 파이썬은 WASM 힙 안만 볼 수 있어서, 건너가려면 옮겨 담아야 한다.
const apply = pyGlobals.get('apply_filter');
let insideMs;
try {
  insideMs = apply(image.data, source.width, source.height, name);
} finally {
  apply.destroy();
}
```

**이쪽은 복사를 피할 수 없다.** 캔버스가 준 `Uint8ClampedArray` 는 자바스크립트 힙에 있고, 파이썬은 WASM 힙 안만 볼 수 있다. [01. WebAssembly 는 어떻게 도는가](../../docs/tutorials/01-how-wasm-works.md)에서 본 그대로다. 건너가려면 옮겨 담아야 한다.

파이썬 쪽에서 받는 모습이다.

```python
buffer = flat.to_py() if hasattr(flat, "to_py") else flat
return np.frombuffer(buffer, dtype=np.uint8).reshape(height, width, 4)
```

`to_py()` 를 안 부르면 `TypeError: a bytes-like object is required, not 'pyodide.ffi.JsProxy'` 가 난다. 넘어온 것은 아직 자바스크립트 객체를 가리키는 손잡이일 뿐이다.

돌아오는 쪽은 다르다. 결과가 이미 WASM 힙 안에 있으므로 자바스크립트가 그 자리를 들여다보기만 하면 된다.

```js
function paintResult(canvas, width, height) {
  const proxy = pyGlobals.get('result');
  const started = performance.now();
  const buffer = proxy.getBuffer('u8clamped');
  try {
    canvas.getContext('2d').putImageData(new ImageData(buffer.data, width, height), 0, 0);
    return { ms: performance.now() - started, bytes: buffer.data.byteLength };
  } finally {
    buffer.release();
    proxy.destroy();
  }
}
```

`getBuffer('u8clamped')` 가 주는 `Uint8ClampedArray` 는 그대로 `ImageData` 에 들어간다. 복사가 없다.

### 2. 크기를 키우면 갈린다

같은 배열을 두 방법으로 받아 재 봤다.

| 크기      | 바이트    | `getBuffer` | `toJs`    | 배        |
| --------- | --------- | ----------- | --------- | --------- |
| 256×256   | 256 KiB   | 0.006 ms    | 20.1 ms   | 3,350배   |
| 512×512   | 1.00 MiB  | 0.002 ms    | 69.4 ms   | 34,700배  |
| 1024×1024 | 4.00 MiB  | 0.004 ms    | 370.2 ms  | 92,550배  |
| 2048×2048 | 16.00 MiB | 0.004 ms    | 1672.3 ms | 418,075배 |

배율보다 눈여겨볼 것은 **왼쪽 열이 안 변한다**는 점이다. `getBuffer` 는 크기와 상관없이 일정하다. 하는 일이 "여기서부터 이만큼" 이라고 알려 주는 것뿐이라 옮길 바이트가 없다. `toJs` 는 크기에 정비례해 늘어난다.

`toJs` 가 무엇을 만드는지 보면 이유가 분명해진다. `(2048, 2048, 4)` 배열이면 자바스크립트 배열 2048개를 만들고, 그 안에 다시 2048개를 만들고, 그 안에 4원소짜리를 또 만든다. 자바스크립트 배열 400만 개가 생긴다. **게다가 그렇게 만든 것은 `ImageData` 에 넣을 수도 없다.** 느린 데다 쓸모도 없다.

`toJs` 자체가 나쁜 것은 아니다. [04. 값이 오가는 규칙](../04-type-conversions/)에서 본 대로 작은 딕셔너리나 리스트에는 그게 맞다. 픽셀처럼 큰 덩어리에서만 무너진다.

### 3. 메모리가 한 줄로 이어져 있어야 한다

`getBuffer` 가 복사 없이 넘기려면 배열이 메모리에 한 줄로 놓여 있어야 한다. numpy 연산 중에는 그렇지 않은 결과를 주는 것이 있다.

```python
# ascontiguousarray 로 한 줄짜리 메모리로 만든다. dstack 결과는 그렇지 않을 수 있고,
# 그러면 getBuffer 가 복사 없이 넘길 수 없다.
result = np.ascontiguousarray(out, dtype=np.uint8)
return (time.perf_counter() - started) * 1000
```

`np.dstack` 으로 알파 채널을 붙이면 메모리가 이어지지 않을 수 있다. 그 상태로 `getBuffer` 를 부르면 Pyodide 가 어쩔 수 없이 복사하거나 거절한다. `ascontiguousarray` 한 줄로 정리해 둔다.

### 4. 뷰는 창이지 사본이 아니다

여기가 이 예제에서 가장 조심할 자리다. `getBuffer` 가 주는 것은 WASM 메모리를 들여다보는 창이다. 그 메모리가 자라면 창이 닫힌다.

화면의 "뷰를 잡은 채 파이썬에 큰 것 만들기" 를 누르면 이렇게 나온다.

```text
뷰를 얻었습니다. byteLength=16777216, 첫 값=128
파이썬에서 80 MiB 를 잡았다 놓았습니다
같은 뷰를 다시 보면: byteLength=0, 첫 값=undefined
ArrayBuffer 가 떨어져 나갔나: true
이 뷰로 ImageData 만들기: InvalidStateError — Failed to construct 'ImageData': The input data has zero elements.

데이터가 사라진 것은 아닙니다. 뷰를 다시 얻으면 됩니다.
새로 얻은 뷰: byteLength=16777216, 첫 값=128
```

WASM 힙이 자랄 때 브라우저는 새 `ArrayBuffer` 를 만들고 옛것을 떼어 낸다. 그 옛것을 보던 뷰는 길이 0 짜리 껍데기가 된다.

**예외가 나지 않는다는 것이 고약하다.** `view[0]` 은 `undefined` 를 돌려주고 `byteLength` 는 0 이다. 이 예제 시리즈에서 반복해서 나온 모양이다 — [10. 왜 requests 가 안 되는가](../10-http-and-cors/)의 `connect()`, [11. numpy 로 계산하고 그림 그리기](../11-numpy-and-plots/)의 `matplotlib.use()` 와 같다.

그래서 규칙은 하나다. **뷰를 얻으면 그 자리에서 쓰고 곧바로 놓는다.** 변수에 담아 두거나 나중에 쓰려고 들고 있지 않는다. 위의 `paintResult` 가 `try/finally` 안에서 얻고 쓰고 놓는 것이 그래서다.

## 직접 해볼 것

- 큰 사진을 올려 필터를 걸어 보자. 캔버스 크기에 맞춰 줄여 넣으므로 재는 값은 그대로다
- `src/main.js` 의 `paintResult` 에서 `buffer.release()` 를 지우고 여러 번 눌러 보자
- `src/main.py` 의 `ascontiguousarray` 를 지우고 윤곽 필터를 걸어 보자
- "뷰를 잡은 채…" 를 누른 뒤 곧바로 필터를 걸어 보자. 새 뷰를 얻으므로 멀쩡하다
- `src/main.py` 의 `to_py()` 를 지워 보자. `JsProxy` 라는 오류가 난다

## 막히는 지점

| 증상 | 원인 |
| --- | --- |
| `TypeError: a bytes-like object is required, not 'pyodide.ffi.JsProxy'` | 넘어온 것은 손잡이다. `to_py()` 를 부른다 |
| `ImageData`: `The input data has zero elements` | 들고 있던 뷰가 떨어져 나갔다. §4 참고 |
| 큰 이미지에서 화면이 잠깐 멈춘다 | 필터가 메인 스레드에서 돈다. 워커로 옮기는 이야기는 고급편에서 한다 |
| `toJs()` 결과를 `ImageData` 에 못 넣는다 | 중첩 배열이라 그렇다. `getBuffer` 를 쓴다 |
| 색이 이상하게 나온다 | RGBA 네 채널이다. Pillow 로 넘길 때 알파를 따로 다뤄야 한다 |

## 더 읽을 것

WASM 의 경계로 왜 숫자만 오가는지, 선형 메모리가 자랄 때 무슨 일이 생기는지는 [01. WebAssembly 는 어떻게 도는가](../../docs/tutorials/01-how-wasm-works.md)에 있다. 손잡이를 놓아 주는 이야기는 [05. 손잡이의 수명](../05-pyproxy-lifetime/)에서 다뤘다.

## 다음

다음은 PDF 다. 브라우저 안에서 문서를 열어 글자를 뽑는다. [갤러리 목록](../)에서 이어서 볼 수 있다.
