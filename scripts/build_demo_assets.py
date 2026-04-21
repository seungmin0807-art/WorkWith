from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import struct
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import vision
from mediapipe.tasks.python.core.base_options import BaseOptions
from scipy.signal import find_peaks, savgol_filter
from tqdm import tqdm


TARGET_FPS = 20.0
MODEL_NAME = "MediaPipe Pose"
EXERCISE_NAME = "Barbell Back Squat"
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_full/float16/latest/pose_landmarker_full.task"
)
MODEL_FILENAME = "pose_landmarker_full.task"


def default_model_path() -> Path:
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        return Path(local_app_data) / "WorkWith" / "models" / MODEL_FILENAME
    return Path(".models") / MODEL_FILENAME


MODEL_PATH = default_model_path()
POSE_LANDMARK = vision.PoseLandmark
LANDMARK_INDEX = {landmark.name.lower(): landmark.value for landmark in POSE_LANDMARK}
CONNECTIONS = sorted(
    (int(connection.start), int(connection.end))
    for connection in vision.PoseLandmarksConnections.POSE_LANDMARKS
)

LEFT_CORE = [
    POSE_LANDMARK.LEFT_SHOULDER.value,
    POSE_LANDMARK.LEFT_HIP.value,
    POSE_LANDMARK.LEFT_KNEE.value,
    POSE_LANDMARK.LEFT_ANKLE.value,
    POSE_LANDMARK.LEFT_FOOT_INDEX.value,
]
RIGHT_CORE = [
    POSE_LANDMARK.RIGHT_SHOULDER.value,
    POSE_LANDMARK.RIGHT_HIP.value,
    POSE_LANDMARK.RIGHT_KNEE.value,
    POSE_LANDMARK.RIGHT_ANKLE.value,
    POSE_LANDMARK.RIGHT_FOOT_INDEX.value,
]

LEFT_JOINT_SET = {
    "shoulder": POSE_LANDMARK.LEFT_SHOULDER.value,
    "hip": POSE_LANDMARK.LEFT_HIP.value,
    "knee": POSE_LANDMARK.LEFT_KNEE.value,
    "ankle": POSE_LANDMARK.LEFT_ANKLE.value,
    "heel": POSE_LANDMARK.LEFT_HEEL.value,
    "foot": POSE_LANDMARK.LEFT_FOOT_INDEX.value,
}
RIGHT_JOINT_SET = {
    "shoulder": POSE_LANDMARK.RIGHT_SHOULDER.value,
    "hip": POSE_LANDMARK.RIGHT_HIP.value,
    "knee": POSE_LANDMARK.RIGHT_KNEE.value,
    "ankle": POSE_LANDMARK.RIGHT_ANKLE.value,
    "heel": POSE_LANDMARK.RIGHT_HEEL.value,
    "foot": POSE_LANDMARK.RIGHT_FOOT_INDEX.value,
}

FACE_INDICES = {
    POSE_LANDMARK.NOSE.value,
    POSE_LANDMARK.LEFT_EYE_INNER.value,
    POSE_LANDMARK.LEFT_EYE.value,
    POSE_LANDMARK.LEFT_EYE_OUTER.value,
    POSE_LANDMARK.RIGHT_EYE_INNER.value,
    POSE_LANDMARK.RIGHT_EYE.value,
    POSE_LANDMARK.RIGHT_EYE_OUTER.value,
    POSE_LANDMARK.LEFT_EAR.value,
    POSE_LANDMARK.RIGHT_EAR.value,
    POSE_LANDMARK.MOUTH_LEFT.value,
    POSE_LANDMARK.MOUTH_RIGHT.value,
}
BODY_CONNECTIONS = [
    (start, end)
    for start, end in CONNECTIONS
    if start not in FACE_INDICES and end not in FACE_INDICES
]

ISSUE_SPECS = {
    "hip_hinge": {
        "label": "고관절 힌지 부족",
        "threshold": 0.035,
        "scale": 0.08,
        "highlight": ["hip", "shoulder", "knee"],
        "messages": [
            "엉덩이를 조금 더 뒤로 보내며 내려가세요.",
            "무릎보다 고관절이 먼저 접힌다는 느낌으로 시작하세요.",
        ],
    },
    "knee_drive": {
        "label": "무릎 전진 과다",
        "threshold": 0.045,
        "scale": 0.10,
        "highlight": ["hip", "knee", "ankle", "foot"],
        "messages": [
            "무릎만 앞으로 보내지 말고 엉덩이도 함께 뒤로 빼세요.",
            "정면으로 밀기보다 아래로 앉는 느낌을 가져가세요.",
        ],
    },
    "balance": {
        "label": "중심축 흔들림",
        "threshold": 0.030,
        "scale": 0.08,
        "highlight": ["shoulder", "hip", "ankle"],
        "messages": [
            "몸통의 흔들림을 줄이고 한 축으로 곧게 내려가세요.",
            "가슴과 골반이 같은 리듬으로 움직이게 맞춰보세요.",
        ],
    },
    "heel_pressure": {
        "label": "뒤꿈치 접지 약화",
        "threshold": 0.018,
        "scale": 0.05,
        "highlight": ["ankle", "heel", "foot"],
        "messages": [
            "뒤꿈치로 바닥을 누르며 버티세요.",
            "발 앞쪽으로 쏠리지 않게 발 중앙에 중심을 두세요.",
        ],
    },
    "posterior_chain": {
        "label": "후면사슬 활용 부족",
        "threshold": 0.060,
        "scale": 0.16,
        "highlight": ["hip", "knee", "heel"],
        "messages": [
            "엉덩이와 허벅지 뒤쪽을 같이 쓰는 느낌으로 일어나세요.",
            "무릎만 펴지 말고 엉덩이를 밀어 올리듯 올라오세요.",
        ],
    },
}

QA_PAIRS = [
    {
        "question": "왜 무릎이 먼저 앞으로 나가면 안 좋나요?",
        "answer": (
            "무릎이 먼저 앞으로 쏠리면 하중이 무릎관절에 집중되고, 몸 중심도 앞쪽으로 밀리기 쉬워져요. "
            "WorkWith는 고관절이 함께 접히는지와 뒤꿈치 접지가 유지되는지를 같이 보도록 안내합니다."
        ),
    },
    {
        "question": "뒤꿈치가 뜨려고 하는데 어떤 느낌으로 고치면 되나요?",
        "answer": (
            "발가락으로 버티기보다 뒤꿈치와 발 중앙으로 바닥을 넓게 누르는 느낌이 좋아요. "
            "앉을 때 엉덩이를 조금 더 뒤로 보내면 발 앞쪽 쏠림이 줄어듭니다."
        ),
    },
    {
        "question": "올바른 자세에서는 어떤 근육이 더 잘 쓰이나요?",
        "answer": (
            "고관절이 잘 접히면 대퇴사두근뿐 아니라 대퇴이두근과 대둔근까지 함께 사용돼요. "
            "그래서 동작이 덜 흔들리고 더 안정적인 스쿼트가 됩니다."
        ),
    },
    {
        "question": "허리에 부담 없이 깊게 내려가려면 어떻게 해야 하나요?",
        "answer": (
            "가슴을 과하게 숙이기보다 고관절을 뒤로 보내며 내려가면 허리 부담을 줄이면서 깊이를 확보하기 쉽습니다. "
            "무릎과 엉덩이가 함께 움직이도록 리듬을 맞추는 것이 핵심이에요."
        ),
    },
]


@dataclass
class FrameResult:
    frame_idx: int
    sample_idx: int
    time_sec: float
    landmarks2d: list[list[float]] | None
    world_landmarks: list[list[float]] | None
    visibility: list[float] | None
    side_visibility: dict[str, float]
    metrics_by_side: dict[str, dict[str, float | None]]
    pose_detected: bool


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build precomputed WorkWith demo assets.")
    parser.add_argument("--correct", type=Path, required=True, help="Reference video path.")
    parser.add_argument("--wrong", type=Path, required=True, help="User demo video path.")
    parser.add_argument("--output-dir", type=Path, default=Path("app"), help="Static app output root.")
    parser.add_argument("--target-fps", type=float, default=TARGET_FPS, help="Sampling FPS.")
    return parser.parse_args()


def ensure_model(model_path: Path) -> Path:
    if model_path.exists():
        return model_path
    model_path.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading pose landmarker model to {model_path} ...")
    urllib.request.urlretrieve(MODEL_URL, model_path)
    return model_path


def average_visibility(visibility: list[float] | None, indices: list[int]) -> float:
    if visibility is None:
        return 0.0
    values = [visibility[i] for i in indices if i < len(visibility)]
    return float(sum(values) / len(values)) if values else 0.0


def safe_point(points: list[list[float]] | None, index: int) -> np.ndarray | None:
    if points is None or index >= len(points):
        return None
    return np.asarray(points[index][:3], dtype=np.float64)


def midpoint(points: list[list[float]] | None, left_idx: int, right_idx: int) -> np.ndarray | None:
    left = safe_point(points, left_idx)
    right = safe_point(points, right_idx)
    if left is None or right is None:
        return None
    return (left + right) / 2.0


def angle_at(points: list[list[float]] | None, a_idx: int, b_idx: int, c_idx: int) -> float | None:
    a = safe_point(points, a_idx)
    b = safe_point(points, b_idx)
    c = safe_point(points, c_idx)
    if a is None or b is None or c is None:
        return None
    ba = a[:2] - b[:2]
    bc = c[:2] - b[:2]
    denom = np.linalg.norm(ba) * np.linalg.norm(bc)
    if denom <= 1e-6:
        return None
    cos_value = float(np.clip(np.dot(ba, bc) / denom, -1.0, 1.0))
    return float(np.degrees(np.arccos(cos_value)))


