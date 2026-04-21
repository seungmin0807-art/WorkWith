const WARNING_SCORE_THRESHOLD = 76;
const SCORE_DISPLAY_OFFSET = 6;
const PREP_PHASE_SEC = 0;
const ACTIVE_EXERCISE_END_SEC = Number.POSITIVE_INFINITY;
const FEEDBACK_INTERVAL_SEC = 3;
const HIGHLIGHT_FLASH_DURATION_SEC = 1.08;
const VOICE_PULSE_SPEAK_WINDOW_SEC = 0.28;
const VOICE_LOCK_FALLBACK_MS = 1800;
const MEDIA_CACHE_BUST = "analysis-runtime-v2";
const USER_VIDEO_CACHE_BUST = "user-video-overlay-v2";
const USER_VIDEO_DRIFT_TOLERANCE_SEC = 0.12;
const USER_FALLBACK_DURATION_SEC = 14;
const ATTENDANCE_STORAGE_KEY = "workwith-attendance-v1";
const BODY_PROFILE_STORAGE_KEY = "workwith-body-profile-v1";
const DEFAULT_STREAK_DAYS = 6;
const DEFAULT_BODY_PROFILE = Object.freeze({
  height: 176.3,
  weight: 101.2,
  muscle: 47,
  fat: 18,
});
const DEBUG_SESSION_OPTIONS = parseDebugSessionOptions();
const TUNING = window.WORKWITH_TUNING || {};
const PLAYBACK_TUNING = TUNING.playback || {};
const USER_OVERLAY_TUNING = TUNING.userOverlay || {};
const USER_VIDEO_TUNING = TUNING.userVideo || {};
const CAMERA_KEEPALIVE_TUNING = TUNING.cameraKeepAlive || {};

const PRIMARY_METRIC_IDS = new Set([
  "match_rate",
  "hip_hinge_norm",
  "knee_forward_norm",
  "balance_offset_norm",
  "heel_lift_norm",
  "posterior_chain_score",
]);

const ISSUE_HOT_NAMES = {
  hip_hinge: (side) => [`${side}_hip`, `${side}_knee`],
  knee_drive: (side) => [`${side}_hip`, `${side}_knee`],
  balance: () => ["left_hip", "right_hip", "left_knee", "right_knee"],
  heel_pressure: (side) => [`${side}_hip`, `${side}_knee`],
  posterior_chain: (side) => [`${side}_hip`, `${side}_knee`],
};
const HIGHLIGHT_ALLOWED_JOINTS = new Set(["left_hip", "right_hip", "left_knee", "right_knee"]);

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

const ISSUE_FEEDBACK_COPY = {
  hip_hinge: {
    label: "골반 힌지 보완",
    coachText: "엉덩이를 먼저 뒤로 보내고 상체 길이를 유지하세요.",
    summaryText: "고관절이 먼저 접히지 않아 상체와 무릎 보상이 커지고 있습니다.",
  },
  knee_drive: {
    label: "무릎 전진 제어",
    coachText: "무릎만 먼저 밀지 말고 엉덩이와 발 중앙 압력을 함께 쓰세요.",
    summaryText: "하중이 앞쪽으로 쏠리면서 무릎 전방 이동이 커지고 있습니다.",
  },
  balance: {
    label: "중심선 안정",
    coachText: "좌우 발바닥 압력을 고르게 유지하고 몸통 흔들림을 줄이세요.",
    summaryText: "상체와 골반 중심선이 좌우로 흔들리고 있습니다.",
  },
  heel_pressure: {
    label: "뒤꿈치 지지 확보",
    coachText: "뒤꿈치와 발 중앙으로 바닥을 눌러 버티세요.",
    summaryText: "발 앞쪽으로 체중이 쏠려 뒤꿈치 지지가 약해지고 있습니다.",
  },
  posterior_chain: {
    label: "둔근-햄스트링 사용",
    coachText: "내려갈 때 엉덩이를 더 뒤로 빼서 뒤사슬을 먼저 쓰세요.",
    summaryText: "둔근과 햄스트링 사용이 적어 무릎과 상체 보상이 커집니다.",
  },
  default: {
    label: "자세 보정",
    coachText: "현재 흔들리는 부위를 먼저 안정시키고 리듬을 일정하게 유지하세요.",
    summaryText: "현재 구간의 주요 자세 편차를 기준으로 보정 포인트를 표시합니다.",
  },
};

const ISSUE_VOICE_SHORT_TEXT = {
  hip_hinge: "엉덩이 뒤로",
  knee_drive: "무릎 더 뒤로",
  balance: "중심 유지",
  heel_pressure: "뒤꿈치",
  posterior_chain: "엉덩이 힘",
  default: "자세 교정",
};

const VOICE_AUDIO_CACHE_BUST = "voice-v1";
const ISSUE_VOICE_AUDIO_FILES = {
  hip_hinge: "media/voice/hip-hinge.mp3",
  knee_drive: "media/voice/knee-drive.mp3",
  balance: "media/voice/balance.mp3",
  heel_pressure: "media/voice/heel-pressure.mp3",
  posterior_chain: "media/voice/posterior-chain.mp3",
  default: "media/voice/default.mp3",
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
  voiceEnabled: true,
  hasSessionStarted: false,
  avatarInitialized: false,
  selectedExerciseName: "바벨 스쿼트",
  attendance: {
    streakDays: DEFAULT_STREAK_DAYS,
    lastCompletedDate: null,
  },
  bodyProfile: { ...DEFAULT_BODY_PROFILE },
  bodyProfileEditing: false,
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
  camera: {
    stream: null,
    videoElement: null,
    startPromise: null,
    stopRequested: false,
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
    lastCueWindowKey: null,
    isSpeaking: false,
    unlockTimerId: null,
    primed: false,
    preferredVoiceURI: null,
    clipCache: new Map(),
    activeClipKey: null,
  },
  highlight: {
    available: false,
    active: false,
    startSec: 4,
    endSec: 8,
  },
  launchControlsBound: false,
  feedback: {
    schedule: [],
  },
};

