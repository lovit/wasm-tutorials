// 10. 왜 requests 가 안 되는가
//
// 새로 배우는 것은 셋이다.
//   pyfetch 와 open_url 이 브라우저의 통로를 그대로 쓴다
//   소켓과 TLS 가 막혀 있어서 그 위에 선 것들이 함께 막힌다
//   requests 는 urllib3 가 우회해 줘서 돈다

import { ensureSupport } from '../../_shared/support.js';
import { getPyodide, renderPythonError, showLoading } from '../../_shared/pyodide.js';

const bootBox = document.querySelector('#boot');
const targets = document.querySelector('#targets');
const urlInput = document.querySelector('#url');
const probeButton = document.querySelector('#probe');
const probeResult = document.querySelector('#probe-result');
const layersButton = document.querySelector('#layers');
const layersResult = document.querySelector('#layers-result');
const missingButton = document.querySelector('#missing');
const missingResult = document.querySelector('#missing-result');

let pyGlobals = null;

if (ensureSupport()) {
  start().catch((error) => renderPythonError(bootBox, error));
}

async function start() {
  bootBox.replaceChildren();
  const done = showLoading(bootBox, 'Python 런타임과 requests 를 받는 중입니다');

  let pyodide;
  try {
    // requests 는 락파일에 있다. 부팅과 함께 받아 두면 눌렀을 때 기다리지 않는다.
    pyodide = await getPyodide({ packages: ['requests'] });
  } catch (error) {
    done();
    renderPythonError(bootBox, error);
    return;
  }

  try {
    const response = await fetch('src/main.py');
    if (!response.ok) throw new Error(`src/main.py 를 받지 못했습니다 (${response.status})`);
    const source = await response.text();
    // 이 손잡이는 페이지가 사는 동안 계속 쓰므로 일부러 안 놓는다.
    pyGlobals = pyodide.runPython(`${source}\n\nglobals()`);
  } finally {
    done();
  }
  bootBox.textContent = '준비됐습니다. 주소를 골라 두드려 보세요.';

  buildTargets();
  probeButton.addEventListener('click', () => run(probeResult, 'probe', urlInput.value));
  // 세 버튼이 같은 런타임을 쓰고 결과가 겹칠 수 있어서 함께 잠근다.
  layersButton.addEventListener('click', () => run(layersResult, 'layers'));
  missingButton.addEventListener('click', () => run(missingResult, 'missing'));

  for (const control of [urlInput, probeButton, layersButton, missingButton]) {
    control.disabled = false;
  }
}

/** 시험할 주소들을 파이썬 쪽 목록에서 읽어 만든다. 이름과 주소가 한곳에만 있게. */
function buildTargets() {
  const entries = pyGlobals.get('TARGETS');
  try {
    let first = true;
    for (const label of entries) {
      const url = entries.get(label);
      const item = document.createElement('label');
      item.className = 'inline';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'target';
      input.value = url;
      input.checked = first;
      if (first) urlInput.value = url;
      first = false;
      input.addEventListener('change', () => {
        urlInput.value = url;
      });
      const text = document.createElement('span');
      text.textContent = `${label} — ${url}`;
      item.append(input, text);
      targets.append(item);
    }
  } finally {
    entries.destroy();
  }
}

/** 파이썬 함수를 부르고 결과를 상자에 적는다. 비동기든 아니든 같은 모양으로 다룬다. */
async function run(box, name, ...args) {
  box.textContent = '두드려 보는 중입니다…';
  const buttons = [probeButton, layersButton, missingButton];
  for (const button of buttons) button.disabled = true;

  const fn = pyGlobals.get(name);
  try {
    box.textContent = await fn(...args);
  } catch (error) {
    box.replaceChildren();
    renderPythonError(box, error);
  } finally {
    fn.destroy();
    for (const button of buttons) button.disabled = false;
  }
}
