// 계산은 파이썬이 하고 그리기는 브라우저가 한다. 그 경계를 두 가지 방식으로 보여 준다.
import { getPyodide, renderPythonError, showLoading } from '../../_shared/pyodide.js';
import { addMetricRow, formatBytes, formatMs } from '../../_shared/metrics.js';
import { ensureSupport } from '../../_shared/support.js';

const status = document.querySelector('#status');
const sizeSelect = document.querySelector('#size');
const benchButton = document.querySelector('#bench');
const benchRows = document.querySelector('#bench-rows');
const liveButton = document.querySelector('#draw-live');
const pngButton = document.querySelector('#draw-png');
const pngTarget = document.querySelector('#png-target');
const mplTarget = document.querySelector('#mpl-target');
const backendsButton = document.querySelector('#backends');
const backendResult = document.querySelector('#backend-result');

let pyodide;
let pyGlobals;

if (ensureSupport()) {
  start();
}

async function start() {
  // matplotlib 은 그릴 자리를 이 전역에서 찾는다. 안 정해 두면 body 끝에 붙는다.
  document.pyodideMplTarget = mplTarget;

  const done = showLoading(status, 'numpy 와 matplotlib 을 받는 중입니다. 10MB 가 넘습니다');
  try {
    pyodide = await getPyodide({ packages: ['numpy', 'matplotlib'] });
    const response = await fetch('src/main.py');
    if (!response.ok) throw new Error(`src/main.py 를 받지 못했습니다 (${response.status})`);
    pyGlobals = pyodide.runPython(`${await response.text()}\n\nglobals()`);
    done();
    status.textContent = `준비됐습니다. ${describeDownload()}`;
    for (const button of [benchButton, liveButton, pngButton, backendsButton])
      button.disabled = false;
  } catch (error) {
    done();
    renderPythonError(status, error);
  }
}

// 이 페이지가 실제로 받은 양을 브라우저에게 물어본다. 문서에 적어 둔 숫자를 믿지 않는다.
function describeDownload() {
  const entries = performance
    .getEntriesByType('resource')
    .filter((entry) => entry.name.includes('/pyodide/'));
  if (!entries.length) return '받은 양은 재지 못했습니다.';
  const transferred = entries.reduce((sum, entry) => sum + entry.transferSize, 0);
  return `${entries.length}개 파일, ${formatBytes(transferred)} 를 받았습니다.`;
}

async function withLock(fn) {
  const buttons = [benchButton, liveButton, pngButton, backendsButton];
  for (const button of buttons) button.disabled = true;
  try {
    await fn();
  } finally {
    for (const button of buttons) button.disabled = false;
  }
}

benchButton.addEventListener('click', () =>
  withLock(async () => {
    benchRows.replaceChildren();
    status.textContent = '재는 중입니다. 파이썬 리스트 쪽은 화면이 잠깐 멈춥니다.';
    const fn = pyGlobals.get('bench');
    let rows;
    try {
      rows = fn(Number(sizeSelect.value));
    } finally {
      fn.destroy();
    }
    try {
      // 리스트 안에 dict 가 들어 있어 toJs 로 통째로 옮긴다. 원소마다 프록시를 만들지 않는다.
      for (const row of rows.toJs({ dict_converter: Object.fromEntries })) {
        addMetricRow(
          benchRows,
          row['방법'],
          `${formatMs(row['초'] * 1000)}  (합 ${row['합'].toFixed(2)})`,
        );
      }
    } finally {
      rows.destroy();
    }
    status.textContent = '다 쟀습니다.';
  }),
);

liveButton.addEventListener('click', () =>
  withLock(async () => {
    mplTarget.replaceChildren();
    const fn = pyGlobals.get('draw_live');
    try {
      status.textContent = `기본 백엔드(${await fn()})로 그렸습니다.`;
    } catch (error) {
      renderPythonError(status, error);
    } finally {
      fn.destroy();
    }
  }),
);

pngButton.addEventListener('click', () =>
  withLock(async () => {
    const fn = pyGlobals.get('draw_png');
    try {
      const encoded = fn();
      pngTarget.src = `data:image/png;base64,${encoded}`;
      pngTarget.alt = 'agg 백엔드가 그린 sin 곡선과 감쇠 곡선';
      status.textContent = `PNG ${formatBytes(Math.round((encoded.length * 3) / 4))} 를 받아 넣었습니다.`;
    } catch (error) {
      renderPythonError(status, error);
    } finally {
      fn.destroy();
    }
  }),
);

backendsButton.addEventListener('click', () =>
  withLock(async () => {
    backendResult.textContent = '물어보는 중입니다…';
    const fn = pyGlobals.get('backends');
    try {
      backendResult.textContent = fn();
    } catch (error) {
      backendResult.replaceChildren();
      renderPythonError(backendResult, error);
    } finally {
      fn.destroy();
    }
  }),
);
