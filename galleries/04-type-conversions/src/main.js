// 04. 값이 오가는 규칙
//
// 01번에서 dict 는 PyProxy 로 오고 숫자는 number 로 온다는 것을 봤다. 그 규칙을 여기서 정리한다.
// 새로 배우는 것은 셋이다.
//   무엇이 복사되고 무엇이 손잡이로 오는지
//   toJs() 의 depth 와 dict_converter
//   null 과 undefined 가 갈리는 자리

import { ensureSupport } from '../../_shared/support.js';
import { getPyodide, renderPythonError, showLoading } from '../../_shared/pyodide.js';
import { addMetricRow } from '../../_shared/metrics.js';

const PY_SAMPLES = [
  '42',
  '2**70',
  '"안녕"',
  'None',
  '[1, 2, 3]',
  '(1, 2)',
  '{"a": {"b": [1, 2]}}',
  '{1, 2}',
  'b"ab"',
  'lambda x: x',
];

// 파이썬 쪽에서 볼 자바스크립트 값들. 여기 있는 이름 그대로 파이썬 모듈이 된다.
const JS_VALUES = {
  1: 1,
  '2 ** 53': 2 ** 53,
  1.5: 1.5,
  "'hi'": 'hi',
  true: true,
  null: null,
  undefined: undefined,
  '[1, 2]': [1, 2],
  '{ a: 1 }': { a: 1 },
  'new Map(...)': new Map([['a', 1]]),
  'new Set([1])': new Set([1]),
  '() => 1': () => 1,
  'new Uint8Array(...)': new Uint8Array([1, 2]),
};

// 파이썬에서 위 값들을 훑어 타입과 표현을 돌려준다.
const INSPECT_JS = `
import jsvalues

rows = []
for label in LABELS:
    value = jsvalues.get(label)
    rows.append((label, type(value).__name__, repr(value)[:60]))
rows
`;

const bootBox = document.querySelector('#boot');
const pySamples = document.querySelector('#py-samples');
const pyCode = document.querySelector('#py-code');
const depthInput = document.querySelector('#depth');
const depthOut = document.querySelector('#depth-out');
const asMapToggle = document.querySelector('#as-map');
const noProxyToggle = document.querySelector('#no-proxy');
const comboWarning = document.querySelector('#combo-warning');
const pyResult = document.querySelector('#py-result tbody');
const jsResult = document.querySelector('#js-result tbody');
const intResult = document.querySelector('#int-result tbody');

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
  done();
  bootBox.textContent = '준비됐습니다. 표현식을 고쳐 넣어 보세요.';

  buildSamples();
  pyCode.disabled = false;
  pyCode.value = '{"a": {"b": [1, 2]}}';

  const rerun = () => inspectPython(pyodide);

  // 표현식은 치는 중에도 도는데, 중간 상태가 무거울 수 있다. 2**100000000 을 치다 보면
  // 그 중간이 먼저 잡힌다. 잠깐 기다렸다 돈다.
  let typing;
  pyCode.addEventListener('input', () => {
    clearTimeout(typing);
    typing = setTimeout(rerun, 150);
  });
  depthInput.addEventListener('input', () => {
    showDepth();
    rerun();
  });
  asMapToggle.addEventListener('change', rerun);
  noProxyToggle.addEventListener('change', () => {
    syncOptionState();
    rerun();
  });
  pySamples.addEventListener('click', (event) => {
    const value = event.target.dataset.expr;
    if (!value) return;
    pyCode.value = value;
    rerun();
  });

  syncOptionState();
  showDepth();
  rerun();
  inspectJs(pyodide);
  findIntBoundary(pyodide);
}

function buildSamples() {
  for (const expr of PY_SAMPLES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.expr = expr;
    button.textContent = expr;
    pySamples.append(button);
  }
}

function showDepth() {
  const depth = Number(depthInput.value);
  const text = depth < 0 ? '-1 (끝까지)' : `${depth}`;
  depthOut.textContent = text;
  // 슬라이더가 읽히는 값도 함께 맞춘다. 안 그러면 "-1" 이라고만 읽는다.
  depthInput.setAttribute('aria-valuetext', text);
}

/** 파이썬 표현식 하나를 돌려서, 자바스크립트가 무엇을 받았는지 적는다. */
function inspectPython(pyodide) {
  pyResult.replaceChildren();

  let value;
  try {
    value = pyodide.runPython(pyCode.value);
  } catch (error) {
    addMetricRow(pyResult, '오류', lastLine(error.message));
    return;
  }

  try {
    const isProxy = value instanceof pyodide.ffi.PyProxy;
    addMetricRow(
      pyResult,
      '자바스크립트가 받은 것',
      isProxy ? `PyProxy (파이썬 ${value.type})` : typeof value,
    );
    addMetricRow(pyResult, '그대로 찍으면', String(value));

    if (!isProxy) {
      addMetricRow(pyResult, 'toJs()', '필요 없습니다. 이미 값입니다');
      return;
    }
    showConverted(pyodide, value);
  } finally {
    value?.destroy?.();
  }
}

