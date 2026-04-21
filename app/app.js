const WARNING_SCORE_THRESHOLD = 76;
const VOICE_SCORE_THRESHOLD = 72;
const VOICE_MIN_GAP_MS = 8000;
const VOICE_REPEAT_GAP_MS = 14000;
const VOICE_STABLE_FRAMES = 4;
const PREP_PHASE_SEC = 9;
const ACTIVE_EXERCISE_END_SEC = 51;
const MEDIA_CACHE_BUST = "analysis-runtime-v2";
const USER_VIDEO_CACHE_BUST = "user-video-overlay-v2";
const USER_VIDEO_DRIFT_TOLERANCE_SEC = 0.12;
const USER_FALLBACK_DURATION_SEC = 14;
const DEBUG_SESSION_OPTIONS = parseDebugSessionOptions();
const TUNING = window.WORKWITH_TUNING || {};
const PLAYBACK_TUNING = TUNING.playback || {};
const USER_OVERLAY_TUNING = TUNING.userOverlay || {};
const USER_VIDEO_TUNING = TUNING.userVideo || {};

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

const LIVE_METRIC_COPY = {
  match_rate: {
    label: "모범 자세 유사도",
    detail: "현재 자세가 모범 동작과 얼마나 비슷한지",
  },
  hip_hinge_norm: {
    label: "골반 접힘 깊이",
    detail: "앉을 때 골반이 충분히 뒤로 접히는지",
  },
  heel_lift_norm: {
    label: "발뒤꿈치 지지",
    detail: "내려가는 동안 발뒤꿈치가 바닥에 남아 있는지",
  },
  balance_offset_norm: {
    label: "몸 중심 안정감",
    detail: "좌우와 앞뒤로 몸이 흔들리지 않는지",
  },
  posterior_chain_score: {
    label: "엉덩이·햄스트링 사용",
    detail: "엉덩이와 허벅지 뒤쪽이 함께 쓰이는지",
  },
};

const FINAL_METRIC_COPY = {
  match: {
    label: "모범 자세 유사도",
    detail: "세트 전체를 놓고 봤을 때 모범 동작과 얼마나 가까웠는지",
  },
  heel_contact: {
    label: "발뒤꿈치 지지",
    detail: "세트 전체에서 발뒤꿈치가 바닥에 안정적으로 남아 있던 정도",
  },
  hip_hinge: {
    label: "골반 접힘 깊이",
    detail: "앉을 때 골반이 먼저 접히며 충분히 내려갔는지",
  },
  stability: {
    label: "몸 중심 안정감",
    detail: "세트 전체에서 몸의 중심이 흔들리지 않았는지",
  },
  posterior_chain: {
    label: "엉덩이·햄스트링 사용",
    detail: "엉덩이와 허벅지 뒤쪽을 잘 활용했는지",
  },
};

const state = {
  data: null,
  scoreBuckets: new Map(),
  analysisBuckets: new Map(),
  analysisStartRepIndex: 0,
  repStarts: [],
  descentSegments: [],
  currentFrame: null,
  voiceEnabled: false,
  hasSessionStarted: false,
  avatarInitialized: false,
  selectedExerciseName: "스쿼트",
  imageCache: new Map(),
  preloadWindow: 18,
  resizeTimerId: null,
  userOverlay: {
    data: null,
    frameIndex: -1,
    rafId: null,
  },
  media: {
    userVideoDurationSec: USER_FALLBACK_DURATION_SEC,
    playbackDurationSec: USER_FALLBACK_DURATION_SEC,
    analysisStartSec: 0,
    analysisEndSec: USER_FALLBACK_DURATION_SEC,
  },
  session: {
    passIndex: 0,
    totalPasses: 2,
  },
  player: {
    isPlaying: false,
    timerId: null,
    index: 0,
    fps: 10,
    playbackTimeSec: 0,
  },
  voice: {
    candidateIssueId: null,
    stableCount: 0,
    lastSpokenIssueId: null,
    lastSpokenAt: 0,
  },
  highlight: {
    available: false,
    active: false,
    startSec: 4,
    endSec: 8,
  },
};

const elements = {
  launchExperience: document.getElementById("launchExperience"),
  logoSplash: document.getElementById("logoSplash"),
  exerciseSelect: document.getElementById("exerciseSelect"),
  demoView: document.getElementById("demoView"),
  correctDemoVideo: document.getElementById("correctDemoVideo"),
  squatStart: document.getElementById("squatStart"),
  exerciseCards: document.querySelectorAll(".exercise-card[data-exercise-name]"),
  demoExerciseName: document.getElementById("demoExerciseName"),
  selectedExerciseName: document.getElementById("selectedExerciseName"),
  skipDemo: document.getElementById("skipDemo"),
  sessionApp: document.getElementById("sessionApp"),
  overlayFrame: document.getElementById("overlayFrame"),
  userVideo: document.getElementById("userVideo"),
  overlayCanvas: document.getElementById("overlayCanvas"),
  avatarStage: document.getElementById("avatarStage"),
  avatarMessage: document.getElementById("avatarMessage"),
  currentIssue: document.getElementById("currentIssue"),
  scoreValue: document.getElementById("scoreValue"),
  playToggle: document.getElementById("playToggle"),
  voiceToggle: document.getElementById("voiceToggle"),
  highlightReplay: document.getElementById("highlightReplay"),
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
  reportNoteGrid: document.getElementById("reportNoteGrid"),
  reportFindingTitle: document.getElementById("reportFindingTitle"),
  reportFindingCopy: document.getElementById("reportFindingCopy"),
  reportGuideTitle: document.getElementById("reportGuideTitle"),
  reportGuideCopy: document.getElementById("reportGuideCopy"),
  reportStatus: document.getElementById("reportStatus"),
  expertGrid: document.getElementById("expertGrid"),
  medicalStatus: document.getElementById("medicalStatus"),
  medicalDetail: document.getElementById("medicalDetail"),
  trainerStatus: document.getElementById("trainerStatus"),
  trainerDetail: document.getElementById("trainerDetail"),
  timeline: document.getElementById("timeline"),
};

