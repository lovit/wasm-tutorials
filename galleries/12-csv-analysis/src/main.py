"""올린 CSV 를 pandas 로 훑는다. 파일은 브라우저 안의 가짜 파일시스템에서만 오간다."""

import io
import json

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
    return describe(
        pd.read_csv(io.StringIO(SAMPLE)), "예제 데이터 (메모리에서 만든 것)"
    )


def load_uploaded(encoding: str) -> str:
    """자바스크립트가 FS 에 써 둔 파일을 읽는다. 경로만 넘겨받는다."""
    try:
        frame = pd.read_csv(UPLOAD_PATH, encoding=encoding)
    except UnicodeDecodeError as exc:
        # 한글 윈도우에서 만든 CSV 는 대개 cp949 다. 이 오류가 그 신호다.
        # from None 으로 pandas 안쪽 트레이스백을 끊는다. 안 끊으면 스무 줄이 먼저 나와서
        # 정작 무엇을 해야 하는지 적은 줄이 맨 아래로 밀린다.
        raise ValueError(
            f"{encoding} 로 읽지 못했습니다. 인코딩을 바꿔 보세요.\n원문: {exc}"
        ) from None
    return describe(frame, f"{UPLOAD_PATH} ({encoding})")


def describe(frame: pd.DataFrame, title: str) -> str:
    """화면에 뿌릴 것을 JSON 으로 돌려준다.

    열 목록을 문자열로 만들어 넘기지 않는다. 고정폭 글꼴에서 한글이 두 칸을 먹는다는
    보장이 없어서(브라우저에서 재 보면 1.44 칸이다) 손으로 맞춘 칸이 어긋난다. 표는
    자바스크립트가 <table> 로 그리게 두고 여기서는 값만 넘긴다.
    """
    columns = [
        {
            "name": str(name),
            "dtype": str(frame[name].dtype),
            "unique": int(frame[name].nunique()),
            "missing": int(frame[name].isna().sum()),
        }
        for name in frame.columns
    ]

    numeric = frame.select_dtypes("number")
    text_columns = [c for c in frame.columns if frame[c].dtype in ("object", "str")]
    grouped = None
    if text_columns and len(frame):
        # 고유값이 가장 적은 열을 고른다. 이름처럼 전부 다른 열을 세어 봐야 1 만 잔뜩 나온다.
        pick = min(text_columns, key=lambda c: frame[c].nunique())
        if frame[pick].nunique() < len(frame):
            grouped = {
                "column": str(pick),
                "text": frame[pick].value_counts().head(5).to_string(),
            }

    return json.dumps(
        {
            "title": title,
            "rows": len(frame),
            "columns": columns,
            # pandas 가 만든 표는 터미널을 겨냥한 고정폭 서식이다. 그대로 <pre> 에 넣는다.
            "numeric": numeric.describe().round(1).to_string()
            if len(numeric.columns)
            else None,
            "grouped": grouped,
            "head": frame.head(3).to_string() if len(frame) else None,
        },
        ensure_ascii=False,
    )