const elements = {
  launchExperience: document.getElementById("launchExperience"),
  homeDashboard: document.getElementById("homeDashboard"),
  logoSplash: document.getElementById("logoSplash"),
  exerciseSelect: document.getElementById("exerciseSelect"),
  demoView: document.getElementById("demoView"),
  attendanceView: document.getElementById("attendanceView"),
  correctDemoVideo: document.getElementById("correctDemoVideo"),
  startWorkout: document.getElementById("startWorkout"),
  squatStart: document.getElementById("squatStart"),
  exerciseCards: document.querySelectorAll(".exercise-card[data-exercise-name]"),
  streakCount: document.getElementById("streakCount"),
  bodyEstimateCard: document.querySelector(".body-estimate-card"),
  bodyEstimateEdit: document.getElementById("bodyEstimateEdit"),
  bodyHeightValue: document.getElementById("bodyHeightValue"),
  bodyWeightValue: document.getElementById("bodyWeightValue"),
  bodyMuscleValue: document.getElementById("bodyMuscleValue"),
  bodyFatValue: document.getElementById("bodyFatValue"),
  bodyHeightInput: document.getElementById("bodyHeightInput"),
  bodyWeightInput: document.getElementById("bodyWeightInput"),
  bodyMuscleInput: document.getElementById("bodyMuscleInput"),
  bodyFatInput: document.getElementById("bodyFatInput"),
  demoExerciseName: document.getElementById("demoExerciseName"),
  selectedExerciseName: document.getElementById("selectedExerciseName"),
  skipDemo: document.getElementById("skipDemo"),
  attendanceHeadline: document.getElementById("attendanceHeadline"),
  attendanceHome: document.getElementById("attendanceHome"),
  sessionApp: document.getElementById("sessionApp"),
  overlayFrame: document.getElementById("overlayFrame"),
  userVideo: document.getElementById("userVideo"),
  overlayCanvas: document.getElementById("overlayCanvas"),
  avatarStage: document.getElementById("avatarStage"),
  avatarMessage: document.getElementById("avatarMessage"),
  currentIssue: document.getElementById("currentIssue"),
  scoreValue: document.getElementById("scoreValue"),
  playbackControls: document.getElementById("playbackControls"),
  playToggle: document.getElementById("playToggle"),
  voiceToggle: document.getElementById("voiceToggle"),
  highlightReplay: document.getElementById("highlightReplay"),
  sessionActionRow: document.getElementById("sessionActionRow"),
  completeWorkout: document.getElementById("completeWorkout"),
  nextExercise: document.getElementById("nextExercise"),
  finishWorkout: document.getElementById("finishWorkout"),
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
  cameraSwitch: document.getElementById("cameraSwitch"),
};

function parseDebugSessionOptions() {
  if (typeof window === "undefined") {
    return {
      autoStart: false,
      skipDemo: false,
      exerciseName: "바벨 스쿼트",
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
    exerciseName: params.get("exercise") || "바벨 스쿼트",
    timeSec: Number.isFinite(parsedTimeSec) ? parsedTimeSec : null,
    pause: params.get("pause") === "1" || hasTimeSec,
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getDeviceLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function loadAttendanceState() {
  const fallback = {
    streakDays: DEFAULT_STREAK_DAYS,
    lastCompletedDate: null,
  };

  if (typeof window === "undefined" || !window.localStorage) {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(ATTENDANCE_STORAGE_KEY);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw);
    return {
      streakDays:
        Number.isFinite(parsed?.streakDays) && parsed.streakDays >= 0
          ? Math.round(parsed.streakDays)
          : DEFAULT_STREAK_DAYS,
      lastCompletedDate:
        typeof parsed?.lastCompletedDate === "string" && parsed.lastCompletedDate
          ? parsed.lastCompletedDate
          : null,
    };
  } catch (error) {
    console.warn("Unable to load attendance state.", error);
    return fallback;
  }
}

function saveAttendanceState() {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(state.attendance));
  } catch (error) {
    console.warn("Unable to save attendance state.", error);
  }
}

function normalizeBodyProfileValue(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return clamp(parsed, min, max);
}

function loadBodyProfileState() {
  const fallback = { ...DEFAULT_BODY_PROFILE };
  if (typeof window === "undefined" || !window.localStorage) {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(BODY_PROFILE_STORAGE_KEY);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw);
    return {
      height: normalizeBodyProfileValue(parsed?.height, fallback.height, 80, 240),
      weight: normalizeBodyProfileValue(parsed?.weight, fallback.weight, 20, 250),
      muscle: normalizeBodyProfileValue(parsed?.muscle, fallback.muscle, 5, 90),
      fat: normalizeBodyProfileValue(parsed?.fat, fallback.fat, 1, 60),
    };
  } catch (error) {
    console.warn("Unable to load body profile state.", error);
    return fallback;
  }
}

function saveBodyProfileState() {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(BODY_PROFILE_STORAGE_KEY, JSON.stringify(state.bodyProfile));
  } catch (error) {
    console.warn("Unable to save body profile state.", error);
  }
}

function formatBodyProfileNumber(value) {
  const fixed = Number(value).toFixed(1);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
}

function setBodyInputValue(input, value) {
  if (!input) return;
  input.value = Number(value).toFixed(1);
}

function syncBodyProfileUi() {
  const profile = state.bodyProfile;
  if (elements.bodyHeightValue) {
    elements.bodyHeightValue.textContent = `${formatBodyProfileNumber(profile.height)}cm`;
  }
  if (elements.bodyWeightValue) {
    elements.bodyWeightValue.textContent = `${formatBodyProfileNumber(profile.weight)}kg`;
  }
  if (elements.bodyMuscleValue) {
    elements.bodyMuscleValue.textContent = `${formatBodyProfileNumber(profile.muscle)}kg`;
  }
  if (elements.bodyFatValue) {
    elements.bodyFatValue.textContent = `${formatBodyProfileNumber(profile.fat)}%`;
  }

  setBodyInputValue(elements.bodyHeightInput, profile.height);
  setBodyInputValue(elements.bodyWeightInput, profile.weight);
  setBodyInputValue(elements.bodyMuscleInput, profile.muscle);
  setBodyInputValue(elements.bodyFatInput, profile.fat);
}