def tilt_from_vertical(points: list[list[float]] | None, lower_idx: int, upper_idx: int) -> float | None:
    lower = safe_point(points, lower_idx)
    upper = safe_point(points, upper_idx)
    if lower is None or upper is None:
        return None
    vector = upper[:2] - lower[:2]
    denom = np.linalg.norm(vector)
    if denom <= 1e-6:
        return None
    up = np.array([0.0, -1.0])
    cos_value = float(np.clip(np.dot(vector / denom, up), -1.0, 1.0))
    return float(np.degrees(np.arccos(cos_value)))


def round_nested(obj: Any, digits: int = 4) -> Any:
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return round(obj, digits)
    if isinstance(obj, list):
        return [round_nested(item, digits) for item in obj]
    if isinstance(obj, dict):
        return {key: round_nested(value, digits) for key, value in obj.items()}
    return obj


def compute_body_scale(landmarks2d: list[list[float]] | None) -> float | None:
    if landmarks2d is None:
        return None
    shoulder_mid = midpoint(
        landmarks2d,
        POSE_LANDMARK.LEFT_SHOULDER.value,
        POSE_LANDMARK.RIGHT_SHOULDER.value,
    )
    ankle_mid = midpoint(
        landmarks2d,
        POSE_LANDMARK.LEFT_ANKLE.value,
        POSE_LANDMARK.RIGHT_ANKLE.value,
    )
    if shoulder_mid is None or ankle_mid is None:
        return None
    value = float(np.linalg.norm(ankle_mid[:2] - shoulder_mid[:2]))
    return value if value > 1e-6 else None


def side_sign(landmarks2d: list[list[float]] | None, side: str) -> float:
    joints = LEFT_JOINT_SET if side == "left" else RIGHT_JOINT_SET
    hip = safe_point(landmarks2d, joints["hip"])
    knee = safe_point(landmarks2d, joints["knee"])
    if hip is None or knee is None:
        return 1.0
    return 1.0 if (knee[0] - hip[0]) >= 0 else -1.0


def compute_side_metrics(landmarks2d: list[list[float]] | None, side: str) -> dict[str, float | None]:
    joints = LEFT_JOINT_SET if side == "left" else RIGHT_JOINT_SET
    shoulder_mid = midpoint(
        landmarks2d,
        POSE_LANDMARK.LEFT_SHOULDER.value,
        POSE_LANDMARK.RIGHT_SHOULDER.value,
    )
    hip_mid = midpoint(
        landmarks2d,
        POSE_LANDMARK.LEFT_HIP.value,
        POSE_LANDMARK.RIGHT_HIP.value,
    )
    ankle_mid = midpoint(
        landmarks2d,
        POSE_LANDMARK.LEFT_ANKLE.value,
        POSE_LANDMARK.RIGHT_ANKLE.value,
    )

    hip = safe_point(landmarks2d, joints["hip"])
    knee = safe_point(landmarks2d, joints["knee"])
    ankle = safe_point(landmarks2d, joints["ankle"])
    heel = safe_point(landmarks2d, joints["heel"])
    foot = safe_point(landmarks2d, joints["foot"])
    body_scale = compute_body_scale(landmarks2d)
    orientation = side_sign(landmarks2d, side)

    if (
        hip is None
        or knee is None
        or ankle is None
        or heel is None
        or foot is None
        or body_scale is None
        or shoulder_mid is None
        or hip_mid is None
        or ankle_mid is None
    ):
        return {}

    knee_angle = angle_at(landmarks2d, joints["hip"], joints["knee"], joints["ankle"])
    hip_angle = angle_at(landmarks2d, joints["shoulder"], joints["hip"], joints["knee"])
    torso_lean_deg = tilt_from_vertical(landmarks2d, joints["hip"], joints["shoulder"])
    shin_lean_deg = tilt_from_vertical(landmarks2d, joints["ankle"], joints["knee"])
    hip_hinge_norm = float(max(0.0, (orientation * (knee[0] - hip[0])) / body_scale))
    knee_forward_norm = float(max(0.0, (orientation * (knee[0] - ankle[0])) / body_scale))
    heel_lift_norm = float(max(0.0, (foot[1] - heel[1]) / body_scale))
    balance_offset_norm = float(abs((shoulder_mid[0] - ankle_mid[0]) / body_scale))
    hip_height_norm = float((hip_mid[1] - shoulder_mid[1]) / max(float(ankle_mid[1] - shoulder_mid[1]), 1e-6))
    depth_score = float((knee[1] - hip[1]) / body_scale)
    posterior_chain_score = float(
        np.clip(
            0.52 * hip_hinge_norm
            + 0.30 * max(0.0, 0.06 - heel_lift_norm)
            + 0.18 * max(0.0, 0.18 - knee_forward_norm),
            0.0,
            1.0,
        )
    )

    return {
        "knee_angle": knee_angle,
        "hip_angle": hip_angle,
        "torso_lean_deg": torso_lean_deg,
        "shin_lean_deg": shin_lean_deg,
        "hip_hinge_norm": hip_hinge_norm,
        "knee_forward_norm": knee_forward_norm,
        "heel_lift_norm": heel_lift_norm,
        "balance_offset_norm": balance_offset_norm,
        "posterior_chain_score": posterior_chain_score,
        "depth_score": depth_score,
        "hip_height_norm": hip_height_norm,
    }


def detect_pose_sequence(video_path: Path, role: str, target_fps: float) -> dict[str, Any]:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise SystemExit(f"Could not open video: {video_path}")

    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    sample_interval = fps / target_fps if fps and target_fps > 0 else 1.0

    frames: list[FrameResult] = []
    detector = vision.PoseLandmarker.create_from_options(
        vision.PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(ensure_model(MODEL_PATH.resolve()))),
            running_mode=vision.RunningMode.VIDEO,
            num_poses=1,
            min_pose_detection_confidence=0.5,
            min_pose_presence_confidence=0.5,
            min_tracking_confidence=0.5,
            output_segmentation_masks=False,
        )
    )

    sampled_index = 0
    progress = tqdm(total=frame_count, desc=f"{role} pose", unit="f")
    frame_idx = 0

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        target_frame_idx = int(round(sampled_index * sample_interval))
        if frame_idx == target_frame_idx:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            sample_time_sec = sampled_index / max(target_fps, 1.0)
            timestamp_ms = int(sample_time_sec * 1000.0)
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = detector.detect_for_video(image, timestamp_ms)

            if result.pose_landmarks and result.pose_world_landmarks:
                landmarks2d = [[float(lm.x), float(lm.y), float(lm.z), float(lm.visibility)] for lm in result.pose_landmarks[0]]
                world_landmarks = [[float(lm.x), float(lm.y), float(lm.z), float(lm.visibility)] for lm in result.pose_world_landmarks[0]]
                visibility = [float(lm.visibility) for lm in result.pose_landmarks[0]]
                frames.append(
                    FrameResult(
                        frame_idx=frame_idx,
                        sample_idx=sampled_index,
                        time_sec=sample_time_sec,
                        landmarks2d=landmarks2d,
                        world_landmarks=world_landmarks,
                        visibility=visibility,
                        side_visibility={
                            "left": average_visibility(visibility, LEFT_CORE),
                            "right": average_visibility(visibility, RIGHT_CORE),
                        },
                        metrics_by_side={
                            "left": compute_side_metrics(landmarks2d, "left"),
                            "right": compute_side_metrics(landmarks2d, "right"),
                        },
                        pose_detected=True,
                    )
                )
            else:
                frames.append(
                    FrameResult(
                        frame_idx=frame_idx,
                        sample_idx=sampled_index,
                        time_sec=sample_time_sec,
                        landmarks2d=None,
                        world_landmarks=None,
                        visibility=None,
                        side_visibility={"left": 0.0, "right": 0.0},
                        metrics_by_side={"left": {}, "right": {}},
                        pose_detected=False,
                    )
                )
            sampled_index += 1

        frame_idx += 1
        progress.update(1)

    progress.close()
    detector.close()
    cap.release()

    detected_frames = [frame for frame in frames if frame.pose_detected]
    left_vis = np.mean([frame.side_visibility["left"] for frame in detected_frames]) if detected_frames else 0.0
    right_vis = np.mean([frame.side_visibility["right"] for frame in detected_frames]) if detected_frames else 0.0
    primary_side = "left" if left_vis >= right_vis else "right"

    return {
        "role": role,
        "path": str(video_path.resolve()),
        "fps": fps,
        "width": width,
        "height": height,
        "frame_count": frame_count,
        "duration_sec": frame_count / fps if fps else 0.0,
        "sample_interval": sample_interval,
        "sampled_fps": target_fps,
        "primary_side": primary_side,
        "frames": frames,
    }


def numeric_series(sequence: dict[str, Any], side: str, metric_names: list[str]) -> np.ndarray:
    frame_count = len(sequence["frames"])
    matrix = np.full((frame_count, len(metric_names)), np.nan, dtype=np.float64)
    for row, frame in enumerate(sequence["frames"]):
        metrics = frame.metrics_by_side.get(side, {})
        for col, name in enumerate(metric_names):
            value = metrics.get(name)
            if value is not None:
                matrix[row, col] = float(value)
    return matrix


def fill_series(values: np.ndarray) -> np.ndarray:
    result = values.astype(np.float64).copy()
    for col in range(result.shape[1]):
        column = result[:, col]
        valid = np.isfinite(column)
        if not np.any(valid):
            result[:, col] = 0.0
            continue
        valid_indices = np.where(valid)[0]
        result[:, col] = np.interp(np.arange(len(column)), valid_indices, column[valid])
        if len(column) >= 7:
            window = min(len(column) if len(column) % 2 == 1 else len(column) - 1, 21)
            if window >= 7:
                result[:, col] = savgol_filter(result[:, col], window_length=window, polyorder=2, mode="interp")
    return result


