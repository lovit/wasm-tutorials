// Pyodide 런타임을 받아 오는 공통 모듈. 모든 예제가 이 파일을 거친다.
//
// 예제가 직접 loadPyodide() 를 부르지 않는 이유는 두 가지다.
// 버전과 CDN 주소가 예제마다 흩어지면 업그레이드할 때 스무 곳을 고쳐야 하고,
// 한 페이지에서 두 번 부르면 6MB 짜리 런타임을 두 번 받는다.

// 이 저장소가 기준으로 삼는 버전. 0.29.x 다음이 314.0.0 이다.
// 앞 세 자리가 번들된 파이썬 버전(3.14)을 뜻하도록 체계가 바뀌었다.
export const PYODIDE_VERSION = '314.0.5';

/** 런타임과 패키지를 받아 오는 곳. 빌드 스크립트도 이 값을 읽어 쓴다. */
export const INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

// 부팅은 페이지당 한 번뿐이다. 두 번째 호출부터는 같은 Promise 를 돌려준다.
let booting = null;
// 몇 번째 시도인지. 재시도할 때 import URL 을 달리하는 데 쓴다.
let attempt = 0;

/**
 * Pyodide 를 받아 온다. 여러 번 불러도 런타임은 하나다.
 *
 * packages 는 loadPyodide 에 그대로 넘긴다. 부팅이 끝난 뒤 loadPackage() 를
 * 부르는 것보다 빠르다. 부팅과 병렬로 내려받기 때문이다.
 */
export function getPyodide({ packages = [], stdout, stderr } = {}) {
  if (booting) {
    // 이미 부팅했으면 인자는 늦었다. 조용히 무시하면 ModuleNotFoundError 로만 드러나고
    // 원인에서 먼 곳에서 터진다. 패키지는 뒤늦게라도 얹어 주고, 나머지는 알려 준다.
    if (stdout || stderr) {
      console.warn('getPyodide: 런타임이 이미 떠 있어 stdout/stderr 인자를 무시합니다.');
    }
    if (packages.length) {
      return booting.then(async (pyodide) => {
        await pyodide.loadPackage(packages);
        return pyodide;
      });
    }
    return booting;
  }

  const tries = attempt++;

  booting = (async () => {
    // 모듈 스크립트로 받는다. 314 부터 pyodide.asm.mjs 라 classic worker 는 못 쓴다.
    //
    // 재시도할 때는 URL 에 표를 하나 붙인다. 브라우저의 모듈 맵은 실패한 import 도
    // 캐시해서, 같은 URL 로 다시 부르면 네트워크가 돌아와도 같은 에러만 돌아온다.
    const url = tries === 0 ? `${INDEX_URL}pyodide.mjs` : `${INDEX_URL}pyodide.mjs?retry=${tries}`;
    const { loadPyodide } = await import(url);
    return loadPyodide({ indexURL: INDEX_URL, packages, stdout, stderr });
  })();

  // 실패한 부팅은 캐시하지 않는다. 캐시해 두면 CDN 이 잠깐 끊긴 것만으로
  // 새로고침 전까지 페이지가 죽고, "다시 시도" 버튼을 달아도 같은 에러만 돌아온다.
  booting.catch(() => {
    booting = null;
  });

  return booting;
}

/**
 * 이미 받아 둔 런타임에 패키지를 더 얹는다.
 * onProgress 를 주면 내려받는 동안 메시지가 그대로 흘러온다.
 */
export async function loadPackages(pyodide, packages, onProgress) {
  await pyodide.loadPackage(packages, {
    messageCallback: onProgress,
    // 실패를 진행 상황과 같은 모양으로 찍으면 아무도 못 알아본다.
    errorCallback: onProgress && ((message) => onProgress(`오류: ${message}`)),
  });
}

const LOADING_CLASS = 'pyodide-loading';

/**
 * 로딩 안내를 띄우고, 끝났을 때 지우는 함수를 돌려준다.
 *
 * 첫 방문자는 6MB 를 받는다. 그동안 빈 화면을 두면 고장 난 것처럼 보인다.
 */
export function showLoading(target, message = 'Python 런타임을 받는 중입니다') {
  // span 을 쓰는 이유가 있다. 예제의 출력 자리는 대개 pre 인데, pre 안에는 p 나 div 를
  // 넣을 수 없다. span 은 어디에나 들어가므로 부르는 쪽이 자리를 가리지 않아도 된다.
  const box = document.createElement('span');
  box.className = LOADING_CLASS;
  box.setAttribute('role', 'status');
  box.textContent = `${message}…`;

  // 대상을 비우지 않고 덧붙인다. 비우면 같은 자리에 있던 버튼이나 중간 출력이 사라진다.
  target.append(box);
  injectStyle();

  const started = performance.now();

  return function done(finalMessage) {
    const elapsed = Math.round(performance.now() - started);
    if (finalMessage) box.textContent = `${finalMessage} (${elapsed}ms)`;
    else box.remove();
    return elapsed;
  };
}

/**
 * PythonError 를 트레이스백까지 사람이 읽을 수 있게 그린다.
 *
 * PythonError 는 메모리 누수를 막으려고 원본 예외 객체를 들고 있지 않다.
 * 포맷된 문자열만 있으므로 그걸 그대로 보여 주는 것이 맞다.
 */
export function renderPythonError(target, error) {
  // pre 가 아니라 code 인 이유는 showLoading 과 같다. pre 안에 pre 는 들어갈 수 없다.
  // 줄바꿈은 CSS 로 살린다.
  const box = document.createElement('code');
  box.className = 'pyodide-error';
  box.setAttribute('role', 'alert');
  box.textContent = error?.message ?? String(error);

  // 여기서 대상을 비우면 예외 직전까지 파이썬이 찍은 것이 함께 지워진다.
  // 어디까지 진행됐는지가 트레이스백만큼 중요하다.
  target.append(box);
  injectStyle();
  return box;
}

const STYLE_ID = 'pyodide-shared-style';

/** 공통 스타일을 한 번만 넣는다. 예제마다 같은 CSS 를 복사하지 않으려고 둔다. */
function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .${LOADING_CLASS} {
      display: block;
      margin: 0;
      padding: 0.75rem 1rem;
      border-radius: var(--radius, 10px);
      background: var(--surface, #f6f8fa);
      color: var(--muted, #57606a);
      font-size: 0.95rem;
    }
    .pyodide-error {
      display: block;
      margin: 0;
      padding: 0.75rem 1rem;
      border-left: 4px solid #d1242f;
      border-radius: 0 var(--radius, 10px) var(--radius, 10px) 0;
      background: #fff5f5;
      color: #82071e;
      font-size: 0.85rem;
      line-height: 1.5;
      overflow-x: auto;
      white-space: pre;
    }
    @media (prefers-color-scheme: dark) {
      .pyodide-error { background: #2b0f11; color: #ffb3ba; }
    }
  `;
  document.head.append(style);
}