function setBodyProfileEditing(isEditing) {
  state.bodyProfileEditing = Boolean(isEditing);
  elements.bodyEstimateCard?.classList.toggle("is-editing", state.bodyProfileEditing);
  if (elements.bodyEstimateEdit) {
    elements.bodyEstimateEdit.textContent = state.bodyProfileEditing ? "수정 완료" : "내 몸상태 수정";
  }

  const displayValues = [
    elements.bodyHeightValue,
    elements.bodyWeightValue,
    elements.bodyMuscleValue,
    elements.bodyFatValue,
  ];
  const editors = document.querySelectorAll(".body-estimate-editor");
  displayValues.forEach((element) => {
    if (element) element.hidden = state.bodyProfileEditing;
  });
  editors.forEach((element) => {
    element.hidden = !state.bodyProfileEditing;
  });

  if (state.bodyProfileEditing) {
    elements.bodyHeightInput?.focus();
    elements.bodyHeightInput?.select();
  }
}

function readBodyProfileInputs() {
  const current = state.bodyProfile;
  return {
    height: normalizeBodyProfileValue(elements.bodyHeightInput?.value, current.height, 80, 240),
    weight: normalizeBodyProfileValue(elements.bodyWeightInput?.value, current.weight, 20, 250),
    muscle: normalizeBodyProfileValue(elements.bodyMuscleInput?.value, current.muscle, 5, 90),
    fat: normalizeBodyProfileValue(elements.bodyFatInput?.value, current.fat, 1, 60),
  };
}

function toggleBodyProfileEditor() {
  if (!state.bodyProfileEditing) {
    syncBodyProfileUi();
    setBodyProfileEditing(true);
    return;
  }

  state.bodyProfile = readBodyProfileInputs();
  saveBodyProfileState();
  syncBodyProfileUi();
  setBodyProfileEditing(false);
}

function syncAttendanceUi() {
  const streakText = `${state.attendance.streakDays}일`;
  if (elements.streakCount) {
    elements.streakCount.textContent = streakText;
  }
  if (elements.attendanceHeadline) {
    elements.attendanceHeadline.textContent = `${state.attendance.streakDays}일 연속 꾸준한 운동에 성공하셨어요!`;
  }
}

function ensureAttendanceCheer() {
  if (!elements.attendanceHome || !elements.attendanceView) return;
  let cheer = elements.attendanceView.querySelector(".attendance-cheer");
  if (cheer) return;

  cheer = document.createElement("p");
  cheer.className = "attendance-cheer";
  cheer.innerHTML = "내일도 화이팅!<br>WorkWith!";
  elements.attendanceHome.insertAdjacentElement("beforebegin", cheer);
}

function markWorkoutCompletedToday() {
  state.attendance.streakDays += 1;
  state.attendance.lastCompletedDate = getDeviceLocalDateKey();
  saveAttendanceState();
  syncAttendanceUi();
  return true;
}

function syncVoiceToggleLabel() {
  if (!elements.voiceToggle) return;
  elements.voiceToggle.textContent = state.voiceEnabled ? "음성 안내 ON" : "음성 안내 OFF";
  elements.voiceToggle.setAttribute("aria-pressed", state.voiceEnabled ? "true" : "false");
}

function getPreferredSpeechVoice() {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice =
    voices.find((voice) => voice.lang === "ko-KR") ||
    voices.find((voice) => (voice.lang || "").toLowerCase() === "ko-kr") ||
    voices.find((voice) => (voice.lang || "").toLowerCase().startsWith("ko")) ||
    voices[0] ||
    null;
  state.voice.preferredVoiceURI = preferredVoice?.voiceURI || null;
  return preferredVoice;
}

function clearVoiceUnlockTimer() {
  if (!state.voice.unlockTimerId) return;
  window.clearTimeout(state.voice.unlockTimerId);
  state.voice.unlockTimerId = null;
}

function releaseVoicePlaybackLock() {
  clearVoiceUnlockTimer();
  state.voice.isSpeaking = false;
}

function lockVoicePlayback() {
  state.voice.isSpeaking = true;
  clearVoiceUnlockTimer();
  state.voice.unlockTimerId = window.setTimeout(() => {
    releaseVoicePlaybackLock();
  }, VOICE_LOCK_FALLBACK_MS);
}

