const WARNING_SCORE_THRESHOLD = 76;
const VOICE_SCORE_THRESHOLD = 72;
const VOICE_MIN_GAP_MS = 8000;
const VOICE_REPEAT_GAP_MS = 14000;
const VOICE_STABLE_FRAMES = 4;
const BLINK_INTERVAL_MS = 280;

const GROUND_JOINT_NAMES = [
  "left_ankle",
  "right_ankle",
  "left_heel",
  "right_heel",
  "left_foot_index",
  "right_foot_index",
];

const FACE_JOINT_NAMES = [
  "nose",
  "left_eye",
  "right_eye",
  "left_ear",
  "right_ear",
];

const PRIMARY_METRIC_IDS = new Set([
  "match_rate",
  "hip_hinge_norm",
  "knee_forward_norm",
  "balance_offset_norm",
  "heel_lift_norm",
  "posterior_chain_score",
]);

const ISSUE_HOT_NAMES = {
  hip_hinge: (side) => [`${side}_hip`, `${side}_shoulder`, `${side}_knee`],
  knee_drive: (side) => [`${side}_hip`, `${side}_knee`, `${side}_ankle`, `${side}_foot_index`],
  balance: () => ["left_shoulder", "right_shoulder", "left_hip", "right_hip"],
  heel_pressure: (side) => [`${side}_ankle`, `${side}_heel`, `${side}_foot_index`],
  posterior_chain: (side) => [`${side}_hip`, `${side}_knee`, `${side}_heel`],
};

const avatarPalette = {
  live: {
    fill0: "rgba(255, 255, 255, 0.46)",
    fill1: "rgba(255, 255, 255, 0.30)",
    fill2: "rgba(255, 255, 255, 0.18)",
    edge: "rgba(255, 255, 255, 0.16)",
    glow: "rgba(255, 255, 255, 0.10)",
    joint: "rgba(255, 255, 255, 0.42)",
    hot0: "rgba(255, 183, 173, 0.96)",
    hot1: "rgba(255, 106, 96, 0.98)",
    hotEdge: "rgba(255, 227, 223, 0.64)",
    hotGlow: "rgba(255, 106, 96, 0.46)",
  },
  reference: {
    fill0: "rgba(87, 206, 255, 0.30)",
    fill1: "rgba(66, 168, 255, 0.18)",
    fill2: "rgba(43, 105, 255, 0.12)",
    edge: "rgba(127, 218, 255, 0.20)",
    glow: "rgba(87, 206, 255, 0.12)",
    joint: "rgba(180, 234, 255, 0.22)",
    hot0: "rgba(87, 206, 255, 0.30)",
    hot1: "rgba(43, 105, 255, 0.16)",
    hotEdge: "rgba(127, 218, 255, 0.20)",
    hotGlow: "rgba(87, 206, 255, 0.12)",
  },
};

const state = {
  data: null,
  scoreBuckets: new Map(),
  analysisBuckets: new Map(),
  currentFrame: null,
  voiceEnabled: false,
  avatar: null,
  imageCache: new Map(),
  preloadWindow: 18,
  resizeTimerId: null,
  session: {
    passIndex: 0,
    totalPasses: 2,
  },
  player: {
    isPlaying: false,
    timerId: null,
    index: 0,
    fps: 10,
  },
  voice: {
    candidateIssueId: null,
    stableCount: 0,
    lastSpokenIssueId: null,
    lastSpokenAt: 0,
  },
};

const elements = {
  overlayFrame: document.getElementById("overlayFrame"),
  currentIssue: document.getElementById("currentIssue"),
  scoreValue: document.getElementById("scoreValue"),
  playToggle: document.getElementById("playToggle"),
  voiceToggle: document.getElementById("voiceToggle"),
  phaseLabel: document.getElementById("phaseLabel"),
  averageScore: document.getElementById("averageScore"),
  repCount: document.getElementById("repCount"),
  matchValue: document.getElementById("matchValue"),
  issueCount: document.getElementById("issueCount"),
  summaryText: document.getElementById("summaryText"),
  coachText: document.getElementById("coachText"),
  sessionStateSection: document.getElementById("sessionStateSection"),
  liveMetricsSection: document.getElementById("liveMetricsSection"),
  liveMetricsLabel: document.getElementById("liveMetricsLabel"),
  issueListSection: document.getElementById("issueListSection"),
  issueList: document.getElementById("issueList"),
  metricGrid: document.getElementById("metricGrid"),
  reportSection: document.getElementById("reportSection"),
  finalMetricGrid: document.getElementById("finalMetricGrid"),
  reportStatus: document.getElementById("reportStatus"),
  expertGrid: document.getElementById("expertGrid"),
  medicalStatus: document.getElementById("medicalStatus"),
  medicalDetail: document.getElementById("medicalDetail"),
  trainerStatus: document.getElementById("trainerStatus"),
  trainerDetail: document.getElementById("trainerDetail"),
  timeline: document.getElementById("timeline"),
  avatarViewport: document.getElementById("avatarViewport"),
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function fmt(value, digits = 1, suffix = "") {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : "--";
}

function median(values) {
  const filtered = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!filtered.length) return null;
  const mid = Math.floor(filtered.length / 2);
  return filtered.length % 2 ? filtered[mid] : (filtered[mid - 1] + filtered[mid]) * 0.5;
}

