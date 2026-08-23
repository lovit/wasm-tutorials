# 예제 코드 스타일

## 빌드하지 않는다

번들러, 트랜스파일러, npm 의존성을 쓰지 않는다. 예제는 정적 서버에 올린 파일 그대로 브라우저에서 돌아가야 한다. 3D 예제도 Three.js 같은 라이브러리 없이 raw WebGL2 로 쓴다.

이유는 학습용이기 때문이다. 몇 년 뒤에 열어도 그대로 돌아가야 하고, 읽는 사람이 API 자체에 집중할 수 있어야 한다.

## 디렉터리 구조

```text
galleries/NN-job-name/
├── README.md      # 튜토리얼 본문. h1 으로 시작한다
├── index.html
└── src/
    ├── main.js    # <script type="module">
    ├── main.py    # 파이썬 코드가 길면 따로 뺀다 (선택)
    └── style.css
```

디렉터리 이름은 `NN-kebab-case` 이고 번호가 학습 순서다. 파일이 더 필요하면 `src/` 아래에 둔다. 예제가 만들어 내는 산출물은 `output/` 에 넣는다(gitignore 됨).

## 필수 규칙

### 런타임은 `_shared/pyodide.js` 로만 부른다

예제에서 `loadPyodide()` 를 직접 부르지 않는다. CDN URL 과 버전을 예제마다 박아 두면 업그레이드할 때 스무 곳을 고쳐야 하고, 같은 페이지에서 두 번 부르면 6MB 를 두 번 받는다.

```js
import { getPyodide } from '../_shared/pyodide.js';

const pyodide = await getPyodide({ packages: ['numpy'] });
```

필요한 패키지는 `packages` 로 넘긴다. 부팅이 끝난 뒤 `loadPackage()` 를 부르는 것보다 빠르다. 부팅과 병렬로 받기 때문이다.

### 로딩 상태를 화면에 보여준다

첫 방문자는 6MB 를 받는다. 그동안 빈 화면을 두면 고장 난 것처럼 보인다. `showLoading()` 으로 안내를 띄우고 준비되면 지운다.

```js
import { getPyodide, showLoading } from '../_shared/pyodide.js';

const done = showLoading(output);
const pyodide = await getPyodide();
done();
```

### PyProxy 를 놓아 준다

`runPython()` 이 돌려주는 파이썬 객체는 JS 가 자동으로 못 걷는다. WASM 힙 안의 객체를 가리키는 핸들이라 GC 가 손댈 수 없기 때문이다. 다 쓰면 `destroy()` 하거나 `using` 으로 스코프를 벗어날 때 풀리게 한다.

```js
// 기본형. 어느 브라우저에서나 돈다.
const result = pyodide.runPython('{"a": 1}');
try {
  render(result.toJs());
} finally {
  result.destroy();
}
```

`using` 을 쓰면 스코프를 벗어날 때 알아서 풀린다. `PyProxy` 에 `[Symbol.dispose]` 가 있어서 되는 것이다.

```js
{
  using result = pyodide.runPython('{"a": 1}');
  render(result.toJs());
}
```

다만 `using` 은 Pyodide 가 아니라 자바스크립트 엔진 쪽 기능이라 브라우저를 가린다. Chrome 151 에서 되는 것은 2026-08-23 에 확인했고, 다른 브라우저는 확인하지 않았다. 게다가 문법이라 미지원 브라우저에서는 파일 전체가 파싱 단계에서 죽는다. 배너를 띄울 틈도 없다. 그래서 **기본은 `try/finally` 로 쓰고, `using` 은 그것을 다루는 예제에서만 쓴다.**

파이썬 함수를 JS 콜백으로 넘길 때는 `create_proxy()` 로 감싼다. 감싸지 않으면 호출이 끝나는 순간 프록시가 풀려서 다음 호출에 에러가 난다. 떼어 낼 때 `destroy()` 도 잊지 않는다.

## JavaScript

- ES module 을 쓴다. `type="module"` 없는 스크립트를 쓰지 않는다
- `const` 를 기본으로 하고 재할당이 필요할 때만 `let` 을 쓴다. `var` 는 쓰지 않는다
- 세미콜론을 쓴다. 작은따옴표를 쓴다. prettier 가 정리한다
- DOM 조회는 파일 상단에 모아 둔다
- 이벤트 핸들러는 이름 있는 함수로 뽑는다. 무슨 일이 언제 일어나는지 이름으로 드러나야 한다

## HTML

- `<!doctype html>` 과 `<meta charset="utf-8">` 로 시작한다
- `lang="ko"` 를 붙인다
- 폼 컨트롤에는 `<label>` 을 붙인다
- 파이썬 코드가 길면 `src/main.py` 로 빼고 fetch 해서 넣는다. JS 템플릿 문자열 안에 스무 줄짜리 파이썬을 넣으면 하이라이트도 린트도 안 된다

## CSS

- `../_shared/base.css` 를 먼저 불러오고 예제별 `src/style.css` 를 덧붙인다
- 색상은 CSS 변수로 뺀다. 다크 모드는 `prefers-color-scheme` 으로 대응한다
- 출력 영역(`pre.output`)에는 `overflow-x: auto` 를 준다. 트레이스백은 길다

## 주석

한국어로 쓴다. "무엇을" 이 아니라 "왜" 를 적는다. 코드를 읽으면 아는 내용을 다시 적지 않는다.

```js
// 나쁨: result 를 destroy 한다
// 좋음: PyProxy 는 WASM 힙의 핸들이라 JS GC 가 못 걷는다. 안 놓아 주면 샌다.
result.destroy();
```

파이썬 코드의 주석도 한국어로 쓴다.

## 튜토리얼의 코드 조각

README 에 코드를 인용할 때는 소스에서 그대로 복사한다. 들여쓰기는 왼쪽에 붙여도 되지만 줄 내용은 바꾸지 않는다. 빌드가 조각을 소스에서 찾아 GitHub 링크를 붙이는데, 손으로 고쳐 쓴 조각은 찾지 못해 링크가 빠진다.

설명을 위해 일부러 줄이거나 지어낸 조각은 그대로 두면 된다. 링크만 안 붙을 뿐 문제가 되지 않는다.

소스를 고쳤으면 그 코드를 인용한 README 도 함께 고친다. `mise run check` 가 링크 수가 줄었는지 보고 막아 준다. 일부러 줄여 쓴 것이라면 `node scripts/check-snippets.mjs --update` 로 기준치를 갱신한다.

## README 뼈대

예제 README 는 같은 순서를 지킨다. 읽는 사람이 다음에 뭐가 나올지 알고 읽게 하기 위해서다.

1. h1 제목과 한 줄 요약 — **두 번째 줄이 랜딩 페이지 카드 설명으로 쓰인다**
2. 스크린샷 — **세 번째 줄.** alt 는 화면에 뭐가 보이는지 서술문으로 길게 쓴다
3. 측정 환경 고지 — 인용문으로. 어느 브라우저에서 언제 확인했는지
4. 무엇을 배우나
5. 실행 방법
6. 핵심 코드 (조각을 하나씩 떼어 설명. 소제목은 주장문으로 쓴다)
7. 직접 해볼 것 — 일부러 망가뜨려 보는 지시를 넣는다
8. 막히는 지점 — `| 증상 | 원인 |` 두 열 표
9. 다음 예제 링크
