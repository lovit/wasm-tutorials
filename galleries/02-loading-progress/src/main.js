// 02. 로딩 비용 드러내기
//
// 01번은 런타임 하나를 받는 비용을 봤다. 여기서는 그 위에 패키지를 얹는다.
// 새로 배우는 것은 셋이다.
//   loadPyodide({ packages }) 로 부팅과 함께 받기
//   loadPackage(_, { messageCallback }) 로 진행 상황 흘리기
//   패키지가 자기 의존성을 끌고 온다는 것

import { ensureSupport } from '../../_shared/support.js';
import { getPyodide, renderPythonError, showLoading } from '../../_shared/pyodide.js';
import { addMetricRow, formatBytes, formatMs } from '../../_shared/metrics.js';

// 받은 패키지가 정말 쓸 수 있는지 한 줄로 확인한다.
const CHECK = `
import importlib.metadata as meta

names = [n.strip() for n in NAMES.split(",") if n.strip()]
"\\n".join(f"{n} {meta.version(n)}" for n in names)
`;

// 고를 수 있는 것은 이 넷뿐이다. ?preload= 로 들어온 값을 이 목록으로 거른다.
// Pyodide 는 .whl 로 끝나는 문자열을 패키지 이름이 아니라 URL 로 보고 그대로 받아 온다.
// 거르지 않으면 링크 하나로 방문자가 남의 서버에서 wheel 을 받게 된다.
const ALLOWED = ['numpy', 'pandas', 'matplotlib', 'scikit-learn'];

const bootBox = document.querySelector('#boot');
const picker = document.querySelector('#picker');
const closureBox = document.querySelector('#closure');
const loadButton = document.querySelector('#load');
const loadHint = document.querySelector('#load-hint');
const logBox = document.querySelector('#log');
const costTable = document.querySelector('#cost tbody');
const checkBox = document.querySelector('#check');
const preloadLink = document.querySelector('#preload-link');

// ?preload=numpy,pandas 로 열면 부팅과 함께 받는다. 그래야 두 방식을 비교할 수 있다.
// 런타임은 페이지당 하나라 한 화면에서 둘 다 잴 수 없다.
const preload = (new URL(location.href).searchParams.get('preload') ?? '')
  .split(',')
  .map((name) => name.trim())
  .filter((name) => ALLOWED.includes(name));

let lock = null;
let bootMs = 0;
let loading = false;

if (ensureSupport()) {
  start().catch((error) => renderPythonError(bootBox, error));
}

async function start() {
  bootBox.replaceChildren();
  // 패키지 이름 뒤에 조사를 붙이지 않는다. numpy 뒤에는 "가", pandas 뒤에는 "이" 라서
  // 문자열을 이어 붙이면 반드시 어느 한쪽이 틀린다.
  const done = showLoading(
    bootBox,
    preload.length ? '런타임과 패키지를 함께 받는 중입니다' : 'Python 런타임을 받는 중입니다',
  );

  // 페이지를 연 시점부터 잰다. 미리 받으면 부팅과 다운로드가 겹치므로 나눠 잴 수 없다.
  const started = performance.now();
  let pyodide;
  try {
    pyodide = await getPyodide({ packages: preload });
  } catch (error) {
    done();
    renderPythonError(bootBox, error);
    return;
  }
  bootMs = performance.now() - started;
  done();

  bootBox.textContent = preload.length
    ? `런타임과 패키지를 함께 받아 ${formatMs(bootMs)} 만에 준비됐습니다.\n받은 것: ${preload.join(', ')}\n부팅과 다운로드가 겹쳐서 돕니다. 그게 얼마나 이득인지는 회선에 따라 다릅니다.`
    : `런타임이 ${formatMs(bootMs)} 만에 준비됐습니다.\n패키지는 아직 하나도 받지 않았습니다.`;

  // 락파일은 Pyodide 가 부팅하며 이미 읽었다. 다시 받지 않고 그대로 꺼내 쓴다.
  lock = pyodide.lockfile;
  picker.addEventListener('change', showClosure);
  loadButton.addEventListener('click', () => loadPicked(pyodide));
  showClosure();

  if (preload.length) {
    reportPreload(wheelEntries());
    await verify(pyodide, preload);
  }
}

function picked() {
  return [...picker.querySelectorAll('input:checked')].map((box) => box.value);
}

/**
 * 고른 것들이 실제로 끌고 오는 패키지를 전부 펼친다. 의존성의 의존성까지 따라간다.
 *
 * 이미 본 것은 다시 큐에 넣지 않으므로 의존이 서로를 가리켜도 멈춘다.
 */
function closureOf(packages, names) {
  // 락파일 키는 소문자로 정규화돼 있지만, 고른 이름이 그렇다는 보장은 없다.
  const byLower = new Map(Object.keys(packages).map((key) => [key.toLowerCase(), key]));
  const found = new Set();
  const queue = [...names];

  while (queue.length) {
    const key = byLower.get(queue.shift().toLowerCase());
    if (!key || found.has(key)) continue;
    found.add(key);
    queue.push(...(packages[key].depends ?? []));
  }

  return [...found].sort();
}

