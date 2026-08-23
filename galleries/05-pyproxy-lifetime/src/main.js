// 05. PyProxy 의 수명
//
// 04번에서 손잡이가 무엇인지 봤다. 여기서는 안 놓으면 무슨 일이 나는지 숫자로 본다.
// 새로 배우는 것은 넷이다.
//   손잡이 하나가 파이썬 쪽 참조 하나를 붙잡는다
//   안 놓으면 WebAssembly 힙이 자라고, 놓아도 힙은 안 줄어든다
//   destroy / try-finally / using 세 가지 방법
//   놓은 손잡이를 다시 쓰면 나는 오류

import { ensureSupport } from '../../_shared/support.js';
import { getPyodide, renderPythonError, showLoading } from '../../_shared/pyodide.js';
import { addMetricRow, formatBytes } from '../../_shared/metrics.js';

// 참조 수를 셀 대상. 전역에 두어야 프록시를 다 놓아도 객체가 살아 있다.
const SETUP = `
import sys

TARGET = {"note": "손잡이가 이 dict 를 붙잡는다"}
`;

const bootBox = document.querySelector('#boot');
const leakButton = document.querySelector('#leak');
const releaseButton = document.querySelector('#release');
const refResult = document.querySelector('#ref-result tbody');
const allocButton = document.querySelector('#alloc');
const freeButton = document.querySelector('#free');
const heapResult = document.querySelector('#heap-result tbody');
const waysButton = document.querySelector('#ways');
const waysResult = document.querySelector('#ways-result tbody');
const reuseButton = document.querySelector('#reuse');
const reuseResult = document.querySelector('#reuse-result');

// 만들어 놓고 안 놓은 손잡이들. 이 배열이 곧 누수다.
let held = [];
let blobs = [];

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
  pyodide.runPython(SETUP);
  bootBox.textContent = '준비됐습니다. 버튼을 눌러 누수를 만들어 보세요.';

  leakButton.addEventListener('click', () => leakHandles(pyodide));
  releaseButton.addEventListener('click', () => releaseHandles(pyodide));
  allocButton.addEventListener('click', () => allocBlobs(pyodide));
  freeButton.addEventListener('click', () => freeBlobs(pyodide));
  waysButton.addEventListener('click', () => compareWays(pyodide));
  reuseButton.addEventListener('click', () => reuseDestroyed(pyodide));

  for (const button of [leakButton, allocButton, waysButton, reuseButton]) button.disabled = false;
  showRefs(pyodide);
  showHeap(pyodide, '아직 아무것도 안 잡았습니다');
}

/**
 * 파이썬 쪽 참조 수.
 *
 * getrefcount 는 자기가 인자로 받은 것도 한 번 세므로 늘 하나가 더 붙는다.
 * 여기서는 그 차이가 아니라 늘고 주는 폭을 보는 것이라 그대로 쓴다.
 */
function refCount(pyodide) {
  return pyodide.runPython('sys.getrefcount(TARGET)');
}

function showRefs(pyodide) {
  refResult.replaceChildren();
  addMetricRow(refResult, '살아 있는 손잡이', `${held.length}개`);
  addMetricRow(refResult, 'TARGET 의 참조 수', String(refCount(pyodide)));
  releaseButton.disabled = held.length === 0;
}

function leakHandles(pyodide) {
  for (let i = 0; i < 100; i += 1) held.push(pyodide.globals.get('TARGET'));
  showRefs(pyodide);
}

function releaseHandles(pyodide) {
  held.forEach((proxy) => proxy.destroy());
  held = [];
  showRefs(pyodide);
}

/**
 * WebAssembly 힙 크기. 공개 API 가 아니라 내부 모듈을 들여다보는 것이다.
 *
 * 없어지면 0 을 돌려주는 대신 null 을 준다. 0 으로 물러서면 "힙은 그대로입니다" 가 떠서
 * 이 예제의 결론과 정반대로 읽힌다. 못 재는 것과 안 자란 것은 다르다.
 */
function heapBytes(pyodide) {
  return pyodide._module?.HEAP8?.length ?? null;
}

function showHeap(pyodide, note) {
  const bytes = heapBytes(pyodide);
  heapResult.replaceChildren();
  addMetricRow(heapResult, '잡고 있는 덩이', `${blobs.length}개`);
  addMetricRow(
    heapResult,
    'WebAssembly 힙',
    bytes === null ? '이 Pyodide 버전에서는 잴 수 없습니다' : formatBytes(bytes),
  );
  if (note) addMetricRow(heapResult, '방금 한 일', note);
  freeButton.disabled = blobs.length === 0;
}

