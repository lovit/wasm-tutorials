# 09. PyPI 에서 설치하기

락파일에 없는 패키지를 브라우저에서 받아 쓰고, 무엇이 되고 무엇이 안 되는지 가리는 법을 익힌다.

![예제 화면. 골라 보기 상자에 jamo·hgtk·soyspacing·soynlp·konlpy·kiwipiepy 여섯 개가 설명과 함께 라디오로 있다. 물어보기 결과에는 soynlp 0.0.493 이 파일 3개 중 순수 파이썬 wheel 1개를 갖고 있어 패키지 자체는 되지만, 의존성에 numpy·psutil·scipy·scikit-learn 이 있고 그중 하나라도 순수가 아니면 막힌다는 판정이 적혀 있다. 그 아래 설치 결과 상자에는 psutil 때문에 실패했다는 오류가 따로 남아 있다. 목록에는 hgtk 와 jamo 는 PyPI 에서 받았고 micropip 과 six 는 락파일에 있던 것이라고 나온다. 맨 아래 한국어 만지기 결과에는 자모로 쪼갠 것, 낱자로 분해한 것, 조사를 붙인 것 세 줄이 보인다.](screenshot.png)

> 이 문서의 측정값은 Chrome 151.0.7922.34 (headless, macOS) 에서 2026-08-23 에 Pyodide 314.0.5 로 확인한 것이다. PyPI 의 패키지 내용은 바뀔 수 있다.

## 무엇을 배우나

- `micropip.install` 로 PyPI 에서 순수 파이썬 패키지를 바로 받는다
- 순수 파이썬 wheel 이 있는지로 될지 안 될지 가린다
- 자기가 순수해도 의존성 하나가 막을 수 있다
- 브라우저에서 PyPI 에 직접 물어볼 수 있다

## 실행 방법

```bash
mise run serve
```

브라우저로 `http://localhost:4173/galleries/09-packages-micropip/` 를 연다. 패키지를 골라 물어보고 설치해 보면 된다.

## 핵심 코드

### 1. 판별법이 목록보다 오래간다

무엇이 되는지 외우는 것보다 가리는 법을 아는 편이 낫다. PyPI 는 어떤 파일이 올라와 있는지 알려 준다.

```python
    files = [item["filename"] for item in data["urls"]]
    pure = [
        f
        for f in files
        if f.endswith("-py3-none-any.whl") or f.endswith("-py2.py3-none-any.whl")
    ]
```

파일 이름에 답이 있다.

| 파일 이름 | 뜻 | 브라우저에서 |
| --- | --- | --- |
| `jamo-0.4.1-py3-none-any.whl` | 순수 파이썬 | 된다 |
| `kiwipiepy-0.23.2-cp314-cp314t-macosx_10_15_x86_64.whl` | macOS 용 네이티브 확장 | 안 된다 |
| `foo-1.0-cp314-cp314-pyemscripten_2026_0_wasm32.whl` | Pyodide 용으로 빌드된 것 | 된다 |
| `foo-1.0.tar.gz` | 소스 배포본 | 안 된다. 빌드할 수 없다 |

`none-any` 가 열쇠다. "특정 파이썬 구현에 매이지 않고(none), 어느 플랫폼에서나(any)" 라는 뜻이다.

브라우저에서 PyPI 에 직접 물어볼 수 있다는 것도 알아 둘 만하다. CORS 가 열려 있어 `pyfetch` 로 그냥 된다.

```python
        response = await pyfetch(f"https://pypi.org/pypi/{name}/json")
```

### 2. 자기가 순수해도 막힐 수 있다

여기가 이 예제에서 가장 자주 걸리는 자리다. `soynlp` 를 물어보면 이렇게 나온다.

```text
soynlp 0.0.493
올라온 파일 3개 중 순수 파이썬 wheel 1개
  soynlp-0.0.493-py3-none-any.whl
판정: 이 패키지 자체는 됩니다
의존성:
  numpy (>=1.12.1)
  psutil (>=5.0.1)
  scipy (>=1.1.0)
  scikit-learn (>=0.20.0)
의존성 중 하나라도 순수가 아니면 그것 때문에 막힙니다.
```