function showClosure() {
  const names = picked();
  preloadLink.href = names.length ? `./?preload=${names.join(',')}` : './';

  // 받는 중에는 다시 누를 수 없어야 한다. 겹쳐 돌면 비용 표가 겹쳐 세고 로그가 지워진다.
  loadButton.disabled = loading || !names.length;

  if (!names.length) {
    closureBox.textContent = '아무것도 고르지 않았습니다.';
    return;
  }

  const all = closureOf(lock.packages, names);
  const extra = all.filter((name) => !names.some((n) => n.toLowerCase() === name.toLowerCase()));

  closureBox.textContent = extra.length
    ? `${names.length}개를 골랐는데 ${all.length}개를 받게 됩니다. 딸려 오는 것: ${extra.join(', ')}`
    : `${all.length}개를 받습니다. 딸려 오는 것은 없습니다.`;
}

async function loadPicked(pyodide) {
  const names = picked();
  if (!names.length || loading) return;

  loading = true;
  loadButton.disabled = true;
  loadHint.textContent = '';
  logBox.textContent = '';
  costTable.replaceChildren();

  // Resource Timing 엔트리는 지워지지 않고 뒤에만 붙는다. 그래서 지금 길이를 잡아 두면
  // 이번에 받은 것만 잘라 낼 수 있다.
  const before = wheelEntries().length;
  const started = performance.now();

  try {
    await pyodide.loadPackage(names, {
      // 진행 상황이 그대로 흘러온다. 몇 초 동안 아무 말이 없으면 멈춘 줄 안다.
      messageCallback: (message) => appendLog(message),
      errorCallback: (message) => appendLog(`오류: ${message}`),
    });
    reportAfterBoot(performance.now() - started, wheelEntries().slice(before));
    await verify(pyodide, names);
    loadHint.textContent =
      '새로고침한 뒤 같은 것을 다시 받아 보면 캐시가 얼마나 줄여 주는지 보입니다.';
  } catch (error) {
    renderPythonError(logBox, error);
  } finally {
    loading = false;
    showClosure();
  }
}

function appendLog(message) {
  logBox.textContent += `${message}\n`;
  logBox.scrollTop = logBox.scrollHeight;
}

/**
 * 이번에 받은 wheel 만 고른다. 런타임 자체 파일은 빼야 패키지 비용이 드러난다.
 *
 * 이 예제가 다루는 넷은 전부 wheel 로 온다. 락파일에는 .zip 으로 오는 공유 라이브러리도
 * 있으므로(libgeos 같은) 확장자로 거르는 방식이 언제나 맞지는 않는다.
 */
function wheelEntries() {
  return performance.getEntriesByType('resource').filter((entry) => entry.name.endsWith('.whl'));
}

/** 미리 받았을 때. 부팅과 다운로드가 겹쳐 돌아서 둘을 나눌 수 없다. */
function reportPreload(wheels) {
  addMetricRow(costTable, '페이지를 연 뒤 준비까지', formatMs(bootMs));
  addMetricRow(costTable, '그중 부팅만', '나눌 수 없습니다 (겹쳐서 돕니다)');
  addBytesRows(wheels);
}

/** 부팅 뒤에 받았을 때. 합계가 미리 받기와 견줄 수 있는 숫자다. */
function reportAfterBoot(packageMs, wheels) {
  addMetricRow(costTable, '부팅까지', formatMs(bootMs));
  addMetricRow(costTable, '패키지 받는 데', formatMs(packageMs));
  addMetricRow(costTable, '합쳐서', formatMs(bootMs + packageMs));
  addBytesRows(wheels);
}

function addBytesRows(wheels) {
  const transferred = wheels.reduce((sum, entry) => sum + entry.transferSize, 0);
  const decoded = wheels.reduce((sum, entry) => sum + entry.decodedBodySize, 0);

  addMetricRow(costTable, '받은 wheel 수', `${wheels.length}개`);
  addMetricRow(costTable, '네트워크를 탄 양', formatBytes(transferred));
  addMetricRow(costTable, '압축을 푼 뒤 크기', formatBytes(decoded));

  if (!wheels.length) {
    addMetricRow(costTable, '참고', '이미 올라와 있어서 아무것도 받지 않았습니다');
  } else if (transferred === 0) {
    addMetricRow(costTable, '참고', '전부 브라우저 캐시에서 왔습니다');
  }
}

/**
 * 받은 것이 정말 import 되는지 본다.
 *
 * 이름을 문자열 보간으로 파이썬 코드에 끼워 넣지 않는다. globals 로 넘기면
 * 따옴표나 줄바꿈이 섞여도 코드가 깨지지 않는다.
 */
async function verify(pyodide, names) {
  const globals = pyodide.toPy({ NAMES: names.join(',') });
  try {
    checkBox.textContent = await pyodide.runPythonAsync(CHECK, { globals });
  } catch (error) {
    checkBox.replaceChildren();
    renderPythonError(checkBox, error);
  } finally {
    globals.destroy();
  }
}
