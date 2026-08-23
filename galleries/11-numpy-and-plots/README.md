# 11. numpy 로 계산하고 그림 그리기

응용편 첫 예제다. 계산은 파이썬이 하고 그리기는 브라우저가 한다. 그 경계가 어디인지 본다.

![예제 화면. 맨 위 상자에 PNG 30 KiB 를 받아 넣었다는 안내가 있다. numpy 는 얼마나 빠른가 절에는 배열 크기 선택칸과 버튼이 있고, 그 아래 표에 파이썬 리스트 140 ms, numpy 배열 17 ms 로 같은 합 -681.76 이 나란히 적혀 있다. 그림을 화면에 띄우는 두 가지 길 절에는 왼쪽에 기본 백엔드가 만든 sin 곡선 위젯이 Figure 1 제목과 도구 막대와 함께 있고, 오른쪽에 agg 가 만든 같은 모양의 PNG 가 있다. 두 그림 모두 sin 과 sin * exp(-x/8) 두 곡선에 범례가 붙어 있다. 맨 아래 백엔드 확인 상자에는 matplotlib 3.10.8, 기본 백엔드 webagg, matplotlib_pyodide 는 ModuleNotFoundError, 그리고 옛 자료대로 use 를 부르면 통과하는데 그릴 때 ModuleNotFoundError 가 난다고 적혀 있다.](screenshot.png)

> 이 문서의 측정값은 Chrome 151.0.7922.34 (headless, macOS) 에서 2026-08-24 에 Pyodide 314.0.5, matplotlib 3.10.8, numpy 2.4.6 으로 잰 것이다. 시간은 기계와 캐시 상태에 따라 달라진다.

## 무엇을 배우나

- numpy 가 브라우저 안에서도 파이썬 반복문보다 빠르다. 다만 기대만큼 압도적이지는 않다
- 그림을 화면에 올리는 길이 둘이고, 고르는 기준이 다르다
- **웹에 널린 `matplotlib-pyodide` 설명은 314 에서 안 통한다.** 그 패키지가 락파일에 없다
- `matplotlib.use()` 는 거짓말을 할 수 있다. 언제 거짓말하는지 규칙이 있다
- 이 예제 하나가 18 MiB 를 받는다

## 실행 방법

```bash
mise run serve
```

<http://localhost:4173/galleries/11-numpy-and-plots/> 를 연다. numpy 와 matplotlib 을 받으므로 기초편 예제보다 한참 오래 걸린다.

## 핵심 코드

### 1. 받는 양이 자릿수 하나 늘어난다

기초편 예제는 런타임만 받아 5.95 MiB 였다. 여기서는 화면이 이렇게 알려 준다.

```text
준비됐습니다. 17개 파일, 18.19 MiB 를 받았습니다.
```

세 배가 됐다. numpy wheel 이 2.8 MB, matplotlib 이 6.6 MB 이고 matplotlib 은 의존성을 열 개 끌고 온다. wheel 은 이미 zip 이라 전송 중에 더 줄지 않는다. [09. PyPI 에서 설치하기](../09-packages-micropip/)에서 본 그대로다.

이건 처음 열었을 때 이야기다. 같은 브라우저로 다시 열면 훨씬 적게 받는다. 다만 얼마나 적은지는 실행마다 달랐다. 한 번은 열일곱 개 중 열여섯 개가 캐시에서 오고 matplotlib wheel 만 다시 받아 6.56 MiB 였고, 다른 실행에서는 열일곱 개 전부 캐시에서 와 0 B 였다. 브라우저의 디스크 캐시 사정이라 여기서 숫자를 못 박지 않는다.

그러니 `packages` 로 미리 받는 것이 중요하다. 부팅과 병렬로 받기 때문이다.

```js
pyodide = await getPyodide({ packages: ['numpy', 'matplotlib'] });
```

### 2. numpy 가 빠른 이유는 브라우저와 상관없다

같은 식을 두 방법으로 계산한다. 파이썬 반복문 쪽은 이렇다.

```python
    values = [math.sqrt(i) * math.sin(i) for i in range(size)]
    total = sum(values)
```

numpy 쪽은 이렇다.

```python
    arr = np.arange(size, dtype=np.float64)
    total = float((np.sqrt(arr) * np.sin(arr)).sum())
```

원소 100만 개로 재면 이렇게 나온다.

