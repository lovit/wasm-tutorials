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

# 이 줄이 없으면 같은 자리의 경고는 처음 한 번만 찍힌다.
warnings.simplefilter("always")

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
const summary = document.querySelector('#summary');
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
  codeInput.disabled = false;

  // 부팅하는 몇 초 동안 사용자가 이미 뭔가 쳤을 수 있다. 그걸 덮어쓰지 않는다.
  if (codeInput.value.trim() === '') codeInput.value = SAMPLES.print;
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
  // textContent += 는 줄마다 문자열 전체를 다시 만든다. 출력이 길어지면 제곱으로 느려진다.
  box.append(`${line}\n`);
  box.scrollTop = box.scrollHeight;
}

function pickSample(event) {
  const name = event.target.dataset.sample;
  if (!name) return;
  codeInput.value = SAMPLES[name];
  stdinInput.value = name === 'input' ? '홍길동\n41' : '';
}

function run(pyodide) {
  // 지우기 전에 떨군다. 지난 실행이 개행 없이 끝냈으면 그 조각이 여기서 흘러나오는데,
  // 곧바로 지워지므로 이번 출력 앞에 유령처럼 붙는 일이 없다.
  flushLeftover(pyodide);

  outBox.replaceChildren();
  errBox.replaceChildren();
  valueBox.replaceChildren();

  // 마지막 개행만 뗀다. 중간의 빈 줄은 입력값으로 쓸 수 있어야 한다.
  const typed = stdinInput.value.replace(/\n$/, '');
  pending = typed === '' ? [] : typed.split('\n');

  // 이름을 주면 Pyodide 가 그 이름으로 소스를 linecache 에 등록해 둔다.
  // 트레이스백은 거기서 줄을 꺼내 온다. 안 주면 <exec> 로 잡히고 등록도 건너뛴다.
  const options = namedToggle.checked ? { filename: 'user_code.py' } : {};

  let value;
  try {
    value = pyodide.runPython(codeInput.value, options);
    valueBox.textContent = value === undefined ? '(없음)' : String(value);
  } catch (error) {
    showTraceback(error);
  } finally {
    value?.destroy?.();
    announce();
  }
}

/**
 * 스크린 리더에는 줄마다 읽어 주는 대신 끝나고 한 번만 알린다.
 * 출력이 몇만 줄이 될 수 있어서, 스트림 칸 자체를 live region 으로 두면 그만큼 읽는다.
 */
function announce() {
  const count = (box) => box.textContent.split('\n').filter(Boolean).length;
  summary.textContent = `실행이 끝났습니다. stdout ${count(outBox)}줄, stderr ${count(errBox)}줄.`;
}

/**
 * 개행 없이 남은 출력 조각을 흘려보낸다.
 *
 * batched 는 개행에서만 흘려보내므로 print("a", end="") 로 끝나면 "a" 가 버퍼에 남는다.
 * setStdout 을 다시 걸어도 sys.stdout.flush() 를 불러도 비워지지 않는다.
 * 개행을 하나 찍어 주는 것이 유일한 방법이다.
 */
function flushLeftover(pyodide) {
  pyodide.runPython('print()');
}

/**
 * PythonError 를 보여 준다.
 *
 * PythonError 는 원본 예외 객체를 들고 있지 않다. 들고 있으면 스택 프레임이 통째로
 * 남아 새기 때문이다. 남는 것은 파이썬이 이미 포맷해 둔 문자열뿐이다.
 */
function showTraceback(error) {
  const text = trimToggle.checked ? trimInternalFrames(error.message) : error.message;
  renderPythonError(errBox, { message: `${text}\n\n예외 종류: ${error.type ?? '(알 수 없음)'}` });
  valueBox.textContent = '(오류가 나서 값이 없습니다)';
}

/**
 * Pyodide 가 코드를 실행하려고 거친 자기 프레임을 걷어낸다.
 *
 * 사용자가 쓴 코드는 한 줄인데 트레이스백 앞머리에 _pyodide/_base.py 가 두 프레임
 * 붙는다. 남의 코드 이야기라 읽는 사람에게는 잡음이다.
 */
function trimInternalFrames(message) {
  const kept = [];
  let skipping = false;

  for (const line of message.split('\n')) {
    const frame = line.match(/^ {2}File "([^"]+)"/);
    if (frame) {
      skipping = frame[1].includes('_pyodide/_base.py');
      if (skipping) continue;
      // 다른 파일의 프레임이 나왔으면 건너뛰기를 멈춘다.
    } else if (skipping) {
      // 프레임에 딸린 소스 줄과 캐럿은 네 칸 이상 들여쓰기돼 있다. 거기까지만 버린다.
      // 들여쓰기가 없는 줄은 예외 메시지이므로 남겨야 한다. 안 그러면
      // 마지막 프레임이 내부 프레임일 때 정작 무슨 오류인지가 사라진다.
      if (/^ {4}/.test(line)) continue;
      skipping = false;
    }
    kept.push(line);
  }

  return kept.join('\n');
}

// ExceptionGroup 의 트레이스백은 프레임 줄이 "  |   File ..." 모양이라 위 정규식에
// 걸리지 않는다. 내부 프레임이 그대로 보이지만 메시지가 사라지지는 않는다.