/** toJs() 를 옵션대로 불러 결과를 적는다. 만들어진 프록시는 여기서 전부 회수한다. */
function showConverted(pyodide, value) {
  const depth = Number(depthInput.value);
  const noProxy = noProxyToggle.checked;

  // 이 조합은 Pyodide 314.0.5 에서 런타임을 통째로 죽인다. 예외가 아니라 fatal error 라
  // 새로고침 전까지 아무것도 돌지 않는다. 부르지 않는 것이 유일한 방어다.
  if (noProxy && depth >= 0) {
    addMetricRow(pyResult, 'toJs()', '이 조합은 부르지 않습니다. 아래 설명을 보세요');
    return;
  }

  // pyproxies 에 배열을 주면 변환 중에 만들어진 프록시가 여기 담긴다.
  // 담아 두지 않으면 어디에 생겼는지 알 수 없어 놓아 줄 수도 없다.
  const made = [];
  const options = noProxy ? { create_pyproxies: false } : { pyproxies: made };

  if (depth >= 0) options.depth = depth;
  if (asMapToggle.checked) options.dict_converter = (entries) => new Map(entries);

  let converted;
  try {
    converted = value.toJs(options);
  } catch (error) {
    addMetricRow(pyResult, 'toJs()', `실패: ${lastLine(error.message)}`);
    return;
  }

  try {
    addMetricRow(pyResult, 'toJs() 결과 종류', describeJs(converted));
    addMetricRow(pyResult, 'toJs() 결과', preview(pyodide, converted));
    addMetricRow(pyResult, '변환하며 만든 프록시', `${made.length}개`);
  } finally {
    made.forEach((proxy) => proxy.destroy());
  }
}

/** 위험한 조합을 골랐을 때 슬라이더를 잠그고 이유를 말해 준다. */
function syncOptionState() {
  const noProxy = noProxyToggle.checked;
  depthInput.disabled = noProxy;
  comboWarning.hidden = !noProxy;
}

function describeJs(value) {
  if (value === null) return 'null';
  if (typeof value !== 'object') return typeof value;
  const tag = Object.prototype.toString.call(value).slice(8, -1);
  return tag === 'Object' ? '평범한 객체' : tag;
}

/**
 * 값이 무엇인지 한 줄로.
 *
 * 남아 있는 PyProxy 를 따로 표시하는 것이 요점이다. JSON.stringify 는 프록시를
 * 그냥 펼쳐 버려서, 그대로 두면 depth 를 바꿔도 결과가 똑같아 보인다.
 */
function preview(pyodide, value, seen = new WeakSet()) {
  if (value instanceof pyodide.ffi.PyProxy) return `«PyProxy ${value.type}»`;

  // 자기를 담은 리스트도 만들 수 있다. 표시하다가 스택이 넘치지 않게 한 번 본 것은 접는다.
  // 파이썬 repr 이 [[...]] 로 접는 것과 같은 이유다.
  if (value && typeof value === 'object') {
    if (seen.has(value)) return '«순환»';
    seen.add(value);
  }
  if (value instanceof Map) {
    const shown = [...value].map(([k, v]) => `${k} => ${preview(pyodide, v, seen)}`);
    return `Map { ${shown.join(', ')} }`;
  }
  if (value instanceof Set)
    return `Set { ${[...value].map((v) => preview(pyodide, v)).join(', ')} }`;
  if (ArrayBuffer.isView(value)) return `${value.constructor.name} [${[...value].join(', ')}]`;
  if (Array.isArray(value)) return `[${value.map((v) => preview(pyodide, v, seen)).join(', ')}]`;
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'function') return '(함수)';

  // 위 갈래에 안 걸린 나머지 객체를 키와 값으로 펼친다.
  // 키에 따옴표를 붙이는 것이 중요하다. dict 키가 문자열로 강제된 결과를 보여 주는 자리라,
  // 따옴표가 없으면 {undefined: "a"} 의 키가 문자열인지 값인지 구별되지 않는다.
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return '{}';
    const shown = entries.map(([k, v]) => `${JSON.stringify(k)}: ${preview(pyodide, v, seen)}`);
    return `{ ${shown.join(', ')} }`;
  }

  return String(value);
}

function lastLine(message) {
  return message.split('\n').filter(Boolean).pop() ?? message;
}

/** 자바스크립트 값을 파이썬 쪽에서 보면 무엇인지. */
function inspectJs(pyodide) {
  const labels = Object.keys(JS_VALUES);

  // 값 자체를 파이썬 코드에 끼워 넣을 수 없으니 모듈로 등록해 이름으로 꺼내 쓴다.
  pyodide.registerJsModule('jsvalues', { get: (label) => JS_VALUES[label] });

  const globals = pyodide.toPy({ LABELS: labels });
  let rows;
  try {
    rows = pyodide.runPython(INSPECT_JS, { globals });
  } finally {
    globals.destroy();
  }

  try {
    for (const row of rows) {
      const [label, typeName, shown] = row.toJs();
      const tr = document.createElement('tr');
      for (const [index, text] of [label, typeName, shown].entries()) {
        const cell = document.createElement(index === 0 ? 'th' : 'td');
        if (index === 0) cell.scope = 'row';
        cell.textContent = text;
        tr.append(cell);
      }
      jsResult.append(tr);
      row.destroy();
    }
  } finally {
    rows.destroy();
  }
}

/**
 * 파이썬 정수가 number 에서 bigint 로 넘어가는 자리를 이진 탐색으로 찾는다.
 *
 * 문서에 "2의 53승쯤" 이라고 적어 두는 대신 이 페이지가 직접 찾게 했다.
 */
function findIntBoundary(pyodide) {
  const kindOf = (expression) => {
    const value = pyodide.runPython(expression);
    const kind = typeof value;
    value?.destroy?.();
    return kind;
  };

  let low = 2 ** 52;
  let high = 2 ** 53;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (kindOf(String(middle)) === 'number') low = middle;
    else high = middle;
  }

  for (const expression of ['0', '2**31', '2**52', String(low), String(high), '2**53', '2**70']) {
    addMetricRow(intResult, expression, kindOf(expression));
  }
  addMetricRow(intResult, 'number 로 오는 가장 큰 값', low.toLocaleString());
  addMetricRow(intResult, 'Number.MAX_SAFE_INTEGER', Number.MAX_SAFE_INTEGER.toLocaleString());
}