| 방법          | 걸린 시간 | 결과 합 |
| ------------- | --------- | ------- |
| 파이썬 리스트 | 140 ms    | -681.76 |
| numpy 배열    | 17 ms     | -681.76 |

8배쯤이다. 그런데 **버튼을 다시 누르면 숫자가 달라진다.**

| 누른 횟수 | 파이썬 리스트 | numpy | 배율   |
| --------- | ------------- | ----- | ------ |
| 1회       | 139 ms        | 18 ms | 7.7배  |
| 2회       | 133 ms        | 10 ms | 13.3배 |
| 3회       | 133 ms        | 10 ms | 13.3배 |
| 4회       | 133 ms        | 9 ms  | 14.8배 |

리스트 쪽은 그대로인데 numpy 쪽이 18 ms 에서 9~~10 ms 로 빨라진다. 첫 클릭 값은 실행마다 11~~18 ms 로 흔들려서 배율도 8배에서 13배 사이를 오간다. 두 번째부터가 안정적이다. 첫 호출에서 치르는 몫이 있다는 뜻이다. 그러니 화면에 처음 뜨는 9배가 numpy 의 실력은 아니다. 눌러 봐야 안다.

이건 브라우저라서 그런 것이 아니라 계측할 때 늘 있는 일이다. 앞의 [10번 예제](../10-http-and-cors/)에서 `import requests` 가 타이머 안에 들어가 통로 비용을 50배로 부풀렸던 것과 같은 종류다.

네이티브 파이썬에서 재도 비슷한 비율이 나온다. numpy 가 빠른 까닭이 원소마다 인터프리터를 왕복하지 않고 C 로 컴파일된 반복문 안에서 끝내기 때문인데, 그 사정은 WebAssembly 위에서도 그대로다.

바꿔 말하면 **브라우저라서 numpy 가 특별히 유리해지지도, 불리해지지도 않는다.** 다만 둘 다 네이티브보다 느리다. 여기서 잰 것은 브라우저 안에서의 상대 비교다.

### 3. 그림을 올리는 길은 둘이다

왼쪽 칸은 matplotlib 이 직접 만든다.

```python
    matplotlib.use("webagg", force=True)
    import matplotlib.pyplot as plt

    importlib.reload(plt)
```

그리고 `plt.show()` 를 부르면 캔버스와 도구 막대가 화면에 생긴다. 어디에 생길지는 자바스크립트 쪽에서 정해 준다.

```js
document.pyodideMplTarget = mplTarget;
```

이 전역을 안 정해 두면 `<body>` 끝에 붙는다. 레이아웃이 무너지는 것으로 알아채게 된다.

오른쪽 칸은 그림을 바이트로 받아 넣는다.

```python
    buffer = io.BytesIO()
    fig.savefig(buffer, format="png", dpi=110)
    plt.close(fig)  # 안 닫으면 그림이 쌓인다. 화면에 안 보여도 메모리에는 남는다.
    return base64.b64encode(buffer.getvalue()).decode()
```

자바스크립트는 받은 문자열을 `src` 에 넣기만 한다.

|             | 기본 백엔드       | agg + PNG                     |
| ----------- | ----------------- | ----------------------------- |
| 확대·이동   | 도구 막대로 된다  | 안 된다                       |
| 결과물      | 캔버스와 DOM 위젯 | PNG 바이트 (이 그림은 30 KiB) |
| 저장하기    | 도구 막대의 버튼  | `<img>` 를 그대로 저장        |
| 어디서 도나 | 브라우저 안에서만 | 어디서나 같은 그림            |

고르는 기준은 간단하다. 사람이 만지작거려야 하면 왼쪽, 결과를 파일로 넘기거나 보고서에 넣어야 하면 오른쪽이다.

### 4. 옛 자료를 그대로 따라 하면 막힌다

검색하면 대부분 이렇게 하라고 한다.

```python
matplotlib.use("module://matplotlib_pyodide.html5_canvas_backend")
```

**314.0.5 에는 `matplotlib_pyodide` 가 없다.** 락파일에 들어 있지 않다. 화면의 "확인해 보기" 를 누르면 직접 물어본 결과가 나온다.

```text
matplotlib      3.10.8
기본 백엔드      webagg   (이 파일이 올라올 때 잡아 둔 값)
지금 백엔드      webagg
matplotlib_pyodide  ModuleNotFoundError — 락파일에 없다
```

