// 08. 파일 다루기
//
// 새로 배우는 것은 넷이다.
//   pyodide.FS 로 자바스크립트에서 파일을 넣고 꺼낸다
//   올린 파일을 파이썬에게 주고, 파이썬이 만든 것을 내려받는다
//   MEMFS 는 새로고침하면 사라진다
//   IDBFS 는 남지만 syncfs 를 불러야 한다

import { ensureSupport } from '../../_shared/support.js';
import { getPyodide, renderPythonError, showLoading } from '../../_shared/pyodide.js';
import { formatBytes } from '../../_shared/metrics.js';

const WORK = '/work';
const PERSIST = '/persist';
const UNPACKED = '/unpacked';
const ROOTS = [WORK, PERSIST, UNPACKED];

const bootBox = document.querySelector('#boot');
const refreshButton = document.querySelector('#refresh');
const treeBody = document.querySelector('#tree tbody');
const uploadInput = document.querySelector('#upload');
const uploadResult = document.querySelector('#upload-result');
const noteInput = document.querySelector('#note');
const downloadButton = document.querySelector('#download');
const downloadResult = document.querySelector('#download-result');
const saveSyncButton = document.querySelector('#save-sync');
const saveNoSyncButton = document.querySelector('#save-nosync');
const reloadButton = document.querySelector('#reload');
const persistResult = document.querySelector('#persist-result');
const unpackButton = document.querySelector('#unpack');
const unpackResult = document.querySelector('#unpack-result');

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

  // 저장소가 막힌 브라우저가 있다. 그때도 나머지 기능은 쓸 수 있어야 하므로 따로 감싼다.
  let persistReady = true;
  try {
    // IDBFS 를 붙이는 것은 자바스크립트 쪽 일이다. 파이썬에서는 그냥 폴더로 보인다.
    pyodide.FS.mkdirTree(PERSIST);
    pyodide.FS.mount(pyodide.FS.filesystems.IDBFS, {}, PERSIST);
    // 켤 때 한 번 읽어 와야 지난번에 저장한 것이 보인다.
    await syncfs(pyodide, true);
  } catch (error) {
    persistReady = false;
    persistResult.textContent = `이 브라우저에서는 영속 저장을 쓸 수 없습니다.\n${error.message ?? error}`;
  }

  const source = await fetch('src/main.py').then((response) => response.text());
  // 이 손잡이는 페이지가 사는 동안 계속 쓰므로 일부러 안 놓는다.
  pyGlobals = pyodide.runPython(`${source}\n\nglobals()`);
  call('setup');
  done();
  bootBox.textContent = '준비됐습니다. 파일을 올리고 내려받아 보세요.';

  refreshButton.addEventListener('click', () => showTree());
  uploadInput.addEventListener('change', (event) => upload(pyodide, event));
  downloadButton.addEventListener('click', () => download(pyodide));
  saveSyncButton.addEventListener('click', () => savePersistent(pyodide, true));
  saveNoSyncButton.addEventListener('click', () => savePersistent(pyodide, false));
  reloadButton.addEventListener('click', () => location.reload());
  unpackButton.addEventListener('click', () => unpack(pyodide));

  for (const control of [refreshButton, uploadInput, noteInput, downloadButton, unpackButton]) {
    control.disabled = false;
  }
  if (persistReady) {
    saveSyncButton.disabled = false;
    saveNoSyncButton.disabled = false;
  }

  showTree();
  if (persistReady) showPersistState();
}

/**
 * IDBFS 를 읽거나 쓴다.
 *
 * IndexedDB 가 비동기라서 콜백으로 온다. Promise 로 감싸 두면 부르는 쪽이 편하다.
 * fromDb 가 true 면 저장된 것을 읽어 오고, false 면 지금 것을 저장한다.
 */
function syncfs(pyodide, fromDb) {
  return new Promise((resolve, reject) => {
    pyodide.FS.syncfs(fromDb, (error) => (error ? reject(error) : resolve()));
  });
}

function call(name, ...args) {
  const fn = pyGlobals.get(name);
  try {
    return fn(...args);
  } finally {
    fn.destroy();
  }
}

/** 파이썬이 훑은 목록을 표로 옮긴다. 돌려받은 것도 손잡이라 놓아 준다. */
function showTree() {
  treeBody.replaceChildren();
  for (const root of ROOTS) {
    const rows = call('list_tree', root);
    try {
      addRow(root, rows.length ? '(폴더)' : '(비어 있거나 아직 없음)', true);
      for (const row of rows) {
        // 반복이 끝나면 알아서 회수되는 빌린 손잡이다. 따로 놓아 줄 필요가 없다.
        const [path, size, isDir] = row.toJs();
        addRow(`  ${path.slice(root.length + 1)}`, isDir ? '(폴더)' : formatBytes(size), isDir);
      }
    } finally {
      rows.destroy();
    }
  }
}

