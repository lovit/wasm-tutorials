"""PyPI 에서 패키지를 받아 쓰고, 무엇이 되고 안 되는지 가린다."""

import json
import time

import micropip
from pyodide.http import pyfetch

# 골라 볼 것들. 되는 것과 안 되는 것을 섞어 두었다.
CANDIDATES = {
    "jamo": "한글을 자모로 쪼갠다. 순수 파이썬이고 의존성도 없다",
    "hgtk": "한글을 다루는 도구 모음. six 가 함께 있어야 돈다",
    "soyspacing": "띄어쓰기를 고친다. 순수 파이썬이다",
    "soynlp": "한국어 분석기. 자기는 순수인데 psutil 이 막는다",
    "konlpy": "한국어 형태소 분석기. JVM 이 필요하다",
    "kiwipiepy": "빠른 형태소 분석기. C++ 확장이다",
}


def first_line(exc: Exception) -> str:
    """예외 메시지의 첫 줄. 메시지가 비어 있으면 splitlines() 가 빈 목록이라 그냥 쓸 수 없다."""
    return str(exc).partition("\n")[0]


async def inspect_package(name: str) -> str:
    """설치해 보기 전에 PyPI 에 물어 될지 가늠한다."""
    try:
        response = await pyfetch(f"https://pypi.org/pypi/{name}/json")
        if response.status != 200:
            return f"PyPI 에서 {name} 을 찾지 못했습니다 ({response.status})"
        data = json.loads(await response.string())
    except Exception as exc:
        return f"PyPI 조회 실패 — {type(exc).__name__}: {first_line(exc)[:70]}"

    files = [item["filename"] for item in data["urls"]]
    pure = [
        f
        for f in files
        if f.endswith("-py3-none-any.whl") or f.endswith("-py2.py3-none-any.whl")
    ]
    requires = data["info"].get("requires_dist") or []

    lines = [
        f"{name} {data['info']['version']}",
        f"올라온 파일 {len(files)}개 중 순수 파이썬 wheel {len(pure)}개",
    ]
    lines.append(
        f"  {pure[0]}" if pure else f"  예: {files[0] if files else '(파일 없음)'}"
    )
    lines.append(
        "판정: " + ("이 패키지 자체는 됩니다" if pure else "이 패키지는 안 됩니다")
    )
    if requires:
        # 조건이 붙은 것은 그 조건도 함께 보여 준다. 떼어 내면 지금 파이썬에 해당하지도
        # 않는 의존성이 목록에 섞여, 왜 막히는지 엉뚱한 데를 짚게 된다.
        lines.append("의존성:")
        for item in requires[:8]:
            spec, _, marker = item.partition(";")
            suffix = f"  (조건: {marker.strip()})" if marker.strip() else ""
            lines.append(f"  {spec.strip()}{suffix}")
        lines.append("의존성 중 하나라도 순수가 아니면 그것 때문에 막힙니다.")
    else:
        lines.append("의존성: 없음")
    return "\n".join(lines)


async def install(name: str) -> str:
    """실제로 설치해 본다. 실패하면 이유를 그대로 돌려준다."""
    started = time.monotonic()
    try:
        # hgtk 는 메타데이터에 six 를 안 적어 두어서 함께 넣어 준다.
        targets = [name, "six"] if name == "hgtk" else [name]
        await micropip.install(targets)
    except Exception as exc:
        return f"실패 — {type(exc).__name__}: {first_line(exc)}"
    elapsed = (time.monotonic() - started) * 1000
    return f"{name} 설치됨 ({elapsed:.0f} ms)"


def installed() -> str:
    """micropip 이 올려 둔 것들. 락파일에서 온 것도 함께 보인다."""
    items = micropip.list()
    lines = [f"{len(items)}개가 올라와 있습니다.", ""]
    for name in sorted(items):
        entry = items[name]
        # source 는 'pypi' 아니면 'pyodide' 다. 어디서 왔는지가 이 예제의 요점이라 함께 적는다.
        where = "PyPI 에서 받음" if entry.source == "pypi" else "락파일에 있던 것"
        lines.append(f"  {name} {entry.version} — {where}")
    return "\n".join(lines)


def use_korean(text: str) -> str:
    """설치한 것들로 한국어를 만져 본다."""
    lines = []
    try:
        import jamo

        # h2j 가 주는 것은 이어 쓰는 자모라 화면에서는 다시 글자로 보인다.
        # j2hcj 로 낱자 모양으로 바꿔야 쪼개진 것이 눈에 보인다.
        pieces = " ".join(jamo.j2hcj(jamo.h2j(ch)) for ch in text[:12] if ch.strip())
        lines.append(f"자모로 쪼개기: {pieces}")
    except ModuleNotFoundError:
        lines.append("jamo 가 아직 없습니다. 위에서 설치해 보세요.")
    except Exception as exc:
        lines.append(
            f"jamo 를 쓰다 실패 — {type(exc).__name__}: {first_line(exc)[:60]}"
        )

    try:
        import hgtk

        first = text.strip()[:1]
        if first:
            lines.append(f"'{first}' 를 낱자로: {hgtk.letter.decompose(first)}")
        word = text.strip().split()[0] if text.strip() else "브라우저"
        lines.append(f"조사 붙이기: {hgtk.josa.attach(word, hgtk.josa.EUN_NEUN)}")
    except ModuleNotFoundError:
        lines.append("hgtk 가 아직 없습니다. 위에서 설치해 보세요.")
    except Exception as exc:
        lines.append(
            f"hgtk 를 쓰다 실패 — {type(exc).__name__}: {first_line(exc)[:60]}"
        )

    return "\n".join(lines)