없어도 되는 이유는 matplotlib 자체가 브라우저용 백엔드를 갖게 됐기 때문이다. 기본값인 `webagg` 가 그것이고, `pyodide` 라는 이름으로도 등록돼 있다. 예전에는 별도 패키지가 하던 일을 이제 본체가 한다.

### 5. use() 는 조건에 따라 거짓말한다

여기가 이 예제에서 가장 조심할 자리다. 없는 백엔드를 지정해도 `use()` 가 통과할 때가 있다.

같은 버튼을 **그림을 그리기 전에** 누르면 이렇게 나온다.

```text
옛 자료가 시키는 대로 해 보면:
  (pyplot 이 이미 올라와 있나: False)
  use(...)        통과. get_backend() = module://matplotlib_pyodide.html5_canvas_backend
  그리기          ModuleNotFoundError: No module named 'matplotlib_pyodide'
```

**그림을 한 번 그린 뒤에** 누르면 다르다.

```text
  (pyplot 이 이미 올라와 있나: True)
  use(...)        ModuleNotFoundError
  그리기          성공
```

규칙은 `pyplot` 이 올라와 있느냐다. 아직 안 올라왔으면 `use()` 는 이름만 적어 두고 검사를 미룬다. 실제로 백엔드를 불러오는 것은 첫 그림을 그릴 때다. 이미 올라와 있으면 그 자리에서 갈아 끼워야 하므로 즉시 확인한다.

그래서 `use()` 가 통과했다는 것만 보고 "백엔드가 잡혔다" 고 판단하면 안 된다. 이 예제 시리즈에서 반복해서 나온 함정이다. [10. 왜 requests 가 안 되는가](../10-http-and-cors/)의 `connect()` 도 같은 모양이었다.

### 6. 레티나 화면에서 그림이 잘린다

이 예제를 만들면서 가장 오래 붙잡은 자리다. 일반 화면에서는 멀쩡한 그림이 레티나 화면에서는 왼쪽 위 4분의 1만 보였다.

파이썬 쪽에 물어보면 사정이 드러난다.

```text
devicePixelRatio = 2
device_pixel_ratio=2  dpi=200.0  크기=[4.4 3.2]
버퍼 440x320 / CSS 440px x 320px
```

브라우저가 알려 준 배율 2 를 파이썬이 받아 dpi 를 200 으로 올렸다. 4.4 인치 × 200 dpi = 880 픽셀을 그린다는 뜻이다. 그런데 캔버스 버퍼는 440×320 그대로다. 880 을 440 짜리 그릇에 부으니 왼쪽 위만 남는다.

`webagg` 와 `pyodide` 두 백엔드가 똑같이 그랬다. `set_size_inches(forward=True)` 로 다시 알려 줘도, 창 크기 변경 이벤트를 보내도 버퍼는 그대로였다. 배율을 1 로 되돌리는 것이 통했다.

```python
    # 레티나 화면에서 그림의 왼쪽 위 4분의 1만 보이는 것을 막는다. 브라우저가 알려 준
    # devicePixelRatio 2 를 받아 파이썬은 dpi 를 200 으로 올려 두 배로 그리는데, 캔버스
    # 버퍼는 그대로 440x320 에 머문다. 배율을 1 로 되돌려 그린 크기와 버퍼를 맞춘다.
    # 밑줄로 시작하는 비공개 API 다. 대신할 공개 API 를 찾지 못했다.
    if hasattr(fig.canvas, "_set_device_pixel_ratio"):
        fig.canvas._set_device_pixel_ratio(1)
        fig.canvas.draw()
```

밑줄로 시작하는 비공개 API 라 언제 사라져도 이상하지 않다. 대신할 공개 API 는 찾지 못했다. 그래서 `hasattr` 로 감싸 두었다. 없어지면 그림이 다시 잘릴 뿐 페이지가 죽지는 않는다.

레티나에서 선이 조금 부드러워 보이는 것은 이 때문이다. 1배로 그린 것을 브라우저가 2배로 늘린다. 선명한 그림이 필요하면 오른쪽 길, 즉 `savefig` 에 `dpi` 를 높여 주는 쪽이 낫다.

### 7. use() 는 기본값도 덮어쓴다

