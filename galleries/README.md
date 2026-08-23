# 갤러리

Pyodide 를 예제로 익힌다. 번호 순서대로 따라가면 앞 예제에서 배운 것을 뒤 예제가 다시 쓴다.

## 시작하기 전에

설치할 것은 없다. 정적 서버만 띄우고 브라우저로 열면 된다.

```bash
mise run serve    # http://localhost:4173/galleries/
```

첫 예제를 열면 Pyodide 런타임 6MB 남짓을 내려받는다. 그동안 안내가 보이고, 두 번째부터는 브라우저 캐시에서 오므로 훨씬 빠르다.

원리부터 알고 싶으면 [원리 문서](../docs/tutorials/README.md)를, 어떤 패키지를 쓸 수 있는지는 [패키지 목록](../docs/packages.md)을 보자. 낯선 용어는 [용어 대응표](../docs/glossary.md)에 있다.

## 학습 순서

예제는 세 묶음으로 쌓는다. 기초편은 런타임을 띄우고 파이썬과 자바스크립트 사이로 값을 주고받는 법, 응용편은 그것으로 실제로 쓸 만한 것을 만드는 법, 고급편은 스레드와 격리와 다른 런타임을 다룬다.

하나씩 추가되는 대로 여기에 목차가 붙는다. 진행 상황은 [이슈 목록](https://github.com/lovit/wasm-tutorials/issues?q=is%3Aissue+label%3Agallery)에서 볼 수 있다.

### 기초편

| # | 예제 | 배우는 것 |
| --- | --- | --- |
| 01 | [`01-hello-pyodide`](./01-hello-pyodide/) | `getPyodide()` 와 `runPython()`, 첫 방문에 드는 6MB 를 직접 재기 |
| 02 | [`02-loading-progress`](./02-loading-progress/) | 패키지를 얹는 비용, 의존성이 딸려 오는 것, 미리 받기의 실측 |
| 03 | [`03-stdout-and-errors`](./03-stdout-and-errors/) | `print` 를 화면으로 돌리고, `input()` 을 되게 하고, 트레이스백을 읽히게 하기 |
| 04 | [`04-type-conversions`](./04-type-conversions/) | 값이 오가는 규칙. `null` 과 `undefined` 가 갈리는 자리 |
| 05 | [`05-pyproxy-lifetime`](./05-pyproxy-lifetime/) | 왜 `destroy()` 가 필요한가. 누수를 숫자로 보기 |
| 06 | `06-dom-from-python` | 파이썬에서 DOM 만지기, `create_proxy` 의 함정 |
| 07 | `07-callbacks-both-ways` | 함수를 양쪽으로 넘기기, 키워드 인자가 사라지는 자리 |
| 08 | `08-file-system` | 가짜 파일시스템, 파일 올리고 내려받기, 영속화 |
| 09 | `09-packages-micropip` | PyPI 에서 바로 설치하기, 되는 것과 안 되는 것 가리기 |
| 10 | `10-http-and-cors` | 왜 `requests` 가 그냥은 안 되는가 |

### 응용편

| #   | 예제                    | 배우는 것                                          |
| --- | ----------------------- | -------------------------------------------------- |
| 11  | `11-numpy-and-plots`    | numpy 계산과 matplotlib 그림을 화면에              |
| 12  | `12-csv-analysis`       | 올린 CSV 를 pandas 로. 데이터가 밖으로 안 나간다   |
| 13  | `13-image-processing`   | 이미지를 numpy 배열로, 다시 캔버스로               |
| 14  | `14-sklearn-in-browser` | 브라우저 안에서 도는 학습 루프                     |
| 15  | `15-sql-workbench`      | 내장 `sqlite3` 와 duckdb, 새로고침해도 남는 데이터 |
| 16  | `16-mini-repl`          | 앞의 기초를 합쳐 쓸 만한 것 하나                   |

### 고급편

| #   | 예제                        | 배우는 것                                     |
| --- | --------------------------- | --------------------------------------------- |
| 17  | `17-web-worker`             | 메인 스레드를 얼리지 않기                     |
| 18  | `18-cross-origin-isolation` | 정적 호스팅에서 COOP/COEP 를 얻어내기         |
| 19  | `19-interrupt-and-run-sync` | 무한 루프 멈추기, 동기 코드로 비동기 기다리기 |
| 20  | `20-pyscript-comparison`    | 같은 것을 PyScript 로. 추상화의 대가          |

링크가 걸린 것만 만들어져 있다. 나머지는 예정이다.

## 예제 공통 규칙

모든 예제는 빌드 없이 파일 그대로 돈다. 번들러도, npm 의존성도 쓰지 않는다. 외부에서 가져오는 것은 Pyodide 런타임 하나뿐이다.

공통 자산은 `_shared/` 에 있다.

- `_shared/pyodide.js` — 런타임 로더. 버전을 여기 한 곳에서만 관리하고, 한 페이지에서 여러 번 불러도 런타임은 하나다
- `_shared/support.js` — 기능 감지와 미지원 안내 배너
- `_shared/base.css` — 예제 공통 스타일
