// 09. PyPI 에서 설치하기
//
// 새로 배우는 것은 셋이다.
//   micropip.install 로 PyPI 에서 바로 받는다
//   순수 파이썬 wheel 이 있는지로 될지 안 될지 가린다
//   자기가 순수해도 의존성 하나가 막을 수 있다

import { ensureSupport } from '../../_shared/support.js';
import { getPyodide, renderPythonError, showLoading } from '../../_shared/pyodide.js';

const bootBox = document.querySelector('#boot');
const picker = document.querySelector('#picker');
const inspectButton = document.querySelector('#inspect');
const installButton = document.querySelector('#install');
const inspectResult = document.querySelector('#inspect-result');
const installResult = document.querySelector('#install-result');
const listButton = document.querySelector('#list');
const listResult = document.querySelector('#list-result');
const textInput = document.querySelector('#text');
const useButton = document.querySelector('#use');
const useResult = document.querySelector('#use-result');

let pyGlobals = null;

if (ensureSupport()) {
  start().catch((error) => renderPythonError(bootBox, error));
}

async function start() {
  bootBox.replaceChildren();
  const done = showLoading(bootBox, 'Python 런타임과 micropip 을 받는 중입니다');

  let pyodide;
  try {
    // micropip 은 락파일에 있는 패키지다. 부팅과 함께 받아 두면 빠르다.
    pyodide = await getPyodide({ packages: ['micropip'] });
  } catch (error) {
    done();
    renderPythonError(bootBox, error);
    return;
  }

  try {
    const source = await fetch('src/main.py').then((response) => response.text());
    // 이 손잡이는 페이지가 사는 동안 계속 쓰므로 일부러 안 놓는다.
    pyGlobals = pyodide.runPython(`${source}\n\nglobals()`);
  } finally {
    // 여기서 실패해도 로딩 안내는 지운다. 남겨 두면 아직 받는 중인 것처럼 보인다.
    done();
  }
  bootBox.textContent = '준비됐습니다. 패키지를 골라 물어보고 설치해 보세요.';

  buildPicker();
  inspectButton.addEventListener('click', () =>
    run(inspectResult, 'inspect_package', currentName()),
  );
  installButton.addEventListener('click', () => install());
  listButton.addEventListener('click', () => run(listResult, 'installed'));
  useButton.addEventListener('click', () => run(useResult, 'use_korean', textInput.value));

  for (const control of [inspectButton, installButton, listButton, textInput, useButton]) {
    control.disabled = false;
  }
}

/** 고를 것들을 파이썬 쪽 목록에서 읽어 만든다. 이름과 설명이 한곳에만 있게. */
function buildPicker() {
  const entries = pyGlobals.get('CANDIDATES');
  try {
    let first = true;
    for (const name of entries) {
      const label = document.createElement('label');
      label.className = 'inline';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'pkg';
      input.value = name;
      input.checked = first;
      first = false;
      const text = document.createElement('span');
      text.innerText = `${name} — ${entries.get(name)}`;
      label.append(input, text);
      picker.append(label);
    }
  } finally {
    entries.destroy();
  }
}

function currentName() {
  return picker.querySelector('input:checked').value;
}

/** 파이썬 함수를 부르고 결과를 상자에 적는다. 비동기든 아니든 같은 모양으로 다룬다. */
async function run(box, name, ...args) {
  box.replaceChildren();
  box.textContent = '하는 중입니다…';

  const fn = pyGlobals.get(name);
  try {
    box.textContent = await fn(...args);
  } catch (error) {
    box.replaceChildren();
    renderPythonError(box, error);
  } finally {
    fn.destroy();
  }
}

/**
 * 설치는 조회와 다른 상자에 적는다.
 *
 * 같은 상자를 쓰면 설치 결과가 조회 결과를 덮어써서, 왜 막혔는지 알려 주는 의존성 줄이
 * 사라진다. 둘을 나란히 두고 견줄 수 있어야 이 예제가 말이 된다.
 */
async function install() {
  // 조회도 함께 잠근다. 설치 중에 조회하면 나중에 끝난 쪽이 이겨서 화면이 뒤섞인다.
  installButton.disabled = true;
  inspectButton.disabled = true;
  try {
    await run(installResult, 'install', currentName());
  } finally {
    installButton.disabled = false;
    inspectButton.disabled = false;
  }
}
