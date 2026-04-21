from __future__ import annotations

import json
import shutil
from fractions import Fraction
from pathlib import Path

import av
import numpy as np
from PIL import Image


TOOLS_DIR = Path(__file__).resolve().parent
APP_DIR = TOOLS_DIR.parent
FRAMES_DIR = TOOLS_DIR / "_frames"
CONFIG_PATH = FRAMES_DIR / "render-config.json"
AVATAR_DIR = APP_DIR / "media" / "avatar"
WEBM_PATH = AVATAR_DIR / "avatar-animation.webm"
MP4_PATH = AVATAR_DIR / "avatar-animation.mp4"


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        raise FileNotFoundError(f"Missing render config: {CONFIG_PATH}")
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def list_frames() -> list[Path]:
    frames = sorted(FRAMES_DIR.glob("frame_*.png"))
    if not frames:
        raise FileNotFoundError(f"No rendered PNG frames found in {FRAMES_DIR}")
    return frames


def ensure_even(value: int) -> int:
    return value if value % 2 == 0 else value - 1


def open_frame(path: Path, width: int, height: int) -> np.ndarray:
    image = Image.open(path).convert("RGB")
    if image.width != width or image.height != height:
        image = image.resize((width, height), Image.Resampling.LANCZOS)
    return np.asarray(image)


def encode_video(
    output_path: Path,
    codec_name: str,
    fps: Fraction,
    width: int,
    height: int,
    frame_paths: list[Path],
    container_options: dict[str, str] | None = None,
    stream_options: dict[str, str] | None = None,
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    container = av.open(str(output_path), mode="w", options=container_options or {})
    stream = container.add_stream(codec_name, rate=fps)
    stream.width = width
    stream.height = height
    stream.pix_fmt = "yuv420p"
    if stream_options:
        stream.options = stream_options

    try:
        for index, frame_path in enumerate(frame_paths):
            frame = av.VideoFrame.from_ndarray(open_frame(frame_path, width, height), format="rgb24")
            frame.pts = index
            frame.time_base = Fraction(1, 1) / fps
            for packet in stream.encode(frame):
                container.mux(packet)

        for packet in stream.encode(None):
            container.mux(packet)
    finally:
        container.close()


def main() -> None:
    config = load_config()
    frame_paths = list_frames()
    fps = Fraction(str(config.get("fps", 30))).limit_denominator(1000)
    width = ensure_even(int(config.get("width", 480)))
    height = ensure_even(int(config.get("height", 480)))

    print(f"[encode] {len(frame_paths)} frames @ {float(fps):.3f} fps ({width}x{height})")

    encode_video(
        WEBM_PATH,
        "libvpx-vp9",
        fps,
        width,
        height,
        frame_paths,
        stream_options={"crf": "30", "b:v": "0", "deadline": "good", "cpu-used": "4", "row-mt": "1"},
    )
    print(f"[encode] Wrote {WEBM_PATH}")

    encode_video(
        MP4_PATH,
        "libx264",
        fps,
        width,
        height,
        frame_paths,
        container_options={"movflags": "faststart"},
        stream_options={"crf": "21", "preset": "medium"},
    )
    print(f"[encode] Wrote {MP4_PATH}")

    shutil.rmtree(FRAMES_DIR, ignore_errors=True)
    print(f"[encode] Removed {FRAMES_DIR}")


if __name__ == "__main__":
    main()
