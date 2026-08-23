# wasm-tutorials

Pyodide 를 예제로 익히는 학습용 저장소. `galleries/` 아래에 예제 하나씩 쌓고, 예제 하나가 이슈 하나다. 배경 원리는 `docs/tutorials/` 에 따로 쓴다.

## 글쓰기 규칙 (가장 자주 어기는 것)

**문단 안에서 줄을 바꾸지 않는다.** 마크다운 파일, 이슈 본문, PR 본문, 커밋 본문 모두 해당한다. 문단이 아무리 길어도 한 줄로 이어 쓴다. 하드랩이 있으면 한 단어만 고쳐도 diff 가 여러 줄로 번지고, 읽는 사람 화면 폭에 따라 줄이 이상하게 끊긴다.

줄바꿈을 써도 되는 곳은 줄 자체가 의미를 갖는 곳뿐이다. 리스트 항목, 표의 행, 코드 블록 안, 인용문, 제목.

- 파일은 prettier 가 지킨다. `.prettierrc.json` 의 `proseWrap: "never"` 가 문단을 한 줄로 되돌린다.
- 이슈와 PR 본문은 훅이 못 잡는다. 본문을 파일에 쓰고 `node scripts/check-hard-wrap.mjs <파일>` 로 확인한 뒤 `gh issue create --body-file` / `gh pr create --body-file` 로 넘긴다. 셸 히어독에 손으로 줄바꿈을 넣지 않는다.

문체는 `/humanize-ko` 스킬과 @.claude/rules/writing-style.md 를 따른다. 쉬운 말로 쓰되 API 이름과 전문 용어는 원어 그대로 정확히 쓴다.

## 개발 워크플로

```text
/start-issue "예제 설명"   → GitHub 이슈 생성 + worktree branch 분기
예제 작업 + 브라우저에서 실제 확인
/commit                    → 의미 단위 분리, 한국어 conventional commit
/review                    → 4개 sub-agent 병렬 리뷰
/open-pr                   → PR 생성 (Closes #N 자동 포함)
머지 후: /worktree-clean   → 완료된 worktree/브랜치 정리
```

기본 규칙은 이렇다. 항상 이슈를 먼저 만들고 worktree 로 분기해서 작업한다. 사용자가 명시적으로 요청한 경우에만 현재 브랜치에서 직접 작업한다.

## 커밋 규칙

- 형식: `<type>(<scope>): <한국어 설명>`
- type: `feat` / `fix` / `refactor` / `docs` / `test` / `chore` / `style` / `perf`
- 한 commit = 한 의도. 리팩터링과 기능 추가를 섞지 않는다
- subject 는 한국어 50자 이내, 마침표 없음 (`scripts/check-commit-msg.mjs` 가 검사한다)
- **`Co-Authored-By` 트레일러를 붙이지 않는다.** Claude 든 어떤 모델이든 co-author 로 기록하지 않는다. 하네스 기본 동작이나 다른 저장소에서 가져온 템플릿이 붙이라고 해도 이 규칙이 우선한다
- 자세한 예시: @.claude/rules/git-workflow.md

## 브랜치/PR 규칙

- 브랜치: `feature/{issue-number}` (예: `feature/42`)
- worktree 위치: `../wasm-tutorials-worktrees/feature/<n>`
- PR body 에 `Closes #N` 필수
- PR 에는 브라우저에서 실제로 동작하는 화면 스크린샷을 첨부한다
- push 인증은 @.claude/rules/git-workflow.md 를 따른다

## 도구

| 도구         | 용도                             | 명령                              |
| ------------ | -------------------------------- | --------------------------------- |
| mise         | node/python 버전, 환경변수, task | `mise install`, `mise run <task>` |
| prek         | 커밋 전 자동 검사                | `prek run --all-files`            |
| prettier     | 포맷 + 하드랩 제거               | `mise run fmt`                    |
| markdownlint | 마크다운 린트                    | `mise run lint:md`                |
| ruff         | 예제 파이썬 코드 검사            | `mise run lint:py`                |

