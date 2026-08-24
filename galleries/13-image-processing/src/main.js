// 픽셀을 옮기는 두 길을 나란히 재고, 제로카피의 대가가 무엇인지 보여 준다.
import { getPyodide, renderPythonError, showLoading } from '../../_shared/pyodide.js';
import { addMetricRow, formatBytes, formatMs } from '../../_shared/metrics.js';
import { ensureSupport } from '../../_shared/support.js';

const status = document.querySelector('#status');
const fileInput = document.querySelector('#file');
const sampleButton = document.querySelector('#sample');
const filterButtons = [...document.querySelectorAll('.filter')];
const benchButton = document.querySelector('#bench');
const benchRows = document.querySelector('#bench-rows');
const detachButton = document.querySelector('#detach');
const detachResult = document.querySelector('#detach-result');
const source = document.querySelector('#source');
const target = document.querySelector('#target');

const sourceCtx = source.getContext('2d', { willReadFrequently: true });
const targetCtx = target.getContext('2d');

let pyodide;
let pyGlobals;

if (ensureSupport()) {
  start();
}

async function start() {
  const done = showLoading(status, 'numpy 와 Pillow 를 받는 중입니다. 10MB 가까이 됩니다');
  try {
    pyodide = await getPyodide({ packages: ['numpy', 'pillow'] });
    const response = await fetch('src/main.py');
    if (!response.ok) throw new Error(`src/main.py 를 받지 못했습니다 (${response.status})`);
    pyGlobals = pyodide.runPython(`${await response.text()}\n\nglobals()`);
    done();
    drawSample();
    status.textContent = `준비됐습니다. ${describeDownload()}`;
    for (const control of [fileInput, sampleButton, benchButton, detachButton, ...filterButtons]) {
      control.disabled = false;
    }
  } catch (error) {
    done();
    status.replaceChildren();
    renderPythonError(status, error);
  }
}

function describeDownload() {
  const entries = performance
    .getEntriesByType('resource')
    .filter((entry) => entry.name.includes('/pyodide/'));
  if (!entries.length) return '받은 양은 재지 못했습니다.';
  const transferred = entries.reduce((sum, entry) => sum + entry.transferSize, 0);
  return `${entries.length}개 파일, ${formatBytes(transferred)} 를 받았습니다.`;
}

function drawSample() {
  const { width, height } = source;
  const gradient = sourceCtx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#f97316');
  gradient.addColorStop(0.5, '#0ea5e9');
  gradient.addColorStop(1, '#111827');
  sourceCtx.fillStyle = gradient;
  sourceCtx.fillRect(0, 0, width, height);

  sourceCtx.fillStyle = '#ffffff';
  for (let i = 0; i < 6; i += 1) {
    sourceCtx.beginPath();
    sourceCtx.arc(50 + i * 45, 60 + (i % 3) * 55, 18 + i * 3, 0, Math.PI * 2);
    sourceCtx.fill();
  }
  sourceCtx.fillStyle = '#111827';
  sourceCtx.font = 'bold 34px system-ui, sans-serif';
  sourceCtx.fillText('Pyodide', 24, 210);
  targetCtx.clearRect(0, 0, target.width, target.height);
}

function lock(disabled) {
  for (const control of [fileInput, sampleButton, benchButton, detachButton, ...filterButtons]) {
    control.disabled = disabled;
  }
}

async function runFilter(name) {
  lock(true);
  try {
    const image = sourceCtx.getImageData(0, 0, source.width, source.height);

    // 여기가 JS -> 파이썬 방향이다. 이쪽은 복사를 피할 수 없다. 캔버스가 준 픽셀은
    // JS 힙에 있고 파이썬은 WASM 힙 안만 볼 수 있어서, 건너가려면 옮겨 담아야 한다.
    const apply = pyGlobals.get('apply_filter');
    let insideMs;
    try {
      insideMs = apply(image.data, source.width, source.height, name);
    } finally {
      apply.destroy();
    }

    const { ms, bytes } = paintResult(target, source.width, source.height);
    status.textContent = `${name}: 파이썬 안에서 ${formatMs(insideMs)}, 돌려받아 그리는 데 ${ms.toFixed(2)} ms (${formatBytes(bytes)})`;
  } catch (error) {
    status.replaceChildren();
    renderPythonError(status, error);
  } finally {
    lock(false);
  }
}

/**
 * 파이썬의 result 배열을 캔버스에 올린다.
 *
 * 뷰를 얻자마자 쓰고 곧바로 놓는다. 들고 있으면 안 되는 이유는 아래 detach 데모가 보여 준다.
 */