def standardize_pair(reference: np.ndarray, target: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    merged = np.vstack([reference, target])
    mean = merged.mean(axis=0)
    std = merged.std(axis=0)
    std[std < 1e-6] = 1.0
    return (reference - mean) / std, (target - mean) / std


def dtw_align(reference: np.ndarray, target: np.ndarray) -> list[int]:
    n, m = len(reference), len(target)
    cost = np.full((n + 1, m + 1), np.inf, dtype=np.float64)
    move = np.zeros((n + 1, m + 1), dtype=np.int8)
    cost[0, 0] = 0.0

    for i in range(1, n + 1):
        for j in range(1, m + 1):
            local = float(np.linalg.norm(reference[i - 1] - target[j - 1]))
            options = [cost[i - 1, j], cost[i, j - 1], cost[i - 1, j - 1]]
            best = int(np.argmin(options))
            cost[i, j] = local + options[best]
            move[i, j] = best

    i, j = n, m
    path: list[tuple[int, int]] = []
    while i > 0 and j > 0:
        path.append((i - 1, j - 1))
        step = int(move[i, j])
        if step == 0:
            i -= 1
        elif step == 1:
            j -= 1
        else:
            i -= 1
            j -= 1
    path.reverse()

    mapping: dict[int, list[int]] = {}
    for ref_idx, target_idx in path:
        mapping.setdefault(target_idx, []).append(ref_idx)

    mapped = []
    previous = 0
    for target_idx in range(m):
        candidates = mapping.get(target_idx)
        if not candidates:
            mapped.append(previous)
            continue
        current = int(round(float(np.median(candidates))))
        current = max(previous, current)
        mapped.append(current)
        previous = current
    return mapped


def detect_reps(sequence: dict[str, Any], side: str) -> dict[str, Any]:
    metrics = fill_series(numeric_series(sequence, side, ["hip_height_norm"]))[:, 0]
    if len(metrics) < 3:
        return {"count": 0, "bottom_indices": [], "phase": ["steady"] * len(metrics), "rep_index": [1] * len(metrics)}

    bottoms, _ = find_peaks(metrics, distance=max(int(sequence["sampled_fps"] * 1.0), 4), prominence=0.03)
    derivative = np.diff(metrics, prepend=metrics[0])
    phase = []
    rep_index = []
    completed = 0
    next_bottom_idx = 0
    bottom_list = bottoms.tolist()
    for idx in range(len(metrics)):
        while next_bottom_idx < len(bottom_list) and idx >= bottom_list[next_bottom_idx]:
            completed += 1
            next_bottom_idx += 1
        rep_index.append(max(completed + 1, 1))
        motion = derivative[idx]
        if motion > 0.002:
            phase.append("descent")
        elif motion < -0.002:
            phase.append("ascent")
        else:
            phase.append("steady")
    return {
        "count": len(bottom_list),
        "bottom_indices": bottom_list,
        "phase": phase,
        "rep_index": rep_index,
    }


def issue_joint_names(issue_id: str, side: str) -> list[str]:
    names = []
    for joint in ISSUE_SPECS[issue_id]["highlight"]:
        if joint in LANDMARK_INDEX:
            names.append(joint)
        else:
            names.append(f"{side}_{joint}")
    return names


def issue_priority(issue_id: str) -> int:
    order = {
        "hip_hinge": 0,
        "knee_drive": 1,
        "heel_pressure": 2,
        "balance": 3,
        "posterior_chain": 4,
    }
    return order.get(issue_id, 9)


def add_metric_row(
    rows: list[dict[str, Any]],
    metric_id: str,
    label: str,
    value: float | None,
    reference: float | None,
    delta: float | None,
    unit: str,
    scale: float = 1.0,
) -> None:
    rows.append(
        {
            "id": metric_id,
            "label": label,
            "value": None if value is None else value * scale,
            "reference": None if reference is None else reference * scale,
            "delta": None if delta is None else delta * scale,
            "unit": unit,
        }
    )


def build_metric_rows(
    wrong_metrics: dict[str, float | None],
    correct_metrics: dict[str, float | None],
    issue_values: dict[str, float | None],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    add_metric_row(
        rows,
        "match_rate",
        "전문가 일치도",
        None,
        None,
        None,
        "%",
    )
    add_metric_row(
        rows,
        "hip_hinge_norm",
        "고관절 힌지",
        wrong_metrics.get("hip_hinge_norm"),
        correct_metrics.get("hip_hinge_norm"),
        issue_values.get("hip_hinge"),
        "%",
        100.0,
    )
    add_metric_row(
        rows,
        "knee_forward_norm",
        "무릎 전진",
        wrong_metrics.get("knee_forward_norm"),
        correct_metrics.get("knee_forward_norm"),
        issue_values.get("knee_drive"),
        "%",
        100.0,
    )
    add_metric_row(
        rows,
        "balance_offset_norm",
        "중심 안정성",
        wrong_metrics.get("balance_offset_norm"),
        correct_metrics.get("balance_offset_norm"),
        issue_values.get("balance"),
        "%",
        100.0,
    )
    add_metric_row(
        rows,
        "heel_lift_norm",
        "뒤꿈치 접지",
        wrong_metrics.get("heel_lift_norm"),
        correct_metrics.get("heel_lift_norm"),
        issue_values.get("heel_pressure"),
        "%",
        100.0,
    )
    add_metric_row(
        rows,
        "posterior_chain_score",
        "후면사슬 활용",
        wrong_metrics.get("posterior_chain_score"),
        correct_metrics.get("posterior_chain_score"),
        issue_values.get("posterior_chain"),
        "%",
        100.0,
    )
    add_metric_row(
        rows,
        "knee_angle",
        "무릎 굴곡",
        wrong_metrics.get("knee_angle"),
        correct_metrics.get("knee_angle"),
        None,
        "deg",
    )
    add_metric_row(
        rows,
        "torso_lean_deg",
        "상체 기울기",
        wrong_metrics.get("torso_lean_deg"),
        correct_metrics.get("torso_lean_deg"),
        None,
        "deg",
    )
    add_metric_row(
        rows,
        "shin_lean_deg",
        "정강이 각도",
        wrong_metrics.get("shin_lean_deg"),
        correct_metrics.get("shin_lean_deg"),
        None,
        "deg",
    )
    return rows


def build_issue_segments(frames: list[dict[str, Any]]) -> list[dict[str, Any]]:
    segments = []
    active: dict[str, dict[str, Any]] = {}

    def close_segment(issue_id: str) -> None:
        segment = active.pop(issue_id, None)
        if segment:
            segments.append(segment)

    for frame in frames:
        active_ids = {issue["id"] for issue in frame["issues"]}
        current_time = frame["time_sec"]

        for issue in frame["issues"]:
            existing = active.get(issue["id"])
            if existing is None:
                active[issue["id"]] = {
                    "id": issue["id"],
                    "label": issue["label"],
                    "start_time": current_time,
                    "end_time": current_time,
                    "peak_severity": issue["severity"],
                    "peak_delta": issue["delta"],
                    "frame_index": frame["sample_idx"],
                }
            else:
                existing["end_time"] = current_time
                if issue["severity"] >= existing["peak_severity"]:
                    existing["peak_severity"] = issue["severity"]
                    existing["peak_delta"] = issue["delta"]
                    existing["frame_index"] = frame["sample_idx"]

        for issue_id in list(active):
            if issue_id not in active_ids:
                close_segment(issue_id)

    for issue_id in list(active):
        close_segment(issue_id)

    return segments


def compare_sequences(correct: dict[str, Any], wrong: dict[str, Any], side: str) -> dict[str, Any]:
    metric_names = [
        "hip_height_norm",
        "knee_angle",
        "torso_lean_deg",
        "shin_lean_deg",
        "hip_hinge_norm",
        "knee_forward_norm",
        "posterior_chain_score",
    ]
    correct_matrix = fill_series(numeric_series(correct, side, metric_names))
    wrong_matrix = fill_series(numeric_series(wrong, side, metric_names))
    correct_scaled, wrong_scaled = standardize_pair(correct_matrix, wrong_matrix)
    mapped_reference = dtw_align(correct_scaled, wrong_scaled)

    rep_info = detect_reps(wrong, side)
    frame_payloads: list[dict[str, Any]] = []
    issue_buckets: dict[str, list[dict[str, Any]]] = {key: [] for key in ISSUE_SPECS}
    score_values = []

    for idx, wrong_frame in enumerate(wrong["frames"]):
        ref_idx = mapped_reference[idx]
        correct_frame = correct["frames"][ref_idx]
        wrong_metrics = wrong_frame.metrics_by_side.get(side, {})
        correct_metrics = correct_frame.metrics_by_side.get(side, {})

        issue_values = {
            "hip_hinge": (
                float(correct_metrics["hip_hinge_norm"] - wrong_metrics["hip_hinge_norm"])
                if wrong_metrics.get("hip_hinge_norm") is not None and correct_metrics.get("hip_hinge_norm") is not None
                else None
            ),
            "knee_drive": (
                float(wrong_metrics["knee_forward_norm"] - correct_metrics["knee_forward_norm"])
                if wrong_metrics.get("knee_forward_norm") is not None and correct_metrics.get("knee_forward_norm") is not None
                else None
            ),
            "balance": (
                float(wrong_metrics["balance_offset_norm"] - correct_metrics["balance_offset_norm"])
                if wrong_metrics.get("balance_offset_norm") is not None and correct_metrics.get("balance_offset_norm") is not None
                else None
            ),
            "heel_pressure": (
                float(wrong_metrics["heel_lift_norm"] - correct_metrics["heel_lift_norm"])
                if wrong_metrics.get("heel_lift_norm") is not None and correct_metrics.get("heel_lift_norm") is not None
                else None
            ),
            "posterior_chain": (
                float(correct_metrics["posterior_chain_score"] - wrong_metrics["posterior_chain_score"])
                if wrong_metrics.get("posterior_chain_score") is not None and correct_metrics.get("posterior_chain_score") is not None
                else None
            ),
        }

        active_issues: list[dict[str, Any]] = []
        highlighted_joint_names: set[str] = set()
        coach_lines: list[str] = []

        for issue_id, delta in issue_values.items():
            if delta is None:
                continue
            spec = ISSUE_SPECS[issue_id]
            if delta <= spec["threshold"]:
                continue
            severity = float(min(1.0, max(0.0, delta / spec["scale"])))
            active_issues.append(
                {
                    "id": issue_id,
                    "label": spec["label"],
                    "delta": delta,
                    "severity": severity,
                }
            )
            issue_buckets[issue_id].append(
                {
                    "frame": idx,
                    "time_sec": wrong_frame.time_sec,
                    "delta": delta,
                    "severity": severity,
                }
            )
            highlighted_joint_names.update(issue_joint_names(issue_id, side))

        active_issues.sort(key=lambda item: (item["severity"], -issue_priority(item["id"])), reverse=True)
        active_issues.sort(key=lambda item: issue_priority(item["id"]))

        if active_issues:
            for issue in active_issues[:2]:
                for line in ISSUE_SPECS[issue["id"]]["messages"][:1]:
                    coach_lines.append(line)
        else:
            coach_lines.append("지금 리듬이 안정적입니다. 뒤꿈치로 바닥을 밀며 유지하세요.")

        score_penalty = 0.0
        if issue_values["hip_hinge"] is not None:
            score_penalty += max(issue_values["hip_hinge"] - ISSUE_SPECS["hip_hinge"]["threshold"], 0.0) * 210.0
        if issue_values["knee_drive"] is not None:
            score_penalty += max(issue_values["knee_drive"] - ISSUE_SPECS["knee_drive"]["threshold"], 0.0) * 170.0
        if issue_values["balance"] is not None:
            score_penalty += max(issue_values["balance"] - ISSUE_SPECS["balance"]["threshold"], 0.0) * 210.0
        if issue_values["heel_pressure"] is not None:
            score_penalty += max(issue_values["heel_pressure"] - ISSUE_SPECS["heel_pressure"]["threshold"], 0.0) * 320.0
        if issue_values["posterior_chain"] is not None:
            score_penalty += max(issue_values["posterior_chain"] - ISSUE_SPECS["posterior_chain"]["threshold"], 0.0) * 115.0
        score = float(max(48.0, min(99.0, 100.0 - score_penalty)))
        score_values.append(score)

        metric_rows = build_metric_rows(wrong_metrics, correct_metrics, issue_values)
        for row in metric_rows:
            if row["id"] == "match_rate":
                row["value"] = round(score, 1)
                row["delta"] = round(100.0 - score, 1)
                row["reference"] = 100.0

        frame_payloads.append(
            {
                "sample_idx": idx,
                "frame_idx": wrong_frame.frame_idx,
                "time_sec": wrong_frame.time_sec,
                "reference_sample_idx": ref_idx,
                "score": score,
                "pose_detected": wrong_frame.pose_detected,
                "rep_index": rep_info["rep_index"][idx] if idx < len(rep_info["rep_index"]) else 1,
                "phase": rep_info["phase"][idx] if idx < len(rep_info["phase"]) else "steady",
                "issues": round_nested(active_issues),
                "coach_text": " ".join(coach_lines[:2]),
                "voice_text": coach_lines[0],
                "analysis_metrics": round_nested(metric_rows),
                "wrong": {
                    "landmarks2d": round_nested(wrong_frame.landmarks2d),
                    "world_landmarks": round_nested(wrong_frame.world_landmarks),
                    "metrics": round_nested(wrong_metrics),
                },
                "reference": {
                    "landmarks2d": round_nested(correct_frame.landmarks2d),
                    "world_landmarks": round_nested(correct_frame.world_landmarks),
                    "metrics": round_nested(correct_metrics),
                },
                "highlighted_joint_names": sorted(highlighted_joint_names),
            }
        )

    issue_summary = []
    for issue_id, items in issue_buckets.items():
        if not items:
            continue
        avg_delta = float(np.mean([item["delta"] for item in items]))
        peak_delta = float(np.max([item["delta"] for item in items]))
        avg_severity = float(np.mean([item["severity"] for item in items]))
        priority_bonus = 0.12 if issue_id in ("hip_hinge", "knee_drive", "heel_pressure") else 0.0
        issue_summary.append(
            {
                "id": issue_id,
                "label": ISSUE_SPECS[issue_id]["label"],
                "frame_hits": len(items),
                "avg_delta": avg_delta,
                "peak_delta": peak_delta,
                "avg_severity": avg_severity,
                "priority": avg_severity + priority_bonus,
            }
        )
    issue_summary.sort(key=lambda item: (item["priority"], item["frame_hits"]), reverse=True)

    segments = build_issue_segments(frame_payloads)

    return {
        "frames": frame_payloads,
        "issue_summary": round_nested(issue_summary),
        "issue_segments": round_nested(segments),
        "rep_info": rep_info,
        "average_score": round(float(np.mean(score_values)), 2) if score_values else 0.0,
    }


def joint_indices_from_names(side: str, names: set[str]) -> set[int]:
    mapping = LEFT_JOINT_SET if side == "left" else RIGHT_JOINT_SET
    indices: set[int] = set()
    for name in names:
        if name in LANDMARK_INDEX:
            indices.add(LANDMARK_INDEX[name])
        elif name in mapping:
            indices.add(mapping[name])
    return indices


def draw_pose_overlay(
    frame: np.ndarray,
    actual_landmarks: list[list[float]] | None,
) -> np.ndarray:
    height, width = frame.shape[:2]
    output = frame.copy()

    if actual_landmarks is None:
        return output

    glow_layer = np.zeros_like(output)
    skeleton_layer = output.copy()
    for a_idx, b_idx in BODY_CONNECTIONS:
        a = safe_point(actual_landmarks, a_idx)
        b = safe_point(actual_landmarks, b_idx)
        if a is None or b is None:
            continue
        cv2.line(
            glow_layer,
            (int(a[0] * width), int(a[1] * height)),
            (int(b[0] * width), int(b[1] * height)),
            (255, 255, 255),
            9,
            cv2.LINE_AA,
        )
        cv2.line(
            skeleton_layer,
            (int(a[0] * width), int(a[1] * height)),
            (int(b[0] * width), int(b[1] * height)),
            (255, 255, 255),
            3,
            cv2.LINE_AA,
        )

    for idx, point in enumerate(actual_landmarks):
        if idx in FACE_INDICES:
            continue
        cv2.circle(
            glow_layer,
            (int(point[0] * width), int(point[1] * height)),
            9,
            (255, 255, 255),
            -1,
            cv2.LINE_AA,
        )
        cv2.circle(
            skeleton_layer,
            (int(point[0] * width), int(point[1] * height)),
            4,
            (255, 255, 255),
            -1,
            cv2.LINE_AA,
        )

    glow_layer = cv2.GaussianBlur(glow_layer, (0, 0), 4.0)
    output = cv2.addWeighted(output, 1.0, glow_layer, 0.34, 0.0)
    return cv2.addWeighted(skeleton_layer, 0.72, output, 0.28, 0.0)


def render_overlay_frames(
    wrong_video_path: Path,
    comparison: dict[str, Any],
    output_path: Path,
    frame_dir: Path,
    sampled_fps: float,
) -> dict[str, Any]:
    cap = cv2.VideoCapture(str(wrong_video_path))
    if not cap.isOpened():
        raise SystemExit(f"Could not open wrong video for overlay rendering: {wrong_video_path}")

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    sample_interval = fps / sampled_fps if fps and sampled_fps > 0 else 1.0
    preview_width = min(width, 540)
    preview_height = int(height * (preview_width / max(width, 1)))

    frame_dir.mkdir(parents=True, exist_ok=True)
    for stale_frame in frame_dir.glob("frame_*.jpg"):
        stale_frame.unlink()

    writer = cv2.VideoWriter(
        str(output_path),
        cv2.VideoWriter_fourcc(*"mp4v"),
        sampled_fps,
        (preview_width, preview_height),
    )

    frames = comparison["frames"]
    sample_idx = 0
    frame_idx = 0
    progress = tqdm(total=int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0), desc="overlay", unit="f")

    while True:
        ok, frame = cap.read()
        if not ok or sample_idx >= len(frames):
            break

        target_frame_idx = int(round(sample_idx * sample_interval))
        if frame_idx == target_frame_idx:
            frame_data = frames[sample_idx]
            composed = draw_pose_overlay(frame, frame_data["wrong"]["landmarks2d"])
            preview = composed
            if preview_width != width:
                preview = cv2.resize(composed, (preview_width, preview_height), interpolation=cv2.INTER_AREA)
            writer.write(preview)
            frame_path = frame_dir / f"frame_{sample_idx:04d}.jpg"
            ok, encoded = cv2.imencode(".jpg", preview, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
            if not ok:
                raise SystemExit(f"Could not encode overlay frame: {frame_path}")
            frame_path.write_bytes(encoded.tobytes())
            sample_idx += 1

        frame_idx += 1
        progress.update(1)

    progress.close()
    writer.release()
    cap.release()
    return {
        "overlay_video": "media/wrong_overlay.mp4",
        "overlay_frame_dir": "media/frames",
        "overlay_frame_pattern": "frame_{index:04d}.jpg",
        "overlay_frame_count": len(frames),
        "overlay_frame_width": preview_width,
        "overlay_frame_height": preview_height,
    }


def build_highlights(comparison: dict[str, Any]) -> list[dict[str, Any]]:
    highlights = []
    segment_lookup = sorted(
        comparison["issue_segments"],
        key=lambda item: (item["peak_severity"], item["peak_delta"]),
        reverse=True,
    )
    for segment in segment_lookup[:4]:
        highlights.append(
            {
                "id": segment["id"],
                "label": segment["label"],
                "time_sec": segment["start_time"],
                "frame_index": int(segment["frame_index"]),
                "summary": ISSUE_SPECS[segment["id"]]["messages"][0],
            }
        )
    return highlights


def issue_entry(comparison: dict[str, Any], issue_id: str) -> dict[str, Any]:
    for item in comparison["issue_summary"]:
        if item["id"] == issue_id:
            return item
    return {"id": issue_id, "avg_severity": 0.0, "avg_delta": 0.0, "peak_delta": 0.0, "frame_hits": 0}


def bounded_score(value: float, lower: float = 48.0, upper: float = 99.0) -> int:
    return int(round(max(lower, min(upper, value))))


def build_report(comparison: dict[str, Any]) -> dict[str, Any]:
    issue_labels = [item["label"] for item in comparison["issue_summary"][:3]]
    primary = issue_labels[0] if issue_labels else "자세 안정성"
    secondary = issue_labels[1] if len(issue_labels) > 1 else "무릎-고관절 균형"

    knee_entry = issue_entry(comparison, "knee_drive")
    heel_entry = issue_entry(comparison, "heel_pressure")
    hinge_entry = issue_entry(comparison, "hip_hinge")
    balance_entry = issue_entry(comparison, "balance")
    posterior_entry = issue_entry(comparison, "posterior_chain")

    match_score = bounded_score(comparison["average_score"])
    knee_load_score = bounded_score(100.0 - knee_entry["avg_severity"] * 42.0 - heel_entry["avg_severity"] * 14.0)
    heel_contact_score = bounded_score(100.0 - heel_entry["avg_severity"] * 48.0)
    hip_hinge_score = bounded_score(100.0 - hinge_entry["avg_severity"] * 44.0)
    stability_score = bounded_score(100.0 - balance_entry["avg_severity"] * 50.0)
    posterior_chain_score = bounded_score(100.0 - posterior_entry["avg_severity"] * 41.0)

    trainer_status = "고관절 힌지와 뒤꿈치 지지 우선 보완"
    medical_status = "무릎과 발목 전면 부담 관리 필요"
    return {
        "headline": "세트 종료 종합 평가",
        "summary": (
            f"이번 세트는 '{primary}'와 '{secondary}'가 핵심 교정 포인트로 나타났습니다. "
            "모범 동작 대비 무릎 전진 비율이 높고 고관절 힌지가 늦게 시작되어 중심이 앞쪽으로 이동하는 패턴이 반복됐습니다."
        ),
        "trainer_status": trainer_status,
        "trainer_detail": (
            "트레이너 관점에서는 내려가기 시작할 때 엉덩이가 먼저 뒤로 빠지지 않고 무릎이 빠르게 전진하는 패턴이 반복됐습니다. "
            "이 흐름은 대퇴사두근 중심으로 버티는 느낌을 만들고, 고관절과 둔근을 함께 쓰는 안정적인 스쿼트 리듬을 약하게 만듭니다. "
            "다음 세트에서는 내려가기 시작하는 순간 엉덩이를 먼저 뒤로 보내고, 뒤꿈치와 발 중앙으로 바닥을 누르며 무릎과 고관절이 함께 움직이도록 만드는 것이 좋습니다."
        ),
        "medical_status": medical_status,
        "medical_detail": (
            "전문의 관점에서는 골반 전방경사와 힙 힌지가 충분히 형성되지 않아 무릎의 전방 쏠림과 발 앞쪽 하중이 반복된 점이 가장 중요한 관찰 포인트입니다. "
            "이 패턴이 누적되면 무릎관절과 발목 전면에 부담이 커질 수 있고, 발목 유연성이 부족한 경우 뒤꿈치 들림으로 이어질 가능성도 있습니다. "
            "통증이 느껴진다면 깊이를 줄이고 안정성을 먼저 확보하는 접근이 바람직합니다."
        ),
        "medical_note": (
            "무릎 전방 쏠림과 뒤꿈치 접지 약화가 함께 나타날 경우 무릎관절과 발목 전면 부담이 커질 수 있습니다. "
            "통증이 동반되면 강도를 낮추고 전문의 또는 운동 전문가와 상담을 권장합니다."
        ),
        "next_session": [
            "내려갈 때 엉덩이를 먼저 뒤로 보내는 연습을 5회 반복하세요.",
            "뒤꿈치와 발 중앙으로 바닥을 누르는 감각을 먼저 만든 뒤 스쿼트를 시작하세요.",
            "상체와 골반이 동시에 내려가도록 천천히 3회 리허설한 뒤 본 세트에 들어가세요.",
        ],
        "muscle_note": (
            "올바른 패턴에서는 대퇴사두근뿐 아니라 대퇴이두근과 대둔근이 함께 참여해 더 안정적인 움직임을 만들 수 있습니다."
        ),
        "final_scores": [
            {"id": "match", "label": "전문가 일치도", "value": match_score},
            {"id": "knee_load", "label": "무릎 하중 분산", "value": knee_load_score},
            {"id": "heel_contact", "label": "뒤꿈치 접지", "value": heel_contact_score},
            {"id": "hip_hinge", "label": "고관절 힌지", "value": hip_hinge_score},
            {"id": "stability", "label": "중심 안정성", "value": stability_score},
            {"id": "posterior_chain", "label": "후면사슬 활용", "value": posterior_chain_score},
        ],
        "highlights": build_highlights(comparison),
    }


def build_overview(comparison: dict[str, Any], wrong: dict[str, Any]) -> dict[str, Any]:
    issues = comparison["issue_summary"]
    top_issue = issues[0]["label"] if issues else "안정적"
    rep_count = comparison["rep_info"]["count"]
    return {
        "exercise": EXERCISE_NAME,
        "model": MODEL_NAME,
        "target_fps": TARGET_FPS,
        "average_score": comparison["average_score"],
        "rep_count": rep_count,
        "primary_side": wrong["primary_side"],
        "headline": "WorkWith session",
        "summary": (
            f"단일 카메라 3D 추적으로 스쿼트 세트를 분석한 결과, 이번 세트에서 가장 큰 관리 포인트는 '{top_issue}'로 정리됐습니다."
        ),
        "top_findings": issues[:3],
    }


def serialize_sequence(sequence: dict[str, Any]) -> dict[str, Any]:
    return {
        "role": sequence["role"],
        "path": sequence["path"],
        "width": sequence["width"],
        "height": sequence["height"],
        "fps": round(sequence["fps"], 4),
        "sampled_fps": round(sequence["sampled_fps"], 4),
        "frame_count": sequence["frame_count"],
        "sample_count": len(sequence["frames"]),
        "duration_sec": round(sequence["duration_sec"], 4),
        "primary_side": sequence["primary_side"],
    }


def ensure_directories(output_dir: Path) -> tuple[Path, Path]:
    data_dir = output_dir / "data"
    media_dir = output_dir / "media"
    data_dir.mkdir(parents=True, exist_ok=True)
    media_dir.mkdir(parents=True, exist_ok=True)
    return data_dir, media_dir


def copy_media_file(source_path: Path, destination_path: Path) -> None:
    destination_path.parent.mkdir(parents=True, exist_ok=True)
    if source_path.resolve() == destination_path.resolve():
        return
    shutil.copy2(source_path, destination_path)


def load_bvh_hierarchy(output_dir: Path) -> str:
    candidates = [
        output_dir / "media" / "motions" / "user_pose_20fps.bvh",
        Path("app") / "media" / "motions" / "user_pose_20fps.bvh",
        output_dir / "user_pose_20fps.bvh",
        Path("app") / "user_pose_20fps.bvh",
    ]
    for candidate in candidates:
        if not candidate.exists():
            continue
        text = candidate.read_text(encoding="utf-8", errors="replace")
        if "MOTION" in text:
            return text.split("MOTION", 1)[0].rstrip() + "\n"
    raise SystemExit("Could not find an existing BVH hierarchy template for motion export.")


def parse_bvh_channels(hierarchy_text: str) -> list[tuple[str, str]]:
    channels: list[tuple[str, str]] = []
    active_joint: str | None = None
    for line in hierarchy_text.splitlines():
        stripped = line.strip()
        if stripped.startswith("ROOT ") or stripped.startswith("JOINT "):
            active_joint = stripped.split(maxsplit=1)[1]
            continue
        if stripped.startswith("CHANNELS ") and active_joint:
            parts = stripped.split()
            for channel in parts[2:]:
                channels.append((active_joint, channel))
            active_joint = None
    return channels


def bvh_point_dict(world_landmarks: list[list[float]] | None) -> dict[str, np.ndarray]:
    if world_landmarks is None:
        return {}
    points: dict[str, np.ndarray] = {}
    for name, index in LANDMARK_INDEX.items():
        if index >= len(world_landmarks):
            continue
        raw = world_landmarks[index]
        if len(raw) < 3:
            continue
        if len(raw) > 3 and raw[3] is not None and raw[3] < 0.12:
            continue
        points[name] = np.asarray([raw[0], -raw[1], -raw[2]], dtype=np.float64)
    add_virtual_bvh_points(points)
    return points


def add_virtual_bvh_points(points: dict[str, np.ndarray]) -> None:
    def avg(name: str, left: str, right: str) -> None:
        if left in points and right in points:
            points[name] = (points[left] + points[right]) / 2.0

    avg("hips", "left_hip", "right_hip")
    avg("shoulders", "left_shoulder", "right_shoulder")
    avg("ears", "left_ear", "right_ear")
    points["neck"] = points.get("shoulders", points.get("nose"))
    points["head"] = points.get("nose", points.get("ears"))
    points["left_index"] = points.get("left_index", points.get("left_wrist"))
    points["right_index"] = points.get("right_index", points.get("right_wrist"))


def normalize_degrees(value: float) -> float:
    return ((value + 180.0) % 360.0) - 180.0


def vector_to_bvh_euler(start: np.ndarray | None, end: np.ndarray | None) -> dict[str, float]:
    if start is None or end is None:
        return {}
    vector = end - start
    norm = float(np.linalg.norm(vector))
    if norm <= 1e-6:
        return {}
    x, y, z = (vector / norm).tolist()
    horizontal = max(math.sqrt(x * x + z * z), 1e-6)
    yaw = math.degrees(math.atan2(x, z))
    pitch = -math.degrees(math.atan2(y, horizontal))
    roll = math.degrees(math.atan2(x, y if abs(y) > 1e-6 else 1e-6)) * 0.35
    return {
        "Zrotation": normalize_degrees(roll),
        "Yrotation": normalize_degrees(yaw),
        "Xrotation": normalize_degrees(pitch),
    }


BVH_VECTOR_MAP = {
    "hips": ("hips", "shoulders"),
    "Chest": ("hips", "shoulders"),
    "Chest2": ("hips", "shoulders"),
    "Chest3": ("hips", "neck"),
    "Neck": ("neck", "head"),
    "Head": ("neck", "head"),
    "Head_End": ("neck", "head"),
    "LeftCollar": ("neck", "left_shoulder"),
    "LeftShoulder": ("left_shoulder", "left_elbow"),
    "LeftElbow": ("left_elbow", "left_wrist"),
    "LeftWrist": ("left_wrist", "left_index"),
    "RightCollar": ("neck", "right_shoulder"),
    "RightShoulder": ("right_shoulder", "right_elbow"),
    "RightElbow": ("right_elbow", "right_wrist"),
    "RightWrist": ("right_wrist", "right_index"),
    "LeftHip": ("left_hip", "left_knee"),
    "LeftKnee": ("left_knee", "left_ankle"),
    "LeftAnkle": ("left_ankle", "left_foot_index"),
    "LeftToe": ("left_heel", "left_foot_index"),
    "RightHip": ("right_hip", "right_knee"),
    "RightKnee": ("right_knee", "right_ankle"),
    "RightAnkle": ("right_ankle", "right_foot_index"),
    "RightToe": ("right_heel", "right_foot_index"),
}


AVATAR_REST_DIR = np.asarray([0.0, 1.0, 0.0], dtype=np.float64)
AVATAR_ROOT_BONES = {"spine"}
AVATAR_BONE_ORDER = [
    "spine",
    "spine.001",
    "spine.002",
    "spine.003",
    "spine.004",
    "shoulder.L",
    "upper_arm.L",
    "forearm.L",
    "hand.L",
    "shoulder.R",
    "upper_arm.R",
    "forearm.R",
    "hand.R",
    "thigh.L",
    "shin.L",
    "foot.L",
    "thigh.R",
    "shin.R",
    "foot.R",
]
AVATAR_BONE_PARENT = {
    "spine.001": "spine",
    "spine.002": "spine.001",
    "spine.003": "spine.002",
    "spine.004": "spine.003",
    "shoulder.L": "spine.003",
    "upper_arm.L": "shoulder.L",
    "forearm.L": "upper_arm.L",
    "hand.L": "forearm.L",
    "shoulder.R": "spine.003",
    "upper_arm.R": "shoulder.R",
    "forearm.R": "upper_arm.R",
    "hand.R": "forearm.R",
    "thigh.L": "spine",
    "shin.L": "thigh.L",
    "foot.L": "shin.L",
    "thigh.R": "spine",
    "shin.R": "thigh.R",
    "foot.R": "shin.R",
}
AVATAR_BONE_TARGETS = {
    "spine": ("hips", "shoulders"),
    "spine.001": ("hips", "shoulders"),
    "spine.002": ("hips", "shoulders"),
    "spine.003": ("hips", "neck"),
    "spine.004": ("neck", "head"),
    "shoulder.L": ("neck", "left_shoulder"),
    "upper_arm.L": ("left_shoulder", "left_elbow"),
    "forearm.L": ("left_elbow", "left_wrist"),
    "hand.L": ("left_wrist", "left_index"),
    "shoulder.R": ("neck", "right_shoulder"),
    "upper_arm.R": ("right_shoulder", "right_elbow"),
    "forearm.R": ("right_elbow", "right_wrist"),
    "hand.R": ("right_wrist", "right_index"),
    "thigh.L": ("left_hip", "left_knee"),
    "shin.L": ("left_knee", "left_ankle"),
    "foot.L": ("left_ankle", "left_foot_index"),
    "thigh.R": ("right_hip", "right_knee"),
    "shin.R": ("right_knee", "right_ankle"),
    "foot.R": ("right_ankle", "right_foot_index"),
}
SPINE_LOCAL_FACTORS = {
    "spine": 0.34,
    "spine.001": 0.24,
    "spine.002": 0.2,
    "spine.003": 0.16,
    "spine.004": 0.1,
}


def normalize_vector(vector: np.ndarray | None) -> np.ndarray | None:
    if vector is None:
        return None
    norm = float(np.linalg.norm(vector))
    if norm <= 1e-6:
        return None
    return vector / norm


def normalize_quat(quat: np.ndarray) -> np.ndarray:
    norm = float(np.linalg.norm(quat))
    if norm <= 1e-9:
        return np.asarray([0.0, 0.0, 0.0, 1.0], dtype=np.float64)
    return quat / norm


def quat_multiply(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return normalize_quat(
        np.asarray(
            [
                aw * bx + ax * bw + ay * bz - az * by,
                aw * by - ax * bz + ay * bw + az * bx,
                aw * bz + ax * by - ay * bx + az * bw,
                aw * bw - ax * bx - ay * by - az * bz,
            ],
            dtype=np.float64,
        )
    )


def quat_inverse(quat: np.ndarray) -> np.ndarray:
    x, y, z, w = normalize_quat(quat)
    return np.asarray([-x, -y, -z, w], dtype=np.float64)


def quat_from_unit_vectors(source: np.ndarray, target: np.ndarray) -> np.ndarray:
    source = normalize_vector(source)
    target = normalize_vector(target)
    if source is None or target is None:
        return np.asarray([0.0, 0.0, 0.0, 1.0], dtype=np.float64)

    dot = float(np.clip(np.dot(source, target), -1.0, 1.0))
    if dot < -0.999999:
        axis = np.cross(source, np.asarray([1.0, 0.0, 0.0], dtype=np.float64))
        if np.linalg.norm(axis) <= 1e-6:
            axis = np.cross(source, np.asarray([0.0, 0.0, 1.0], dtype=np.float64))
        axis = normalize_vector(axis)
        return np.asarray([axis[0], axis[1], axis[2], 0.0], dtype=np.float64)

    cross = np.cross(source, target)
    return normalize_quat(np.asarray([cross[0], cross[1], cross[2], 1.0 + dot], dtype=np.float64))


def quat_slerp(a: np.ndarray, b: np.ndarray, t: float) -> np.ndarray:
    a = normalize_quat(a)
    b = normalize_quat(b)
    dot = float(np.dot(a, b))
    if dot < 0.0:
        b = -b
        dot = -dot
    if dot > 0.9995:
        return normalize_quat(a + t * (b - a))
    theta_0 = math.acos(np.clip(dot, -1.0, 1.0))
    sin_theta_0 = math.sin(theta_0)
    theta = theta_0 * t
    sin_theta = math.sin(theta)
    s0 = math.cos(theta) - dot * sin_theta / sin_theta_0
    s1 = sin_theta / sin_theta_0
    return normalize_quat((s0 * a) + (s1 * b))


def quat_rotate_vector(quat: np.ndarray, vector: np.ndarray) -> np.ndarray:
    quat = normalize_quat(quat)
    q_xyz = quat[:3]
    t = 2.0 * np.cross(q_xyz, vector)
    return vector + (quat[3] * t) + np.cross(q_xyz, t)


@dataclass
class AvatarBoneRest:
    name: str
    parent: str | None
    local_quat: np.ndarray
    world_quat: np.ndarray
    world_pos: np.ndarray
    rest_dir: np.ndarray


def read_glb_json(glb_path: Path) -> dict[str, Any]:
    data = glb_path.read_bytes()
    if len(data) < 20:
        raise SystemExit(f"Invalid GLB file: {glb_path}")
    magic, _version, _length = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67:
        raise SystemExit(f"Avatar model is not a GLB file: {glb_path}")

    offset = 12
    while offset + 8 <= len(data):
        chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        chunk = data[offset : offset + chunk_length]
        offset += chunk_length
        if chunk_type == 0x4E4F534A:
            return json.loads(chunk.decode("utf-8"))
    raise SystemExit(f"Avatar GLB did not contain a JSON chunk: {glb_path}")


def load_avatar_rest_skeleton(glb_path: Path) -> dict[str, AvatarBoneRest]:
    doc = read_glb_json(glb_path)
    nodes = doc.get("nodes", [])
    parent_by_index: dict[int, int] = {}
    for index, node in enumerate(nodes):
        for child_index in node.get("children", []) or []:
            parent_by_index[int(child_index)] = index

    name_by_index = {index: node.get("name", "") for index, node in enumerate(nodes)}
    index_by_name = {name: index for index, name in name_by_index.items() if name}
    missing = [bone for bone in AVATAR_BONE_ORDER if bone not in index_by_name]
    if missing:
        raise SystemExit(f"Avatar model is missing expected bones: {', '.join(missing)}")

    world_pos_by_index: dict[int, np.ndarray] = {}
    world_quat_by_index: dict[int, np.ndarray] = {}

    def compute_world(index: int) -> tuple[np.ndarray, np.ndarray]:
        if index in world_pos_by_index and index in world_quat_by_index:
            return world_pos_by_index[index], world_quat_by_index[index]
        node = nodes[index]
        local_pos = np.asarray(node.get("translation", [0.0, 0.0, 0.0]), dtype=np.float64)
        local_quat = normalize_quat(np.asarray(node.get("rotation", [0.0, 0.0, 0.0, 1.0]), dtype=np.float64))
        parent_index = parent_by_index.get(index)
        if parent_index is None:
            world_pos = local_pos
            world_quat = local_quat
        else:
            parent_pos, parent_quat = compute_world(parent_index)
            world_pos = parent_pos + quat_rotate_vector(parent_quat, local_pos)
            world_quat = quat_multiply(parent_quat, local_quat)
        world_pos_by_index[index] = world_pos
        world_quat_by_index[index] = world_quat
        return world_pos, world_quat

    for bone_name in AVATAR_BONE_ORDER:
        compute_world(index_by_name[bone_name])

    child_names_by_parent: dict[str, list[str]] = {}
    for child_name, parent_name in AVATAR_BONE_PARENT.items():
        child_names_by_parent.setdefault(parent_name, []).append(child_name)

    rest: dict[str, AvatarBoneRest] = {}
    for bone_name in AVATAR_BONE_ORDER:
        bone_index = index_by_name[bone_name]
        node = nodes[bone_index]
        local_quat = normalize_quat(np.asarray(node.get("rotation", [0.0, 0.0, 0.0, 1.0]), dtype=np.float64))
        world_pos, world_quat = compute_world(bone_index)
        child_candidates = child_names_by_parent.get(bone_name, [])
        child_index = next((index_by_name[name] for name in child_candidates if name in index_by_name), None)
        if child_index is None:
            direct_children = node.get("children", []) or []
            child_index = int(direct_children[0]) if direct_children else None
        if child_index is None:
            rest_dir = normalize_vector(quat_rotate_vector(world_quat, AVATAR_REST_DIR))
        else:
            child_pos, _child_quat = compute_world(child_index)
            rest_dir = normalize_vector(child_pos - world_pos)
        if rest_dir is None:
            rest_dir = np.asarray([0.0, 1.0, 0.0], dtype=np.float64)
        rest[bone_name] = AvatarBoneRest(
            name=bone_name,
            parent=AVATAR_BONE_PARENT.get(bone_name),
            local_quat=local_quat,
            world_quat=world_quat,
            world_pos=world_pos,
            rest_dir=rest_dir,
        )
    return rest


def torso_direction_from_metrics(frame: FrameResult, points: dict[str, np.ndarray]) -> np.ndarray | None:
    lean_values = [
        float(metrics["torso_lean_deg"])
        for metrics in frame.metrics_by_side.values()
        if metrics.get("torso_lean_deg") is not None and math.isfinite(float(metrics["torso_lean_deg"]))
    ]
    if not lean_values:
        return None

    lean_deg = max(0.0, min(55.0, float(sum(lean_values) / len(lean_values)) * 1.25))
    lateral = 0.0
    if points.get("shoulders") is not None and points.get("hips") is not None:
        lateral = float(np.clip((points["shoulders"][0] - points["hips"][0]) * 1.8, -0.35, 0.35))
    pitch = math.radians(lean_deg)
    return normalize_vector(np.asarray([lateral, math.cos(pitch), -math.sin(pitch)], dtype=np.float64))


def avatar_pose_frame(
    frame: FrameResult,
    origin: np.ndarray,
    previous_bones: dict[str, list[float]],
    rest_skeleton: dict[str, AvatarBoneRest],
) -> tuple[dict[str, Any], dict[str, list[float]]]:
    points = bvh_point_dict(frame.world_landmarks)
    if not points:
        return {
            "root": [0.0, 0.0, 0.0],
            "bones": previous_bones,
        }, previous_bones

    hips = points.get("hips", origin)
    root_delta = (hips - origin).astype(float)
    root = [
        round(float(root_delta[0]) * 0.45, 6),
        round(float(root_delta[1]) * 0.45, 6),
        round(float(root_delta[2]) * 0.28, 6),
    ]

    world_quats: dict[str, np.ndarray] = {}
    local_quats: dict[str, list[float]] = {}
    torso_direction = torso_direction_from_metrics(frame, points)
    for bone_name in AVATAR_BONE_ORDER:
        rest = rest_skeleton[bone_name]
        start_name, end_name = AVATAR_BONE_TARGETS[bone_name]
        target_dir = None
        if bone_name.startswith("spine") and torso_direction is not None:
            target_dir = torso_direction
        elif start_name in points and end_name in points and points[start_name] is not None and points[end_name] is not None:
            target_dir = normalize_vector(points[end_name] - points[start_name])

        parent_name = rest.parent
        if parent_name is None:
            parent_world = np.asarray([0.0, 0.0, 0.0, 1.0], dtype=np.float64)
        else:
            parent_world = world_quats.get(parent_name, rest_skeleton[parent_name].world_quat)
        if target_dir is None:
            local_quat = np.asarray(previous_bones.get(bone_name, rest.local_quat.tolist()), dtype=np.float64)
            world_quat = quat_multiply(parent_world, local_quat)
        elif bone_name in SPINE_LOCAL_FACTORS:
            delta_world = quat_from_unit_vectors(rest.rest_dir, target_dir)
            desired_world = quat_multiply(delta_world, rest.world_quat)
            desired_local = quat_multiply(quat_inverse(parent_world), desired_world)
            local_quat = quat_slerp(rest.local_quat, desired_local, SPINE_LOCAL_FACTORS[bone_name])
            world_quat = quat_multiply(parent_world, local_quat)
        else:
            delta_world = quat_from_unit_vectors(rest.rest_dir, target_dir)
            desired_world = quat_multiply(delta_world, rest.world_quat)
            local_quat = quat_multiply(quat_inverse(parent_world), desired_world)
            world_quat = quat_multiply(parent_world, local_quat)

        local_quat = normalize_quat(local_quat)
        local_quats[bone_name] = [round(float(value), 6) for value in local_quat.tolist()]
        world_quats[bone_name] = world_quat

    return {
        "root": root,
        "bones": local_quats,
    }, local_quats


def write_avatar_motion_json(
    sequence: dict[str, Any],
    output_path: Path,
    target_fps: float,
    model_path: str,
    source_label: str,
    rest_skeleton: dict[str, AvatarBoneRest],
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    origin = first_valid_bvh_origin(sequence)
    previous_bones = {bone_name: rest_skeleton[bone_name].local_quat.tolist() for bone_name in AVATAR_BONE_ORDER}
    frames: list[dict[str, Any]] = []
    for frame in sequence["frames"]:
        pose_frame, previous_bones = avatar_pose_frame(frame, origin, previous_bones, rest_skeleton)
        frames.append(pose_frame)

    payload = {
        "fps": target_fps,
        "source": source_label,
        "model": model_path,
        "coordinate_system": "mediapipe_world_to_three_y_up",
        "motion_space": "male_base_mesh_local_quaternion",
        "bones": AVATAR_BONE_ORDER,
        "frames": frames,
    }
    output_path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def build_bvh_values(
    frame: FrameResult,
    channel_order: list[tuple[str, str]],
    origin: np.ndarray,
    previous_values: list[float],
) -> list[float]:
    points = bvh_point_dict(frame.world_landmarks)
    if not points:
        return previous_values[:]

    rotations = {
        joint: vector_to_bvh_euler(points.get(start), points.get(end))
        for joint, (start, end) in BVH_VECTOR_MAP.items()
    }
    hips = points.get("hips", origin)
    root_position = (hips - origin) * 100.0
    root_values = {
        "Xposition": float(root_position[0]),
        "Yposition": float(30.0 + root_position[1]),
        "Zposition": float(root_position[2]),
    }

    values: list[float] = []
    for joint, channel in channel_order:
        if joint == "hips" and channel.endswith("position"):
            values.append(root_values.get(channel, 0.0))
        else:
            values.append(rotations.get(joint, {}).get(channel, 0.0))
    return values


def first_valid_bvh_origin(sequence: dict[str, Any]) -> np.ndarray:
    for frame in sequence["frames"]:
        points = bvh_point_dict(frame.world_landmarks)
        if "hips" in points:
            return points["hips"]
    return np.zeros(3, dtype=np.float64)


def write_sequence_bvh(sequence: dict[str, Any], output_path: Path, hierarchy_text: str, target_fps: float) -> None:
    channel_order = parse_bvh_channels(hierarchy_text)
    if not channel_order:
        raise SystemExit("BVH hierarchy did not contain channel definitions.")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    origin = first_valid_bvh_origin(sequence)
    previous_values = [0.0] * len(channel_order)
    motion_frames: list[list[float]] = []
    for frame in sequence["frames"]:
        values = build_bvh_values(frame, channel_order, origin, previous_values)
        previous_values = values
        motion_frames.append(values)

    with output_path.open("w", encoding="utf-8", newline="\n") as file:
        file.write(hierarchy_text)
        file.write("MOTION\n")
        file.write(f"Frames: {len(motion_frames)}\n")
        file.write(f"Frame Time: {1.0 / target_fps:.6f}\n")
        for values in motion_frames:
            file.write(" ".join(f"{value:.6f}" for value in values) + "\n")


def write_motion_assets(correct: dict[str, Any], wrong: dict[str, Any], output_dir: Path, media_dir: Path, target_fps: float) -> dict[str, Any]:
    hierarchy_text = load_bvh_hierarchy(output_dir)
    motion_dir = media_dir / "motions"
    user_pose_path = motion_dir / "user_pose_20fps.bvh"
    user_legacy_path = motion_dir / "user_bvh.bvh"
    correct_pose_path = motion_dir / "correct_pose_20fps.bvh"
    user_avatar_motion_path = motion_dir / "user_avatar_motion.json"
    correct_avatar_motion_path = motion_dir / "correct_avatar_motion.json"
    avatar_model_path = media_dir / "avatar" / "male_base_mesh.glb"
    rest_skeleton = load_avatar_rest_skeleton(avatar_model_path)

    write_sequence_bvh(wrong, user_pose_path, hierarchy_text, target_fps)
    write_sequence_bvh(wrong, user_legacy_path, hierarchy_text, target_fps)
    write_sequence_bvh(correct, correct_pose_path, hierarchy_text, target_fps)
    write_avatar_motion_json(wrong, user_avatar_motion_path, target_fps, "media/avatar/male_base_mesh.glb", "wrong.mp4", rest_skeleton)
    write_avatar_motion_json(correct, correct_avatar_motion_path, target_fps, "media/avatar/male_base_mesh.glb", "correct.mp4", rest_skeleton)

    return {
        "fps": target_fps,
        "user_bvh": "media/motions/user_pose_20fps.bvh",
        "user_legacy_bvh": "media/motions/user_bvh.bvh",
        "correct_bvh": "media/motions/correct_pose_20fps.bvh",
        "user_avatar_motion": "media/motions/user_avatar_motion.json",
        "correct_avatar_motion": "media/motions/correct_avatar_motion.json",
        "avatar_model": "media/avatar/male_base_mesh.glb",
        "mapping": "mediapipe_pose_world_landmarks_to_male_base_mesh_bones",
    }


def draw_gradient_background(image: Any) -> None:
    from PIL import ImageDraw

    width, height = image.size
    pixels = image.load()
    for y in range(height):
        for x in range(width):
            dx = (x - width * 0.42) / width
            dy = (y - height * 0.32) / height
            glow = max(0.0, 1.0 - math.sqrt(dx * dx + dy * dy) * 2.2)
            base = 9 + int(glow * 24)
            blue = 20 + int(glow * 58)
            pixels[x, y] = (base, base + 8, blue, 255)

    draw = ImageDraw.Draw(image, "RGBA")
    for y in range(int(height * 0.68), height, 28):
        alpha = max(8, int(42 * (1 - (y - height * 0.68) / (height * 0.32))))
        draw.line([(0, y), (width, y)], fill=(87, 206, 255, alpha), width=2)
    for x in range(-width, width * 2, 68):
        draw.line([(x, height), (x + width * 0.52, int(height * 0.68))], fill=(87, 206, 255, 18), width=2)


def draw_capsule(draw: Any, start: tuple[float, float], end: tuple[float, float], width: int, fill: tuple[int, int, int, int]) -> None:
    draw.line([start, end], fill=fill, width=width)
    radius = width / 2
    for point in (start, end):
        draw.ellipse(
            [point[0] - radius, point[1] - radius, point[0] + radius, point[1] + radius],
            fill=fill,
        )


def draw_avatar_card(output_path: Path, pose: dict[str, tuple[float, float]], accent: tuple[int, int, int, int]) -> None:
    from PIL import Image, ImageDraw, ImageFilter

    size = 900
    image = Image.new("RGBA", (size, size), (5, 9, 14, 255))
    draw_gradient_background(image)

    shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow, "RGBA")
    for a, b, width in [
        ("hip", "shoulder", 92),
        ("shoulder", "head", 78),
        ("l_shoulder", "l_elbow", 58),
        ("l_elbow", "l_wrist", 48),
        ("r_shoulder", "r_elbow", 58),
        ("r_elbow", "r_wrist", 48),
        ("l_hip", "l_knee", 64),
        ("l_knee", "l_ankle", 54),
        ("r_hip", "r_knee", 64),
        ("r_knee", "r_ankle", 54),
    ]:
        draw_capsule(shadow_draw, pose[a], pose[b], width + 18, (0, 0, 0, 96))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    image.alpha_composite(shadow)

    avatar = Image.new("RGBA", image.size, (0, 0, 0, 0))
    avatar_draw = ImageDraw.Draw(avatar, "RGBA")
    limb = (239, 249, 255, 236)
    core = (248, 252, 255, 245)
    glow = accent

    for a, b, width in [
        ("l_shoulder", "l_elbow", 54),
        ("l_elbow", "l_wrist", 44),
        ("r_shoulder", "r_elbow", 54),
        ("r_elbow", "r_wrist", 44),
        ("l_hip", "l_knee", 60),
        ("l_knee", "l_ankle", 50),
        ("r_hip", "r_knee", 60),
        ("r_knee", "r_ankle", 50),
    ]:
        draw_capsule(avatar_draw, pose[a], pose[b], width + 16, (glow[0], glow[1], glow[2], 42))
        draw_capsule(avatar_draw, pose[a], pose[b], width, limb)

    draw_capsule(avatar_draw, pose["hip"], pose["shoulder"], 86, core)
    draw_capsule(avatar_draw, pose["shoulder"], pose["head"], 62, core)
    hx, hy = pose["head"]
    avatar_draw.ellipse([hx - 58, hy - 58, hx + 58, hy + 58], fill=(248, 252, 255, 248))
    avatar_draw.ellipse([hx - 38, hy - 54, hx + 46, hy + 42], fill=(228, 242, 250, 160))

    avatar = avatar.filter(ImageFilter.UnsharpMask(radius=2, percent=120, threshold=3))
    image.alpha_composite(avatar)

    image.save(output_path)


def write_exercise_card_assets(media_dir: Path) -> dict[str, str]:
    exercise_dir = media_dir / "exercises"
    exercise_dir.mkdir(parents=True, exist_ok=True)
    poses = {
        "squat": {
            "head": (450, 210),
            "shoulder": (450, 330),
            "hip": (450, 500),
            "l_shoulder": (360, 340),
            "l_elbow": (305, 470),
            "l_wrist": (270, 610),
            "r_shoulder": (540, 340),
            "r_elbow": (595, 470),
            "r_wrist": (630, 610),
            "l_hip": (388, 510),
            "l_knee": (315, 665),
            "l_ankle": (260, 790),
            "r_hip": (512, 510),
            "r_knee": (585, 665),
            "r_ankle": (640, 790),
        },
        "deadlift": {
            "head": (468, 222),
            "shoulder": (440, 350),
            "hip": (520, 520),
            "l_shoulder": (360, 365),
            "l_elbow": (360, 525),
            "l_wrist": (360, 690),
            "r_shoulder": (520, 335),
            "r_elbow": (520, 520),
            "r_wrist": (520, 690),
            "l_hip": (450, 535),
            "l_knee": (390, 680),
            "l_ankle": (340, 802),
            "r_hip": (590, 505),
            "r_knee": (650, 670),
            "r_ankle": (690, 802),
        },
        "lunge": {
            "head": (450, 200),
            "shoulder": (450, 322),
            "hip": (465, 500),
            "l_shoulder": (365, 330),
            "l_elbow": (300, 455),
            "l_wrist": (250, 585),
            "r_shoulder": (535, 330),
            "r_elbow": (600, 455),
            "r_wrist": (650, 585),
            "l_hip": (405, 510),
            "l_knee": (285, 635),
            "l_ankle": (205, 790),
            "r_hip": (525, 500),
            "r_knee": (640, 710),
            "r_ankle": (735, 805),
        },
        "press": {
            "head": (450, 245),
            "shoulder": (450, 365),
            "hip": (450, 555),
            "l_shoulder": (365, 365),
            "l_elbow": (315, 215),
            "l_wrist": (300, 90),
            "r_shoulder": (535, 365),
            "r_elbow": (585, 215),
            "r_wrist": (600, 90),
            "l_hip": (390, 570),
            "l_knee": (380, 700),
            "l_ankle": (360, 820),
            "r_hip": (510, 570),
            "r_knee": (520, 700),
            "r_ankle": (540, 820),
        },
    }
    output: dict[str, str] = {}
    for index, (exercise, pose) in enumerate(poses.items()):
        path = exercise_dir / f"{exercise}-avatar.png"
        draw_avatar_card(path, pose, (87, 206, 255, 255) if index != 2 else (122, 234, 179, 255))
        output[exercise] = f"media/exercises/{exercise}-avatar.png"
    return output


def build_payload(correct: dict[str, Any], wrong: dict[str, Any], comparison: dict[str, Any], media_payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "brand": {
            "name": "WorkWith",
            "tagline": "Single-camera 3D motion coaching",
        },
        "overview": build_overview(comparison, wrong),
        "input_videos": {
            "correct": serialize_sequence(correct),
            "wrong": serialize_sequence(wrong),
        },
        "landmark_index": LANDMARK_INDEX,
        "connections": CONNECTIONS,
        "issue_segments": comparison["issue_segments"],
        "frames": comparison["frames"],
        "report": build_report(comparison),
        "media": media_payload,
    }


def main() -> None:
    args = parse_args()
    output_dir = args.output_dir.resolve()
    data_dir, media_dir = ensure_directories(output_dir)

    correct = detect_pose_sequence(args.correct.resolve(), "correct", args.target_fps)
    wrong = detect_pose_sequence(args.wrong.resolve(), "wrong", args.target_fps)
    side = wrong["primary_side"]
    comparison = compare_sequences(correct, wrong, side)

    overlay_path = media_dir / "wrong_overlay.mp4"
    frame_dir = media_dir / "frames"
    media_payload = render_overlay_frames(args.wrong.resolve(), comparison, overlay_path, frame_dir, wrong["sampled_fps"])
    copy_media_file(args.correct.resolve(), media_dir / "correct.mp4")
    copy_media_file(args.wrong.resolve(), media_dir / "wrong.mp4")
    media_payload.update(
        {
            "reference_video": "media/correct.mp4",
            "source_user_video": "media/wrong.mp4",
            "motions": write_motion_assets(correct, wrong, output_dir, media_dir, args.target_fps),
            "exercise_cards": write_exercise_card_assets(media_dir),
        }
    )

    payload = build_payload(correct, wrong, comparison, media_payload)
    rounded_payload = round_nested(payload)
    analysis_path = data_dir / "session-data.json"
    analysis_path.write_text(
        json.dumps(rounded_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    inline_path = data_dir / "session-data.js"
    inline_path.write_text(
        "window.__WORKWITH_DATA__ = " + json.dumps(rounded_payload, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )

    print(f"Session data written to {analysis_path}")
    print(f"Inline session data written to {inline_path}")
    print(f"Overlay video written to {overlay_path}")
    print(f"Motion BVH files written to {media_dir / 'motions'}")


if __name__ == "__main__":
    main()
