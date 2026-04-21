from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SESSION_DATA = ROOT / "app" / "data" / "session-data.json"
OUTPUT_DIR = ROOT / "app" / "media" / "avatar-frames"
FRAME_SIZE = (640, 640)
JPEG_QUALITY = 82


BODY_SEGMENTS = [
    ("left_hip", "left_knee", 34),
    ("left_knee", "left_ankle", 30),
    ("right_hip", "right_knee", 34),
    ("right_knee", "right_ankle", 30),
    ("left_shoulder", "left_elbow", 26),
    ("left_elbow", "left_wrist", 22),
    ("right_shoulder", "right_elbow", 26),
    ("right_elbow", "right_wrist", 22),
]


def midpoint(a: tuple[float, float], b: tuple[float, float]) -> tuple[float, float]:
    return ((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5)


def draw_capsule(
    draw: ImageDraw.ImageDraw,
    start: tuple[float, float],
    end: tuple[float, float],
    width: int,
    fill: tuple[int, int, int, int],
) -> None:
    draw.line([start, end], fill=fill, width=width, joint="curve")
    radius = width * 0.5
    for x, y in (start, end):
        draw.ellipse([x - radius, y - radius, x + radius, y + radius], fill=fill)


def draw_background(image: Image.Image) -> None:
    width, height = image.size
    pixels = image.load()
    for y in range(height):
        for x in range(width):
            dx = (x - width * 0.52) / width
            dy = (y - height * 0.32) / height
            glow = max(0.0, 1.0 - math.sqrt(dx * dx * 2.8 + dy * dy * 3.2))
            base = int(4 + glow * 15)
            blue = int(15 + glow * 44)
            pixels[x, y] = (base, base + 5, blue)

    draw = ImageDraw.Draw(image, "RGBA")
    horizon = int(height * 0.76)
    for row in range(horizon, height + 1, 24):
        alpha = max(10, int(42 * (1 - (row - horizon) / max(height - horizon, 1))))
        draw.line([(0, row), (width, row)], fill=(38, 138, 176, alpha), width=1)
    for offset in range(-width, width * 2, 60):
        draw.line([(offset, height), (offset + 170, horizon)], fill=(38, 138, 176, 24), width=1)


def project_points(
    landmarks: list[list[float]],
    index: dict[str, int],
    center_x: float,
    ground_y: float,
    scale: float,
) -> dict[str, tuple[float, float]]:
    points: dict[str, tuple[float, float]] = {}
    left_hip = landmarks[index["left_hip"]]
    right_hip = landmarks[index["right_hip"]]
    hip_x = (left_hip[0] + right_hip[0]) * 0.5
    hip_z = (left_hip[2] + right_hip[2]) * 0.5
    ankle_y = max(landmarks[index["left_ankle"]][1], landmarks[index["right_ankle"]][1])

    for name, landmark_index in index.items():
        if landmark_index >= len(landmarks):
            continue
        x, y, z = landmarks[landmark_index][:3]
        screen_x = center_x + (x - hip_x) * scale * 0.88 - (z - hip_z) * scale * 0.28
        screen_y = ground_y - (ankle_y - y) * scale
        points[name] = (screen_x, screen_y)
    return points


def should_flash_user(frame: dict) -> bool:
    time_sec = float(frame.get("time_sec") or 0.0)
    pulse_on = (time_sec % 3.0) < 1.32
    metrics = frame.get("wrong", {}).get("metrics", {})
    knee_angle = float(metrics.get("knee_angle") or 180.0)
    phase = frame.get("phase")
    is_squat_motion = phase in {"descent", "bottom", "ascent"} or knee_angle < 168.0
    return pulse_on and is_squat_motion


def draw_avatar(
    base: Image.Image,
    points: dict[str, tuple[float, float]],
    tint: tuple[int, int, int],
    alpha: int,
    is_user: bool,
    flash: bool,
) -> None:
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")
    core = (*tint, alpha)
    limb = (*tint, max(96, alpha - 18))
    glow = (*tint, 35)
    red = (255, 74, 68, 210)

    left_shoulder = points["left_shoulder"]
    right_shoulder = points["right_shoulder"]
    left_hip = points["left_hip"]
    right_hip = points["right_hip"]
    shoulder_mid = midpoint(left_shoulder, right_shoulder)
    hip_mid = midpoint(left_hip, right_hip)
    nose = points["nose"]
    head = (nose[0], nose[1] - 16)

    shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow, "RGBA")
    for a, b, width in BODY_SEGMENTS:
        draw_capsule(shadow_draw, points[a], points[b], width + 10, (0, 0, 0, 58))
    draw_capsule(shadow_draw, hip_mid, shoulder_mid, 62, (0, 0, 0, 70))
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))
    layer.alpha_composite(shadow)

    for a, b, width in BODY_SEGMENTS:
        draw_capsule(draw, points[a], points[b], width + 12, glow)
        draw_capsule(draw, points[a], points[b], width, limb)

    draw_capsule(draw, hip_mid, shoulder_mid, 58, core)
    draw_capsule(draw, left_shoulder, right_shoulder, 36, core)
    draw_capsule(draw, left_hip, right_hip, 38, core)
    draw_capsule(draw, shoulder_mid, head, 34, core)

    head_radius = 34
    draw.ellipse(
        [head[0] - head_radius, head[1] - head_radius, head[0] + head_radius, head[1] + head_radius],
        fill=(*tint, min(245, alpha + 24)),
    )

    for wrist_name in ("left_wrist", "right_wrist"):
        x, y = points[wrist_name]
        draw.ellipse([x - 13, y - 13, x + 13, y + 13], fill=(*tint, min(255, alpha + 20)))

    for ankle_name, toe_name in (("left_ankle", "left_foot_index"), ("right_ankle", "right_foot_index")):
        draw_capsule(draw, points[ankle_name], points[toe_name], 18, limb)

    bar_left = (min(left_shoulder[0], right_shoulder[0]) - 58, shoulder_mid[1] - 4)
    bar_right = (max(left_shoulder[0], right_shoulder[0]) + 58, shoulder_mid[1] - 4)
    draw_capsule(draw, bar_left, bar_right, 10, (108, 122, 138, 150 if is_user else 110))
    draw.ellipse([bar_left[0] - 17, bar_left[1] - 17, bar_left[0] + 17, bar_left[1] + 17], fill=(84, 94, 108, 150))
    draw.ellipse([bar_right[0] - 17, bar_right[1] - 17, bar_right[0] + 17, bar_right[1] + 17], fill=(84, 94, 108, 150))

    if is_user and flash:
        for joint_name in ("left_knee", "right_knee", "left_hip", "right_hip"):
            x, y = points[joint_name]
            draw.ellipse([x - 25, y - 25, x + 25, y + 25], fill=red)

    layer = layer.filter(ImageFilter.UnsharpMask(radius=1.4, percent=120, threshold=3))
    base.alpha_composite(layer)


