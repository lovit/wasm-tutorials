// 이 예제의 핵심은 분석 결과가 아니라, 나가는 요청을 세는 일이 어디까지 믿을 만한지 보이는 데 있다.
import { getPyodide, renderPythonError, showLoading } from '../../_shared/pyodide.js';
import { addMetricRow, formatBytes } from '../../_shared/metrics.js';
import { ensureSupport } from '../../_shared/support.js';

const status = document.querySelector('#status');
const fileInput = document.querySelector('#file');
const encodingSelect = document.querySelector('#encoding');
const sampleButton = document.querySelector('#sample');
const leakButton = document.querySelector('#leak');
const leakResult = document.querySelector('#leak-result');
const netRows = document.querySelector('#net-rows');
const result = document.querySelector('#result');

const UPLOAD_PATH = '/data/uploaded.csv';

let pyodide;
let pyGlobals;
// 부팅이 끝난 시점의 요청 수와 바이트를 기억해 둔다. 이 뒤에 늘어나는 것이 곧 "나간 것" 이다.
let baseline = 0;
let baselineBytes = 0;
// 파일을 한 번이라도 올렸는지. 인코딩만 바꿔도 다시 읽으려면 알아야 한다.
let uploadedName = null;

if (ensureSupport()) {
  start();
}

async function start() {
  // 기본 버퍼는 250건이라 조용히 넘친다. 세는 것이 일인 예제이니 넉넉히 잡는다.
  performance.setResourceTimingBufferSize(1000);

  const done = showLoading(status, 'pandas 를 받는 중입니다');
  try {
    pyodide = await getPyodide({ packages: ['pandas'] });
    const response = await fetch('src/main.py');
    if (!response.ok) throw new Error(`src/main.py 를 받지 못했습니다 (${response.status})`);
    // 이 프록시는 페이지가 살아 있는 동안 계속 쓰므로 일부러 붙잡아 둔다.
    pyGlobals = pyodide.runPython(`${await response.text()}\n\nglobals()`);
    // 올린 파일이 들어갈 자리. MEMFS 라 새로고침하면 사라진다.
    pyodide.FS.mkdirTree('/data');
    done();
    const entries = requests();
    baseline = entries.length;
    baselineBytes = entries.reduce((sum, entry) => sum + entry.transferSize, 0);
    status.textContent = '준비됐습니다. CSV 를 고르거나 예제 데이터로 해 보세요.';
    for (const control of [fileInput, encodingSelect, sampleButton, leakButton])
      control.disabled = false;
    showNetwork();
  } catch (error) {
    done();
    status.replaceChildren();
    renderPythonError(status, error);
  }
}

// 이 문서가 만든 요청 전부. 브라우저가 기록해 둔 것을 그대로 읽는다.
function requests() {
  return performance.getEntriesByType('resource');
}

function showNetwork() {
  const all = requests();
  netRows.replaceChildren();
  addMetricRow(netRows, '부팅에 쓴 요청', `${baseline}건 · ${formatBytes(baselineBytes)} 받음`);

  // 버퍼는 아무나 비울 수 있는 전역 상태다. 줄었다면 세던 근거가 사라진 것이다.
  if (all.length < baseline) {
    addMetricRow(netRows, '분석하며 생긴 요청', '셀 수 없음');
    mark('계측을 믿을 수 없습니다. 기록이 지워졌습니다', false);
    return;
  }

  const since = all.slice(baseline);
  addMetricRow(netRows, '분석하며 생긴 요청', `${since.length}건`);
  if (!since.length) {
    mark('이 계측에 잡힌 요청은 없습니다', true);
    return;
  }
  const names = since.slice(0, 3).map((entry) => {
    const url = new URL(entry.name);
    // 어느 호스트로 갔는지가 유출 판정에서 제일 중요하다. 경로만 찍으면 그걸 버린다.
    return url.host === location.host ? url.pathname : `${url.host}${url.pathname}`;
  });
  const more = since.length > 3 ? ` 외 ${since.length - 3}건` : '';
  mark(`${names.join(', ')}${more} 로 나갔습니다`, false);
}

function mark(text, clean) {
  const row = addMetricRow(netRows, '관측', text);
  row.lastElementChild.className = clean ? 'verdict clean' : 'verdict';
}