조건이 붙은 의존성은 조건도 함께 보여 준다. 이걸 떼어 내면 지금 파이썬에 해당하지도 않는 것이 목록에 섞인다. `kiwipiepy` 를 물어보면 `dataclasses` 가 나오는데, 그건 파이썬 3.7 미만에서만 필요한 것이다. Pyodide 314 는 3.14 라 상관없다.

자기는 순수 파이썬이다. 그런데 설치하면 이렇게 막힌다.

```text
실패 — ValueError: Can't find a pure Python 3 wheel for 'psutil>=5.0.1'.
```

`psutil` 이 네이티브 확장이라서다. numpy 와 scipy 와 scikit-learn 은 락파일에 있어서 괜찮은데 `psutil` 만 없다. 하나가 전체를 막는다.

`deps=False` 로 의존성을 건너뛸 수는 있다. 다만 그러면 쓸 때 터진다. 게다가 락파일에 있던 numpy 조차 안 올라오므로, `import soynlp` 는 numpy 나 psutil 중 먼저 걸리는 데서 죽는다. 설치만 되고 못 쓰는 것이다. **되는 것처럼 보이게 만들 수 있다는 것이 오히려 함정이다.**

### 3. 막히는 모양이 여러 가지다

Chrome 151 에서 확인한 결과다. 걸린 시간은 회마다 흔들리므로 자릿수만 보면 된다.

| 패키지 | 결과 | 왜 |
| --- | --- | --- |
| `jamo` | 수십 ms 만에 설치 | 순수 파이썬, 의존성 없음 |
| `hgtk` | 설치됨 | 순수 파이썬. `six` 를 함께 넣어야 한다 |
| `soyspacing` | 설치됨. 조금 오래 걸린다 | 순수 파이썬. numpy 를 락파일에서 함께 끌어온다 |
| `soynlp` | `Can't find a pure Python 3 wheel for 'psutil>=5.0.1'` | 의존성이 네이티브 |
| `konlpy` | `Can't find a pure Python 3 wheel for 'jpype1>=0.7.0'` | JVM 바인딩이 필요하다 |
| `kiwipiepy` | 순수 wheel 0개 | 자기가 C++ 확장 |

`hgtk` 는 좀 다른 경우다. 순수 파이썬인데 메타데이터에 `six` 를 안 적어 두어서, 그냥 설치하면 쓸 때 `ModuleNotFoundError` 가 난다.

```python
        # hgtk 는 메타데이터에 six 를 안 적어 두어서 함께 넣어 준다.
        targets = [name, "six"] if name == "hgtk" else [name]
```

의존성 해결은 메타데이터를 믿고 하는 일이라, 메타데이터가 틀리면 도구도 틀린다.

### 4. 어디서 왔는지 알아 두기

```python
        # source 는 'pypi' 아니면 'pyodide' 다. 어디서 왔는지가 이 예제의 요점이라 함께 적는다.
        where = "PyPI 에서 받음" if entry.source == "pypi" else "락파일에 있던 것"
```

설치하고 나면 이렇게 섞여 있다.

```text
4개가 올라와 있습니다.

  hgtk 0.2.1 — PyPI 에서 받음
  jamo 0.4.1 — PyPI 에서 받음
  micropip 0.11.1 — 락파일에 있던 것
  six 1.17.0 — 락파일에 있던 것
```

`soyspacing` 까지 설치하면 여기에 `numpy 2.4.6 — 락파일에 있던 것` 이 늘어난다. 고르지도 않은 것이 딸려 온 것이다.

`six` 가 락파일에서 온 것이 눈에 띈다. `micropip` 은 필요한 것이 락파일에 있으면 그쪽을 먼저 쓴다. PyPI 를 다녀오는 것보다 빠르고, 이미 브라우저 캐시에 있을 수도 있다.

