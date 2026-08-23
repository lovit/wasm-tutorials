"""브라우저 안의 파일시스템을 파이썬 쪽에서 다룬다."""

import io
import zipfile
from pathlib import Path

WORK = Path("/work")
PERSIST = Path("/persist")


def setup() -> None:
    """작업 폴더를 만든다. /persist 는 자바스크립트가 IDBFS 로 마운트해 둔다."""
    WORK.mkdir(exist_ok=True)


def list_tree(root: str) -> list[tuple[str, int, bool]]:
    """폴더 하나를 훑어 (경로, 크기, 폴더인가) 목록을 만든다."""
    base = Path(root)
    if not base.exists():
        return []

    found: list[tuple[str, int, bool]] = []
    for path in sorted(base.rglob("*")):
        is_dir = path.is_dir()
        size = 0 if is_dir else path.stat().st_size
        found.append((str(path), size, is_dir))
    return found


def describe(path: str) -> str:
    """올라온 파일을 파이썬이 읽어 무엇인지 말해 준다.

    앞부분만 보여 주면 되니 통째로 읽지 않는다. 몇십 MB 짜리를 올려도 이 함수 때문에
    한 벌이 더 잡히는 일이 없다.
    """
    target = Path(path)
    size = target.stat().st_size
    with target.open("rb") as handle:
        head = handle.read(240)

    # 240바이트에서 자르면 글자 중간이 끊길 수 있다. 그 자리를 물음표로 바꾸고
    # 글자 단위로 다시 센다. errors 를 안 주면 평범한 한글 파일이 16진수로 나온다.
    text = head.decode("utf-8", errors="replace")
    printable = sum(1 for ch in text if ch.isprintable() or ch in "\n\t")
    if printable < len(text) * 0.8:
        return f"{target.name}: {size}바이트\n앞부분(글자가 아닌 것 같아 16진수로): {head[:40].hex(' ')}"
    return f"{target.name}: {size}바이트\n앞부분: {text[:60]}"


def make_report(note: str) -> str:
    """파이썬이 파일을 하나 만든다. 이걸 내려받게 된다."""
    target = WORK / "report.txt"
    lines = [
        "이 파일은 브라우저 안의 파이썬이 만들었습니다.",
        f"남긴 말: {note}",
        "",
        "작업 폴더에 있는 것:",
        *(
            f"  {p.name} ({p.stat().st_size}바이트)"
            for p in sorted(WORK.iterdir())
            if p.is_file()
        ),
    ]
    target.write_text("\n".join(lines), encoding="utf-8")
    return str(target)


def write_persistent(name: str, text: str) -> str:
    """영속 폴더에 쓴다. 실제로 남기려면 자바스크립트가 syncfs 를 불러야 한다."""
    target = PERSIST / name
    target.write_text(text, encoding="utf-8")
    return str(target)


def make_zip() -> bytes:
    """압축 파일을 하나 만들어 바이트로 돌려준다. 이걸 unpackArchive 가 푼다."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("풀린것/하나.txt", "첫 번째 파일")
        archive.writestr("풀린것/둘.txt", "두 번째 파일")
        archive.writestr("풀린것/안쪽/셋.txt", "폴더 안의 파일")
    return buffer.getvalue()
