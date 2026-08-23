# 12. 내 데이터가 밖으로 안 나간다

CSV 를 올려 pandas 로 분석한다. 그리고 그 파일이 한 발짝도 안 나갔다는 것을 숫자로 확인한다.

![예제 화면. 위쪽 상자에 다 읽었다는 안내가 있다. 데이터 고르기 절에는 파일 고르기 칸과 인코딩 선택칸, 파일 없이 예제 데이터로 버튼이 있다. 그 아래 이 페이지가 주고받은 것 전부 표에는 부팅에 쓴 요청 17건에 13.20 MiB 를 받았고, 분석하며 생긴 요청은 0건이며, 판정 칸에 데이터는 이 브라우저를 벗어나지 않았습니다 가 초록 글씨로 적혀 있다. 맨 아래 분석 결과에는 행 6개 열 5개, 열마다 타입과 고유값 수와 결측 여부, 숫자 열 요약 표, 부서 별로 세기, 처음 세 줄이 차례로 나온다.](screenshot.png)

> 이 문서의 측정값은 Chrome 151.0.7922.34 (headless, macOS) 에서 2026-08-24 에 Pyodide 314.0.5, pandas 3.0.2 로 잰 것이다.

## 무엇을 배우나

- 올린 파일을 `FS.writeFile` 로 넣고 pandas 로 읽는 길
- **아무것도 안 나갔다는 것을 증명하는 법.** 말로 하지 않고 브라우저가 기록한 요청 수를 센다
- 한글 CSV 의 인코딩. `cp949` 파일을 `utf-8` 로 읽으면 무슨 오류가 나는지
- 한글이 든 표를 고정폭으로 맞추는 법
- pandas 를 받는 비용

## 실행 방법

```bash
mise run serve
```

<http://localhost:4173/galleries/12-csv-analysis/> 를 연다. 파일이 없으면 "파일 없이 예제 데이터로" 를 누르면 된다.

## 핵심 코드

### 1. 이 예제의 요점은 분석이 아니다

CSV 를 분석하는 웹 도구는 널려 있다. 대부분 파일을 서버로 보낸다. 브라우저 파이썬이 다른 점은 **계산이 사용자 기기 안에서 끝난다**는 것인데, 그건 말로 하면 안 믿긴다. 개인정보가 든 파일을 올리라고 할 때 "안 보냅니다" 라는 문장 하나로는 부족하다.

그래서 이 예제는 화면에 요청 수를 센다. 브라우저가 이미 기록해 두는 것을 읽기만 하면 된다.

```js
function requests() {
  return performance.getEntriesByType('resource');
}
```

부팅이 끝난 시점의 개수를 기억해 둔다.

```js
baseline = requests().length;
```

그 뒤에 늘어난 것이 곧 "나간 것" 이다.

```js
const all = requests();
const since = all.slice(baseline);
const transferred = all.reduce((sum, entry) => sum + entry.transferSize, 0);
```

파일을 올리고 분석해도 이 숫자는 0 이다.

```text
부팅에 쓴 요청        17건 · 13.20 MiB 받음
분석하며 생긴 요청     0건
판정                 데이터는 이 브라우저를 벗어나지 않았습니다
```

의심스러우면 개발자 도구의 네트워크 탭을 열어 두고 파일을 올려 보면 된다. 아무 줄도 늘어나지 않는다.

한 가지 밝혀 둘 것이 있다. 이 계측은 **이 페이지가 만든 요청**만 센다. 확장 프로그램이나 다른 탭이 하는 일은 안 보인다. 이 페이지의 코드가 데이터를 보내지 않는다는 것까지가 증명되는 범위다.

### 2. 파일은 가짜 파일시스템으로 들어간다

`<input type="file">` 로 고른 파일은 아직 브라우저 안에만 있다. 그걸 파이썬이 읽으려면 [08. 파일 다루기](../08-file-system/)에서 본 자리로 옮겨야 한다.

```js
const bytes = new Uint8Array(await file.arrayBuffer());
pyodide.FS.writeFile(UPLOAD_PATH, bytes);
await analyze('load_uploaded', encodingSelect.value);
```

파이썬 쪽은 그냥 경로를 읽는다. 이게 진짜 파일인지 메모리 위의 흉내인지 모른다.

