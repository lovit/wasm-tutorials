// 07. 함수를 양쪽으로 넘기기
//
// 06번은 파이썬이 화면을 만지는 쪽이었다. 여기서는 양쪽이 서로를 부른다.
// 새로 배우는 것은 셋이다.
//   create_once_callable 은 한 번만 부를 수 있다
//   자바스크립트에서 파이썬 함수에 키워드 인자를 넘기려면 callKwargs
//   파이썬의 키워드 인자는 자바스크립트에서 객체 하나로 묶인다

import { ensureSupport } from '../../_shared/support.js';
import { getPyodide, renderPythonError, showLoading } from '../../_shared/pyodide.js';
import { addMetricRow } from '../../_shared/metrics.js';

const bootBox = document.querySelector('#boot');
const kindFieldset = document.querySelector('#kind');
const makeButton = document.querySelector('#make');
const callButton = document.querySelector('#call');
const callKwButton = document.querySelector('#call-kw');
const releaseButton = document.querySelector('#release');
const returnButton = document.querySelector('#return');
const callLog = document.querySelector('#call-log');
const heldTable = document.querySelector('#held tbody');
const toJsButton = document.querySelector('#to-js');
const toJsResult = document.querySelector('#to-js-result');
const channelsButton = document.querySelector('#channels');
const channelsResult = document.querySelector('#channels-result');

// 파이썬이 맡긴 손잡이. 자바스크립트가 이걸 붙잡고 있다가 나중에 부른다.
// 06번의 addEventListener 가 하는 일과 같다.
let handle = null;
// 마지막으로 불러 본 결과. 참조가 있다고 부를 수 있는 것은 아니라서 따로 기억한다.
let lastCall = '아직 안 불러 봄';
let pyGlobals = null;

if (ensureSupport()) {
  start().catch((error) => renderPythonError(bootBox, error));
}

async function start() {
  bootBox.replaceChildren();
  const done = showLoading(bootBox);

  let pyodide;
  try {
    pyodide = await getPyodide();
  } catch (error) {
    done();
    renderPythonError(bootBox, error);
    return;
  }

  // 파이썬이 부를 자바스크립트 함수를 모듈로 등록한다. js 의 속성이 아니라 최상위 모듈이 된다.
  pyodide.registerJsModule('report', { name: 'report 모듈', describe, remember });

  const source = await fetch('src/main.py').then((response) => response.text());
  // 이 손잡이는 페이지가 사는 동안 계속 쓰므로 일부러 안 놓는다.
  pyGlobals = pyodide.runPython(`${source}\n\nglobals()`);
  pyGlobals.set('FROM_SET', 'globals.set 으로 넣은 값');
  done();
  bootBox.textContent = '준비됐습니다. 손잡이를 만들고 불러 보세요.';

  makeButton.addEventListener('click', () => makeHandle());
  callButton.addEventListener('click', () => callHandle(false));
  callKwButton.addEventListener('click', () => callHandle(true));
  returnButton.addEventListener('click', () => callReturned());
  releaseButton.addEventListener('click', () => releaseAll());
  toJsButton.addEventListener('click', () => showToJs());
  channelsButton.addEventListener('click', () => showChannels());

  for (const button of [makeButton, returnButton, toJsButton, channelsButton]) {
    button.disabled = false;
  }
  showHeld();
}

/** 파이썬이 손잡이를 맡기는 자리. 받아서 들고 있기만 한다. */
function remember(fn) {
  handle = fn;
}

/** 파이썬이 부를 자바스크립트 함수. 받은 것을 그대로 되읊어 준다. */
function describe(name, ...rest) {
  const shown = rest.map((value) => {
    if (value && typeof value === 'object') {
      // 진짜 객체인지 손잡이인지는 이 태그가 가른다. 이게 이 예제의 핵심 증거다.
      return `${Object.prototype.toString.call(value)} ${JSON.stringify(value)}`;
    }
    return JSON.stringify(value);
  });
  return `이름=${name} / 나머지 ${rest.length}개: ${shown.join(', ') || '(없음)'}`;
}

function currentKind() {
  return kindFieldset.querySelector('input:checked').value;
}

function call(name, ...args) {
  const fn = pyGlobals.get(name);
  try {
    return fn(...args);
  } finally {
    fn.destroy();
  }
}

function makeHandle() {
  handle = null;
  lastCall = '아직 안 불러 봄';
  call('hand_over', currentKind());
  callLog.textContent = `${currentKind()} 방식으로 손잡이를 맡았습니다. 이제 눌러 보세요.`;
  callButton.disabled = false;
  callKwButton.disabled = false;
  showHeld();
}

function callHandle(withKeywords) {
  let line;
  try {
    // 파이썬 함수에 키워드 인자를 넘기려면 callKwargs 를 쓴다. 그냥 부르면 위치 인자다.
    line = withKeywords
      ? handle.callKwargs('마루', { greeting: '반가워', excited: true })
      : handle('마루');
    lastCall = '부를 수 있음';
  } catch (error) {
    line = `실패 — ${error.message.split('\n')[0]}`;
    lastCall = '이미 죽었음';
  }

  callLog.textContent += `\n${withKeywords ? 'callKwargs' : '그냥 부르기'} → ${line}`;
  showHeld();
}

/**
 * 파이썬이 모아 둔 프록시만 놓는다.
 *
 * 자바스크립트가 든 참조는 건드리지 않는다. 모아 둔 것과 지금 든 것이 다를 수 있어서,
 * 여기서 함께 지우면 살아 있는 손잡이가 화면에서만 사라진다.
 */
function releaseAll() {
  callLog.textContent += `\n${call('release_all')}`;
  showHeld();
}

/**
 * 같은 함수를 반환값으로 받아 부른다.
 *
 * 인자로 넘긴 것과 달리 이건 빌린 손잡이가 아니다. 자동으로 회수되지 않으므로
 * 여러 번 불러도 되고, 대신 다 쓰면 우리가 놓아야 한다.
 */
function callReturned() {
  const returned = call('return_handle');
  try {
    callLog.textContent += `\n반환값으로 받아 부르기 → ${returned('마루')}`;
    callLog.textContent += `\n한 번 더 → ${returned('마루')}`;
  } finally {
    returned.destroy();
  }
}

function showHeld() {
  const held = call('held_count');
  heldTable.replaceChildren();
  addMetricRow(heldTable, '파이썬이 모아 둔 프록시', `${held}개`);
  addMetricRow(heldTable, 'greet 을 가리키는 참조 수', String(call('greet_refcount')));
  addMetricRow(heldTable, '자바스크립트가 든 참조', handle ? `있음 (${lastCall})` : '없음');
  releaseButton.disabled = held === 0;
}

function showToJs() {
  try {
    toJsResult.textContent = report(
      `위치 인자로: ${call('call_js_positional')}`,
      `키워드 인자로: ${call('call_js_keyword')}`,
      '',
      `키워드 안에 dict: ${call('nested_dict_as_keyword')}`,
      `키워드 안에 to_js: ${call('nested_to_js_as_keyword')}`,
    );
  } catch (error) {
    toJsResult.replaceChildren();
    renderPythonError(toJsResult, error);
  }
}

function report(...lines) {
  return lines.join('\n');
}

function showChannels() {
  try {
    channelsResult.textContent = call('channel_report');
  } catch (error) {
    channelsResult.replaceChildren();
    renderPythonError(channelsResult, error);
  }
}
