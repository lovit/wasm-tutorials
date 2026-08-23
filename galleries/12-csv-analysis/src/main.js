// 이 예제의 핵심은 분석 결과가 아니라 "아무것도 안 나갔다" 는 것을 숫자로 보이는 데 있다.
import { getPyodide, renderPythonError, showLoading } from '../../_shared/pyodide.js';
import { addMetricRow, formatBytes } from '../../_shared/metrics.js';
import { ensureSupport } from '../../_shared/support.js';

const status = document.querySelector('#status');
const fileInput = document.querySelector('#file');
const encodingSelect = document.querySelector('#encoding');
const sampleButton = document.querySelector('#sample');
const netRows = document.querySelector('#net-rows');
const result = document.querySelector('#result');

const UPLOAD_PATH = '/data/uploaded.csv';

let pyodide;
let pyGlobals;
// 부팅이 끝난 시점의 요청 수를 기억해 둔다. 이 뒤에 늘어나는 것이 곧 "나간 것" 이다.
let baseline = 0;

if (ensureSupport()) {
  start();
}

async function start() {
  const done = showLoading(status, 'pandas 를 받는 중입니다');
  try {
    pyodide = await getPyodide({ packages: ['pandas'] });
    const response = await fetch('src/main.py');
    if (!response.ok) throw new Error(`src/main.py 를 받지 못했습니다 (${response.status})`);
    pyGlobals = pyodide.runPython(`${await response.text()}\n\nglobals()`);
    // 올린 파일이 들어갈 자리. MEMFS 라 새로고침하면 사라진다.
    pyodide.FS.mkdirTree('/data');
    done();
    baseline = requests().length;
    status.textContent = '준비됐습니다. CSV 를 고르거나 예제 데이터로 해 보세요.';
    fileInput.disabled = false;
    encodingSelect.disabled = false;
    sampleButton.disabled = false;
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
  const since = all.slice(baseline);
  const transferred = all.reduce((sum, entry) => sum + entry.transferSize, 0);

  netRows.replaceChildren();
  addMetricRow(netRows, '부팅에 쓴 요청', `${baseline}건 · ${formatBytes(transferred)} 받음`);
  addMetricRow(netRows, '분석하며 생긴 요청', `${since.length}건`);

  // addMetricRow 는 문자열만 받는다. 색은 돌려받은 행에서 칸을 꺼내 입힌다.
  const row = addMetricRow(
    netRows,
    '판정',
    since.length
      ? `${since.map((entry) => new URL(entry.name).pathname).join(', ')} 로 나갔습니다`
      : '데이터는 이 브라우저를 벗어나지 않았습니다',
  );
  row.lastElementChild.className = since.length ? 'verdict' : 'verdict clean';
}

async function analyze(fn, ...args) {
  const controls = [fileInput, encodingSelect, sampleButton];
  for (const control of controls) control.disabled = true;
  result.textContent = '읽는 중입니다…';

  const call = pyGlobals.get(fn);
  try {
    result.textContent = call(...args);
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
  await analyze('load_uploaded', encodingSelect.value);
});

sampleButton.addEventListener('click', () => analyze('load_sample'));