function primeSpeechSynthesis(useWarmup = false) {
  if (!("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  try {
    synth.resume();
  } catch {}

  const preferredVoice = getPreferredSpeechVoice();
  if (!useWarmup || state.voice.primed) return;

  state.voice.primed = true;
  const warmupUtterance = new SpeechSynthesisUtterance(" ");
  warmupUtterance.lang = "ko-KR";
  warmupUtterance.volume = 0;
  warmupUtterance.rate = 1;
  warmupUtterance.pitch = 1;
  if (preferredVoice) {
    warmupUtterance.voice = preferredVoice;
  }
  warmupUtterance.onerror = () => {
    state.voice.primed = false;
  };

  try {
    synth.speak(warmupUtterance);
  } catch {
    state.voice.primed = false;
  }
}

function getVoiceClipKey(issueId) {
  return ISSUE_VOICE_AUDIO_FILES[issueId] ? issueId : "default";
}

function ensureVoiceClip(issueId) {
  const clipKey = getVoiceClipKey(issueId);
  if (state.voice.clipCache.has(clipKey)) {
    return state.voice.clipCache.get(clipKey);
  }

  const clipPath = ISSUE_VOICE_AUDIO_FILES[clipKey];
  if (!clipPath) return null;

  const clip = new Audio(`${clipPath}?v=${VOICE_AUDIO_CACHE_BUST}`);
  clip.preload = "auto";
  clip.addEventListener("ended", () => {
    if (state.voice.activeClipKey === clipKey) {
      state.voice.activeClipKey = null;
    }
    releaseVoicePlaybackLock();
  });
  clip.addEventListener("error", () => {
    if (state.voice.activeClipKey === clipKey) {
      state.voice.activeClipKey = null;
    }
    releaseVoicePlaybackLock();
  });

  state.voice.clipCache.set(clipKey, clip);
  return clip;
}

function stopActiveVoiceClip() {
  if (!state.voice.activeClipKey) return;
  const activeClip = state.voice.clipCache.get(state.voice.activeClipKey);
  state.voice.activeClipKey = null;
  if (!activeClip) return;
  try {
    activeClip.pause();
    activeClip.currentTime = 0;
  } catch {}
}

function preloadGeneratedVoiceClips() {
  Object.keys(ISSUE_VOICE_AUDIO_FILES).forEach((issueId) => {
    const clip = ensureVoiceClip(issueId);
    if (!clip) return;
    try {
      clip.load();
    } catch {}
  });
}

function playBrowserSpeechCue(shortText) {
  if (!("speechSynthesis" in window)) return false;
  primeSpeechSynthesis();

  const synth = window.speechSynthesis;
  if (synth.speaking || synth.pending) return false;

  const utterance = new SpeechSynthesisUtterance(shortText);
  utterance.lang = "ko-KR";
  utterance.rate = 1.08;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  const preferredVoice = getPreferredSpeechVoice();
  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }
  utterance.onend = () => {
    releaseVoicePlaybackLock();
  };
  utterance.onerror = () => {
    releaseVoicePlaybackLock();
  };

  try {
    synth.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

function playPreferredVoiceCue(issueId, shortText) {
  const clipKey = getVoiceClipKey(issueId);
  const clip = ensureVoiceClip(clipKey);
  if (!clip) {
    return playBrowserSpeechCue(shortText);
  }

  stopActiveVoiceClip();
  state.voice.activeClipKey = clipKey;

  try {
    clip.currentTime = 0;
  } catch {}

  const playResult = clip.play();
  if (playResult && typeof playResult.then === "function") {
    playResult.catch(() => {
      if (state.voice.activeClipKey === clipKey) {
        state.voice.activeClipKey = null;
      }
      if (!playBrowserSpeechCue(shortText)) {
        releaseVoicePlaybackLock();
      }
    });
  }

  return true;
}

function getVoicePrompt(issueId, scheduledFeedback, warningIssue) {
  const promptMap = {
    hip_hinge: "엉덩이 더 뒤로",
    knee_drive: "무릎을 좀 더 뒤로",
    balance: "중심을 잡아 주세요",
    heel_pressure: "뒤꿈치로 버텨 주세요",
    posterior_chain: "엉덩이에 힘 주세요",
    default: "자세를 바로잡아 주세요",
  };
  return (
    promptMap[issueId] ||
    scheduledFeedback?.label ||
    warningIssue?.label ||
    promptMap.default
  );
}

function smoothstep(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function fmt(value, digits = 1, suffix = "") {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : "--";
}

function adjustDisplayedScore(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return clamp(value - SCORE_DISPLAY_OFFSET, 0, 100);
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
    buckets.set(second, { ...bucket, avg: adjustDisplayedScore(bucket.sum / bucket.count) });
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
      avgScore: adjustDisplayedScore(bucket.scoreSum / Math.max(bucket.count, 1)),
      runningAvgScore: adjustDisplayedScore(cumulativeScore / Math.max(cumulativeFrames, 1)),
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

function setStandaloneUiClass() {
  const isStandalone =
    window.navigator?.standalone === true ||
    window.matchMedia?.("(display-mode: standalone)")?.matches;
  document.documentElement.classList.toggle("is-standalone", Boolean(isStandalone));
}

function getCameraKeepAliveVideo() {
  if (state.camera.videoElement) {
    return state.camera.videoElement;
  }

  const video = document.createElement("video");
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("aria-hidden", "true");
  video.style.position = "fixed";
  video.style.left = "-2px";
  video.style.bottom = "-2px";
  video.style.width = "1px";
  video.style.height = "1px";
  video.style.opacity = "0";
  video.style.pointerEvents = "none";
  video.style.zIndex = "-1";
  document.body.appendChild(video);
  state.camera.videoElement = video;
  return video;
}

function stopCameraKeepAlive() {
  state.camera.stopRequested = true;
  if (state.camera.stream) {
    state.camera.stream.getTracks().forEach((track) => track.stop());
    state.camera.stream = null;
  }
  if (state.camera.videoElement) {
    state.camera.videoElement.pause();
    state.camera.videoElement.srcObject = null;
  }
}

async function startCameraKeepAlive() {
  if (state.camera.stream || state.camera.startPromise) {
    return state.camera.startPromise || state.camera.stream;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return null;
  }

  state.camera.stopRequested = false;
  const facingMode = CAMERA_KEEPALIVE_TUNING.facingMode || "user";
  const constraints = {
    audio: false,
    video: {
      facingMode,
      width: { ideal: 640 },
      height: { ideal: 480 },
    },
  };

  state.camera.startPromise = navigator.mediaDevices.getUserMedia(constraints)
    .then((stream) => {
      if (state.camera.stopRequested) {
        stream.getTracks().forEach((track) => track.stop());
        return null;
      }

      state.camera.stream = stream;
      const video = getCameraKeepAliveVideo();
      video.srcObject = stream;
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
      return stream;
    })
    .catch((error) => {
      console.warn("Camera keep-alive unavailable.", error);
      return null;
    })
    .finally(() => {
      state.camera.startPromise = null;
    });

  return state.camera.startPromise;
}

function postNativeOrientation(mode) {
  try {
    window.webkit?.messageHandlers?.workwithOrientation?.postMessage(mode);
  } catch (error) {
    console.warn("Native orientation bridge unavailable.", error);
  }
}

function lockBrowserOrientation(mode) {
  const orientation = mode === "landscape" ? "landscape" : "portrait-primary";
  const lock = window.screen?.orientation?.lock;
  if (typeof lock !== "function") {
    return;
  }

  const lockPromise = lock.call(window.screen.orientation, orientation);
  if (lockPromise && typeof lockPromise.catch === "function") {
    lockPromise.catch(() => {});
  }
}

function requestAppOrientation(mode) {
  const normalizedMode = mode === "landscape" ? "landscape" : "portrait";
  document.documentElement.dataset.orientationTarget = normalizedMode;
  postNativeOrientation(normalizedMode);
  lockBrowserOrientation(normalizedMode);
}

function showLaunchScreen(screenName) {
  stopCameraKeepAlive();
  requestAppOrientation("portrait");

  const screens = {
    home: elements.homeDashboard,
    exercise: elements.exerciseSelect,
    trainerLesson: elements.demoView,
    attendance: elements.attendanceView,
  };

  Object.entries(screens).forEach(([name, screen]) => {
    if (!screen) return;
    const active = name === screenName;
    screen.hidden = !active;
    screen.classList.toggle("is-active", active);
  });

  if (elements.launchExperience) {
    elements.launchExperience.hidden = false;
  }

  if (screenName === "home" || screenName === "attendance") {
    syncAttendanceUi();
  }
}

function playLaunchSplash() {
  if (!elements.logoSplash) return;
  elements.launchExperience?.classList.add("is-splashing");
  elements.logoSplash.hidden = false;
  elements.logoSplash.classList.remove("is-complete");

  window.setTimeout(() => {
    if (!elements.logoSplash) return;
    elements.logoSplash.classList.add("is-complete");
    window.setTimeout(() => {
      if (!elements.logoSplash) return;
      elements.logoSplash.hidden = true;
      elements.launchExperience?.classList.remove("is-splashing");
    }, 500);
  }, 980);
}

function dismissLaunchSplash() {
  elements.launchExperience?.classList.remove("is-splashing");
  if (!elements.logoSplash) return;
  elements.logoSplash.classList.add("is-complete");
  elements.logoSplash.hidden = true;
}

function flashButton(button) {
  if (!button) return;
  button.classList.remove("is-tapped");
  void button.offsetWidth;
  button.classList.add("is-tapped");
}

function updateSessionControls() {
  const reportPass = isReportPass();

  if (elements.sessionApp) {
    elements.sessionApp.dataset.pass = reportPass ? "review" : "live";
  }
  if (elements.playbackControls) {
    elements.playbackControls.hidden = false;
    elements.playbackControls.classList.toggle("voice-only", !reportPass);
  }
  if (elements.playToggle) {
    elements.playToggle.hidden = !reportPass;
  }
  if (elements.voiceToggle) {
    elements.voiceToggle.hidden = false;
    syncVoiceToggleLabel();
  }
  if (elements.timeline) {
    elements.timeline.hidden = !reportPass;
  }
  if (elements.completeWorkout) {
    elements.completeWorkout.hidden = reportPass;
  }
  if (elements.nextExercise) {
    elements.nextExercise.hidden = !reportPass;
  }
  if (elements.finishWorkout) {
    elements.finishWorkout.hidden = !reportPass;
  }
  if (elements.sessionActionRow) {
    elements.sessionActionRow.classList.toggle("review-mode", reportPass);
  }
  if (elements.phaseLabel) {
    elements.phaseLabel.hidden = true;
    elements.phaseLabel.textContent = "";
  }

  syncHighlightButton();
}

function showAttendanceAndReturnHome() {
  pause();
  markWorkoutCompletedToday();
  state.hasSessionStarted = false;
  state.highlight.active = false;
  resetSessionProgress();

  if (elements.correctDemoVideo) {
    elements.correctDemoVideo.pause();
    elements.correctDemoVideo.currentTime = 0;
  }
  if (elements.sessionApp) {
    elements.sessionApp.hidden = true;
  }

  showLaunchScreen("attendance");
}

function syncHighlightButton() {
  const button = elements.highlightReplay;
  if (!button) return;

  const available = isReportPass() && (state.highlight.available || state.session.passIndex >= 1);
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
  updateSessionControls();
  seekToTime(state.highlight.startSec);
  play();
}

function resetSessionProgress() {
  state.session.passIndex = 0;
  state.highlight.available = false;
  state.highlight.active = false;
  updateSessionControls();
  resetVoiceTracking();
}

function getDisplayedScore(frame) {
  const bucket = state.scoreBuckets.get(Math.floor(frame.time_sec));
  return bucket ? bucket.avg : adjustDisplayedScore(frame.score);
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

function applyLoadedUserOverlayData(data) {
  state.userOverlay.data = data || null;
  const overlayDurationSec = Number(state.userOverlay.data?.duration_sec);
  if (Number.isFinite(overlayDurationSec) && overlayDurationSec > 0) {
    state.media.userVideoDurationSec = overlayDurationSec;
  }
}

async function loadUserOverlayData() {
  if (window.__WORKWITH_USER_OVERLAY__) {
    applyLoadedUserOverlayData(window.__WORKWITH_USER_OVERLAY__);
    return;
  }

  const response = await fetch(buildMediaUrl(USER_OVERLAY_TUNING.dataPath || "data/user-overlay-analysis.json", USER_VIDEO_CACHE_BUST), {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("사용자 MediaPipe 오버레이 데이터를 불러오지 못했습니다.");
  }
  applyLoadedUserOverlayData(await response.json());
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

function getPlaybackIndexForTime(timeSec) {
  return Math.max(
    0,
    Math.min(
      getPlaybackFrameCount() - 1,
      Math.round(clamp(timeSec, 0, getPlaybackDurationSec()) * Math.max(state.player.fps, 1)),
    ),
  );
}

function getVideoDrivenPlaybackIndex() {
  const video = elements.userVideo;
  if (!state.player.isPlaying || !video || video.ended || !Number.isFinite(video.currentTime)) {
    return null;
  }
  return getPlaybackIndexForTime(video.currentTime);
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
    buildFeedbackSchedule();
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
  if (state.player.isPlaying && !forceSeek) {
    renderPoseOverlayAtTime(video.currentTime);
    return;
  }

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
  const names = new Set();
  if (!issueId) return names;
  const primarySide = getUserInputVideoMeta().primary_side || "left";
  const resolver = ISSUE_HOT_NAMES[issueId];
  (resolver ? resolver(primarySide) : []).forEach((name) => {
    if (HIGHLIGHT_ALLOWED_JOINTS.has(name)) {
      names.add(name);
    }
  });
  return names;
}

function getTimedHighlightJointNames(playbackTimeSec, names = []) {
  const phaseSec = ((playbackTimeSec % FEEDBACK_INTERVAL_SEC) + FEEDBACK_INTERVAL_SEC) % FEEDBACK_INTERVAL_SEC;
  if (phaseSec > HIGHLIGHT_FLASH_DURATION_SEC) return [];
  return names.filter((name) => HIGHLIGHT_ALLOWED_JOINTS.has(name));
}

function getFeedbackPulsePhaseSec(playbackTimeSec) {
  return ((playbackTimeSec % FEEDBACK_INTERVAL_SEC) + FEEDBACK_INTERVAL_SEC) % FEEDBACK_INTERVAL_SEC;
}

function getFeedbackCopy(issueId) {
  return ISSUE_FEEDBACK_COPY[issueId] || ISSUE_FEEDBACK_COPY.default;
}

function summarizeIssueWindow(frames) {
  const issueMap = new Map();
  (frames || []).forEach((frame) => {
    (frame.issues || []).forEach((issue) => {
      const current = issueMap.get(issue.id) || {
        id: issue.id,
        label: issue.label,
        severitySum: 0,
        count: 0,
      };
      current.severitySum += issue.severity || 0;
      current.count += 1;
      issueMap.set(issue.id, current);
    });
  });

  const topIssue = [...issueMap.values()]
    .map((issue) => ({
      id: issue.id,
      label: issue.label,
      severity: issue.count ? issue.severitySum / issue.count : 0,
    }))
    .sort((a, b) => b.severity - a.severity)[0] || null;

  if (!topIssue) {
    return null;
  }

  const copy = getFeedbackCopy(topIssue.id);
  return {
    issueId: topIssue.id,
    label: copy.label || topIssue.label,
    coachText: copy.coachText,
    summaryText: copy.summaryText,
    highlightedJointNames: [...getHotJointNames(null, topIssue.id)],
    severity: topIssue.severity,
  };
}

function buildFeedbackSchedule() {
  const durationSec = getPlaybackDurationSec();
  const frames = state.data?.frames || [];
  const schedule = [];
  if (!frames.length || !Number.isFinite(durationSec) || durationSec <= 0) {
    state.feedback.schedule = schedule;
    return;
  }

  for (let startSec = 0; startSec < durationSec; startSec += FEEDBACK_INTERVAL_SEC) {
    const endSec = Math.min(durationSec, startSec + FEEDBACK_INTERVAL_SEC);
    const sourceStartSec = mapPlaybackTimeToSourceTime(startSec);
    const sourceEndSec = mapPlaybackTimeToSourceTime(endSec);
    const windowFrames = frames.filter((frame) => frame.time_sec >= sourceStartSec && frame.time_sec < sourceEndSec + 1e-6);
    const feedback = summarizeIssueWindow(windowFrames);
    schedule.push({
      startSec,
      endSec,
      ...(feedback || {
        issueId: null,
        label: "자세 안정 구간",
        coachText: "현재 구간은 큰 편차 없이 유지되고 있습니다.",
        summaryText: "다음 3초 구간에서 더 중요한 편차가 있으면 자동으로 바뀝니다.",
        highlightedJointNames: [],
        severity: 0,
      }),
    });
  }

  state.feedback.schedule = schedule;
}

function getScheduledFeedback(playbackTimeSec, frame) {
  const schedule = state.feedback.schedule || [];
  if (schedule.length) {
    const windowIndex = Math.min(
      schedule.length - 1,
      Math.max(0, Math.floor(Math.max(playbackTimeSec, 0) / FEEDBACK_INTERVAL_SEC)),
    );
    return schedule[windowIndex];
  }

  const fallbackIssue = (frame?.issues || [])[0] || null;
  if (!fallbackIssue) {
    return {
      issueId: null,
      label: "자세 안정 구간",
      coachText: "현재 구간은 큰 편차 없이 유지되고 있습니다.",
      summaryText: "다음 구간에서 편차가 보이면 자동으로 보정 포인트를 표시합니다.",
      highlightedJointNames: [],
      severity: 0,
    };
  }

  const copy = getFeedbackCopy(fallbackIssue.id);
  return {
    issueId: fallbackIssue.id,
    label: copy.label || fallbackIssue.label,
    coachText: copy.coachText,
    summaryText: copy.summaryText,
    highlightedJointNames: [...getHotJointNames(frame, fallbackIssue.id)],
    severity: fallbackIssue.severity || 0,
  };
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
    return adjustDisplayedScore(matchMetric.value);
  }
  return adjustDisplayedScore(state.data?.overview?.average_score || 0);
}

function getCompactFinalMetrics() {
  const preferredIds = ["match", "heel_contact", "hip_hinge", "stability", "posterior_chain"];
  const reportMetrics = state.data.report.final_scores || [];
  return preferredIds
    .map((id) => {
      const metric = reportMetrics.find((item) => item.id === id);
      if (!metric) return null;
      if (metric.id !== "match") return metric;
      return {
        ...metric,
        value: adjustDisplayedScore(metric.value),
      };
    })
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
  state.voice.lastCueWindowKey = null;
  state.voice.lastSpokenIssueId = null;
  state.voice.lastSpokenAt = 0;
  stopActiveVoiceClip();
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  releaseVoicePlaybackLock();
}

function maybeSpeak(warningIssue, scheduledFeedback, playbackTimeSec) {
  if (isReportPass()) return;
  if (!state.voiceEnabled || !warningIssue) return;
  const highlightedJointNames = getTimedHighlightJointNames(
    playbackTimeSec,
    scheduledFeedback?.highlightedJointNames || [],
  );
  if (!highlightedJointNames.length) return;

  const phaseSec = getFeedbackPulsePhaseSec(playbackTimeSec);
  if (phaseSec > Math.min(HIGHLIGHT_FLASH_DURATION_SEC, VOICE_PULSE_SPEAK_WINDOW_SEC)) return;

  const issueId = warningIssue.id;
  const cueWindowIndex = Math.max(0, Math.floor(Math.max(playbackTimeSec, 0) / FEEDBACK_INTERVAL_SEC));
  const cueWindowKey = `${cueWindowIndex}:${issueId}`;
  if (state.voice.lastCueWindowKey === cueWindowKey) return;
  if (state.voice.isSpeaking) return;
  if ("speechSynthesis" in window) {
    const synth = window.speechSynthesis;
    if (synth.speaking || synth.pending) return;
  }

  const shortText = getVoicePrompt(issueId, scheduledFeedback, warningIssue);
  lockVoicePlayback();
  if (!playPreferredVoiceCue(issueId, shortText)) {
    releaseVoicePlaybackLock();
    return;
  }

  state.voice.lastSpokenIssueId = issueId;
  state.voice.lastSpokenAt = Date.now();
  state.voice.lastCueWindowKey = cueWindowKey;
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
  const scheduledFeedback = getScheduledFeedback(playbackTimeSec, frame);
  const effectiveIssueId = scheduledFeedback.issueId || topIssue?.id || null;
  const effectiveIssueLabel = scheduledFeedback.label || topIssue?.label || "자세 비교 중";
  const warningIssue = effectiveIssueId && (scheduledFeedback.issueId || displayedScore <= WARNING_SCORE_THRESHOLD)
    ? { id: effectiveIssueId, label: effectiveIssueLabel, severity: scheduledFeedback.severity || topIssue?.severity || 0 }
    : null;
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
  elements.averageScore.textContent = `${Math.round(reportReady ? adjustDisplayedScore(overview.average_score) : bucket.runningAvgScore)}`;
  elements.repCount.textContent = `${reportReady ? getReportRepCount() : bucket.repCount}`;
  elements.matchValue.textContent = `${Math.round(reportReady ? finalMatchScore : displayedScore)}점`;
  elements.issueCount.textContent = `${reportReady ? reportFindings.length : bucket.issueCount}`;
  elements.currentIssue.textContent = reportReady ? report.headline : effectiveIssueLabel;
  elements.phaseLabel.textContent = formatPhase(frame, playbackTimeSec);
  elements.coachText.textContent = reportReady
    ? `${reportFocus} 중심으로 종합 평가를 정리했습니다.`
    : scheduledFeedback.coachText;
  elements.summaryText.textContent = reportReady
    ? "전문의와 트레이너 관점 평가는 아래에서 확인할 수 있습니다."
    : scheduledFeedback.summaryText;

  renderMetrics(reportReady ? [] : getLiveMetrics(bucket.metrics));
  renderFinalMetrics(reportReady);

  elements.issueListSection.hidden = true;
  elements.issueList.innerHTML = "";

  elements.reportStatus.textContent = reportReady ? "평가 완료" : "비교 중";
  elements.reportStatus.classList.toggle("ready", reportReady);
  elements.reportFindingTitle.textContent = reportReady ? reportFocus || "핵심 이슈 정리" : effectiveIssueLabel;
  elements.reportFindingCopy.textContent = reportReady ? report.summary : "";
  elements.reportGuideTitle.textContent = reportReady ? (topFinding?.label || "다음 세트 가이드") : "현재 안내";
  elements.reportGuideCopy.textContent = reportReady ? guideLine : scheduledFeedback.coachText;
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
    maybeSpeak(warningIssue, scheduledFeedback, playbackTimeSec);
  }
}

function showFrame(index, options = {}) {
  const clamped = Math.max(0, Math.min(index, getPlaybackFrameCount() - 1));
  const playbackTimeSec = getPlaybackTimeForIndex(clamped);
  const frame = getSourceFrameForPlaybackIndex(clamped);
  state.player.index = clamped;
  state.player.playbackTimeSec = playbackTimeSec;
  syncUserVideoFrame(frame, playbackTimeSec, options.forceUserVideoSeek === true);
  updateFrame(frame, playbackTimeSec);
  updateAvatarScene(frame, playbackTimeSec);
  updateSessionControls();
}

function pause() {
  if (state.player.timerId) {
    clearInterval(state.player.timerId);
    state.player.timerId = null;
  }
  pauseUserVideo();
  state.highlight.active = false;
  state.player.isPlaying = false;
  if (elements.playToggle) {
    elements.playToggle.textContent = "재생";
  }
  updateSessionControls();
}

function play() {
  const initialLastIndex = getPlaybackFrameCount() - 1;
  if (state.session.passIndex >= state.session.totalPasses - 1 && state.player.index >= initialLastIndex) {
    resetSessionProgress();
    showFrame(0, { forceUserVideoSeek: true });
  }
  if (state.player.isPlaying) return;
  state.player.isPlaying = true;
  playUserVideo();
  if (elements.playToggle) {
    elements.playToggle.textContent = "일시정지";
  }
  updateSessionControls();

  const intervalMs = 1000 / Math.max(state.player.fps, 1);
  state.player.timerId = window.setInterval(() => {
    const lastIndex = getPlaybackFrameCount() - 1;
    const syncedIndex = getVideoDrivenPlaybackIndex();
    const nextIndex = syncedIndex ?? state.player.index + 1;

    if (state.player.index >= lastIndex) {
      if (state.session.passIndex < state.session.totalPasses - 1) {
        state.session.passIndex += 1;
        state.highlight.available = true;
        showFrame(0, { forceUserVideoSeek: true });
        playUserVideo();
        return;
      }
      showFrame(lastIndex);
      pause();
      return;
    }

    showFrame(nextIndex);
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
  showFrame(Math.round(targetTimeSec * Math.max(state.player.fps, 1)), { forceUserVideoSeek: true });
}

function bindControls() {
  elements.playToggle?.addEventListener("click", () => {
    if (state.player.isPlaying) {
      pause();
    } else {
      play();
    }
  });

  elements.voiceToggle?.addEventListener("click", () => {
    state.voiceEnabled = !state.voiceEnabled;
    syncVoiceToggleLabel();
    if (!state.voiceEnabled) {
      resetVoiceTracking();
      return;
    }
    preloadGeneratedVoiceClips();
    primeSpeechSynthesis(true);
  });

  elements.highlightReplay?.addEventListener("click", () => {
    startHighlightPlayback();
  });

  elements.completeWorkout?.addEventListener("click", () => {
    flashButton(elements.completeWorkout);
  });

  elements.cameraSwitch?.addEventListener("click", () => {
    flashButton(elements.cameraSwitch);
  });

  elements.nextExercise?.addEventListener("click", () => {
    flashButton(elements.nextExercise);
  });

  elements.finishWorkout?.addEventListener("click", () => {
    showAttendanceAndReturnHome();
  });

  elements.attendanceHome?.addEventListener("click", () => {
    showLaunchScreen("home");
  });

  window.addEventListener("resize", () => {
    if (state.resizeTimerId) {
      window.clearTimeout(state.resizeTimerId);
    }
    state.resizeTimerId = window.setTimeout(() => {
      renderPoseOverlayAtTime(elements.userVideo?.currentTime || state.player.playbackTimeSec || 0, true);
    }, 80);
  });
  window.addEventListener("pagehide", stopCameraKeepAlive);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopCameraKeepAlive();
    }
  });
}

function revealExerciseSelect() {
  showLaunchScreen("exercise");
}

function startAnalysisSession() {
  if (state.hasSessionStarted) return;
  state.hasSessionStarted = true;
  preloadGeneratedVoiceClips();
  primeSpeechSynthesis(true);
  requestAppOrientation("landscape");

  dismissLaunchSplash();

  if (elements.correctDemoVideo) {
    elements.correctDemoVideo.pause();
    elements.correctDemoVideo.currentTime = 0;
  }
  if (elements.demoView) {
    elements.demoView.hidden = true;
  }
  if (elements.attendanceView) {
    elements.attendanceView.hidden = true;
  }
  if (elements.launchExperience) {
    elements.launchExperience.hidden = true;
  }
  if (elements.sessionApp) {
    elements.sessionApp.hidden = false;
  }
  void startCameraKeepAlive();
  initAvatarScene();

  const beginSessionPlayback = () => {
    buildTimeline();
    resetSessionProgress();
    showFrame(0, { forceUserVideoSeek: true });
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

function showReferenceDemo(exerciseName = "바벨 스쿼트") {
  state.selectedExerciseName = exerciseName;
  if (elements.demoExerciseName) {
    elements.demoExerciseName.textContent = exerciseName;
  }
  if (elements.selectedExerciseName) {
    elements.selectedExerciseName.textContent = exerciseName;
  }

  showLaunchScreen("trainerLesson");
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
  if (state.launchControlsBound) {
    showLaunchScreen("home");
    return;
  }
  state.launchControlsBound = true;

  elements.startWorkout?.addEventListener("click", () => {
    showLaunchScreen("exercise");
  });
  elements.bodyEstimateEdit?.addEventListener("click", toggleBodyProfileEditor);
  elements.exerciseCards?.forEach((card) => {
    card.addEventListener("click", () => showReferenceDemo(card.dataset.exerciseName || "바벨 스쿼트"));
  });
  elements.skipDemo?.addEventListener("click", startAnalysisSession);
  elements.correctDemoVideo?.addEventListener("ended", startAnalysisSession);
  showLaunchScreen("home");
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
  const scheduledFeedback = getScheduledFeedback(playbackTimeSec, frame);
  const highlightedJointNames = getTimedHighlightJointNames(
    playbackTimeSec,
    scheduledFeedback.highlightedJointNames || [],
  );
  window.WorkWithAvatarScene.update(frame, {
    playbackTimeSec,
    playbackDurationSec: getPlaybackDurationSec(),
    reportReady: isReportPass(),
    highlightedJointNames,
  });
}

async function bootstrap() {
  setStandaloneUiClass();
  state.data = await loadData();
  state.attendance = loadAttendanceState();
  state.bodyProfile = loadBodyProfileState();
  saveAttendanceState();
  syncAttendanceUi();
  syncBodyProfileUi();
  setBodyProfileEditing(false);
  await loadUserOverlayData().catch((error) => {
    console.warn("User overlay disabled.", error);
    state.userOverlay.data = null;
  });
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
  buildFeedbackSchedule();
  state.player.fps = getUserInputVideoMeta().sampled_fps || 10;
  ensureUserVideoSource();

  bindControls();
  bindLaunchControls();
  ensureAttendanceCheer();
  syncVoiceToggleLabel();
  if ("speechSynthesis" in window) {
    const primeOnce = () => {
      primeSpeechSynthesis(true);
    };
    window.speechSynthesis.getVoices();
    getPreferredSpeechVoice();
    if (typeof window.speechSynthesis.addEventListener === "function") {
      window.speechSynthesis.addEventListener("voiceschanged", getPreferredSpeechVoice);
    }
    window.addEventListener("pointerdown", primeOnce, { once: true, passive: true });
    window.addEventListener("touchstart", primeOnce, { once: true, passive: true });
    window.addEventListener("keydown", primeOnce, { once: true });
  }

  if (DEBUG_SESSION_OPTIONS.autoStart) {
    dismissLaunchSplash();
  } else {
    playLaunchSplash();
  }

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
  dismissLaunchSplash();
  bindLaunchControls();
  elements.summaryText.textContent = error.message;
  elements.coachText.textContent = "세션 데이터를 불러오지 못했습니다.";
  elements.medicalDetail.textContent = error.message;
  elements.trainerDetail.textContent = error.message;
});
