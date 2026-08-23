"""같은 계산을 두 방법으로 재고, 그림을 두 가지 길로 화면에 올린다."""

import base64
import importlib
import io
import math
import sys
import time

import matplotlib
import numpy as np

# use() 는 rcParams 와 rcParamsDefault 를 함께 덮어쓴다. 한번 부르고 나면 원래 기본값을
# 되물을 방법이 없으므로, 아무것도 건드리기 전인 지금 잡아 둔다.
DEFAULT_BACKEND = matplotlib.rcParams["backend"]


def bench(size: int) -> list[dict]:
    """파이썬 리스트와 numpy 로 같은 식을 계산하고 시간을 잰다.

    식은 sqrt(x) * sin(x) 다. 반복문 안에서 함수를 두 번 부르므로 인터프리터가
    한 원소마다 왕복한다. numpy 는 그 왕복을 C 쪽에서 한 번에 끝낸다.
    """
    rows = []

    started = time.perf_counter()
    values = [math.sqrt(i) * math.sin(i) for i in range(size)]
    total = sum(values)
    rows.append(
        {"방법": "파이썬 리스트", "초": time.perf_counter() - started, "합": total}
    )

    started = time.perf_counter()
    arr = np.arange(size, dtype=np.float64)
    total = float((np.sqrt(arr) * np.sin(arr)).sum())
    rows.append(
        {"방법": "numpy 배열", "초": time.perf_counter() - started, "합": total}
    )

    return rows


def draw_live() -> str:
    """기본 백엔드로 그린다. matplotlib 이 document.pyodideMplTarget 아래에 캔버스를 만든다."""
    # 앞에서 agg 로 바꿔 놓았을 수 있다. 되돌리지 않으면 show() 가 아무것도 안 그린다.
    matplotlib.use("webagg", force=True)
    import matplotlib.pyplot as plt

    importlib.reload(plt)
    # use() 는 이름이 지금 백엔드와 같으면 아무것도 하지 않는다. 그래서 앞서 그린 그림이
    # 그대로 열려 있고, show() 는 열린 그림을 전부 그린다. 두 번 누르면 옆으로 쌓인다.
    plt.close("all")

    x = np.linspace(0, 4 * np.pi, 400)
    fig, ax = plt.subplots(figsize=(4.4, 3.2))
    ax.plot(x, np.sin(x), label="sin")
    ax.plot(x, np.sin(x) * np.exp(-x / 8), label="sin * exp(-x/8)")
    ax.legend()
    ax.set_title("plt.show()")
    plt.show()

    # 레티나 화면에서 그림의 왼쪽 위 4분의 1만 보이는 것을 막는다. 브라우저가 알려 준
    # devicePixelRatio 2 를 받아 파이썬은 dpi 를 200 으로 올려 두 배로 그리는데, 캔버스
    # 버퍼는 그대로 440x320 에 머문다. 배율을 1 로 되돌려 그린 크기와 버퍼를 맞춘다.
    # 밑줄로 시작하는 비공개 API 다. 대신할 공개 API 를 찾지 못했다.
    if hasattr(fig.canvas, "_set_device_pixel_ratio"):
        fig.canvas._set_device_pixel_ratio(1)
        fig.canvas.draw()

    return matplotlib.get_backend()


def draw_png() -> str:
    """agg 로 그려 PNG 바이트를 만든다. 화면을 모르는 백엔드라 어디서나 같은 그림이 나온다."""
    matplotlib.use("agg", force=True)
    import matplotlib.pyplot as plt

    importlib.reload(plt)

    x = np.linspace(0, 4 * np.pi, 400)
    fig, ax = plt.subplots(figsize=(4.4, 3.2))
    ax.plot(x, np.sin(x), label="sin")
    ax.plot(x, np.sin(x) * np.exp(-x / 8), label="sin * exp(-x/8)")
    ax.legend()
    ax.set_title("savefig")

    buffer = io.BytesIO()
    fig.savefig(buffer, format="png", dpi=110)
    plt.close(fig)  # 안 닫으면 그림이 쌓인다. 화면에 안 보여도 메모리에는 남는다.
    return base64.b64encode(buffer.getvalue()).decode()


def backends() -> str:
    """무엇을 쓸 수 있고 무엇이 없어졌는지 직접 물어본다."""
    lines = [
        f"matplotlib      {matplotlib.__version__}",
        f"기본 백엔드      {DEFAULT_BACKEND}   (이 파일이 올라올 때 잡아 둔 값)",
        f"지금 백엔드      {matplotlib.get_backend()}",
    ]

    try:
        importlib.import_module("matplotlib_pyodide")
        lines.append("matplotlib_pyodide  있음")
    except ImportError as exc:
        lines.append(f"matplotlib_pyodide  {type(exc).__name__} — 락파일에 없다")

    lines.append("")
    lines.append("옛 자료가 시키는 대로 해 보면:")
    # 언제 막히는지가 pyplot 이 올라와 있는지에 달려 있다. 그 조건을 함께 보여 준다.
    lines.append(
        f"  (pyplot 이 이미 올라와 있나: {'matplotlib.pyplot' in sys.modules})"
    )
    before = matplotlib.get_backend()
    try:
        matplotlib.use("module://matplotlib_pyodide.html5_canvas_backend")
        lines.append(
            f"  use(...)        통과. get_backend() = {matplotlib.get_backend()}"
        )
    except Exception as exc:
        lines.append(f"  use(...)        {type(exc).__name__}")
    try:
        import matplotlib.pyplot as plt

        importlib.reload(plt)
        # close("all") 로 치우면 화면에 떠 있는 그림까지 닫힌다. 그림은 그대로 있는데
        # 도구 막대가 먹통이 되어, 보는 사람은 알아챌 방법이 없다. 만든 것만 닫는다.
        probe_figure, _ = plt.subplots()
        plt.close(probe_figure)
        lines.append("  그리기          성공")
    except Exception as exc:
        lines.append(
            f"  그리기          {type(exc).__name__}: {str(exc).splitlines()[0][:60]}"
        )
    matplotlib.use(before, force=True)

    return "\n".join(lines)