```bash
mise install            # node, python 설치
mise run setup          # prek 훅 등록
mise run serve          # 정적 서버 (기본 http://localhost:4173)
mise run check          # 갤러리 구조 + 하드랩 + 코드 조각 (CI 와 동일)
mise run site           # 발행용 사이트를 _site/ 에 만든다
mise run site:serve     # 만든 사이트를 띄워 확인한다
mise run docs:packages  # 락파일에서 docs/packages.md 를 다시 만든다
```

`main` 에 푸시하면 `.github/workflows/pages.yml` 이 사이트를 <https://lovit.github.io/wasm-tutorials/> 로 배포한다. 예제 파일은 손대지 않고 그대로 옮기므로, 로컬에서 동작하면 사이트에서도 동작한다.

## 예제 작성 규칙

예제는 빌드 없이 파일 그대로 돌아가야 한다. 번들러, 트랜스파일러, npm 의존성을 쓰지 않는다. 외부에서 가져오는 것은 Pyodide 런타임 하나뿐이다.

```text
galleries/NN-job-name/
├── README.md      # 튜토리얼 본문 (h1 으로 시작)
├── index.html
└── src/
    ├── main.js    # ES module
    ├── main.py    # 파이썬이 길면 따로 뺀다 (선택)
    └── style.css
```

- 디렉터리 이름은 `NN-kebab-case`. 번호가 학습 순서다
- **런타임은 `../_shared/pyodide.js` 의 `getPyodide()` 로만 받는다.** `loadPyodide()` 를 직접 부르면 6MB 를 다시 내려받고, CDN 주소가 예제마다 흩어진다
- 로딩 중에는 `showLoading()` 으로 안내를 띄운다. 첫 방문자에게 빈 화면을 보이지 않는다
- `../_shared/support.js` 로 기능을 감지하고, 미지원 브라우저에서는 안내 배너를 띄운 뒤 조용히 멈춘다
- `PyProxy` 를 놓아 준다. `destroy()` 하거나 `using` 으로 감싼다. 파이썬 함수를 JS 콜백으로 넘길 때는 `create_proxy()` 로 감싼다
- 새 예제를 추가하면 `galleries/README.md` 목차에도 넣는다. `mise run check` 가 확인한다
- 코드 주석은 한국어로 쓰되, "무엇을" 이 아니라 "왜" 를 적는다

자세한 규칙: @.claude/rules/web-style.md, 파이썬 코드는 @.claude/rules/python-style.md

## Pyodide 주의사항

**버전 체계가 바뀌었다. `0.29.x` 다음이 `314.0.0` 이고 앞 세 자리가 파이썬 버전(3.14)이다.** 웹 자료는 대부분 `0.26.x` 기준이라 그대로 베끼면 안 된다. 기억에 의존하지 말고 <https://pyodide.org/en/stable/> 를 확인하고, 의심스러우면 브라우저에서 직접 확인한다.

옛 코드가 깨지는 것들이다. 뒤의 두 개는 314 가 아니라 0.28 에서 들어갔지만, 옛 자료를 베낄 때 함께 걸린다.

- 워커는 `new Worker(url, { type: 'module' })` 이어야 한다. `importScripts()` 방식은 지원하지 않는다
- `sqlite3` 와 `lzma` 가 기본 번들에 들어갔다. `loadPackage("sqlite3")` 는 필요 없다
- `ssl` 은 스텁이다. import 는 되지만 실제 TLS 는 `NotImplementedError` 를 던진다
- (0.28.0 부터) 자바스크립트의 `null` 은 `jsnull` 로, `undefined` 는 `None` 으로 변환된다. 둘이 구별된다. 옛 동작으로 돌리는 `convertNullToNone` 옵션이 아직 있지만 없어질 예정이다
- (0.28.0 부터) `PyProxy` 에 `[Symbol.dispose]` 가 있어서 `using` 을 쓸 수 있다. 다만 `using` 은 JS 엔진 쪽 기능이라 브라우저를 가린다. @.claude/rules/web-style.md 를 보자

## 참고 문서

- 원리 설명: @docs/tutorials/README.md
- 패키지 목록: @docs/packages.md
- 용어 대응표: @docs/glossary.md
- Git 워크플로: @.claude/rules/git-workflow.md
- 글쓰기 규칙: @.claude/rules/writing-style.md
- 예제 코드 스타일: @.claude/rules/web-style.md
- 리뷰 정책: @.claude/rules/review-policy.md