```python
    try:
        frame = pd.read_csv(UPLOAD_PATH, encoding=encoding)
    except UnicodeDecodeError as exc:
        # 한글 윈도우에서 만든 CSV 는 대개 cp949 다. 이 오류가 그 신호다.
        raise ValueError(
```

MEMFS 라 새로고침하면 사라진다. 남기고 싶으면 08번에서 본 IDBFS 를 쓴다.

### 3. 한글 CSV 는 대개 cp949 다

엑셀이 한글 윈도우에서 저장한 CSV 는 utf-8 이 아니다. 그대로 읽으면 이렇게 된다.

```text
ValueError: utf-8 로 읽지 못했습니다. 인코딩을 바꿔 보세요.
원문: 'utf-8' codec can't decode byte 0xc0 in position 0: invalid start byte
```

`0xc0` 은 utf-8 에서 시작 바이트로 쓸 수 없는 값이다. 그래서 "position 0" 에서 바로 걸린다. 인코딩을 `cp949` 로 바꾸면 읽힌다.

이 오류를 그대로 두면 읽는 사람은 파일이 깨진 줄 안다. 그래서 `UnicodeDecodeError` 만 따로 잡아 무엇을 해 보라는 말을 붙였다. 원문도 함께 남긴다. 감추면 확인할 길이 없다.

### 4. 한글은 두 칸을 먹는다

파이썬의 `f"{name:<10}"` 은 글자 수로 채운다. 한글은 화면에서 두 칸을 차지하므로 한글이 든 줄만 짧아져 표가 어긋난다.

```python
def width(text: str) -> int:
    """화면에서 차지하는 칸 수. 한글과 한자는 두 칸을 먹는다."""
    return sum(2 if unicodedata.east_asian_width(ch) in "WF" else 1 for ch in text)
```

`unicodedata.east_asian_width` 가 글자마다 `W`(넓음) 나 `F`(전각) 를 알려 준다. 이 둘만 두 칸으로 세면 맞는다.

pandas 가 만들어 주는 표(`to_string()`)는 이미 이걸 고려한다. 우리가 손으로 줄을 맞추는 자리에서만 필요하다.

## 직접 해볼 것

- 개발자 도구 네트워크 탭을 열어 두고 파일을 올려 보자. 줄이 하나도 안 늘어난다
- 한글이 든 CSV 를 엑셀에서 "CSV UTF-8" 이 아닌 그냥 "CSV" 로 저장해 올려 보자. `utf-8` 인 채로는 §3 의 오류가 난다
- `src/main.js` 의 `baseline` 을 0 으로 고정해 보자. 부팅에 쓴 요청까지 "분석하며 생긴 요청" 으로 세어 판정이 뒤집힌다
- 아주 큰 CSV 를 올려 보자. 파일 전체가 메모리에 두 번 올라간다. 브라우저에서 한 번, WASM 힙에서 또 한 번
- `src/main.py` 의 `pad()` 를 `f"{name:<14}"` 로 바꿔 보자. 한글 열 이름이 있는 줄만 어긋난다

## 막히는 지점

| 증상 | 원인 |
| --- | --- |
| `UnicodeDecodeError: 'utf-8' codec can't decode byte 0xc0` | 한글 윈도우에서 저장한 CSV 다. 인코딩을 `cp949` 로 바꾼다 |
| 표의 열이 삐뚤빼뚤하다 | 한글을 한 칸으로 세어 채웠다. §4 참고 |
| 큰 파일에서 탭이 죽는다 | 파일이 메모리에 두 번 올라가고, 파싱도 메인 스레드에서 돈다 |
| 새로고침하니 올린 파일이 없다 | MEMFS 다. 남기려면 IDBFS 를 쓴다 |
| 요청 수가 0 이 아니다 | 이 페이지가 무언가를 더 받았다는 뜻이다. 어느 주소인지 판정 칸에 찍힌다 |

## 더 읽을 것

MEMFS 가 왜 새로고침에 사라지는지는 [02. CPython 을 브라우저로 옮기기](../../docs/tutorials/02-emscripten-and-cpython.md)에서 다룬다. 파일 다루는 법 자체는 [08. 파일 다루기](../08-file-system/)에 있다.

## 다음

다음은 이미지다. 사진을 numpy 배열로 바꿔 손보고 다시 캔버스에 돌려놓는다. [갤러리 목록](../)에서 이어서 볼 수 있다.