원래 기본 백엔드가 무엇이었는지 나중에 되물을 수 없다. `use()` 가 `rcParams` 와 `rcParamsDefault` 를 함께 바꾸기 때문이다. 그래서 아무것도 건드리기 전에 잡아 둔다.

```python
# use() 는 rcParams 와 rcParamsDefault 를 함께 덮어쓴다. 한번 부르고 나면 원래 기본값을
# 되물을 방법이 없으므로, 아무것도 건드리기 전인 지금 잡아 둔다.
DEFAULT_BACKEND = matplotlib.rcParams["backend"]
```

이걸 안 하고 `rcParamsDefault["backend"]` 를 읽으면, PNG 버튼을 누른 뒤에는 기본값이 `agg` 라고 나온다. 실제로 이 예제를 만들다 그렇게 잘못 적었다.

## 직접 해볼 것

- 배열 크기를 500만으로 올려 보자. 파이썬 리스트 쪽에서 화면이 눈에 띄게 멈춘다. 계산이 메인 스레드에서 돌기 때문이고, 워커로 옮기는 이야기는 고급편에서 한다
- `src/main.js` 에서 `document.pyodideMplTarget` 줄을 지우고 왼쪽 그림을 그려 보자. 그림이 페이지 맨 아래에 붙는다
- `src/main.py` 의 `plt.close(fig)` 를 지우고 PNG 버튼을 여러 번 눌러 보자. 화면은 그대로인데 경고가 쌓인다
- 그래프 라벨을 한글로 바꿔 보자. 네모로 나온다. 아래 표에 이유가 있다
- "확인해 보기" 를 그림 그리기 전과 후에 각각 눌러 결과가 달라지는 것을 확인하자
- `src/style.css` 의 `.plot-box canvas` 규칙을 지우고 왼쪽 그림을 그려 보자. 그림이 사라지고 빈 상자만 남는다
- `src/main.py` 의 `_set_device_pixel_ratio` 줄을 지우고 레티나 화면에서 열어 보자. 그림이 잘린다

## 막히는 지점

| 증상 | 원인 |
| --- | --- |
| `ModuleNotFoundError: matplotlib_pyodide` | 314 락파일에 없다. `webagg` 나 `pyodide` 를 쓰면 된다 |
| `use()` 는 됐는데 그릴 때 터진다 | `pyplot` 이 아직 안 올라왔으면 `use()` 가 검사를 미룬다 |
| 그림이 페이지 맨 아래에 붙는다 | `document.pyodideMplTarget` 을 안 정해 뒀다 |
| 한글 라벨이 네모로 나온다 | 번들에 든 폰트에 한글 글리프가 없다. family 20종인데 DejaVu 5종에 나머지는 STIX 와 Computer Modern 이다 |
| 콘솔에 `MatplotlibDeprecationWarning` 이 뜬다 | matplotlib 이 그림을 그리며 스스로 내는 것이다. 파이썬 기본 필터가 같은 자리를 한 번만 내보내므로 버튼마다 처음 한 번씩만 보인다 |
| PNG 를 여러 번 만들면 느려진다 | `plt.close()` 를 안 해 그림이 쌓였다 |
| 레티나에서 그림 왼쪽 위만 보인다 | 파이썬은 2배로 그리는데 캔버스 버퍼가 1배다. §6 참고 |
| 그림이 안 보이고 빈 상자만 있다 | 공통 CSS 가 `canvas` 에 배경을 준다. matplotlib 이 위에 겹쳐 놓은 캔버스가 불투명해져 덮는다 |
| 첫 로딩이 유난히 길다 | 18 MiB 를 받는다. 정상이다 |

## 더 읽을 것

wheel 이 왜 압축되지 않는지, 네이티브 확장이 어떤 ABI 로 빌드돼야 하는지는 [패키지 목록](../../docs/packages.md)에 있다. numpy 배열이 WASM 메모리 어디에 있는지는 [01. WebAssembly 는 어떻게 도는가](../../docs/tutorials/01-how-wasm-works.md)에서 다룬다.

## 다음

응용편은 여기서 시작한다. 다음 예제들은 이 위에 얹는다. 올린 파일을 pandas 로 다루는 것, 이미지를 numpy 배열로 바꿔 캔버스에 되돌리는 것, 브라우저 안에서 모델을 학습시키는 것. [갤러리 목록](../)에서 이어서 볼 수 있다.