function paintResult(canvas, width, height) {
  const proxy = pyGlobals.get('result');
  const started = performance.now();
  const buffer = proxy.getBuffer('u8clamped');
  try {
    canvas.getContext('2d').putImageData(new ImageData(buffer.data, width, height), 0, 0);
    return { ms: performance.now() - started, bytes: buffer.data.byteLength };
  } finally {
    buffer.release();
    proxy.destroy();
  }
}

for (const button of filterButtons) {
  button.addEventListener('click', () => runFilter(button.dataset.filter));
}

sampleButton.addEventListener('click', () => {
  drawSample();
  status.textContent = '예제 그림을 다시 그렸습니다.';
});

fileInput.addEventListener('change', async () => {
  const [file] = fileInput.files;
  if (!file) return;
  const bitmap = await createImageBitmap(file);
  // 캔버스 크기는 그대로 두고 맞춰 넣는다. 큰 사진을 그대로 받으면 재는 값이 흔들린다.
  sourceCtx.clearRect(0, 0, source.width, source.height);
  const scale = Math.min(source.width / bitmap.width, source.height / bitmap.height);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  sourceCtx.drawImage(bitmap, (source.width - w) / 2, (source.height - h) / 2, w, h);
  bitmap.close();
  targetCtx.clearRect(0, 0, target.width, target.height);
  fileInput.value = '';
  status.textContent = `${file.name} 를 올렸습니다. 필터를 눌러 보세요.`;
});

benchButton.addEventListener('click', async () => {
  lock(true);
  benchRows.replaceChildren();
  status.textContent = '재는 중입니다. 큰 쪽에서는 화면이 잠깐 멈춥니다.';
  try {
    for (const side of [256, 512, 1024, 2048]) {
      const make = pyGlobals.get('make_square');
      try {
        make(side);
      } finally {
        make.destroy();
      }
      const proxy = pyGlobals.get('result');
      try {
        // getBuffer 한 번은 타이머 해상도 아래라 0.00 ms 로 찍힌다. 여러 번 돌려 나눈다.
        const ROUNDS = 50;
        let t = performance.now();
        for (let i = 0; i < ROUNDS; i += 1) {
          const buffer = proxy.getBuffer('u8clamped');
          new ImageData(buffer.data, side, side);
          buffer.release();
        }
        const zero = (performance.now() - t) / ROUNDS;

        t = performance.now();
        proxy.toJs();
        const copied = performance.now() - t;

        const row = addMetricRow(benchRows, `${side}×${side}`, formatBytes(side * side * 4));
        for (const value of [
          `${zero.toFixed(3)} ms`,
          `${copied.toFixed(1)} ms`,
          `${Math.round(copied / zero).toLocaleString()}배`,
        ]) {
          const cell = document.createElement('td');
          cell.textContent = value;
          row.append(cell);
        }
      } finally {
        proxy.destroy();
      }
      // 한 칸씩 그려 나가는 것이 보이게 한 박자 쉰다.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    status.textContent = '다 쟀습니다.';
  } catch (error) {
    status.replaceChildren();
    renderPythonError(status, error);
  } finally {
    lock(false);
  }
});

detachButton.addEventListener('click', () => {
  lock(true);
  const lines = [];
  const proxy = pyGlobals.get('result');
  const buffer = proxy.getBuffer('u8clamped');
  try {
    const view = buffer.data;
    lines.push(`뷰를 얻었습니다. byteLength=${view.byteLength}, 첫 값=${view[0]}`);

    const grow = pyGlobals.get('grow_heap');
    try {
      lines.push(`파이썬에서 ${grow(80)}`);
    } finally {
      grow.destroy();
    }

    lines.push(`같은 뷰를 다시 보면: byteLength=${view.byteLength}, 첫 값=${view[0]}`);
    lines.push(`ArrayBuffer 가 떨어져 나갔나: ${view.buffer.detached}`);
    try {
      new ImageData(view, source.width, source.height);
      lines.push('이 뷰로 ImageData 를 만들 수 있습니다.');
    } catch (error) {
      lines.push(`이 뷰로 ImageData 만들기: ${error.name} — ${error.message}`);
    }
    lines.push('');
    lines.push('데이터가 사라진 것은 아닙니다. 뷰를 다시 얻으면 됩니다.');
  } finally {
    buffer.release();
    proxy.destroy();
  }

  const again = pyGlobals.get('result');
  const fresh = again.getBuffer('u8clamped');
  try {
    lines.push(`새로 얻은 뷰: byteLength=${fresh.data.byteLength}, 첫 값=${fresh.data[0]}`);
  } finally {
    fresh.release();
    again.destroy();
  }
  detachResult.textContent = lines.join('\n');
  lock(false);
});
