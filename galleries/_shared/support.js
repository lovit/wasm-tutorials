// 예제를 시작하기 전에 이 브라우저에서 돌 수 있는지 확인한다.
//
// html-in-canvas 저장소의 같은 이름 모듈에서 배너 만드는 방식을 그대로 가져왔다.
// innerHTML 을 쓰지 않고 DOM API 로만 만들며, 스타일은 자기가 한 번만 주입한다.
// 그래서 별도 CSS 없이도 어느 예제에서든 똑같이 보인다.

const BANNER_ID = 'pyodide-support-banner';

/** WebAssembly 를 쓸 수 있는지. 요즘 브라우저는 거의 다 되지만 확인은 해야 한다. */
export function isSupported() {
  return typeof WebAssembly === 'object' && typeof WebAssembly.instantiateStreaming === 'function';
}

/**
 * SharedArrayBuffer 를 쓸 수 있는지.
 *
 * 이건 브라우저가 지원하느냐가 아니라 이 문서가 cross-origin isolation 상태냐의 문제다.
 * COOP/COEP 헤더가 없으면 지원하는 브라우저에서도 생성자 자체가 없다.
 */
export function isIsolated() {
  return globalThis.crossOriginIsolated === true && typeof SharedArrayBuffer === 'function';
}

/** 미지원 안내 배너를 문서 맨 앞에 띄운다. 이미 떠 있으면 아무것도 하지 않는다. */
export function showUnsupportedBanner(title, detail) {
  if (document.getElementById(BANNER_ID)) return;

  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.setAttribute('role', 'alert');

  const heading = document.createElement('strong');
  heading.textContent = title;

  const body = document.createElement('p');
  body.textContent = detail;

  banner.append(heading, body);
  document.body.prepend(banner);
  injectStyle();
}

/**
 * 예제 시작점에서 부른다. 돌 수 있으면 true, 아니면 배너를 띄우고 false 를 준다.
 * 호출한 쪽은 false 를 받으면 조용히 끝내면 된다.
 */
export function ensureSupport({ isolated = false } = {}) {
  if (!isSupported()) {
    showUnsupportedBanner(
      '이 브라우저에서는 WebAssembly 를 쓸 수 없습니다',
      'Pyodide 는 WebAssembly 위에서 도는 파이썬입니다. 최신 버전의 Chrome, Firefox, Safari, Edge 중 하나로 열어 보세요. 설명은 그대로 읽을 수 있습니다.',
    );
    return false;
  }

  if (isolated && !isIsolated()) {
    showUnsupportedBanner(
      '이 페이지는 cross-origin isolation 상태가 아닙니다',
      'SharedArrayBuffer 가 필요한 예제입니다. 로컬에서는 CROSS_ORIGIN_ISOLATED=1 mise run serve 로 띄우세요. 발행된 사이트에서는 service worker 가 헤더를 붙여 줍니다. 새로고침해도 이 배너가 계속 뜬다면 18번 예제의 설명을 보세요.',
    );
    return false;
  }

  return true;
}

const STYLE_ID = `${BANNER_ID}-style`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${BANNER_ID} {
      margin: 0 0 1.5rem;
      padding: 1rem 1.25rem;
      border: 1px solid #d97706;
      border-radius: 8px;
      background: #fffbeb;
      color: #7c2d12;
      font: 15px/1.6 system-ui, sans-serif;
    }
    #${BANNER_ID} p { margin: 0.5rem 0 0; }
    @media (prefers-color-scheme: dark) {
      #${BANNER_ID} { background: #2b1c06; border-color: #b45309; color: #fde68a; }
    }
  `;
  document.head.append(style);
}