function renderResult(payload) {
  const data = JSON.parse(payload);
  const parts = [];

  const heading = document.createElement('p');
  heading.textContent = `${data.title} — 행 ${data.rows.toLocaleString()}개, 열 ${data.columns.length}개`;
  parts.push(heading);

  // 열 목록은 표로 그린다. 고정폭 글꼴에 기대어 손으로 칸을 맞추면 한글에서 어긋난다.
  const table = document.createElement('table');
  table.className = 'metrics';
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const label of ['열', '타입', '고유값', '결측']) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = label;
    headRow.append(cell);
  }
  head.append(headRow);
  const body = document.createElement('tbody');
  for (const column of data.columns) {
    const row = document.createElement('tr');
    const name = document.createElement('th');
    name.scope = 'row';
    name.textContent = column.name;
    row.append(name);
    for (const value of [
      column.dtype,
      column.unique.toLocaleString(),
      column.missing ? `${column.missing}개` : '없음',
    ]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    body.append(row);
  }
  table.append(head, body);
  parts.push(table);

  for (const [label, text] of [
    ['숫자 열 요약', data.numeric],
    [data.grouped ? `${data.grouped.column} 별로 세기` : null, data.grouped?.text],
    ['처음 세 줄', data.head],
  ]) {
    if (!label || !text) continue;
    const caption = document.createElement('p');
    caption.className = 'hint';
    caption.textContent = label;
    const block = document.createElement('pre');
    block.className = 'output';
    block.textContent = text;
    parts.push(caption, block);
  }

  result.replaceChildren(...parts);
}

async function analyze(fn, ...args) {
  const controls = [fileInput, encodingSelect, sampleButton, leakButton];
  for (const control of controls) control.disabled = true;
  result.replaceChildren(
    Object.assign(document.createElement('p'), { textContent: '읽는 중입니다…' }),
  );

  const call = pyGlobals.get(fn);
  try {
    renderResult(call(...args));
    status.textContent = '다 읽었습니다.';
  } catch (error) {
    result.replaceChildren();
    renderPythonError(result, error);
    status.textContent = '읽지 못했습니다.';
  } finally {
    call.destroy();
    for (const control of controls) control.disabled = false;
    showNetwork();
  }
}

fileInput.addEventListener('change', async () => {
  const [file] = fileInput.files;
  if (!file) return;
  status.textContent = `${file.name} (${formatBytes(file.size)}) 를 가짜 파일시스템에 올리는 중입니다…`;
  // FileReader 대신 arrayBuffer() 를 쓴다. 어차피 파일 전체를 메모리에 올린다.
  const bytes = new Uint8Array(await file.arrayBuffer());
  pyodide.FS.writeFile(UPLOAD_PATH, bytes);
  uploadedName = file.name;
  // 값을 비워 둬야 같은 파일을 다시 골랐을 때도 change 가 뜬다.
  fileInput.value = '';
  await analyze('load_uploaded', encodingSelect.value);
});

// 인코딩만 바꿔도 다시 읽어야 한다. 안 그러면 오류 화면을 띄워 놓고 고칠 길이 없다.
encodingSelect.addEventListener('change', () => {
  if (uploadedName) analyze('load_uploaded', encodingSelect.value);
});

sampleButton.addEventListener('click', () => analyze('load_sample'));

leakButton.addEventListener('click', async () => {
  const before = requests().length;
  // 응답을 읽지 않는 fetch 다. 보내는 쪽은 응답이 필요 없으니 유출 코드의 기본형이기도 하다.
  // 같은 출처의 아무 주소나 두드린다. 서버가 뭘 돌려주든 상관없다.
  fetch(`${location.pathname}?몰래=${encodeURIComponent('보낸 것처럼')}`, { method: 'POST' });
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const after = requests().length;
  leakResult.textContent = [
    '응답을 읽지 않는 fetch 를 한 번 보냈습니다.',
    `Resource Timing 이 센 요청: ${before}건 → ${after}건`,
    after === before
      ? '늘지 않았습니다. 위의 표는 이 요청을 못 봅니다.'
      : '이번에는 잡혔습니다. 브라우저나 상황에 따라 다를 수 있습니다.',
    '',
    '개발자 도구의 네트워크 탭을 열어 두고 다시 눌러 보세요. 거기에는 찍힙니다.',
  ].join('\n');
  showNetwork();
});