function allocBlobs(pyodide) {
  const before = heapBytes(pyodide);
  for (let i = 0; i < 5; i += 1) blobs.push(pyodide.runPython('bytearray(2 * 1024 * 1024)'));
  const after = heapBytes(pyodide);

  if (before === null || after === null) {
    showHeap(pyodide, '10 MiB 를 잡았습니다. 힙 크기는 재지 못했습니다');
    return;
  }
  // 매번 자라지는 않는다. 이미 늘려 둔 자리에 들어가면 힙은 그대로다.
  showHeap(
    pyodide,
    after > before
      ? `10 MiB 를 잡았고 힙이 ${formatBytes(after - before)} 늘었습니다`
      : '10 MiB 를 잡았지만 힙은 그대로입니다. 이미 늘려 둔 자리에 들어갔습니다',
  );
}

function freeBlobs(pyodide) {
  const before = heapBytes(pyodide);
  blobs.forEach((proxy) => proxy.destroy());
  blobs = [];
  pyodide.runPython('import gc; gc.collect()');
  const after = heapBytes(pyodide);

  if (before === null || after === null) {
    showHeap(pyodide, '전부 놓았습니다. 힙 크기는 재지 못했습니다');
    return;
  }
  showHeap(
    pyodide,
    after < before
      ? `힙이 ${formatBytes(before - after)} 줄었습니다`
      : '힙은 줄지 않습니다. 파이썬 쪽 메모리는 돌아왔지만 WebAssembly 는 선형 메모리를 반납하지 않습니다',
  );
}

/**
 * using 은 문법이라 미지원 브라우저에서는 파일 전체가 파싱 단계에서 죽는다.
 * 배너를 띄울 틈도 없으므로, 쓸 수 있는지 확인한 뒤 그때 만들어 쓴다.
 */
function makeUsingRunner() {
  // CSP 에 unsafe-eval 이 없으면 new Function 자체가 던진다. 그때는 문법 지원 여부와
  // 무관하게 못 쓰는 것이라 결과는 같다.
  try {
    return new Function(
      'get',
      `{
        using handle = get();
        return handle.type;
      }`,
    );
  } catch {
    return null;
  }
}

const usingRunner = makeUsingRunner();

/** 세 가지 방법을 나란히 돌리고, 각각 참조 수가 제자리로 돌아오는지 본다. */
function compareWays(pyodide) {
  waysResult.replaceChildren();

  addWay('그냥 두기', '언제나 됩니다', () => {
    // 일부러 놓지 않는다. 이 손잡이는 페이지가 닫힐 때까지 남는다.
    held.push(pyodide.globals.get('TARGET'));
  });

  addWay('destroy()', '언제나 됩니다', () => {
    const handle = pyodide.globals.get('TARGET');
    handle.destroy();
  });

  addWay('try / finally', '언제나 됩니다', () => {
    const handle = pyodide.globals.get('TARGET');
    try {
      return handle.type;
    } finally {
      handle.destroy();
    }
  });

  addWay(
    'using',
    usingRunner ? '이 브라우저는 지원합니다' : '이 브라우저는 지원하지 않습니다',
    usingRunner ? () => usingRunner(() => pyodide.globals.get('TARGET')) : null,
  );

  showRefs(pyodide);

  function addWay(name, support, run) {
    const before = refCount(pyodide);
    let verdict;
    if (!run) {
      verdict = '해 보지 않았습니다';
    } else {
      run();
      const after = refCount(pyodide);
      verdict =
        after === before ? `돌아왔습니다 (${before})` : `안 돌아왔습니다 (${before} → ${after})`;
    }

    const row = document.createElement('tr');
    for (const [index, text] of [name, support, verdict].entries()) {
      const cell = document.createElement(index === 0 ? 'th' : 'td');
      if (index === 0) cell.scope = 'row';
      cell.textContent = text;
      row.append(cell);
    }
    waysResult.append(row);
  }
}

function reuseDestroyed(pyodide) {
  const handle = pyodide.globals.get('TARGET');
  handle.destroy();

  const lines = [];
  try {
    handle.type;
    lines.push('다시 썼는데 아무 일도 없었습니다. 뜻밖입니다.');
  } catch (error) {
    lines.push(`다시 쓰기: ${error.constructor.name}: ${error.message}`);
  }

  // 두 번 놓는 것은 막지 않는다. 이미 놓았으면 할 일이 없을 뿐이다.
  try {
    handle.destroy();
    lines.push('두 번 놓기: 조용히 지나갑니다.');
  } catch (error) {
    lines.push(`두 번 놓기: ${error.message}`);
  }

  reuseResult.textContent = lines.join('\n');
}