`loadPackage` 와 `micropip.install` 의 차이도 여기서 갈린다. `loadPackage` 는 락파일 안에서만 찾고, `micropip` 은 락파일을 먼저 보고 없으면 PyPI 로 간다. 그래서 대개는 `micropip` 하나로 충분하다.

### 5. 설치한 것을 바로 쓰기

```python
        # h2j 가 주는 것은 이어 쓰는 자모라 화면에서는 다시 글자로 보인다.
        # j2hcj 로 낱자 모양으로 바꿔야 쪼개진 것이 눈에 보인다.
        pieces = " ".join(jamo.j2hcj(jamo.h2j(ch)) for ch in text[:12] if ch.strip())
```

```text
자모로 쪼개기: ㅂㅡ ㄹㅏ ㅇㅜ ㅈㅓ ㅇㅔ ㅅㅓ ㅎㅏㄴ ㄱㅡㄹ ㅇㅡㄹ ㄷㅏ
'브' 를 낱자로: ('ㅂ', 'ㅡ', '')
조사 붙이기: 브라우저에서는
```

여기서 한 가지 짚고 갈 것이 있다. `h2j` 가 돌려주는 것은 "이어 쓰는 자모" 라 화면에서는 다시 글자로 뭉쳐 보인다. `j2hcj` 로 "낱자 모양" 으로 바꿔야 쪼개진 것이 눈에 보인다. 유니코드가 한글을 두 가지로 담고 있어서 생기는 일이다.

## 직접 해볼 것

- 여섯 개를 하나씩 골라 "PyPI 에 물어보기" 를 눌러 보자. 설치하기 전에 될지 알 수 있다
- `soynlp` 를 물어본 뒤 설치해 보자. 판정은 "됩니다" 인데 실제로는 막힌다. 두 결과가 위아래로 남으니 나란히 견줘 보자
- `jamo` 를 설치하기 전에 "만져 보기" 를 눌러 보자. 아직 없다고 나온다
- `hgtk` 만 설치하고 `six` 없이 써 보려면 `src/main.py` 의 `targets` 줄을 고치면 된다. `ModuleNotFoundError` 가 난다
- `soyspacing` 을 설치한 뒤 "목록 보기" 를 눌러 보자. 고르지 않은 numpy 가 락파일에서 딸려 와 있다
- "목록 보기" 로 락파일에서 온 것과 PyPI 에서 온 것을 갈라 보자
- 개발자 도구 네트워크 탭을 열고 설치해 보자. `pypi.org` 와 `files.pythonhosted.org` 로 요청이 나간다
- 같은 것을 다시 설치해 보자. 이미 있으면 아무것도 받지 않는다

## 막히는 지점

| 증상 | 원인 |
| --- | --- |
| `Can't find a pure Python 3 wheel for 'X'` | X 가 네이티브 확장이다. 그 패키지 자체일 수도, 의존성일 수도 있다 |
| 설치는 됐는데 `import` 에서 `ModuleNotFoundError` | `deps=False` 로 건너뛰었거나 메타데이터에 빠진 의존성이 있다 |
| PyPI 조회가 실패한다 | 네트워크나 CORS 문제다. PyPI 는 CORS 를 열어 두므로 대개는 네트워크 쪽이다 |
| `micropip` 이 없다 | 락파일에 있는 패키지다. `getPyodide({ packages: ['micropip'] })` 로 먼저 받자 |
| 소스 배포본만 있는 패키지 | 브라우저에는 컴파일러가 없어 빌드할 수 없다 |
| 설치가 오래 걸린다 | 의존성을 줄줄이 끌고 오는 중이다. 02번에서 pandas 하나가 다섯 개가 되던 것을 떠올리자 |

## 더 읽을 것

wheel 이름 규칙과 ABI 태그가 무엇인지는 [원리 문서](../../docs/tutorials/README.md)에서, 락파일에 무엇이 들어 있는지는 [패키지 목록](../../docs/packages.md)에서 다룬다.

## 다음 예제

[10. 왜 requests 가 안 되는가](../10-http-and-cors/) — 브라우저 안의 파이썬이 네트워크를 쓰는 법과 못 쓰는 것들.
