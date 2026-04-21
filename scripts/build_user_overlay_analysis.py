from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2

from build_demo_assets import BODY_CONNECTIONS, detect_pose_sequence, round_nested


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Analyze user.mp4 with MediaPipe and write overlay data.")
    parser.add_argument("--video", type=Path, default=Path("user.mp4"), help="Input user video path.")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("app/data/user-overlay-analysis.json"),
        help="Overlay analysis JSON output path.",
    )
    return parser.parse_args()


def detect_video_fps(video_path: Path) -> float:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise SystemExit(f"Could not open video: {video_path}")
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    cap.release()
    return fps if fps > 0 else 30.0


def compute_focus(frames: list[dict]) -> dict[str, float]:
    x_values: list[float] = []
    y_values: list[float] = []
    for frame in frames:
        landmarks = frame.get("landmarks2d") or []
        body_points = [
            point
            for index, point in enumerate(landmarks)
            if index >= 11 and point and (point[3] if len(point) > 3 else 1.0) >= 0.25
        ]
        if not body_points:
            continue
        xs = [point[0] for point in body_points]
        ys = [point[1] for point in body_points]
        x_values.append((min(xs) + max(xs)) * 0.5)
        y_values.append((min(ys) + max(ys)) * 0.5)

    if not x_values or not y_values:
        return {"x": 0.5, "y": 0.5}

    x_values.sort()
    y_values.sort()
    mid_x = x_values[len(x_values) // 2]
    mid_y = y_values[len(y_values) // 2]
    return {"x": round(mid_x, 4), "y": round(mid_y, 4)}


def main() -> None:
    args = parse_args()
    source_fps = detect_video_fps(args.video)
    sequence = detect_pose_sequence(args.video, "user_overlay", source_fps)

    frames = [
        {
            "sample_idx": frame.sample_idx,
            "frame_idx": frame.frame_idx,
            "time_sec": frame.time_sec,
            "pose_detected": frame.pose_detected,
            "landmarks2d": round_nested(frame.landmarks2d),
            "world_landmarks": round_nested(frame.world_landmarks),
            "visibility": round_nested(frame.visibility),
        }
        for frame in sequence["frames"]
    ]

    payload = {
        "source": str(args.video.as_posix()),
        "width": sequence["width"],
        "height": sequence["height"],
        "fps": round(sequence["fps"], 4),
        "duration_sec": round(sequence["duration_sec"], 4),
        "sampled_fps": round(sequence["sampled_fps"], 4),
        "frame_count": len(frames),
        "connections": BODY_CONNECTIONS,
        "suggested_focus": compute_focus(frames),
        "frames": frames,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(
        f"Wrote {args.output} with {payload['frame_count']} frames at "
        f"{payload['sampled_fps']:.2f} fps (duration {payload['duration_sec']:.2f}s)."
    )


if __name__ == "__main__":
    main()
