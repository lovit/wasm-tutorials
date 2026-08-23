// 06. 파이썬에서 DOM 만지기
//
// 이 파일은 파이썬 코드를 불러다 실행하고 버튼을 연결하는 일만 한다.
// 화면을 만드는 코드는 전부 src/main.py 에 있다.

import { ensureSupport } from '../../_shared/support.js';
import { getPyodide, renderPythonError, showLoading } from '../../_shared/pyodide.js';
import { addMetricRow } from '../../_shared/metrics.js';

const bootBox = document.querySelector('#boot');
const modeFieldset = document.querySelector('#mode');
const textInput = document.querySelector('#text');
const addButton = document.querySelector('#add');
const clearButton = document.querySelector('#clear');
const countTable = document.querySelector('#proxy-count tbody');
const errorBox = document.querySelector('#handler-error');
const optionsButton = document.querySelector('#options');
const optionsResult = document.querySelector('#options-result');

// 파이썬 쪽 전역. host.changed() 가 불릴 때 개수를 다시 세려면 여기 있어야 한다.
let todoGlobals = null;

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

  // 파이썬이 화면을 바꿨을 때 자바스크립트가 알아야 한다. 모듈로 등록해 두면
  // 파이썬 쪽에서 import 해서 부를 수 있다. 반대 방향의 다리인 셈이다.
  pyodide.registerJsModule('host', { changed: () => showCount(todoGlobals) });

  // 파이썬 코드를 파일로 두면 하이라이트도 되고 ruff 검사도 받는다.
  // 자바스크립트 문자열 안에 파이썬을 스무 줄 넣으면 둘 다 안 된다.
  const source = await fetch('src/main.py').then((response) => response.text());
  // 이 손잡이는 페이지가 사는 동안 계속 쓰므로 일부러 안 놓는다. 놓으면 파이썬 전역이 사라진다.
  todoGlobals = pyodide.runPython(`${source}\n\nglobals()`);
  done();
  bootBox.textContent = '준비됐습니다. 항목을 넣고 지워 보세요.';

  // 그냥 넘긴 핸들러가 죽는 것은 리스너 안에서 나므로 여기까지 안 온다.
  // 창 전체의 오류를 잡아야 화면에 보여 줄 수 있다. 대신 이 페이지의 다른 오류도 함께
  // 걸리므로 "핸들러에서" 라고 단정하지 않는다.
  window.addEventListener('error', (event) => showError(event.error ?? event.message));

  addButton.addEventListener('click', () => addItem(todoGlobals));
  clearButton.addEventListener('click', () => clearAll(todoGlobals));
  optionsButton.addEventListener('click', () => showOptions(todoGlobals));
  textInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') addItem(todoGlobals);
  });

  for (const control of [textInput, addButton, clearButton, optionsButton]) {
    control.disabled = false;
  }
  showCount(todoGlobals);
}

function currentMode() {
  return modeFieldset.querySelector('input:checked').value;
}

/** 파이썬 쪽 함수를 꺼내 부르고, 다 쓰면 놓아 준다. */
function call(todo, name, ...args) {
  const fn = todo.get(name);
  try {
    return fn(...args);
  } finally {
    fn.destroy();
  }
}

function addItem(todo) {
  const text = textInput.value.trim();
  if (!text) return;
  call(todo, 'add_item', text, currentMode());
}

function clearAll(todo) {
  call(todo, 'clear_all');
}

function showCount(todo) {
  if (!todo) return;
  // 무엇이든 성공적으로 바뀐 것이므로 앞서 뜬 오류는 지운다.
  errorBox.replaceChildren();
  countTable.replaceChildren();
  addMetricRow(
    countTable,
    '화면에 있는 항목',
    `${document.querySelectorAll('#todo-list li').length}개`,
  );
  addMetricRow(countTable, '파이썬이 들고 있는 핸들러', `${call(todo, 'handler_count')}개`);
}

function showError(error) {
  const message = error?.message ?? String(error);
  errorBox.textContent = `가장 최근 오류\n\n${message}`;
}

function showOptions(todo) {
  optionsResult.textContent = call(todo, 'fetch_options_report');
}