function vecAdd(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

function vecSub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

function vecScale(v, scale) {
  return { x: v.x * scale, y: v.y * scale };
}

function vecLength(v) {
  return Math.hypot(v.x, v.y);
}

function vecNormalize(v, fallback = { x: 0, y: 1 }) {
  const length = vecLength(v);
  if (length < 1e-4) return fallback;
  return { x: v.x / length, y: v.y / length };
}

function vecPerp(v) {
  return { x: -v.y, y: v.x };
}

function vecDot(a, b) {
  return a.x * b.x + a.y * b.y;
}

function vecLerp(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function averagePoints(points) {
  const valid = points.filter(Boolean);
  if (!valid.length) return null;
  const total = valid.reduce(
    (acc, point) => ({
      x: acc.x + point.x,
      y: acc.y + point.y,
    }),
    { x: 0, y: 0 },
  );
  return {
    x: total.x / valid.length,
    y: total.y / valid.length,
  };
}

function getLandmarkIndex(name) {
  return state.data.landmark_index[name];
}

function cloneLandmarks(landmarks) {
  return landmarks.map((point) => [
    point[0] ?? 0,
    point[1] ?? 0,
    point[2] ?? 0,
    point[3] ?? 1,
  ]);
}

function getJointPoint(landmarks, name) {
  const index = getLandmarkIndex(name);
  return Number.isInteger(index) && landmarks?.[index] ? landmarks[index] : null;
}

function averageWorldPoints(landmarks, names) {
  const points = names.map((name) => getJointPoint(landmarks, name)).filter(Boolean);
  if (!points.length) return null;
  return {
    x: points.reduce((sum, point) => sum + point[0], 0) / points.length,
    y: points.reduce((sum, point) => sum + point[1], 0) / points.length,
    z: points.reduce((sum, point) => sum + point[2], 0) / points.length,
  };
}

function buildScoreBuckets(frames) {
  const buckets = new Map();
  frames.forEach((frame) => {
    const second = Math.floor(frame.time_sec);
    const current = buckets.get(second) || { sum: 0, count: 0 };
    current.sum += frame.score;
    current.count += 1;
    buckets.set(second, current);
  });
  buckets.forEach((bucket, second) => {
    buckets.set(second, { ...bucket, avg: bucket.sum / bucket.count });
  });
  return buckets;
}

function buildAnalysisBuckets(frames) {
  const buckets = new Map();

  frames.forEach((frame) => {
    const second = Math.floor(frame.time_sec);
    const bucket = buckets.get(second) || {
      second,
      count: 0,
      scoreSum: 0,
      repCount: 1,
      issueCountSum: 0,
      issueMap: new Map(),
      metricMap: new Map(),
    };

    bucket.count += 1;
    bucket.scoreSum += frame.score || 0;
    bucket.repCount = Math.max(bucket.repCount, frame.rep_index || 1);
    bucket.issueCountSum += (frame.issues || []).length;

    (frame.issues || []).forEach((issue) => {
      const current = bucket.issueMap.get(issue.id) || {
        id: issue.id,
        label: issue.label,
        severitySum: 0,
        hits: 0,
      };
      current.severitySum += issue.severity || 0;
      current.hits += 1;
      bucket.issueMap.set(issue.id, current);
    });

    (frame.analysis_metrics || []).forEach((metric) => {
      if (!PRIMARY_METRIC_IDS.has(metric.id)) return;
      const current = bucket.metricMap.get(metric.id) || {
        id: metric.id,
        label: metric.label,
        unit: metric.unit || "",
        valueSum: 0,
        valueCount: 0,
        referenceSum: 0,
        referenceCount: 0,
        deltaSum: 0,
        deltaCount: 0,
      };

      if (typeof metric.value === "number" && Number.isFinite(metric.value)) {
        current.valueSum += metric.value;
        current.valueCount += 1;
      }
      if (typeof metric.reference === "number" && Number.isFinite(metric.reference)) {
        current.referenceSum += metric.reference;
        current.referenceCount += 1;
      }
      if (typeof metric.delta === "number" && Number.isFinite(metric.delta)) {
        current.deltaSum += metric.delta;
        current.deltaCount += 1;
      }
      bucket.metricMap.set(metric.id, current);
    });

    buckets.set(second, bucket);
  });

  const orderedSeconds = [...buckets.keys()].sort((a, b) => a - b);
  let cumulativeScore = 0;
  let cumulativeFrames = 0;
  let cumulativeRepCount = 1;

  orderedSeconds.forEach((second) => {
    const bucket = buckets.get(second);
    cumulativeScore += bucket.scoreSum;
    cumulativeFrames += bucket.count;
    cumulativeRepCount = Math.max(cumulativeRepCount, bucket.repCount);

    const metrics = [...bucket.metricMap.values()].map((metric) => ({
      id: metric.id,
      label: metric.label,
      unit: metric.unit,
      value: metric.valueCount ? metric.valueSum / metric.valueCount : null,
      reference: metric.referenceCount ? metric.referenceSum / metric.referenceCount : null,
      delta: metric.deltaCount ? metric.deltaSum / metric.deltaCount : null,
    }));

    const topIssue = [...bucket.issueMap.values()]
      .map((issue) => ({
        id: issue.id,
        label: issue.label,
        severity: issue.hits ? issue.severitySum / issue.hits : 0,
      }))
      .sort((a, b) => b.severity - a.severity)[0] || null;

    buckets.set(second, {
      avgScore: bucket.scoreSum / Math.max(bucket.count, 1),
      runningAvgScore: cumulativeScore / Math.max(cumulativeFrames, 1),
      repCount: cumulativeRepCount,
      issueCount: Math.round(bucket.issueCountSum / Math.max(bucket.count, 1)),
      topIssue,
      metrics,
    });
  });

  return buckets;
}

function isReportPass() {
  return state.session.passIndex >= 1;
}

function resetSessionProgress() {
  state.session.passIndex = 0;
  resetVoiceTracking();
}

function getDisplayedScore(frame) {
  const bucket = state.scoreBuckets.get(Math.floor(frame.time_sec));
  return bucket ? bucket.avg : frame.score;
}

function getFramePath(index) {
  const media = state.data.media;
  const padded = String(index).padStart(4, "0");
  return `${media.overlay_frame_dir}/${media.overlay_frame_pattern.replace("{index:04d}", padded)}`;
}

function preloadFrame(index) {
  if (!state.data || index < 0 || index >= state.data.frames.length || state.imageCache.has(index)) {
    return;
  }
  const image = new Image();
  image.decoding = "async";
  image.src = getFramePath(index);
  state.imageCache.set(index, image);
}

function preloadFramesAround(index) {
  const end = Math.min(state.data.frames.length - 1, index + state.preloadWindow);
  for (let frameIndex = index; frameIndex <= end; frameIndex += 1) {
    preloadFrame(frameIndex);
  }

  const keepFrom = Math.max(0, index - state.preloadWindow);
  state.imageCache.forEach((_, cachedIndex) => {
    if (cachedIndex < keepFrom) {
      state.imageCache.delete(cachedIndex);
    }
  });
}

function findNearestFrameIndex(timeSec) {
  const frames = state.data.frames;
  let low = 0;
  let high = frames.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (frames[mid].time_sec < timeSec) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const a = Math.max(0, high);
  const b = Math.min(frames.length - 1, low);
  return Math.abs(frames[a].time_sec - timeSec) <= Math.abs(frames[b].time_sec - timeSec) ? a : b;
}

function getHotJointNames(frame, issueId = null) {
  const names = new Set(frame?.highlighted_joint_names || []);
  if (issueId) {
    const primarySide = state.data.input_videos.wrong.primary_side || "left";
    const resolver = ISSUE_HOT_NAMES[issueId];
    (resolver ? resolver(primarySide) : []).forEach((name) => names.add(name));
  }
  return names;
}

function emaPass(sequence, alpha) {
  let previous = null;
  return sequence.map((landmarks) => {
    if (!landmarks) {
      return previous ? cloneLandmarks(previous) : null;
    }
    if (!previous) {
      previous = cloneLandmarks(landmarks);
      return cloneLandmarks(previous);
    }

    const next = cloneLandmarks(landmarks);
    landmarks.forEach((_, jointIndex) => {
      for (let coord = 0; coord < 4; coord += 1) {
        next[jointIndex][coord] =
          alpha * landmarks[jointIndex][coord] + (1 - alpha) * previous[jointIndex][coord];
      }
    });
    previous = cloneLandmarks(next);
    return next;
  });
}

function smoothSequence(sequence, alpha) {
  const forward = emaPass(sequence, alpha);
  const backward = emaPass([...sequence].reverse(), alpha).reverse();
  return sequence.map((landmarks, frameIndex) => {
    if (!landmarks) return null;
    const forwardFrame = forward[frameIndex];
    const backwardFrame = backward[frameIndex];
    if (!forwardFrame || !backwardFrame) return cloneLandmarks(landmarks);
    return landmarks.map((point, jointIndex) => [
      (forwardFrame[jointIndex][0] + backwardFrame[jointIndex][0]) * 0.5,
      (forwardFrame[jointIndex][1] + backwardFrame[jointIndex][1]) * 0.5,
      (forwardFrame[jointIndex][2] + backwardFrame[jointIndex][2]) * 0.5,
      (forwardFrame[jointIndex][3] + backwardFrame[jointIndex][3]) * 0.5,
    ]);
  });
}

function buildSupportInfo(landmarks) {
  const points = GROUND_JOINT_NAMES.map((name) => getJointPoint(landmarks, name)).filter(Boolean);
  if (!points.length) return null;
  return {
    groundY: Math.max(...points.map((point) => point[1])),
  };
}

function buildHeadInfo(landmarks) {
  const shoulders = averageWorldPoints(landmarks, ["left_shoulder", "right_shoulder"]);
  const hips = averageWorldPoints(landmarks, ["left_hip", "right_hip"]);
  if (!shoulders || !hips) return null;
  return {
    x: shoulders.x,
    y: shoulders.y - (hips.y - shoulders.y) * 0.62,
    z: shoulders.z,
  };
}

function buildRootInfo(landmarks) {
  return averageWorldPoints(landmarks, ["left_hip", "right_hip"]);
}

function distanceBetweenLandmarks(landmarks, a, b) {
  const pointA = getJointPoint(landmarks, a);
  const pointB = getJointPoint(landmarks, b);
  if (!pointA || !pointB) return null;
  return Math.hypot(pointA[0] - pointB[0], pointA[1] - pointB[1]);
}

function buildAvatarLayout(sequence) {
  const rootXs = [];
  const groundYs = [];
  const bodyHeights = [];
  const shoulderSpans = [];
  const hipSpans = [];
  const upperArms = [];
  const forearms = [];
  const thighs = [];
  const shins = [];

  sequence.forEach((landmarks) => {
    if (!landmarks) return;
    const support = buildSupportInfo(landmarks);
    const head = buildHeadInfo(landmarks);
    const root = buildRootInfo(landmarks);

    if (root) rootXs.push(root.x);
    if (support) groundYs.push(support.groundY);
    if (support && head) bodyHeights.push(support.groundY - head.y);
    shoulderSpans.push(distanceBetweenLandmarks(landmarks, "left_shoulder", "right_shoulder"));
    hipSpans.push(distanceBetweenLandmarks(landmarks, "left_hip", "right_hip"));
    upperArms.push(distanceBetweenLandmarks(landmarks, "left_shoulder", "left_elbow"));
    upperArms.push(distanceBetweenLandmarks(landmarks, "right_shoulder", "right_elbow"));
    forearms.push(distanceBetweenLandmarks(landmarks, "left_elbow", "left_wrist"));
    forearms.push(distanceBetweenLandmarks(landmarks, "right_elbow", "right_wrist"));
    thighs.push(distanceBetweenLandmarks(landmarks, "left_hip", "left_knee"));
    thighs.push(distanceBetweenLandmarks(landmarks, "right_hip", "right_knee"));
    shins.push(distanceBetweenLandmarks(landmarks, "left_knee", "left_ankle"));
    shins.push(distanceBetweenLandmarks(landmarks, "right_knee", "right_ankle"));
  });

  const bodyHeight = median(bodyHeights) || 1;
  return {
    centerX: median(rootXs) || 0,
    groundY: median(groundYs) || 0,
    bodyHeight,
    shoulderSpan: median(shoulderSpans) || bodyHeight * 0.2,
    hipSpan: median(hipSpans) || bodyHeight * 0.15,
    upperArm: median(upperArms) || bodyHeight * 0.18,
    forearm: median(forearms) || bodyHeight * 0.17,
    thigh: median(thighs) || bodyHeight * 0.24,
    shin: median(shins) || bodyHeight * 0.23,
  };
}

function prepareAvatarTrack(roleKey) {
  const inputKey = roleKey === "reference" ? "correct" : "wrong";
  const videoMeta = state.data.input_videos[inputKey] || {};
  const sourceWidth = videoMeta.width || 1080;
  const sourceHeight = videoMeta.height || 1920;

  const sequence = state.data.frames.map((frame) => {
    const landmarks = frame?.[roleKey]?.landmarks2d;
    if (!Array.isArray(landmarks) || !landmarks.length) return null;
    return landmarks.map((point) => [
      (point[0] ?? 0) * sourceWidth,
      (point[1] ?? 0) * sourceHeight,
      (point[2] ?? 0) * sourceWidth,
      point[3] ?? 1,
    ]);
  });

  const finalTrack = smoothSequence(smoothSequence(sequence, 0.72), 0.82);
  return {
    frames: finalTrack,
    layout: buildAvatarLayout(finalTrack),
  };
}

function fitLimbChain(start, middle, end, upperTarget, lowerTarget, fallbackDir) {
  if (!start) {
    return { middle, end };
  }

  const upperDirection = middle
    ? vecNormalize(vecSub(middle, start), fallbackDir)
    : end
      ? vecNormalize(vecSub(end, start), fallbackDir)
      : fallbackDir;
  const rawUpper = middle ? vecLength(vecSub(middle, start)) : upperTarget;
  const fittedUpper = clamp(rawUpper || upperTarget, upperTarget * 0.88, upperTarget * 1.18);
  const fittedMiddle = vecAdd(start, vecScale(upperDirection, fittedUpper));

  const lowerDirection = end
    ? vecNormalize(vecSub(end, middle || fittedMiddle), upperDirection)
    : upperDirection;
  const rawLower = end && middle ? vecLength(vecSub(end, middle)) : lowerTarget;
  const fittedLower = clamp(rawLower || lowerTarget, lowerTarget * 0.88, lowerTarget * 1.2);
  const fittedEnd = vecAdd(fittedMiddle, vecScale(lowerDirection, fittedLower));

  return {
    middle: fittedMiddle,
    end: fittedEnd,
  };
}

function buildProjectedFrame(landmarks, width, height, layout) {
  if (!Array.isArray(landmarks) || !landmarks.length) return null;

  const targetHeight = height * 0.64;
  const targetGroundY = height * 0.84;
  const targetCenterX = width * 0.5;
  const scale = clamp(targetHeight / Math.max(layout?.bodyHeight || 1, 1), 0.24, 0.52);
  const centerX = layout?.centerX ?? 0;
  const groundY = layout?.groundY ?? 0;

  const projected = landmarks.map((point) => ({
    x: (point[0] - centerX) * scale + targetCenterX,
    y: (point[1] - groundY) * scale + targetGroundY,
  }));

  const pick = (name) => {
    const index = getLandmarkIndex(name);
    return Number.isInteger(index) ? projected[index] : null;
  };

  const leftShoulder = pick("left_shoulder");
  const rightShoulder = pick("right_shoulder");
  const leftHip = pick("left_hip");
  const rightHip = pick("right_hip");
  const leftElbow = pick("left_elbow");
  const rightElbow = pick("right_elbow");
  const leftWrist = pick("left_wrist");
  const rightWrist = pick("right_wrist");
  const leftKnee = pick("left_knee");
  const rightKnee = pick("right_knee");
  const leftAnkle = pick("left_ankle");
  const rightAnkle = pick("right_ankle");
  const leftFoot = pick("left_foot_index");
  const rightFoot = pick("right_foot_index");

  const shoulderMid = averagePoints([leftShoulder, rightShoulder]);
  const hipMid = averagePoints([leftHip, rightHip]);
  if (!shoulderMid || !hipMid) return null;

  const torsoAxis = vecNormalize(vecSub(hipMid, shoulderMid), { x: 0, y: 1 });
  let lateralAxis = vecNormalize(
    vecSub(rightShoulder || shoulderMid, leftShoulder || shoulderMid),
    vecPerp(torsoAxis),
  );
  if (Math.abs(vecDot(torsoAxis, lateralAxis)) > 0.45) {
    lateralAxis = vecNormalize(vecPerp(torsoAxis), { x: 1, y: 0 });
  }

  const bodyHeight = clamp((layout?.bodyHeight || 1) * scale, height * 0.46, height * 0.7);
  const headUnit = clamp(bodyHeight / 8.1, height * 0.034, height * 0.06);
  const measuredShoulderHalf = vecLength(vecSub(rightShoulder || shoulderMid, leftShoulder || shoulderMid)) * 0.5;
  const measuredHipHalf = vecLength(vecSub(rightHip || hipMid, leftHip || hipMid)) * 0.5;
  const shoulderHalf = clamp(
    Math.max(measuredShoulderHalf, ((layout?.shoulderSpan || 0) * scale) * 0.5) * 1.02,
    headUnit * 0.78,
    headUnit * 1.22,
  );
  const hipHalf = clamp(
    Math.max(measuredHipHalf, ((layout?.hipSpan || 0) * scale) * 0.5) * 1.02,
    headUnit * 0.54,
    headUnit * 0.94,
  );

  const torso = {
    leftShoulder: vecAdd(shoulderMid, vecScale(lateralAxis, -shoulderHalf)),
    rightShoulder: vecAdd(shoulderMid, vecScale(lateralAxis, shoulderHalf)),
    leftHip: vecAdd(hipMid, vecScale(lateralAxis, -hipHalf)),
    rightHip: vecAdd(hipMid, vecScale(lateralAxis, hipHalf)),
  };
  torso.chestLeft = vecLerp(torso.leftShoulder, torso.leftHip, 0.24);
  torso.chestRight = vecLerp(torso.rightShoulder, torso.rightHip, 0.24);
  torso.waistLeft = vecLerp(torso.leftShoulder, torso.leftHip, 0.74);
  torso.waistRight = vecLerp(torso.rightShoulder, torso.rightHip, 0.74);
  torso.neck = shoulderMid;
  torso.sternum = vecLerp(shoulderMid, hipMid, 0.28);
  torso.headCenter = vecAdd(shoulderMid, vecScale(torsoAxis, -headUnit * 0.98));

  const leftArm = fitLimbChain(
    torso.leftShoulder,
    leftElbow,
    leftWrist,
    Math.max((layout?.upperArm || 0) * scale, headUnit * 1.45),
    Math.max((layout?.forearm || 0) * scale, headUnit * 1.42),
    vecNormalize(vecAdd(vecScale(lateralAxis, -1), vecScale(torsoAxis, 0.22)), { x: -1, y: 0 }),
  );
  const rightArm = fitLimbChain(
    torso.rightShoulder,
    rightElbow,
    rightWrist,
    Math.max((layout?.upperArm || 0) * scale, headUnit * 1.45),
    Math.max((layout?.forearm || 0) * scale, headUnit * 1.42),
    vecNormalize(vecAdd(vecScale(lateralAxis, 1), vecScale(torsoAxis, 0.22)), { x: 1, y: 0 }),
  );

  return {
    headUnit,
    torso,
    joints: {
      leftShoulder: torso.leftShoulder,
      rightShoulder: torso.rightShoulder,
      leftElbow: leftArm.middle,
      rightElbow: rightArm.middle,
      leftWrist: leftArm.end,
      rightWrist: rightArm.end,
      leftHip: torso.leftHip,
      rightHip: torso.rightHip,
      leftKnee,
      rightKnee,
      leftAnkle,
      rightAnkle,
      leftFoot,
      rightFoot,
    },
  };
}

function drawBackdrop(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);

  const background = ctx.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, "rgba(8, 12, 18, 1)");
  background.addColorStop(1, "rgba(4, 7, 11, 1)");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(87, 206, 255, 0.08)";
  ctx.lineWidth = 1;
  const horizonY = height * 0.28;
  const floorY = height * 0.86;
  for (let i = 0; i < 7; i += 1) {
    const t = i / 6;
    const y = horizonY + (floorY - horizonY) * (t * t);
    ctx.beginPath();
    ctx.moveTo(width * (0.18 - t * 0.08), y);
    ctx.lineTo(width * (0.82 + t * 0.08), y);
    ctx.stroke();
  }

  for (let i = 0; i < 7; i += 1) {
    const t = i / 6;
    const xLeft = width * (0.2 + t * 0.1);
    const xRight = width * (0.8 - t * 0.1);
    ctx.beginPath();
    ctx.moveTo(width * 0.5, horizonY);
    ctx.lineTo(xLeft, floorY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(width * 0.5, horizonY);
    ctx.lineTo(xRight, floorY);
    ctx.stroke();
  }
}

function drawCapsule(ctx, start, end, width, palette, isHot) {
  if (!start || !end) return;

  const gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
  if (isHot) {
    gradient.addColorStop(0, palette.hot0);
    gradient.addColorStop(1, palette.hot1);
  } else {
    gradient.addColorStop(0, palette.fill0);
    gradient.addColorStop(0.5, palette.fill1);
    gradient.addColorStop(1, palette.fill2);
  }

  ctx.save();
  ctx.strokeStyle = gradient;
  ctx.lineCap = "round";
  ctx.lineWidth = width;
  ctx.shadowBlur = isHot ? width * 0.46 : width * 0.2;
  ctx.shadowColor = isHot ? palette.hotGlow : palette.glow;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  ctx.fillStyle = isHot ? palette.hot1 : palette.joint;
  ctx.beginPath();
  ctx.arc(start.x, start.y, width * 0.26, 0, Math.PI * 2);
  ctx.arc(end.x, end.y, width * 0.26, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPolygon(ctx, points, palette, isHot) {
  const valid = points.filter(Boolean);
  if (valid.length < 3) return;

  const minX = Math.min(...valid.map((point) => point.x));
  const maxX = Math.max(...valid.map((point) => point.x));
  const minY = Math.min(...valid.map((point) => point.y));
  const maxY = Math.max(...valid.map((point) => point.y));
  const gradient = ctx.createLinearGradient(minX, minY, maxX, maxY);
  if (isHot) {
    gradient.addColorStop(0, palette.hot0);
    gradient.addColorStop(1, palette.hot1);
  } else {
    gradient.addColorStop(0, palette.fill0);
    gradient.addColorStop(0.55, palette.fill1);
    gradient.addColorStop(1, palette.fill2);
  }

  ctx.save();
  ctx.fillStyle = gradient;
  ctx.strokeStyle = isHot ? palette.hotEdge : palette.edge;
  ctx.lineWidth = 1.2;
  ctx.shadowBlur = isHot ? 18 : 8;
  ctx.shadowColor = isHot ? palette.hotGlow : palette.glow;
  ctx.beginPath();
  ctx.moveTo(valid[0].x, valid[0].y);
  for (let i = 1; i < valid.length; i += 1) {
    ctx.lineTo(valid[i].x, valid[i].y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawAdultFigure(ctx, frameData, hotNames, palette, isGhost = false) {
  if (!frameData) return;

  const blinkOn = !isGhost && state.avatar ? state.avatar.blinkVisible : true;
  const isHot = (...names) => blinkOn && names.some((name) => hotNames.has(name));
  const head = frameData.headUnit;
  const torso = frameData.torso;
  const joints = frameData.joints;

  ctx.save();
  if (isGhost) {
    ctx.globalAlpha = 0.92;
  }

  drawPolygon(ctx, [torso.leftShoulder, torso.rightShoulder, torso.chestRight, torso.chestLeft], palette, false);
  drawPolygon(
    ctx,
    [torso.chestLeft, torso.chestRight, torso.waistRight, torso.rightHip, torso.leftHip, torso.waistLeft],
    palette,
    false,
  );

  drawCapsule(ctx, joints.leftShoulder, joints.leftElbow, head * 0.33, palette, isHot("left_shoulder", "left_elbow"));
  drawCapsule(ctx, joints.leftElbow, joints.leftWrist, head * 0.27, palette, isHot("left_elbow", "left_wrist"));
  drawCapsule(ctx, joints.rightShoulder, joints.rightElbow, head * 0.33, palette, isHot("right_shoulder", "right_elbow"));
  drawCapsule(ctx, joints.rightElbow, joints.rightWrist, head * 0.27, palette, isHot("right_elbow", "right_wrist"));
  drawCapsule(ctx, joints.leftHip, joints.leftKnee, head * 0.46, palette, isHot("left_hip", "left_knee"));
  drawCapsule(ctx, joints.leftKnee, joints.leftAnkle, head * 0.36, palette, isHot("left_knee", "left_ankle"));
  drawCapsule(ctx, joints.rightHip, joints.rightKnee, head * 0.46, palette, isHot("right_hip", "right_knee"));
  drawCapsule(ctx, joints.rightKnee, joints.rightAnkle, head * 0.36, palette, isHot("right_knee", "right_ankle"));
  drawCapsule(ctx, joints.leftAnkle, joints.leftFoot, head * 0.17, palette, isHot("left_ankle", "left_heel", "left_foot_index"));
  drawCapsule(ctx, joints.rightAnkle, joints.rightFoot, head * 0.17, palette, isHot("right_ankle", "right_heel", "right_foot_index"));
  drawCapsule(ctx, torso.neck, torso.sternum, head * 0.16, palette, false);

  drawPolygon(
    ctx,
    [
      { x: torso.headCenter.x - head * 0.34, y: torso.headCenter.y - head * 0.24 },
      { x: torso.headCenter.x + head * 0.34, y: torso.headCenter.y - head * 0.24 },
      { x: torso.headCenter.x + head * 0.28, y: torso.headCenter.y + head * 0.48 },
      { x: torso.headCenter.x - head * 0.28, y: torso.headCenter.y + head * 0.48 },
    ],
    palette,
    false,
  );

  ctx.restore();
}

function ensureAvatarCanvas() {
  const canvas = document.createElement("canvas");
  canvas.className = "avatar-canvas";
  elements.avatarViewport.innerHTML = "";
  elements.avatarViewport.appendChild(canvas);
  return canvas;
}

function resizeAvatarCanvas() {
  if (!state.avatar) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(elements.avatarViewport.clientWidth * dpr));
  const height = Math.max(1, Math.floor(elements.avatarViewport.clientHeight * dpr));
  if (state.avatar.canvas.width !== width || state.avatar.canvas.height !== height) {
    state.avatar.canvas.width = width;
    state.avatar.canvas.height = height;
  }
}

function renderAvatar() {
  if (!state.avatar) return;
  resizeAvatarCanvas();

  const { canvas, ctx } = state.avatar;
  const width = canvas.width;
  const height = canvas.height;
  if (!width || !height) return;

  drawBackdrop(ctx, width, height);

  const referenceFrame = buildProjectedFrame(
    state.avatar.referenceLandmarks,
    width,
    height,
    state.avatar.tracks.reference.layout,
  );
  const wrongFrame = buildProjectedFrame(
    state.avatar.wrongLandmarks,
    width,
    height,
    state.avatar.tracks.wrong.layout,
  );

  drawAdultFigure(ctx, referenceFrame, new Set(), avatarPalette.reference, true);
  drawAdultFigure(ctx, wrongFrame, state.avatar.hotNames || new Set(), avatarPalette.live, false);
}

function initAvatar(avatarTracks) {
  const canvas = ensureAvatarCanvas();
  const ctx = canvas.getContext("2d");
  state.avatar = {
    canvas,
    ctx,
    tracks: avatarTracks,
    wrongLandmarks: null,
    referenceLandmarks: null,
    hotNames: new Set(),
    blinkVisible: true,
    blinkTimerId: window.setInterval(() => {
      if (!state.avatar) return;
      state.avatar.blinkVisible = !state.avatar.blinkVisible;
      if (state.avatar.hotNames.size) {
        renderAvatar();
      }
    }, BLINK_INTERVAL_MS),
  };

  window.addEventListener("resize", () => {
    window.clearTimeout(state.resizeTimerId);
    state.resizeTimerId = window.setTimeout(renderAvatar, 160);
  });

  renderAvatar();
}

function renderIssueList() {
  elements.issueList.innerHTML = "";
  const issues = state.data?.overview?.top_findings || [];

  if (!issues.length) {
    const node = document.createElement("div");
    node.className = "issue-card";
    node.innerHTML = `
      <div class="issue-top">
        <strong>안정적 세트</strong>
        <span>good</span>
      </div>
      <div class="issue-bar"><i style="width: 18%"></i></div>
    `;
    elements.issueList.appendChild(node);
    return;
  }

  issues.slice(0, 3).forEach((issue) => {
    const node = document.createElement("div");
    node.className = "issue-card";
    node.innerHTML = `
      <div class="issue-top">
        <strong>${issue.label}</strong>
        <span>${fmt(issue.severity * 100, 0, "%")}</span>
      </div>
      <div class="issue-bar"><i style="width: ${Math.max(12, issue.severity * 100)}%"></i></div>
    `;
    elements.issueList.appendChild(node);
  });
}

function renderMetrics(metrics) {
  elements.metricGrid.innerHTML = "";
  (metrics || []).forEach((metric) => {
    const unit = metric.unit || "";
    const digits = unit === "deg" ? 1 : 0;
    const node = document.createElement("article");
    node.className = "metric-card";
    if (typeof metric.delta === "number" && Math.abs(metric.delta) >= (unit === "deg" ? 6 : 10)) {
      node.classList.add("alert");
    }

    const valueText = metric.value == null ? "--" : `${metric.value.toFixed(digits)}${unit}`;
    const refText = metric.reference == null ? "" : `ref ${metric.reference.toFixed(digits)}${unit}`;
    const gapText = metric.delta == null ? "" : `gap ${Math.abs(metric.delta).toFixed(digits)}${unit}`;

    node.innerHTML = `
      <span>${metric.label}</span>
      <strong>${valueText}</strong>
      <em>${gapText}${refText ? ` · ${refText}` : ""}</em>
    `;
    elements.metricGrid.appendChild(node);
  });
}

function getLiveMetrics(metrics) {
  const preferredIds = ["match_rate", "knee_forward_norm", "hip_hinge_norm", "heel_lift_norm"];
  return preferredIds
    .map((id) => (metrics || []).find((metric) => metric.id === id))
    .filter(Boolean);
}

function getReportMatchScore() {
  const matchMetric = (state.data?.report?.final_scores || []).find((metric) => metric.id === "match");
  if (typeof matchMetric?.value === "number" && Number.isFinite(matchMetric.value)) {
    return matchMetric.value;
  }
  return state.data?.overview?.average_score || 0;
}

function getCompactFinalMetrics() {
  const preferredIds = ["match", "knee_load", "heel_contact"];
  const reportMetrics = state.data.report.final_scores || [];
  return preferredIds
    .map((id) => reportMetrics.find((metric) => metric.id === id))
    .filter(Boolean);
}

function renderFinalMetrics(isReady) {
  elements.finalMetricGrid.innerHTML = "";
  if (!isReady) {
    elements.finalMetricGrid.hidden = true;
    return;
  }

  elements.finalMetricGrid.hidden = false;
  const metrics = getCompactFinalMetrics();

  metrics.forEach((metric) => {
    const node = document.createElement("article");
    node.className = "metric-card";
    const valueText =
      typeof metric.value === "number" && Number.isFinite(metric.value) ? `${Math.round(metric.value)}%` : "--";
    if (isReady && typeof metric.value === "number" && metric.value <= 82) {
      node.classList.add("alert");
    }
    node.innerHTML = `
      <span>${metric.label}</span>
      <strong>${valueText}</strong>
      <em>${isReady ? "세트 종료 기준" : "분석 중..."}</em>
    `;
    elements.finalMetricGrid.appendChild(node);
  });
}

function setAnalysisMode(reportReady) {
  elements.sessionStateSection.hidden = true;
  elements.liveMetricsSection.hidden = reportReady;
  elements.summaryText.hidden = reportReady;
  elements.liveMetricsLabel.textContent = reportReady ? "종합 평가 수치" : "실시간 수치";
  elements.reportSection.classList.toggle("compact-pending", !reportReady);
  elements.reportSection.classList.toggle("report-ready", reportReady);
  elements.expertGrid.classList.toggle("report-ready", reportReady);
}

function buildTimeline() {
  elements.timeline.innerHTML = "";

  const base = document.createElement("div");
  base.className = "timeline-base";
  elements.timeline.appendChild(base);

  const progress = document.createElement("div");
  progress.className = "timeline-progress";
  progress.id = "timelineProgress";
  elements.timeline.appendChild(progress);

  const cursor = document.createElement("div");
  cursor.className = "timeline-cursor";
  cursor.id = "timelineCursor";
  elements.timeline.appendChild(cursor);

  elements.timeline.addEventListener("click", (event) => {
    const rect = elements.timeline.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const duration = state.data.input_videos.wrong.duration_sec || 1;
    const wasPlaying = state.player.isPlaying;
    seekToTime(duration * ratio);
    if (wasPlaying) {
      play();
    }
  });
}

function formatPhase(frame) {
  const labels = {
    descent: "하강",
    ascent: "상승",
    steady: "정지",
  };
  const cycleLabel = isReportPass() ? "2차 재생 · 종합 평가" : "1차 재생 · 실시간 분석";
  return `${cycleLabel} · Rep ${frame.rep_index} · ${labels[frame.phase] || frame.phase}`;
}

function resetVoiceTracking() {
  state.voice.candidateIssueId = null;
  state.voice.stableCount = 0;
}

function maybeSpeak(frame, warningIssue) {
  if (isReportPass()) return;
  if (!state.voiceEnabled || !warningIssue || !("speechSynthesis" in window)) return;
  if (frame.score > VOICE_SCORE_THRESHOLD) {
    resetVoiceTracking();
    return;
  }

  const issueId = warningIssue.id;
  if (state.voice.candidateIssueId === issueId) {
    state.voice.stableCount += 1;
  } else {
    state.voice.candidateIssueId = issueId;
    state.voice.stableCount = 1;
  }

  if (state.voice.stableCount < VOICE_STABLE_FRAMES) return;
  if (window.speechSynthesis.speaking) return;

  const now = Date.now();
  if (now - state.voice.lastSpokenAt < VOICE_MIN_GAP_MS) return;
  if (state.voice.lastSpokenIssueId === issueId && now - state.voice.lastSpokenAt < VOICE_REPEAT_GAP_MS) return;

  const utterance = new SpeechSynthesisUtterance(frame.voice_text || frame.coach_text);
  utterance.lang = "ko-KR";
  utterance.rate = 0.98;
  window.speechSynthesis.speak(utterance);

  state.voice.lastSpokenIssueId = issueId;
  state.voice.lastSpokenAt = now;
  state.voice.stableCount = 0;
}

function updateFrame(frame) {
  if (!frame) return;
  state.currentFrame = frame;

  const second = Math.floor(frame.time_sec);
  const bucket = state.analysisBuckets.get(second) || {
    avgScore: getDisplayedScore(frame),
    runningAvgScore: getDisplayedScore(frame),
    repCount: frame.rep_index || 1,
    issueCount: (frame.issues || []).length,
    topIssue: (frame.issues || [])[0] || null,
    metrics: (frame.analysis_metrics || []).filter((metric) => PRIMARY_METRIC_IDS.has(metric.id)),
  };
  const displayedScore = bucket.avgScore;
  const topIssue = bucket.topIssue || (frame.issues || [])[0] || null;
  const warningIssue = topIssue && displayedScore <= WARNING_SCORE_THRESHOLD ? topIssue : null;
  const currentIndex = state.player.index;
  const reportReady = isReportPass();
  const overview = state.data.overview;
  const report = state.data.report;
  const finalMatchScore = getReportMatchScore();
  const reportFocus = (overview.top_findings || [])
    .slice(0, 2)
    .map((item) => item.label)
    .join(" · ");

  setAnalysisMode(reportReady);

  elements.scoreValue.textContent = `${Math.round(reportReady ? finalMatchScore : displayedScore)}`;
  elements.averageScore.textContent = `${Math.round(reportReady ? overview.average_score : bucket.runningAvgScore)}`;
  elements.repCount.textContent = `${reportReady ? overview.rep_count : bucket.repCount}`;
  elements.matchValue.textContent = `${Math.round(reportReady ? finalMatchScore : displayedScore)}%`;
  elements.issueCount.textContent = `${reportReady ? (overview.top_findings || []).length : bucket.issueCount}`;
  elements.currentIssue.textContent = reportReady ? report.headline : "실시간 추적 중";
  elements.phaseLabel.textContent = formatPhase(frame);
  elements.coachText.textContent = reportReady
    ? `${reportFocus} 중심으로 종합 평가를 정리했습니다.`
    : "실시간 수치를 1초 단위 평균으로 집계하고 있습니다.";
  elements.summaryText.textContent = reportReady
    ? "전문의와 트레이너 관점 평가는 아래에서 확인할 수 있습니다."
    : "마지막 반복까지 추적한 뒤, 다음 재생에서 종합 평가를 표시합니다.";

  renderMetrics(reportReady ? [] : getLiveMetrics(bucket.metrics));
  renderFinalMetrics(reportReady);

  elements.issueListSection.hidden = true;
  elements.issueList.innerHTML = "";

  elements.reportStatus.textContent = reportReady ? "평가 완료" : "분석 중...";
  elements.reportStatus.classList.toggle("ready", reportReady);
  elements.medicalStatus.textContent = reportReady ? report.medical_status : "분석 중...";
  elements.medicalDetail.textContent = reportReady
    ? "무릎이 먼저 전진하고 뒤꿈치 지지가 약해 관절 전면 부담이 커질 수 있습니다. 깊이를 조금 줄이고 안정성을 먼저 확보하세요."
    : "";
  elements.trainerStatus.textContent = reportReady ? report.trainer_status : "분석 중...";
  elements.trainerDetail.textContent = reportReady
    ? "내려갈 때 엉덩이를 먼저 뒤로 보내고, 뒤꿈치와 발 중앙으로 바닥을 눌러 무릎과 고관절이 함께 움직이게 하세요."
    : "";

  const cursor = document.getElementById("timelineCursor");
  const progress = document.getElementById("timelineProgress");
  const duration = state.data.input_videos.wrong.duration_sec || 1;
  const progressPercent = (frame.time_sec / duration) * 100;
  if (progress) {
    progress.style.width = `${progressPercent}%`;
  }
  if (cursor) {
    cursor.style.left = `${progressPercent}%`;
  }

  const hotNames = topIssue ? getHotJointNames(frame, topIssue.id) : new Set();
  if (state.avatar) {
    state.avatar.wrongLandmarks = state.avatar.tracks.wrong.frames[currentIndex] || frame.wrong.landmarks2d;
    state.avatar.referenceLandmarks = state.avatar.tracks.reference.frames[currentIndex] || frame.reference.landmarks2d;
    state.avatar.hotNames = hotNames;
    renderAvatar();
  }

  maybeSpeak({ ...frame, score: displayedScore }, warningIssue);
}

function showFrame(index) {
  const clamped = Math.max(0, Math.min(index, state.data.frames.length - 1));
  state.player.index = clamped;
  const cachedImage = state.imageCache.get(clamped);
  elements.overlayFrame.src = cachedImage?.complete ? cachedImage.src : getFramePath(clamped);
  preloadFramesAround(clamped + 1);
  updateFrame(state.data.frames[clamped]);
}

function pause() {
  if (state.player.timerId) {
    clearInterval(state.player.timerId);
    state.player.timerId = null;
  }
  state.player.isPlaying = false;
  elements.playToggle.textContent = "▶";
}

function play() {
  const lastIndex = state.data.frames.length - 1;
  if (state.session.passIndex >= state.session.totalPasses - 1 && state.player.index >= lastIndex) {
    resetSessionProgress();
    showFrame(0);
  }
  if (state.player.isPlaying) return;
  state.player.isPlaying = true;
  elements.playToggle.textContent = "❚❚";

  const intervalMs = 1000 / Math.max(state.player.fps, 1);
  state.player.timerId = window.setInterval(() => {
    if (state.player.index >= lastIndex) {
      if (state.session.passIndex < state.session.totalPasses - 1) {
        state.session.passIndex += 1;
        showFrame(0);
        return;
      }
      showFrame(lastIndex);
      pause();
      return;
    }
    showFrame(state.player.index + 1);
  }, intervalMs);
}

function seekToTime(timeSec) {
  showFrame(findNearestFrameIndex(timeSec));
}

function bindControls() {
  elements.playToggle.addEventListener("click", () => {
    if (state.player.isPlaying) {
      pause();
    } else {
      play();
    }
  });

  elements.voiceToggle.addEventListener("click", () => {
    state.voiceEnabled = !state.voiceEnabled;
    elements.voiceToggle.textContent = state.voiceEnabled ? "음성 안내 켜짐" : "음성 안내 꺼짐";
    if (!state.voiceEnabled && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      resetVoiceTracking();
    }
  });
}

async function loadData() {
  if (window.__WORKWITH_DATA__) {
    return window.__WORKWITH_DATA__;
  }
  const response = await fetch("data/session-data.json");
  if (!response.ok) {
    throw new Error("세션 데이터를 불러오지 못했습니다.");
  }
  return response.json();
}

async function bootstrap() {
  state.data = await loadData();
  state.scoreBuckets = buildScoreBuckets(state.data.frames);
  state.analysisBuckets = buildAnalysisBuckets(state.data.frames);
  state.player.fps = state.data.input_videos.wrong.sampled_fps || 10;
  preloadFramesAround(0);

  const avatarTracks = {
    wrong: prepareAvatarTrack("wrong"),
    reference: prepareAvatarTrack("reference"),
  };

  buildTimeline();
  initAvatar(avatarTracks);
  bindControls();
  resetSessionProgress();
  showFrame(0);
  window.setTimeout(play, 280);
}

bootstrap().catch((error) => {
  console.error(error);
  document.body.classList.add("has-load-error");
  elements.summaryText.textContent = error.message;
  elements.coachText.textContent = "세션 데이터를 불러오지 못했습니다.";
  elements.medicalDetail.textContent = error.message;
  elements.trainerDetail.textContent = error.message;
});