def render_frame(frame: dict, index: dict[str, int]) -> Image.Image:
    image = BASE_BACKGROUND.copy()
    rgba = image.convert("RGBA")

    reference_points = project_points(frame["reference"]["world_landmarks"], index, 275, 550, 360)
    user_points = project_points(frame["wrong"]["world_landmarks"], index, 355, 550, 360)
    draw_avatar(rgba, reference_points, (70, 207, 255), 132, False, False)
    draw_avatar(rgba, user_points, (245, 252, 255), 218, True, should_flash_user(frame))
    return rgba.convert("RGB")


BASE_BACKGROUND = Image.new("RGB", FRAME_SIZE, (4, 8, 13))
draw_background(BASE_BACKGROUND)


def main() -> None:
    data = json.loads(SESSION_DATA.read_text(encoding="utf-8"))
    frames = data["frames"]
    index = data["landmark_index"]

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for stale in OUTPUT_DIR.glob("frame_*.jpg"):
        stale.unlink()

    for frame in frames:
        sample_idx = int(frame.get("sample_idx") or 0)
        image = render_frame(frame, index)
        image.save(OUTPUT_DIR / f"frame_{sample_idx:04d}.jpg", quality=JPEG_QUALITY, optimize=True)

    print(f"Rendered {len(frames)} avatar frames to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
