"""캔버스에서 받은 픽셀을 손본다. 자바스크립트로 돌려주는 일은 JS 쪽에서 한다."""

import time

import numpy as np
from PIL import Image, ImageFilter, ImageOps

# 마지막으로 만든 결과. JS 가 getBuffer 로 이 배열을 들여다본다.
result: np.ndarray | None = None


def _as_array(flat, width: int, height: int) -> np.ndarray:
    """ImageData 의 1차원 바이트를 (높이, 너비, RGBA) 로 본다.

    자바스크립트에서 넘어온 Uint8ClampedArray 는 그대로는 JsProxy 다. to_py() 를 불러야
    파이썬이 읽을 수 있는 memoryview 가 된다. 그리고 그 memoryview 는 WASM 메모리 안의
    복사본이다. JS 쪽 배열과 같은 메모리가 아니다. 건너오는 순간 한 번 복사된다.
    """
    buffer = flat.to_py() if hasattr(flat, "to_py") else flat
    return np.frombuffer(buffer, dtype=np.uint8).reshape(height, width, 4)


def apply_filter(flat, width: int, height: int, name: str) -> float:
    """필터를 걸고 걸린 시간을 돌려준다. 결과 자체는 전역 result 에 둔다."""
    global result
    started = time.perf_counter()
    pixels = _as_array(flat, width, height)

    if name == "gray":
        # 사람 눈이 초록에 민감하므로 채널마다 가중치가 다르다.
        luma = (pixels[..., :3] * np.array([0.299, 0.587, 0.114])).sum(axis=2)
        out = np.empty_like(pixels)
        out[..., :3] = luma[..., None].astype(np.uint8)
        out[..., 3] = pixels[..., 3]
    elif name == "invert":
        out = pixels.copy()
        out[..., :3] = 255 - out[..., :3]
    else:
        # Pillow 는 알파를 따로 다뤄야 한다. RGB 만 넘기고 알파는 그대로 붙인다.
        image = Image.fromarray(pixels[..., :3], mode="RGB")
        if name == "edge":
            image = image.filter(ImageFilter.FIND_EDGES)
        elif name == "posterize":
            image = ImageOps.posterize(image, 2)
        else:
            raise ValueError(f"모르는 필터입니다: {name}")
        out = np.dstack([np.asarray(image), pixels[..., 3]])

    # ascontiguousarray 로 한 줄짜리 메모리로 만든다. dstack 결과는 그렇지 않을 수 있고,
    # 그러면 getBuffer 가 복사 없이 넘길 수 없다.
    result = np.ascontiguousarray(out, dtype=np.uint8)
    return (time.perf_counter() - started) * 1000


def make_square(side: int) -> None:
    """벤치용 정사각형 배열을 만든다. 내용은 중요하지 않다."""
    global result
    result = np.full((side, side, 4), 128, dtype=np.uint8)


def grow_heap(mib: int) -> str:
    """일부러 WASM 힙을 키운다. 뷰가 어떻게 되는지 보여 주려는 것이다."""
    holder = bytearray(mib * 1024 * 1024)
    size = len(holder)
    del holder
    return f"{size // (1024 * 1024)} MiB 를 잡았다 놓았습니다"