function parseDebugSessionOptions() {
  if (typeof window === "undefined") {
    return {
      autoStart: false,
      skipDemo: false,
      exerciseName: "스쿼트",
      timeSec: null,
      pause: false,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const hasTimeSec = params.has("timeSec");
  const parsedTimeSec = hasTimeSec ? Number(params.get("timeSec")) : null;
  return {
    autoStart: params.get("autostart") === "1",
    skipDemo: params.get("skipDemo") === "1" || params.get("autostart") === "1",
    exerciseName: params.get("exercise") || "스쿼트",
    timeSec: Number.isFinite(parsedTimeSec) ? parsedTimeSec : null,
    pause: params.get("pause") === "1" || hasTimeSec,
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function smoothstep(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
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

function mixValue(a, b, t) {
  return (a ?? 0) + ((b ?? 0) - (a ?? 0)) * t;
}

function mixCorrectionProfile(a, b, t) {
  return {
    shoulderLift: mixValue(a?.shoulderLift, b?.shoulderLift, t),
    shoulderSlide: mixValue(a?.shoulderSlide, b?.shoulderSlide, t),
    torsoTwist: mixValue(a?.torsoTwist, b?.torsoTwist, t),
    pelvisDrop: mixValue(a?.pelvisDrop, b?.pelvisDrop, t),
    pelvisShift: mixValue(a?.pelvisShift, b?.pelvisShift, t),
    pelvisTilt: mixValue(a?.pelvisTilt, b?.pelvisTilt, t),
    kneeDrive: mixValue(a?.kneeDrive, b?.kneeDrive, t),
    kneeOpen: mixValue(a?.kneeOpen, b?.kneeOpen, t),
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
    if (!isActiveExerciseFrame(frame)) return;
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
    if (!isActiveExerciseFrame(frame)) return;
    const second = Math.floor(frame.time_sec);
    const bucket = buckets.get(second) || {
      second,
      count: 0,
      scoreSum: 0,
      repCount: 0,
      issueCountSum: 0,
      issueMap: new Map(),
      metricMap: new Map(),
    };

    bucket.count += 1;
    bucket.scoreSum += frame.score || 0;
    bucket.repCount = Math.max(bucket.repCount, getDisplayRepCount(frame));
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
  let cumulativeRepCount = 0;

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

function isPrepFrame(frame) {
  return (frame?.time_sec || 0) < PREP_PHASE_SEC;
}

function isAfterExerciseFrame(frame) {
  return (frame?.time_sec || 0) >= ACTIVE_EXERCISE_END_SEC;
}

function isActiveExerciseFrame(frame) {
  const timeSec = frame?.time_sec || 0;
  return timeSec >= PREP_PHASE_SEC && timeSec < ACTIVE_EXERCISE_END_SEC;
}

function getAnalysisStartRepIndex(frames) {
  const firstAnalysisFrame = (frames || []).find((frame) => !isPrepFrame(frame));
  return firstAnalysisFrame?.rep_index || 0;
}

function buildRepStarts(frames) {
  const starts = [];
  let previousPhase = null;
  let lastCountedAt = Number.NEGATIVE_INFINITY;
  const minRepGapSec = 2.4;
  const latestStartSec = ACTIVE_EXERCISE_END_SEC - 2.4;

  (frames || []).forEach((frame) => {
    const timeSec = frame?.time_sec || 0;
    const phase = frame?.phase || "";
    if (!isActiveExerciseFrame(frame)) {
      previousPhase = phase;
      return;
    }

    const isDescentStart = phase === "descent" && previousPhase !== "descent";
    if (isDescentStart && timeSec <= latestStartSec && timeSec - lastCountedAt >= minRepGapSec) {
      starts.push({
        timeSec,
      });
      lastCountedAt = timeSec;
    }

    previousPhase = phase;
  });

  return starts;
}

function buildDescentSegments(frames) {
  const segments = [];
  let current = null;

  (frames || []).forEach((frame) => {
    const timeSec = frame?.time_sec || 0;
    const isActiveDescent = isActiveExerciseFrame(frame) && frame.phase === "descent";

    if (isActiveDescent) {
      if (!current) {
        current = {
          startSec: timeSec,
          endSec: timeSec,
        };
      } else {
        current.endSec = timeSec;
      }
      return;
    }

    if (current) {
      if (current.endSec - current.startSec >= 0.18) {
        segments.push(current);
      }
      current = null;
    }
  });

  if (current && current.endSec - current.startSec >= 0.18) {
    segments.push(current);
  }

  return segments;
}

function getDescentProgress(timeSec) {
  const segment = state.descentSegments.find(
    (entry) => timeSec >= entry.startSec && timeSec <= entry.endSec,
  );
  if (!segment) return null;

  const duration = Math.max(segment.endSec - segment.startSec, 0.001);
  return clamp((timeSec - segment.startSec) / duration, 0, 1);
}

function getDisplayRepCount(frame) {
  const timeSec = Math.min(frame?.time_sec || 0, ACTIVE_EXERCISE_END_SEC);
  return state.repStarts.filter((entry) => entry.timeSec <= timeSec).length;
}

function getReportRepCount() {
  return state.repStarts.length;
}

function getReportFindings() {
  const seen = new Set();
  return (state.data?.overview?.top_findings || []).filter((finding) => {
    if (!finding?.id || seen.has(finding.id)) return false;
    seen.add(finding.id);
    return true;
  });
}

function syncHighlightButton() {
  const button = elements.highlightReplay;
  if (!button) return;

  const available = state.highlight.available || state.session.passIndex >= 1;
  state.highlight.available = available;
  button.hidden = !available;
  button.disabled = state.highlight.active;
  button.textContent = state.highlight.active ? "하이라이트 재생 중..." : "하이라이트 보기";
}

function startHighlightPlayback() {
  if (!elements.highlightReplay) return;

  pause();
  state.highlight.available = true;
  state.highlight.active = true;
  state.session.passIndex = Math.max(state.session.passIndex, 1);
  syncHighlightButton();
  seekToTime(state.highlight.startSec);
  play();
}

function resetSessionProgress() {
  state.session.passIndex = 0;
  state.highlight.available = false;
  state.highlight.active = false;
  syncHighlightButton();
  resetVoiceTracking();
}

function getDisplayedScore(frame) {
  const bucket = state.scoreBuckets.get(Math.floor(frame.time_sec));
  return bucket ? bucket.avg : frame.score;
}

function getUserInputVideoMeta() {
  return state.data?.input_videos?.user || state.data?.input_videos?.wrong || {};
}

function getUserPoseData(frame) {
  return frame?.user || frame?.wrong || null;
}

function getUserLandmarks2D(frame) {
  return getUserPoseData(frame)?.landmarks2d || [];
}

function getBodyLandmarkConnections() {
  return (state.userOverlay.data?.connections || state.data?.connections || [])
    .filter(([startIndex, endIndex]) => startIndex >= 11 && endIndex >= 11);
}

function getUserVideoFocus(axis, fallback = 0.5) {
  const tunedValue = axis === "x" ? USER_VIDEO_TUNING.focusX : USER_VIDEO_TUNING.focusY;
  if (Number.isFinite(tunedValue)) {
    return clamp(tunedValue, 0, 1);
  }
  const suggested = state.userOverlay.data?.suggested_focus?.[axis];
  return clamp(Number.isFinite(suggested) ? suggested : fallback, 0, 1);
}

function getUserOverlayFrames() {
  return state.userOverlay.data?.frames || [];
}

function findNearestUserOverlayFrameIndex(timeSec) {
  const frames = getUserOverlayFrames();
  if (!frames.length) return -1;

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

function getUserOverlayFrameAtTime(timeSec) {
  const index = findNearestUserOverlayFrameIndex(timeSec);
  return index >= 0 ? getUserOverlayFrames()[index] : null;
}

async function loadUserOverlayData() {
  const response = await fetch(buildMediaUrl(USER_OVERLAY_TUNING.dataPath || "data/user-overlay-analysis.json", USER_VIDEO_CACHE_BUST), {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("사용자 MediaPipe 오버레이 데이터를 불러오지 못했습니다.");
  }
  state.userOverlay.data = await response.json();
  const overlayDurationSec = Number(state.userOverlay.data?.duration_sec);
  if (Number.isFinite(overlayDurationSec) && overlayDurationSec > 0) {
    state.media.userVideoDurationSec = overlayDurationSec;
  }
}

function applyUserVideoTuning() {
  const stack = elements.userVideo?.closest(".video-stack");
  const video = elements.userVideo;
  if (!stack || !video) return;

  const zoom = Number.isFinite(USER_VIDEO_TUNING.zoom) ? USER_VIDEO_TUNING.zoom : 1;
  const translateX = Number.isFinite(USER_VIDEO_TUNING.translateXPercent) ? USER_VIDEO_TUNING.translateXPercent : 0;
  const translateY = Number.isFinite(USER_VIDEO_TUNING.translateYPercent) ? USER_VIDEO_TUNING.translateYPercent : 0;
  stack.style.transform = `translate(${translateX}%, ${translateY}%) scale(${zoom})`;
  stack.style.transformOrigin = "center center";
  video.style.objectFit = USER_VIDEO_TUNING.objectFit || "cover";
  video.style.objectPosition = `${getUserVideoFocus("x") * 100}% ${getUserVideoFocus("y") * 100}%`;
}

function getPlaybackDurationSec() {
  return Math.max(1, state.media.playbackDurationSec || USER_FALLBACK_DURATION_SEC);
}

function getPlaybackFrameCount() {
  return Math.max(2, Math.floor(getPlaybackDurationSec() * Math.max(state.player.fps, 1)) + 1);
}

function getSourceAnalysisStartSec() {
  return Number.isFinite(state.media.analysisStartSec) ? state.media.analysisStartSec : 0;
}

function getSourceAnalysisEndSec() {
  const frameEnd = state.data?.frames?.[state.data.frames.length - 1]?.time_sec;
  return Number.isFinite(state.media.analysisEndSec) ? state.media.analysisEndSec : (frameEnd || getPlaybackDurationSec());
}

function getSourceAnalysisDurationSec() {
  return Math.max(0.01, getSourceAnalysisEndSec() - getSourceAnalysisStartSec());
}

function getPlaybackTimeForIndex(index) {
  return clamp(index / Math.max(state.player.fps, 1), 0, getPlaybackDurationSec());
}

function mapPlaybackTimeToSourceTime(playbackTimeSec) {
  const ratio = clamp(playbackTimeSec / getPlaybackDurationSec(), 0, 1);
  return getSourceAnalysisStartSec() + getSourceAnalysisDurationSec() * ratio;
}

function getSourceFrameIndexForPlaybackIndex(index) {
  if (!state.data?.frames?.length) return 0;
  return findNearestFrameIndex(mapPlaybackTimeToSourceTime(getPlaybackTimeForIndex(index)));
}

function getSourceFrameForPlaybackIndex(index) {
  return state.data?.frames?.[getSourceFrameIndexForPlaybackIndex(index)] || null;
}

function estimateAnalysisTimeRange() {
  const frames = state.data?.frames || [];
  if (frames.length < 2) {
    return { startSec: 0, endSec: getPlaybackDurationSec() };
  }

  const bodyIndexes = [...new Set(getBodyLandmarkConnections().flat())];
  const deltaAt = (a, b) => {
    const aLandmarks = getUserLandmarks2D(a);
    const bLandmarks = getUserLandmarks2D(b);
    let total = 0;
    let count = 0;
    bodyIndexes.forEach((index) => {
      const pointA = aLandmarks[index];
      const pointB = bLandmarks[index];
      if (!pointA || !pointB) return;
      total += Math.hypot((pointA[0] || 0) - (pointB[0] || 0), (pointA[1] || 0) - (pointB[1] || 0));
      count += 1;
    });
    return count ? total / count : 0;
  };

  let startIndex = 0;
  for (let index = 1; index < frames.length; index += 1) {
    if (deltaAt(frames[index], frames[index - 1]) > 0.0022) {
      startIndex = Math.max(0, index - 1);
      break;
    }
  }

  let endIndex = frames.length - 1;
  for (let index = frames.length - 1; index > startIndex; index -= 1) {
    if (deltaAt(frames[index], frames[index - 1]) > 0.0022) {
      endIndex = index;
      break;
    }
  }

  const startSec = frames[startIndex]?.time_sec || 0;
  const endSec = frames[endIndex]?.time_sec || frames[frames.length - 1]?.time_sec || getPlaybackDurationSec();
  return {
    startSec,
    endSec: Math.max(startSec + 0.5, endSec),
  };
}

function getUserVideoCandidates() {
  const media = state.data?.media || {};
  return [...new Set([
    "media/user.mp4",
    media.user_video,
    media.source_user_video,
    "media/wrong.mp4",
  ].filter((path) => typeof path === "string" && path.trim()))];
}

function buildMediaUrl(path, cacheBust) {
  return `${path}?v=${cacheBust}`;
}

function ensureUserVideoSource() {
  const video = elements.userVideo;
  if (!video || video.dataset.initialized === "1") return;

  const candidates = getUserVideoCandidates();
  if (!candidates.length) return;

  const applyCandidate = (index) => {
    const path = candidates[index];
    if (!path) return;
    video.dataset.candidateIndex = String(index);
    video.src = buildMediaUrl(path, USER_VIDEO_CACHE_BUST);
    video.load();
  };

  video.addEventListener("error", () => {
    const nextIndex = Number(video.dataset.candidateIndex || 0) + 1;
    if (nextIndex < candidates.length) {
      applyCandidate(nextIndex);
    }
  });

  video.addEventListener("loadedmetadata", () => {
    state.media.userVideoDurationSec =
      Number.isFinite(video.duration) && video.duration > 0 ? video.duration : USER_FALLBACK_DURATION_SEC;
    state.media.playbackDurationSec = PLAYBACK_TUNING.useExactUserVideoDuration !== false
      ? state.media.userVideoDurationSec
      : Math.min(
          state.media.userVideoDurationSec,
          Number.isFinite(PLAYBACK_TUNING.fallbackDurationSec) ? PLAYBACK_TUNING.fallbackDurationSec : USER_FALLBACK_DURATION_SEC,
        );
    applyUserVideoTuning();
    buildTimeline();
    const frame = getSourceFrameForPlaybackIndex(state.player.index) || state.data?.frames?.[0];
    if (frame) {
      syncUserVideoFrame(frame, getPlaybackTimeForIndex(state.player.index), true);
    }
  });

  video.addEventListener("seeked", () => {
    renderPoseOverlayAtTime(video.currentTime, true);
  });
  video.addEventListener("pause", () => {
    stopUserOverlayLoop();
    renderPoseOverlayAtTime(video.currentTime, true);
  });
  video.addEventListener("ended", () => {
    stopUserOverlayLoop();
    renderPoseOverlayAtTime(video.currentTime, true);
  });

  video.dataset.initialized = "1";
  applyCandidate(0);
}

function getFramePath(index) {
  const media = state.data.media;
  const padded = String(index).padStart(4, "0");
  return `${media.overlay_frame_dir}/${media.overlay_frame_pattern.replace("{index:04d}", padded)}?v=${MEDIA_CACHE_BUST}`;
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

function resizeOverlayCanvas() {
  const canvas = elements.overlayCanvas;
  if (!canvas) return null;

  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  return {
    ctx,
    width: rect.width,
    height: rect.height,
  };
}

function getOverlayVideoRect(width, height) {
  const video = elements.userVideo;
  const sourceWidth = video?.videoWidth || state.userOverlay.data?.width || getUserInputVideoMeta().width || 1920;
  const sourceHeight = video?.videoHeight || state.userOverlay.data?.height || getUserInputVideoMeta().height || 1080;
  const fit = USER_VIDEO_TUNING.objectFit || "cover";
  const scale = fit === "contain"
    ? Math.min(width / Math.max(sourceWidth, 1), height / Math.max(sourceHeight, 1))
    : Math.max(width / Math.max(sourceWidth, 1), height / Math.max(sourceHeight, 1));
  const renderWidth = sourceWidth * scale;
  const renderHeight = sourceHeight * scale;
  const focusX = getUserVideoFocus("x");
  const focusY = getUserVideoFocus("y");
  return {
    x: (width - renderWidth) * focusX,
    y: (height - renderHeight) * focusY,
    width: renderWidth,
    height: renderHeight,
  };
}

function renderPoseOverlayFrame(frame) {
  const overlay = resizeOverlayCanvas();
  if (!overlay) return;

  const { ctx, width, height } = overlay;
  ctx.clearRect(0, 0, width, height);

  const landmarks = frame?.landmarks2d || [];
  if (!landmarks.length) return;

  const drawRect = getOverlayVideoRect(width, height);
  const connections = getBodyLandmarkConnections();
  const pointRadius = Math.max(3.2, width * 0.008);
  const lineWidth = Math.max(2.4, width * 0.0065);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  connections.forEach(([startIndex, endIndex]) => {
    const start = landmarks[startIndex];
    const end = landmarks[endIndex];
    if (!start || !end) return;
    if ((start[3] ?? 1) < 0.25 || (end[3] ?? 1) < 0.25) return;

    ctx.strokeStyle = "rgba(255, 255, 255, 0.88)";
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(drawRect.x + start[0] * drawRect.width, drawRect.y + start[1] * drawRect.height);
    ctx.lineTo(drawRect.x + end[0] * drawRect.width, drawRect.y + end[1] * drawRect.height);
    ctx.stroke();
  });

  landmarks.forEach((point, index) => {
    if (!point || index < 11 || (point[3] ?? 1) < 0.25) return;

    const x = drawRect.x + point[0] * drawRect.width;
    const y = drawRect.y + point[1] * drawRect.height;

    ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
    ctx.beginPath();
    ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
    ctx.fill();
  });
}

function renderPoseOverlayAtTime(timeSec, force = false) {
  const frameIndex = findNearestUserOverlayFrameIndex(timeSec);
  if (frameIndex < 0) {
    renderPoseOverlayFrame(null);
    return;
  }
  if (!force && state.userOverlay.frameIndex === frameIndex) {
    return;
  }
  state.userOverlay.frameIndex = frameIndex;
  renderPoseOverlayFrame(getUserOverlayFrames()[frameIndex]);
}

function stopUserOverlayLoop() {
  if (state.userOverlay.rafId) {
    window.cancelAnimationFrame(state.userOverlay.rafId);
    state.userOverlay.rafId = null;
  }
}

function startUserOverlayLoop() {
  stopUserOverlayLoop();
  const step = () => {
    const video = elements.userVideo;
    if (!video) return;
    renderPoseOverlayAtTime(video.currentTime);
    if (!video.paused && !video.ended) {
      state.userOverlay.rafId = window.requestAnimationFrame(step);
    } else {
      state.userOverlay.rafId = null;
    }
  };
  step();
}

function getVideoSeekTime(video, timeSec) {
  if (!Number.isFinite(timeSec)) return 0;
  if (!Number.isFinite(video?.duration) || video.duration <= 0) {
    return Math.max(0, timeSec);
  }
  return clamp(timeSec, 0, Math.max(video.duration - 0.016, 0));
}

function syncUserVideoFrame(frame, playbackTimeSec = 0, forceSeek = false) {
  const video = elements.userVideo;
  if (!video) return;

  ensureUserVideoSource();
  const targetTime = getVideoSeekTime(
    video,
    Number.isFinite(playbackTimeSec) ? playbackTimeSec : (frame?.time_sec || 0),
  );
  renderPoseOverlayAtTime(targetTime, forceSeek || !state.player.isPlaying);
  const drift = Math.abs((video.currentTime || 0) - targetTime);

  if (forceSeek || !state.player.isPlaying || drift > USER_VIDEO_DRIFT_TOLERANCE_SEC) {
    try {
      if (forceSeek && typeof video.fastSeek === "function") {
        video.fastSeek(targetTime);
      } else {
        video.currentTime = targetTime;
      }
    } catch (error) {
      console.debug("user video seek skipped", error);
    }
  }
}

function playUserVideo() {
  const video = elements.userVideo;
  if (!video) return;

  const frame = getSourceFrameForPlaybackIndex(state.player.index);
  const playbackTimeSec = getPlaybackTimeForIndex(state.player.index);
  syncUserVideoFrame(frame, playbackTimeSec, true);

  video.playbackRate = PLAYBACK_TUNING.useExactUserVideoDuration !== false
    ? 1
    : clamp(
        (state.media.userVideoDurationSec || getPlaybackDurationSec()) / getPlaybackDurationSec(),
        0.85,
        1.2,
      );

  const playPromise = video.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => {});
  }
  startUserOverlayLoop();
}

function pauseUserVideo() {
  stopUserOverlayLoop();
  elements.userVideo?.pause();
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
    const primarySide = getUserInputVideoMeta().primary_side || "left";
    const resolver = ISSUE_HOT_NAMES[issueId];
    (resolver ? resolver(primarySide) : []).forEach((name) => names.add(name));
  }
  return names;
}

function renderIssueList() {
  elements.issueList.innerHTML = "";
  const issues = getReportFindings();

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

function formatMetricValue(value, unit, digits = unit === "deg" ? 1 : 0) {
  if (value == null || !Number.isFinite(value)) return "--";
  return `${value.toFixed(digits)}${unit}`;
}

function formatMetricGap(delta, unit, digits = unit === "deg" ? 1 : 0) {
  if (delta == null || !Number.isFinite(delta)) return "";
  return `${Math.abs(delta).toFixed(digits)}${unit === "%" ? "%p" : unit}`;
}

function getLiveMetricCardContent(metric) {
  const meta = LIVE_METRIC_COPY[metric.id] || {};
  const unit = metric.unit || "";
  const digits = unit === "deg" ? 1 : 0;
  const label = meta.label || metric.label;
  const valueText = formatMetricValue(metric.value, unit, digits);
  const refText = formatMetricValue(metric.reference, unit, digits);
  const gapText = formatMetricGap(metric.delta, unit, digits);

  return {
    label,
    valueText,
    detail: [
      meta.detail || "",
      refText !== "--" ? `기준 ${refText}` : "",
      gapText ? `차이 ${gapText}` : "",
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

function renderMetrics(metrics) {
  elements.metricGrid.innerHTML = "";
  (metrics || []).forEach((metric) => {
    const unit = metric.unit || "";
    const { label, valueText, detail } = getLiveMetricCardContent(metric);
    const node = document.createElement("article");
    node.className = "metric-card";
    if (typeof metric.delta === "number" && Math.abs(metric.delta) >= (unit === "deg" ? 6 : 10)) {
      node.classList.add("alert");
    }

    node.innerHTML = `
      <span>${label}</span>
      <strong>${valueText}</strong>
      <em>${detail}</em>
    `;
    elements.metricGrid.appendChild(node);
  });
}

function getLiveMetrics(metrics) {
  const preferredIds = ["match_rate", "hip_hinge_norm", "heel_lift_norm", "balance_offset_norm"];
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
  const preferredIds = ["match", "heel_contact", "hip_hinge", "stability", "posterior_chain"];
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
    const meta = FINAL_METRIC_COPY[metric.id] || {};
    const node = document.createElement("article");
    node.className = "metric-card";
    const valueText =
      typeof metric.value === "number" && Number.isFinite(metric.value) ? `${Math.round(metric.value)}점` : "--";
    if (isReady && typeof metric.value === "number" && metric.value <= 82) {
      node.classList.add("alert");
    }
    node.innerHTML = `
      <span>${meta.label || metric.label}</span>
      <strong>${valueText}</strong>
      <em>${isReady ? meta.detail || "세트 전체를 기준으로 정리한 결과입니다." : "분석 중..."}</em>
    `;
    elements.finalMetricGrid.appendChild(node);
  });
}

function setAnalysisMode(reportReady) {
  elements.sessionStateSection.hidden = true;
  elements.liveMetricsSection.hidden = reportReady;
  elements.summaryText.hidden = reportReady;
  elements.reportNoteGrid.hidden = !reportReady;
  elements.liveMetricsLabel.textContent = reportReady ? "세트 전체 평가" : "지금 보고 있는 수치";
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

  elements.timeline.onclick = (event) => {
    const rect = elements.timeline.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const duration = getPlaybackDurationSec();
    const wasPlaying = state.player.isPlaying;
    seekToTime(duration * ratio);
    if (wasPlaying) {
      play();
    }
  };
}

function formatPhase(frame, playbackTimeSec = state.player.playbackTimeSec || 0) {
  if (state.highlight.active) {
    return `하이라이트 다시보기 · ${Math.max(0, Math.ceil(state.highlight.endSec - playbackTimeSec))}초`;
  }
  if (!isReportPass() && isPrepFrame(frame)) {
    return `준비 구간 · ${PREP_PHASE_SEC}초 뒤 분석 시작`;
  }

  if (!isReportPass() && isAfterExerciseFrame(frame)) {
    return "정리 구간 · 반복 수 집계 종료";
  }

  const labels = {
    descent: "내려가기",
    ascent: "올라오기",
    steady: "멈춤",
  };
  if (isReportPass()) {
    return `종합 평가 다시보기 · 총 ${getReportRepCount()}회 기준 · ${labels[frame.phase] || frame.phase}`;
  }
  return `실시간 분석 · ${getDisplayRepCount(frame)}회 · ${labels[frame.phase] || frame.phase}`;
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

function updateFrame(frame, playbackTimeSec = state.player.playbackTimeSec || 0) {
  if (!frame) return;
  state.currentFrame = frame;

  const second = Math.floor(frame.time_sec);
  const bucket = state.analysisBuckets.get(second) || {
    avgScore: getDisplayedScore(frame),
    runningAvgScore: getDisplayedScore(frame),
    repCount: getDisplayRepCount(frame),
    issueCount: (frame.issues || []).length,
    topIssue: (frame.issues || [])[0] || null,
    metrics: (frame.analysis_metrics || []).filter((metric) => PRIMARY_METRIC_IDS.has(metric.id)),
  };
  const displayedScore = bucket.avgScore;
  const topIssue = bucket.topIssue || (frame.issues || [])[0] || null;
  const warningIssue = topIssue && displayedScore <= WARNING_SCORE_THRESHOLD ? topIssue : null;
  const reportReady = isReportPass();
  syncHighlightButton();
  const liveActive = isActiveExerciseFrame(frame);
  const prepActive = !reportReady && isPrepFrame(frame);
  const cooldownActive = !reportReady && isAfterExerciseFrame(frame);
  const overview = state.data.overview;
  const report = state.data.report;
  const reportFindings = getReportFindings();
  const finalMatchScore = getReportMatchScore();
  const reportFocus = reportFindings
    .slice(0, 2)
    .map((item) => item.label)
    .join(" · ");
  const topFinding = reportFindings[0];
  const guideLine = report.next_session?.[0] || "";

  setAnalysisMode(reportReady);

  if (prepActive || cooldownActive) {
    const idleTitle = prepActive ? "운동 준비 구간" : "정리 동작 구간";
    const idleGuide = prepActive ? "제대로 된 자세를 잡아주세요." : "운동 동작 집계가 끝났습니다.";
    const idleSummary = prepActive
      ? `${PREP_PHASE_SEC}초 이후부터 반복 수와 피드백을 시작합니다.`
      : `${ACTIVE_EXERCISE_END_SEC}초 이후 구간은 반복 수와 자세 비교에서 제외합니다.`;

    elements.scoreValue.textContent = "--";
    elements.averageScore.textContent = "--";
    elements.repCount.textContent = `${getDisplayRepCount(frame)}`;
    elements.matchValue.textContent = "--";
    elements.issueCount.textContent = "0";
    elements.currentIssue.textContent = idleTitle;
    elements.phaseLabel.textContent = formatPhase(frame, playbackTimeSec);
    elements.coachText.textContent = idleGuide;
    elements.summaryText.textContent = idleSummary;

    renderMetrics([]);
    renderFinalMetrics(false);

    elements.issueListSection.hidden = true;
    elements.issueList.innerHTML = "";
    elements.reportStatus.textContent = prepActive ? "준비 중" : "대기 중";
    elements.reportStatus.classList.remove("ready");
    elements.reportFindingTitle.textContent = prepActive ? "분석 대기" : "세트 정리 중";
    elements.reportFindingCopy.textContent = "";
    elements.reportGuideTitle.textContent = prepActive ? "준비 자세" : "반복 수 집계";
    elements.reportGuideCopy.textContent = prepActive
      ? "호흡을 고르고 발 너비와 바벨 위치를 먼저 맞춰주세요."
      : "반복 수는 9초부터 51초 전까지의 운동 구간만 집계합니다.";
    elements.medicalStatus.textContent = prepActive ? "준비 중" : "대기 중";
    elements.medicalDetail.textContent = "";
    elements.trainerStatus.textContent = prepActive ? "준비 중" : "대기 중";
    elements.trainerDetail.textContent = "";

    const cursor = document.getElementById("timelineCursor");
    const progress = document.getElementById("timelineProgress");
    const duration = getPlaybackDurationSec();
    const progressPercent = (playbackTimeSec / duration) * 100;
    if (progress) progress.style.width = `${progressPercent}%`;
    if (cursor) cursor.style.left = `${progressPercent}%`;

    resetVoiceTracking();
    return;
  }

  elements.scoreValue.textContent = `${Math.round(reportReady ? finalMatchScore : displayedScore)}`;
  elements.averageScore.textContent = `${Math.round(reportReady ? overview.average_score : bucket.runningAvgScore)}`;
  elements.repCount.textContent = `${reportReady ? getReportRepCount() : bucket.repCount}`;
  elements.matchValue.textContent = `${Math.round(reportReady ? finalMatchScore : displayedScore)}점`;
  elements.issueCount.textContent = `${reportReady ? reportFindings.length : bucket.issueCount}`;
  elements.currentIssue.textContent = reportReady ? report.headline : topIssue?.label || "자세 비교 중";
  elements.phaseLabel.textContent = formatPhase(frame, playbackTimeSec);
  elements.coachText.textContent = reportReady
    ? `${reportFocus} 중심으로 종합 평가를 정리했습니다.`
    : topIssue
      ? `${topIssue.label}을 우선 확인하고 있습니다.`
      : "골반과 왼쪽 어깨를 중심으로 자세를 비교하고 있습니다.";
  elements.summaryText.textContent = reportReady
    ? "전문의와 트레이너 관점 평가는 아래에서 확인할 수 있습니다."
    : "실시간 수치는 현재 값과 기준값의 차이를 함께 보여줍니다.";

  renderMetrics(reportReady ? [] : getLiveMetrics(bucket.metrics));
  renderFinalMetrics(reportReady);

  elements.issueListSection.hidden = true;
  elements.issueList.innerHTML = "";

  elements.reportStatus.textContent = reportReady ? "평가 완료" : "비교 중";
  elements.reportStatus.classList.toggle("ready", reportReady);
  elements.reportFindingTitle.textContent = reportReady ? reportFocus || "핵심 이슈 정리" : topIssue?.label || "비교 중";
  elements.reportFindingCopy.textContent = reportReady ? report.summary : "";
  elements.reportGuideTitle.textContent = reportReady ? (topFinding?.label || "다음 세트 가이드") : "현재 안내";
  elements.reportGuideCopy.textContent = reportReady ? guideLine : "";
  elements.medicalStatus.textContent = reportReady ? report.medical_status : "비교 중";
  elements.medicalDetail.textContent = reportReady
    ? "무릎이 먼저 전진하고 뒤꿈치 지지가 약해 관절 전면 부담이 커질 수 있습니다. 깊이를 조금 줄이고 안정성을 먼저 확보하세요."
    : "";
  elements.trainerStatus.textContent = reportReady ? report.trainer_status : "비교 중";
  elements.trainerDetail.textContent = reportReady
    ? "내려갈 때 엉덩이를 먼저 뒤로 보내고, 뒤꿈치와 발 중앙으로 바닥을 눌러 무릎과 고관절이 함께 움직이게 하세요."
    : "";

  const cursor = document.getElementById("timelineCursor");
  const progress = document.getElementById("timelineProgress");
  const duration = getPlaybackDurationSec();
  const progressPercent = (playbackTimeSec / duration) * 100;
  if (progress) {
    progress.style.width = `${progressPercent}%`;
  }
  if (cursor) {
    cursor.style.left = `${progressPercent}%`;
  }

  if (liveActive) {
    maybeSpeak({ ...frame, score: displayedScore }, warningIssue);
  }
}

function showFrame(index) {
  const clamped = Math.max(0, Math.min(index, getPlaybackFrameCount() - 1));
  const playbackTimeSec = getPlaybackTimeForIndex(clamped);
  const frame = getSourceFrameForPlaybackIndex(clamped);
  state.player.index = clamped;
  state.player.playbackTimeSec = playbackTimeSec;
  syncUserVideoFrame(frame, playbackTimeSec);
  updateFrame(frame, playbackTimeSec);
  updateAvatarScene(frame, playbackTimeSec);
}

function pause() {
  if (state.player.timerId) {
    clearInterval(state.player.timerId);
    state.player.timerId = null;
  }
  pauseUserVideo();
  state.highlight.active = false;
  syncHighlightButton();
  state.player.isPlaying = false;
  elements.playToggle.textContent = "재생";
}

function play() {
  const initialLastIndex = getPlaybackFrameCount() - 1;
  if (state.session.passIndex >= state.session.totalPasses - 1 && state.player.index >= initialLastIndex) {
    resetSessionProgress();
    showFrame(0);
  }
  if (state.player.isPlaying) return;
  state.player.isPlaying = true;
  playUserVideo();
  elements.playToggle.textContent = "일시정지";

  const intervalMs = 1000 / Math.max(state.player.fps, 1);
  state.player.timerId = window.setInterval(() => {
    const lastIndex = getPlaybackFrameCount() - 1;
    if (state.player.index >= lastIndex) {
      if (state.session.passIndex < state.session.totalPasses - 1) {
        state.session.passIndex += 1;
        state.highlight.available = true;
        syncHighlightButton();
        showFrame(0);
        return;
      }
      showFrame(lastIndex);
      pause();
      return;
    }
    showFrame(state.player.index + 1);
    if (state.highlight.active) {
      if ((state.player.playbackTimeSec || 0) >= state.highlight.endSec) {
        seekToTime(state.highlight.endSec);
        pause();
      }
    }
  }, intervalMs);
}

function seekToTime(timeSec) {
  const targetTimeSec = clamp(timeSec, 0, getPlaybackDurationSec());
  showFrame(Math.round(targetTimeSec * Math.max(state.player.fps, 1)));
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

  elements.highlightReplay?.addEventListener("click", () => {
    startHighlightPlayback();
  });

  window.addEventListener("resize", () => {
    if (state.resizeTimerId) {
      window.clearTimeout(state.resizeTimerId);
    }
    state.resizeTimerId = window.setTimeout(() => {
      renderPoseOverlayAtTime(elements.userVideo?.currentTime || state.player.playbackTimeSec || 0, true);
    }, 80);
  });
}

function revealExerciseSelect() {
  elements.logoSplash?.classList.add("is-complete");
  window.setTimeout(() => {
    elements.exerciseSelect?.classList.add("is-active");
  }, 260);
}

function startAnalysisSession() {
  if (state.hasSessionStarted) return;
  state.hasSessionStarted = true;

  if (elements.correctDemoVideo) {
    elements.correctDemoVideo.pause();
    elements.correctDemoVideo.currentTime = 0;
  }
  if (elements.demoView) {
    elements.demoView.hidden = true;
  }
  if (elements.launchExperience) {
    elements.launchExperience.hidden = true;
  }
  if (elements.sessionApp) {
    elements.sessionApp.hidden = false;
  }
  initAvatarScene();

  const beginSessionPlayback = () => {
    buildTimeline();
    resetSessionProgress();
    showFrame(0);
    window.setTimeout(() => {
      if (Number.isFinite(DEBUG_SESSION_OPTIONS.timeSec)) {
        seekToTime(DEBUG_SESSION_OPTIONS.timeSec);
        if (DEBUG_SESSION_OPTIONS.pause) {
          pause();
        } else {
          play();
        }
        return;
      }
      play();
    }, 280);
  };

  const waitForUserVideoReady = () => {
    ensureUserVideoSource();
    const video = elements.userVideo;
    if (video && video.readyState < 1) {
      video.addEventListener("loadedmetadata", beginSessionPlayback, { once: true });
      return;
    }
    beginSessionPlayback();
  };

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(waitForUserVideoReady);
  });
}

function showReferenceDemo(exerciseName = "스쿼트") {
  state.selectedExerciseName = exerciseName;
  if (elements.demoExerciseName) {
    elements.demoExerciseName.textContent = exerciseName;
  }
  if (elements.selectedExerciseName) {
    elements.selectedExerciseName.textContent = exerciseName;
  }

  elements.exerciseSelect?.classList.remove("is-active");
  if (elements.demoView) {
    elements.demoView.hidden = false;
  }
  if (!elements.correctDemoVideo) {
    startAnalysisSession();
    return;
  }

  elements.correctDemoVideo.currentTime = 0;
  const playPromise = elements.correctDemoVideo.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => {});
  }
}

function bindLaunchControls() {
  elements.exerciseCards?.forEach((card) => {
    card.addEventListener("click", () => showReferenceDemo(card.dataset.exerciseName || "스쿼트"));
  });
  elements.skipDemo?.addEventListener("click", startAnalysisSession);
  elements.correctDemoVideo?.addEventListener("ended", startAnalysisSession);
  window.setTimeout(revealExerciseSelect, 1050);
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

function initAvatarScene() {
  if (state.avatarInitialized || !elements.avatarStage || !window.WorkWithAvatarScene?.init) return;
  state.avatarInitialized = true;
  const motionMedia = state.data?.media?.motions || {};

  window.WorkWithAvatarScene.init({
    stage: elements.avatarStage,
    message: elements.avatarMessage,
    data: state.data,
    modelUrl: motionMedia.avatar_model || "media/avatar/male_base_mesh.glb",
  }).catch((error) => {
    console.error(error);
    if (elements.avatarMessage) {
      elements.avatarMessage.hidden = false;
      const title = elements.avatarMessage.querySelector("strong");
      const detail = elements.avatarMessage.querySelector("em");
      if (title) title.textContent = "3D 아바타 로딩 실패";
      if (detail) detail.textContent = "골격 비교 데이터는 계속 재생됩니다.";
    }
  });
}

function updateAvatarScene(frame, playbackTimeSec = state.player.playbackTimeSec || 0) {
  if (!frame || !window.WorkWithAvatarScene?.update) return;
  window.WorkWithAvatarScene.update(frame, {
    playbackTimeSec,
    playbackDurationSec: getPlaybackDurationSec(),
    reportReady: isReportPass(),
    highlightedJointNames: frame.highlighted_joint_names || [],
  });
}

async function bootstrap() {
  state.data = await loadData();
  await loadUserOverlayData();
  applyUserVideoTuning();
  state.media.analysisStartSec = state.data?.frames?.[0]?.time_sec || 0;
  state.media.analysisEndSec = state.data?.frames?.[state.data.frames.length - 1]?.time_sec || USER_FALLBACK_DURATION_SEC;
  state.media.playbackDurationSec = PLAYBACK_TUNING.useExactUserVideoDuration !== false
    ? (state.media.userVideoDurationSec || Number(PLAYBACK_TUNING.fallbackDurationSec) || USER_FALLBACK_DURATION_SEC)
    : Math.min(
        state.media.userVideoDurationSec || Number(PLAYBACK_TUNING.fallbackDurationSec) || USER_FALLBACK_DURATION_SEC,
        Number(PLAYBACK_TUNING.fallbackDurationSec) || USER_FALLBACK_DURATION_SEC,
      );
  state.analysisStartRepIndex = getAnalysisStartRepIndex(state.data.frames);
  state.repStarts = buildRepStarts(state.data.frames);
  state.descentSegments = buildDescentSegments(state.data.frames);
  state.scoreBuckets = buildScoreBuckets(state.data.frames);
  state.analysisBuckets = buildAnalysisBuckets(state.data.frames);
  state.player.fps = getUserInputVideoMeta().sampled_fps || 10;
  ensureUserVideoSource();

  bindControls();
  bindLaunchControls();

  if (elements.correctDemoVideo) {
    elements.correctDemoVideo.load();
  }

  if (DEBUG_SESSION_OPTIONS.autoStart) {
    state.selectedExerciseName = DEBUG_SESSION_OPTIONS.exerciseName;
    if (elements.demoExerciseName) {
      elements.demoExerciseName.textContent = DEBUG_SESSION_OPTIONS.exerciseName;
    }
    if (elements.selectedExerciseName) {
      elements.selectedExerciseName.textContent = DEBUG_SESSION_OPTIONS.exerciseName;
    }
    if (DEBUG_SESSION_OPTIONS.skipDemo) {
      startAnalysisSession();
    } else {
      showReferenceDemo(DEBUG_SESSION_OPTIONS.exerciseName);
    }
  } else if (!elements.launchExperience || !elements.exerciseSelect || !elements.sessionApp) {
    startAnalysisSession();
  }
}

bootstrap().catch((error) => {
  console.error(error);
  document.body.classList.add("has-load-error");
  elements.summaryText.textContent = error.message;
  elements.coachText.textContent = "세션 데이터를 불러오지 못했습니다.";
  elements.medicalDetail.textContent = error.message;
  elements.trainerDetail.textContent = error.message;
});