function addRow(label, size, muted) {
  const row = document.createElement('tr');
  const head = document.createElement('th');
  head.scope = 'row';
  head.textContent = label;
  if (muted) head.classList.add('dir');
  const cell = document.createElement('td');
  cell.textContent = size;
  row.append(head, cell);
  treeBody.append(row);
}

/** 사용자가 고른 파일을 파일시스템에 넣는다. */
async function upload(pyodide, event) {
  const file = event.target.files?.[0];
  if (!file) return;
  uploadResult.replaceChildren();

  try {
    // File 을 바이트로 바꿔 그대로 쓴다. 이 자리가 브라우저와 파이썬이 만나는 곳이다.
    const bytes = new Uint8Array(await file.arrayBuffer());
    // 이름을 그대로 붙이지 않는다. .. 가 들어 있으면 /work 밖에 쓰게 된다.
    // 파일 선택기는 그런 이름을 주지 않지만, 드래그앤드롭이나 원격에서 온 이름은 다르다.
    const path = `${WORK}/${file.name.split('/').pop()}`;
    pyodide.FS.writeFile(path, bytes);
    uploadResult.textContent = call('describe', path);
    showTree();
  } catch (error) {
    renderPythonError(uploadResult, error);
  } finally {
    // 비워 두지 않으면 같은 파일을 다시 골랐을 때 change 가 오지 않는다.
    event.target.value = '';
  }
}

/** 파이썬이 만든 파일을 내려받는다. */
function download(pyodide) {
  const path = call('make_report', noteInput.value);
  const bytes = pyodide.FS.readFile(path);

  // Blob 으로 감싸 임시 주소를 만들고, 보이지 않는 링크를 눌러 준다.
  const url = URL.createObjectURL(new Blob([bytes], { type: 'text/plain' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'report.txt';
  link.click();
  // 주소는 페이지가 사는 동안 남으므로 다 쓰면 놓아 준다.
  URL.revokeObjectURL(url);

  downloadResult.textContent = `${path} 를 만들어 내려받았습니다.\n\n${new TextDecoder().decode(bytes)}`;
  showTree();
}

async function savePersistent(pyodide, withSync) {
  const name = withSync ? 'synced.txt' : 'forgot.txt';
  const path = call(
    'write_persistent',
    name,
    withSync ? '저장까지 했습니다' : '저장은 안 했습니다',
  );

  if (withSync) {
    await syncfs(pyodide, false);
    persistResult.textContent = `${path} 를 쓰고 syncfs 까지 불렀습니다. 새로고침해도 남습니다.`;
  } else {
    persistResult.textContent = `${path} 를 쓰기만 했습니다. syncfs 를 안 불렀으니 새로고침하면 사라집니다.`;
  }
  showTree();
}

/**
 * 페이지를 열었을 때 영속 폴더에 무엇이 남아 있는지 알려 준다.
 *
 * 반복 도중에 값으로 바꿔 담는 것이 중요하다. 파이썬 목록을 훑을 때 나오는 항목은
 * 반복이 끝나면 회수되는 빌린 손잡이라서, 배열에 모아 뒀다가 나중에 쓰면 이미 죽어 있다.
 */
function showPersistState() {
  const rows = call('list_tree', PERSIST);
  const names = [];
  try {
    for (const row of rows) {
      const [path] = row.toJs();
      names.push(path.slice(PERSIST.length + 1));
    }
  } finally {
    rows.destroy();
  }

  persistResult.textContent = names.length
    ? `지난번에 저장해 둔 것: ${names.join(', ')}`
    : '영속 폴더가 비어 있습니다.';
}

/** 파이썬이 만든 zip 을 Pyodide 가 파일시스템에 푼다. */
function unpack(pyodide) {
  const made = call('make_zip');
  try {
    // unpackArchive 는 ArrayBuffer 나 그 뷰를 받는다. 손잡이를 그대로 주면 안 된다.
    // .buffer 를 꺼내면 부분 뷰일 때 엉뚱한 데이터를 넘기게 되므로 뷰째로 준다.
    pyodide.unpackArchive(made.toJs(), 'zip', { extractDir: UNPACKED });
  } finally {
    made.destroy();
  }

  unpackResult.textContent = 'zip 을 만들어 /unpacked 에 풀었습니다. 아래 목록을 보세요.';
  showTree();
}
