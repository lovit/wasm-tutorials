// 03. 출력과 오류를 화면으로
//
// 01번에서 print 한 것이 콘솔로 갔다. 여기서 화면으로 돌린다.
// 새로 배우는 것은 넷이다.
//   setStdout({ batched }) / setStderr({ batched })
//   setStdin({ stdin })
//   runPython(code, { filename }) 이 트레이스백에 소스 줄을 살린다
//   PythonError 는 포맷된 문자열만 들고 있다

import { ensureSupport } from '../../_shared/support.js';
import { getPyodide, renderPythonError, showLoading } from '../../_shared/pyodide.js';

const SAMPLES = {
  print: `for i in range(3):
    print("줄", i)

print("끝났습니다")
`,
  stderr: `import sys
import warnings

print("이건 stdout 으로 갑니다")
print("이건 stderr 로 갑니다", file=sys.stderr)
warnings.warn("경고도 stderr 로 갑니다")
`,
  error: `def divide(a, b):
    return a / b


def run():
    return divide(1, 0)


run()
`,
  input: `name = input("이름을 넣어 주세요: ")
age = input("나이는요? ")

print(f"{name} 님, {age} 살이시군요.")
len(name)
`,
};

const bootBox = document.querySelector('#boot');
const codeInput = document.querySelector('#code');
const stdinInput = document.querySelector('#stdin');
const runButton = document.querySelector('#run');
const namedToggle = document.querySelector('#named');
const trimToggle = document.querySelector('#trim');
const samples = document.querySelector('#samples');
const outBox = document.querySelector('#out');
const errBox = document.querySelector('#err');
const valueBox = document.querySelector('#value');

// input() 이 한 줄씩 꺼내 가는 줄. 실행할 때마다 새로 채운다.
let pending = [];

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
  bootBox.textContent = '준비됐습니다. 아래 코드를 고쳐 실행해 보세요.';

  connectStreams(pyodide);

  samples.addEventListener('click', pickSample);
  runButton.addEventListener('click', () => run(pyodide));
  runButton.disabled = false;

  codeInput.value = SAMPLES.print;
  run(pyodide);
}

/**
 * 파이썬의 세 스트림을 이 페이지로 끌어온다.
 *
 * batched 는 줄 단위로 준다. 개행은 떼고 온다. 바이트 단위로 받는 raw 도 있지만
 * 화면에 글자를 찍는 용도로는 batched 가 맞다.
 */
function connectStreams(pyodide) {
  pyodide.setStdout({ batched: (line) => append(outBox, line) });
  pyodide.setStderr({ batched: (line) => append(errBox, line) });

  // stdin 콜백은 동기다. 여기서 사용자에게 물어보고 기다릴 수 없다는 뜻이다.
  // 그래서 미리 받아 둔 줄을 꺼내 주고, 없으면 브라우저를 멈추는 prompt() 로 넘긴다.
  pyodide.setStdin({
    stdin: () => (pending.length ? pending.shift() : (prompt('input() 이 값을 기다립니다') ?? '')),
  });
}

function append(box, line) {
  box.textContent += `${line}\n`;
}

function pickSample(event) {
  const name = event.target.dataset.sample;
  if (!name) return;
  codeInput.value = SAMPLES[name];
  stdinInput.value = name === 'input' ? '홍길동\n41' : '';
}

function run(pyodide) {
  outBox.textContent = '';
  errBox.textContent = '';
  valueBox.replaceChildren();

  pending = stdinInput.value.split('\n').filter((line) => line !== '');

  // 이름을 주면 트레이스백에 소스 줄이 나온다. 안 주면 <exec> 로 잡혀서 줄만 나온다.
  // 꺾쇠로 감싼 이름은 파일이 아니라는 뜻이라 파이썬이 소스를 찾지 않는다.
  const options = namedToggle.checked ? { filename: 'user_code.py' } : {};

  let value;
  try {
    value = pyodide.runPython(codeInput.value, options);
  } catch (error) {
    showTraceback(error);
    return;
  }

  try {
    valueBox.textContent = value === undefined ? '(없음)' : String(value);
  } finally {
    value?.destroy?.();
  }
}

/**
 * PythonError 를 보여 준다.
 *
 * PythonError 는 원본 예외 객체를 들고 있지 않다. 들고 있으면 스택 프레임이 통째로
 * 남아 새기 때문이다. 남는 것은 파이썬이 이미 포맷해 둔 문자열뿐이다.
 */
function showTraceback(error) {
  const text = trimToggle.checked ? trimInternalFrames(error.message) : error.message;
  const box = renderPythonError(errBox, text);
  box.textContent = `${text}\n\n예외 종류: ${error.type ?? '(알 수 없음)'}`;
}

/**
 * Pyodide 가 코드를 실행하려고 거친 자기 프레임을 걷어낸다.
 *
 * 사용자가 쓴 코드는 한 줄인데 트레이스백 앞머리에 _pyodide/_base.py 가 두 프레임
 * 붙는다. 남의 코드 이야기라 읽는 사람에게는 잡음이다.
 */
function trimInternalFrames(message) {
  const lines = message.split('\n');
  const kept = [];
  let skipping = false;

  for (const line of lines) {
    const frame = line.match(/^ {2}File "([^"]+)"/);
    if (frame) {
      skipping = frame[1].includes('_pyodide/_base.py');
      if (skipping) continue;
    } else if (skipping) {
      // 프레임 아래 딸린 소스 줄과 캐럿까지 함께 버린다.
      continue;
    }
    kept.push(line);
  }

  return kept.join('\n');
}
