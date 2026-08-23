"""올린 CSV 를 pandas 로 훑는다. 파일은 브라우저 안의 가짜 파일시스템에서만 오간다."""

import io
import unicodedata

import pandas as pd

UPLOAD_PATH = "/data/uploaded.csv"

SAMPLE = """이름,부서,나이,연봉,입사일
김철수,개발,34,5200,2019-03-01
이영희,개발,29,4800,2021-07-15
박민수,영업,41,6100,2012-01-09
정수진,영업,36,5500,2016-11-23
최지훈,디자인,27,4200,2022-05-02
한소영,개발,45,7300,2008-04-17
"""


def load_sample() -> str:
    """파일을 안 고른 사람도 해 볼 수 있게 한다. 이것도 네트워크를 타지 않는다."""
    frame = pd.read_csv(io.StringIO(SAMPLE))
    return describe(frame, "예제 데이터 (파일 없이 메모리에서 만든 것)")


def load_uploaded(encoding: str) -> str:
    """자바스크립트가 FS 에 써 둔 파일을 읽는다. 경로만 넘겨받는다."""
    try:
        frame = pd.read_csv(UPLOAD_PATH, encoding=encoding)
    except UnicodeDecodeError as exc:
        # 한글 윈도우에서 만든 CSV 는 대개 cp949 다. 이 오류가 그 신호다.
        raise ValueError(
            f"{encoding} 로 읽지 못했습니다. 인코딩을 바꿔 보세요.\n원문: {exc}"
        ) from exc
    return describe(frame, f"{UPLOAD_PATH} ({encoding})")


def width(text: str) -> int:
    """화면에서 차지하는 칸 수. 한글과 한자는 두 칸을 먹는다."""
    return sum(2 if unicodedata.east_asian_width(ch) in "WF" else 1 for ch in text)


def pad(text: str, columns: int) -> str:
    """len() 으로 채우면 한글이 든 줄만 짧아진다. 칸 수로 채운다."""
    return text + " " * max(0, columns - width(text))


def describe(frame: pd.DataFrame, title: str) -> str:
    lines = [title, "=" * width(title), ""]
    lines.append(f"행 {len(frame):,}개, 열 {len(frame.columns)}개")
    lines.append("")

    lines.append("[열마다 무엇이 들어 있나]")
    for name in frame.columns:
        column = frame[name]
        missing = int(column.isna().sum())
        note = f"결측 {missing}개" if missing else "결측 없음"
        lines.append(
            f"  {pad(name, 14)} {column.dtype!s:<8} 고유값 {column.nunique():>4}개  {note}"
        )
    lines.append("")

    numeric = frame.select_dtypes("number")
    if len(numeric.columns):
        lines.append("[숫자 열 요약]")
        # to_string 이 판다스의 표 서식을 그대로 준다. 직접 줄을 맞추지 않는다.
        lines.append(numeric.describe().round(1).to_string())
        lines.append("")

    text_columns = [c for c in frame.columns if frame[c].dtype in ("object", "str")]
    if text_columns:
        # 고유값이 가장 적은 열을 고른다. 이름처럼 전부 다른 열을 세어 봐야 1 만 잔뜩 나온다.
        grouped = min(text_columns, key=lambda c: frame[c].nunique())
        lines.append(f"[{grouped} 별로 세기]")
        lines.append(frame[grouped].value_counts().head(5).to_string())
        lines.append("")

    lines.append("[처음 세 줄]")
    lines.append(frame.head(3).to_string())
    return "\n".join(lines)
