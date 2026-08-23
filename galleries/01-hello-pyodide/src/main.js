// 01. 브라우저에서 파이썬 띄우기
//
// 이 예제에서 새로 배우는 줄은 둘뿐이다.
//   pyodide = await getPyodide();
//   pyodide.runPython(코드);
// 나머지는 그 대가가 얼마인지 재서 화면에 보여 주는 코드다.

import { ensureSupport } from '../../_shared/support.js';
import { getPyodide, renderPythonError, showLoading } from '../../_shared/pyodide.js';
import { addMetricRow, formatBytes, formatMs } from '../../_shared/metrics.js';

// 파이썬이 자기 자신을 소개하게 한다. sys.platform 이 emscripten 으로 나오는 것이 요점이다.
// 마지막 문장이 표현식이라 그 값이 그대로 자바스크립트로 넘어온다.
const VERSION_REPORT = `
import platform
import sys

f"""Python {platform.python_version()}
{sys.platform} / {sys.implementation.name}
{sys.version}"""
`;

const versionBox = document.querySelector('#version');
const costTable = document.querySelector('#cost tbody');
const cacheNote = document.querySelector('#cache-note');
const againButton = document.querySelector('#again');
const againResult = document.querySelector('#again-result');
const codeInput = document.querySelector('#code');
const runButton = document.querySelector('#run');
const resultBox = document.querySelector('#result');

// 미지원이면 배너를 이미 띄웠으므로 여기서 조용히 끝낸다.
if (ensureSupport()) {
  start().catch((error) => renderPythonError(versionBox, error));
}

async function start() {
  versionBox.replaceChildren();
  const done = showLoading(versionBox, 'Python 런타임을 받는 중입니다');

  const started = performance.now();
  let pyodide;
  try {
    pyodide = await getPyodide();
  } catch (error) {
    done();
    renderPythonError(versionBox, error);
    return;
  }
  const boot = Math.round(performance.now() - started);
  done();

  versionBox.textContent = pyodide.runPython(VERSION_REPORT);
  showCost(boot);

  againButton.addEventListener('click', measureSecondCall);
  runButton.addEventListener('click', () => runUserCode(pyodide));

  // 런타임이 준비되기 전에는 눌러도 할 일이 없다. 그때까지 잠가 둔다.
  againButton.disabled = false;
  runButton.disabled = false;
  runUserCode(pyodide);
}

/**
 * 이번 방문에 실제로 내려받은 바이트를 잰다.
 *
 * 문서에 "6MB" 라고 적어 두는 대신 그 자리에서 재게 한 이유가 있다. 값은 버전과
 * 브라우저와 캐시 상태에 따라 달라지는데, 적어 둔 숫자는 그중 하나로 고정된다.
 */
function showCost(boot) {
  const entries = performance
    .getEntriesByType('resource')
    .filter((entry) => entry.name.includes('/pyodide/'));

  // transferSize 가 0 이면 캐시에서 온 것이다. 네트워크를 탄 것과 구분해야 한다.
  // 다만 이건 교차 출처 응답에 Timing-Allow-Origin 이 있을 때만 참이다. 없으면
  // 캐시가 아니어도 0 으로 보인다. jsDelivr 는 그 헤더를 준다.
  const transferred = entries.reduce((sum, entry) => sum + entry.transferSize, 0);
  const decoded = entries.reduce((sum, entry) => sum + entry.decodedBodySize, 0);
  const fromCache = entries.filter((entry) => entry.transferSize === 0).length;

  addMetricRow(costTable, '부팅에 걸린 시간', formatMs(boot));
  addMetricRow(costTable, '받은 파일 수', `${entries.length}개`);
  addMetricRow(costTable, '네트워크를 탄 양', formatBytes(transferred));
  addMetricRow(costTable, '압축을 푼 뒤 크기', formatBytes(decoded));

  if (fromCache > 0) {
    cacheNote.textContent = `${entries.length}개 중 ${fromCache}개가 캐시에서 왔습니다. 그래서 이번 부팅이 빠릅니다. 처음 방문한 것처럼 보려면 캐시를 비우고 새로고침하세요.`;
  }
}

/** 두 번째 호출이 얼마나 걸리는지. 런타임이 하나라는 것을 시간으로 보여 준다. */
async function measureSecondCall() {
  againButton.disabled = true;
  againResult.textContent = '재는 중…';

  const started = performance.now();
  try {
    await getPyodide();
    const elapsed = performance.now() - started;
    againResult.textContent = `${elapsed.toFixed(1)} ms 걸렸습니다. 아무것도 받지 않고 이미 떠 있는 런타임을 그대로 돌려줬기 때문입니다.`;
  } finally {
    againButton.disabled = false;
  }
}

/**
 * 입력한 코드를 돌린다.
 *
 * 값이 dict 나 list 면 PyProxy 로 넘어온다. 자바스크립트 GC 가 못 걷는 핸들이라
 * 다 쓰면 놓아 줘야 한다. 그게 05번 예제의 주제이고, 여기서는 규칙만 지킨다.
 */
function runUserCode(pyodide) {
  let value;

  try {
    value = pyodide.runPython(codeInput.value);
  } catch (error) {
    resultBox.replaceChildren();
    renderPythonError(resultBox, error);
    return;
  }

  try {
    resultBox.textContent = describe(pyodide, value);
  } finally {
    // PyProxy 일 때만 destroy 가 있다. 숫자나 문자열이면 그냥 값이다.
    value?.destroy?.();
  }
}

/** 넘어온 값이 무엇인지 자바스크립트 쪽 시선으로 적는다. */
function describe(pyodide, value) {
  if (value === undefined) {
    return '값이 없습니다.\n마지막 문장이 돌려준 값이 None 이면 자바스크립트에서는 undefined 로 보입니다.\nprint() 도 표현식이지만 돌려주는 값이 None 입니다.';
  }

  // .type 이 있는지로 가리면 안 된다. HTMLInputElement 처럼 type 을 가진 JS 객체가
  // 파이썬 객체로 둔갑한다. 프록시인지 아닌지는 프록시 클래스에 직접 물어본다.
  const isProxy = value instanceof pyodide.ffi.PyProxy;
  const kind = isProxy ? `PyProxy (파이썬 ${value.type})` : typeof value;
  const shown = value?.toString?.() ?? String(value);
  return `${shown}\n\n자바스크립트가 받은 것: ${kind}`;
}
