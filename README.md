# wasm-tutorials

WebAssembly 위에서 도는 파이썬, Pyodide 를 예제로 익히는 학습용 저장소. 예제를 순서대로 따라가면 브라우저 안에서 파이썬을 띄우고, 자바스크립트와 값을 주고받고, pandas 로 데이터를 다루고, 워커로 옮겨 UI 를 살리는 데까지 간다.

## 이게 뭔가

Pyodide 는 CPython 을 WebAssembly 로 컴파일한 것이다. 서버 없이, 설치 없이, 브라우저 탭 안에서 진짜 파이썬이 돈다. numpy 도 pandas 도 scikit-learn 도 그대로 돈다.

```js
import { getPyodide } from './galleries/_shared/pyodide.js';

const pyodide = await getPyodide();
pyodide.runPython(`
import sys
print(sys.version)
`);
```

Pyodide 자체의 API 는 `loadPyodide()` 지만, 이 저장소의 예제는 `_shared/pyodide.js` 를 거친다. 버전을 한 곳에서 관리하고 런타임을 두 번 내려받지 않기 위해서다.

내려받는 양이 적지 않고(런타임만 6MB 남짓) 네이티브보다 몇 배 느리며 소켓도 스레드도 없다. 그 제약이 어디서 오고 무엇으로 우회하는지가 이 저장소가 다루는 내용의 절반이다.

## 시작하기

```bash
mise trust && mise install   # node, python 설치
mise run setup               # prek 훅 등록
mise run serve               # 정적 서버
```

브라우저로 `http://localhost:4173/galleries/` 를 열면 된다.

이 서버는 개발용이라 `127.0.0.1` 에만 바인딩한다. 같은 네트워크의 다른 기기에서는 열리지 않는다. 저장소 루트를 그대로 서비스하는 이상 `.git` 과 `.env` 가 사정거리 안에 있기 때문이다. 점으로 시작하는 경로도 내주지 않는다.

## 무엇이 들어 있나

| 경로 | 내용 |
| --- | --- |
| [`galleries/`](galleries/README.md) | 예제와 튜토리얼. 기초 · 응용 · 고급 순서로 쌓는다 |
| [`docs/tutorials/`](docs/tutorials/README.md) | 원리 설명. WASM 이 어떻게 도는지부터 브라우저 제약까지 |
| [`docs/packages.md`](docs/packages.md) | Pyodide 가 미리 빌드해 둔 패키지 목록. 락파일에서 만든다 |
| [`docs/glossary.md`](docs/glossary.md) | 용어 대응표 |
| `scripts/` | 정적 서버와 검사 스크립트 (의존성 없음) |
| `.claude/` | 개발 워크플로 커맨드, 리뷰 에이전트 |

## 발행된 사이트

`main` 에 푸시하면 GitHub Actions 가 사이트를 만들어 배포한다.

- 사이트: <https://lovit.github.io/wasm-tutorials/>
- 랜딩 페이지에 예제가 스크린샷과 함께 나오고, 각 예제의 데모와 튜토리얼로 갈 수 있다

로컬에서 같은 결과를 만들어 볼 수 있다.

```bash
mise run site         # _site/ 에 사이트를 만든다
mise run site:serve   # 만든 사이트를 띄운다
```

빌드는 `scripts/build-site.mjs` 하나가 한다. 저장소를 읽어 랜딩 페이지를 만들고, 예제와 문서를 옮기고, 마크다운을 HTML 로 바꾼다. 의존성은 쓰지 않는다. 마크다운 렌더링은 GitHub 의 API 를 빌려 쓰므로 로컬에서 제대로 보려면 `GH_TOKEN` 이 필요하다. 없으면 원문을 그대로 보여 주는 쪽으로 물러선다.

튜토리얼의 코드 조각은 소스에서 찾아 GitHub 링크를 붙인다. 링크는 브랜치가 아니라 빌드 시점의 커밋을 가리키므로 나중에 줄이 밀려도 어긋나지 않는다.

## 어떤 Pyodide 를 쓰나

`galleries/_shared/pyodide.js` 의 `PYODIDE_VERSION` 한 곳에서 관리한다. 예제는 이 모듈을 거쳐 런타임을 받으므로 버전을 올릴 때 고칠 곳은 그 한 줄이다.

Pyodide 는 버전 체계를 바꿨다. `0.29.x` 다음이 `314.0.0` 이고, 앞 세 자리가 번들된 파이썬 버전(3.14)을 뜻한다. 웹에 널린 자료는 대부분 `0.26.x` 기준이라 그대로 베끼면 지금은 안 되는 것이 섞인다. 무엇이 달라졌는지는 각 예제의 "막히는 지점" 에 적어 두었다.

패키지 목록을 최신으로 다시 만들려면 이렇게 한다.

```bash
mise run docs:packages
```

## 개발 워크플로

예제 하나가 이슈 하나다.

```text
/start-issue "예제 설명"   → 이슈 생성 + worktree 분기
작업 + 브라우저에서 확인
/commit                    → 한국어 conventional commit
/review                    → 4개 sub-agent 병렬 리뷰
/open-pr                   → PR 생성 (Closes #N 포함)
머지 후: /worktree-clean
```

커밋 메시지에 `Co-Authored-By` 트레일러를 붙이지 않는다. 자세한 규칙은 [Git 워크플로](.claude/rules/git-workflow.md)에 있다.

## 도구

| 도구                                 | 용도                                                     |
| ------------------------------------ | -------------------------------------------------------- |
| [mise](https://mise.jdx.dev/)        | node, python 버전과 task 러너                            |
| [prek](https://github.com/j178/prek) | 커밋 전 자동 검사                                        |
| prettier                             | 포맷팅. `proseWrap: "never"` 로 마크다운 하드랩을 없앤다 |
| markdownlint                         | 마크다운 린트                                            |
| ruff                                 | 예제 안의 파이썬 코드 검사                               |

```bash
mise run fmt      # 포맷팅 (하드랩도 여기서 풀린다)
mise run lint     # 포맷 + 마크다운 + 파이썬
mise run check    # 하드랩 + 갤러리 구조 + 코드 조각
prek run --all-files
```

## 글쓰기 규칙

문단 안에서 줄을 바꾸지 않는다. 마크다운 파일, 이슈 본문, PR 본문 모두 해당한다. 자세한 이유와 예외는 [글쓰기 규칙](.claude/rules/writing-style.md)에 있다.

## 참고

- [Pyodide 문서](https://pyodide.org/en/stable/)
- [Pyodide 314.0 릴리스 노트](https://blog.pyodide.org/posts/314-release/)
- [PEP 783 — Emscripten Packaging](https://peps.python.org/pep-0783/)
