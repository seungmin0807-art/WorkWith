(() => {
  const THREE = window.THREE;

  if (!THREE) {
    window.WorkWithAvatarScene = {
      init: () => Promise.reject(new Error("Three.js is not loaded.")),
      update: () => {},
      resize: () => {},
    };
    return;
  }

  const QUERY = new URLSearchParams(window.location.search);
  const DEBUG_SKELETON = QUERY.get("debugSkeleton") === "1";
  const DEBUG_RETARGET = QUERY.get("debugRetarget") === "1";
  const ASSET_VERSION = "20260421-bvh23";
  const TUNING = window.WORKWITH_TUNING || {};
  const AVATAR_TUNING = TUNING.avatar || {};

  function tunedNumber(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function tunedVector3(value, fallback) {
    return new THREE.Vector3(
      tunedNumber(value?.x, fallback.x),
      tunedNumber(value?.y, fallback.y),
      tunedNumber(value?.z, fallback.z),
    );
  }
  const BODY_SEGMENTS = [
    ["left_shoulder", "right_shoulder"],
    ["left_shoulder", "left_elbow"],
    ["left_elbow", "left_wrist"],
    ["right_shoulder", "right_elbow"],
    ["right_elbow", "right_wrist"],
    ["left_shoulder", "left_hip"],
    ["right_shoulder", "right_hip"],
    ["left_hip", "right_hip"],
    ["left_hip", "left_knee"],
    ["left_knee", "left_ankle"],
    ["left_ankle", "left_heel"],
    ["left_heel", "left_foot_index"],
    ["right_hip", "right_knee"],
    ["right_knee", "right_ankle"],
    ["right_ankle", "right_heel"],
    ["right_heel", "right_foot_index"],
    ["nose", "left_shoulder"],
    ["nose", "right_shoulder"],
  ];

  const MODEL_FRONT_FINE_TUNE_Y = tunedNumber(AVATAR_TUNING.modelFrontFineTuneY, 0);
  const MOTION_WORLD_ROTATION_Y = tunedNumber(AVATAR_TUNING.motionWorldRotationY, 0);
  const AVATAR_OFFSETS = {
    reference: tunedVector3(AVATAR_TUNING.offsets?.reference, { x: -0.02, y: -0.18, z: -0.09 }),
    user: tunedVector3(AVATAR_TUNING.offsets?.user, { x: 0.02, y: -0.18, z: 0.09 }),
  };

  const RIG_APPEARANCE = {
    reference: {
      color: tunedNumber(AVATAR_TUNING.appearance?.reference?.color, 0x59cfff),
      opacity: tunedNumber(AVATAR_TUNING.appearance?.reference?.opacity, 0.54),
      emissive: tunedNumber(AVATAR_TUNING.appearance?.reference?.emissive, 0x08304d),
      emissiveIntensity: tunedNumber(AVATAR_TUNING.appearance?.reference?.emissiveIntensity, 0.38),
    },
    user: {
      color: tunedNumber(AVATAR_TUNING.appearance?.user?.color, 0xf5f9ff),
      opacity: tunedNumber(AVATAR_TUNING.appearance?.user?.opacity, 0.68),
      emissive: tunedNumber(AVATAR_TUNING.appearance?.user?.emissive, 0x141a22),
      emissiveIntensity: tunedNumber(AVATAR_TUNING.appearance?.user?.emissiveIntensity, 0.12),
    },
  };

  const HIGHLIGHT_BONE_MAP = {
    nose: "spine.004",
    left_shoulder: "upper_arm.L",
    left_elbow: "forearm.L",
    left_wrist: "hand.L",
    right_shoulder: "upper_arm.R",
    right_elbow: "forearm.R",
    right_wrist: "hand.R",
    left_hip: "thigh.L",
    left_knee: "shin.L",
    left_ankle: "foot.L",
    left_heel: "foot.L",
    left_foot_index: "foot.L",
    right_hip: "thigh.R",
    right_knee: "shin.R",
    right_ankle: "foot.R",
    right_heel: "foot.R",
    right_foot_index: "foot.R",
  };
  const HIGHLIGHT_ALLOWED_JOINTS = new Set(["left_hip", "right_hip", "left_knee", "right_knee"]);
  const HIGHLIGHT_KNEE_BENT_MAX_ANGLE_DEG = tunedNumber(
    AVATAR_TUNING.highlights?.kneeBentMaxAngleDeg,
    150,
  );

  const HIGHLIGHT_REGION_BONES = {
    "spine.004": ["spine.003", "spine.004", "spine.005"],
    "upper_arm.L": ["shoulder.L", "upper_arm.L"],
    "forearm.L": ["forearm.L"],
    "hand.L": [
      "hand.L",
      "thumb.01.L",
      "thumb.02.L",
      "thumb.03.L",
      "f_index.01.L",
      "f_index.02.L",
      "f_index.03.L",
      "f_middle.01.L",
      "f_middle.02.L",
      "f_middle.03.L",
      "f_ring.01.L",
      "f_ring.02.L",
      "f_ring.03.L",
      "f_pinky.01.L",
      "f_pinky.02.L",
      "f_pinky.03.L",
    ],
    "upper_arm.R": ["shoulder.R", "upper_arm.R"],
    "forearm.R": ["forearm.R"],
    "hand.R": [
      "hand.R",
      "thumb.01.R",
      "thumb.02.R",
      "thumb.03.R",
      "f_index.01.R",
      "f_index.02.R",
      "f_index.03.R",
      "f_middle.01.R",
      "f_middle.02.R",
      "f_middle.03.R",
      "f_ring.01.R",
      "f_ring.02.R",
      "f_ring.03.R",
      "f_pinky.01.R",
      "f_pinky.02.R",
      "f_pinky.03.R",
    ],
    "thigh.L": ["pelvis.L", "thigh.L"],
    "shin.L": ["shin.L"],
    "foot.L": ["foot.L", "toe.L", "heel.02.L"],
    "thigh.R": ["pelvis.R", "thigh.R"],
    "shin.R": ["shin.R"],
    "foot.R": ["foot.R", "toe.R", "heel.02.R"],
  };

  const HAND_POSE_ROTATIONS = {
    "hand.L": {
      x: tunedNumber(AVATAR_TUNING.hands?.wristBendX, 0.16),
      z: tunedNumber(AVATAR_TUNING.hands?.wristSplayZ, 0.03),
    },
    "thumb.01.L": {
      x: tunedNumber(AVATAR_TUNING.hands?.thumbBaseX, 0.2),
      y: tunedNumber(AVATAR_TUNING.hands?.thumbBaseY, 0.62),
      z: tunedNumber(AVATAR_TUNING.hands?.thumbBaseZ, 0.56),
    },
    "thumb.02.L": {
      x: tunedNumber(AVATAR_TUNING.hands?.thumbMidX, 0.16),
      y: tunedNumber(AVATAR_TUNING.hands?.thumbMidY, 0.32),
      z: tunedNumber(AVATAR_TUNING.hands?.thumbMidZ, 0.28),
    },
    "thumb.03.L": {
      x: tunedNumber(AVATAR_TUNING.hands?.thumbTipX, 0.12),
      y: tunedNumber(AVATAR_TUNING.hands?.thumbTipY, 0.16),
      z: tunedNumber(AVATAR_TUNING.hands?.thumbTipZ, 0.14),
    },
    "f_index.01.L": {
      x: tunedNumber(AVATAR_TUNING.hands?.fingerBaseCurlX, 1.16),
      z: tunedNumber(AVATAR_TUNING.hands?.fingerIndexSpreadZ, 0.04),
    },
    "f_index.02.L": {
      x: tunedNumber(AVATAR_TUNING.hands?.fingerMidCurlX, 0.98),
    },
    "f_index.03.L": {
      x: tunedNumber(AVATAR_TUNING.hands?.fingerTipCurlX, 0.82),
    },
    "f_middle.01.L": {
      x: tunedNumber(AVATAR_TUNING.hands?.fingerBaseCurlX, 1.16),
      z: tunedNumber(AVATAR_TUNING.hands?.fingerMiddleSpreadZ, 0.01),
    },
    "f_middle.02.L": {
      x: tunedNumber(AVATAR_TUNING.hands?.fingerMidCurlX, 0.98),
    },
    "f_middle.03.L": {
      x: tunedNumber(AVATAR_TUNING.hands?.fingerTipCurlX, 0.82),
    },
    "f_ring.01.L": {
      x: tunedNumber(AVATAR_TUNING.hands?.fingerBaseCurlX, 1.16),
      z: tunedNumber(AVATAR_TUNING.hands?.fingerRingSpreadZ, -0.02),
    },
    "f_ring.02.L": {
      x: tunedNumber(AVATAR_TUNING.hands?.fingerMidCurlX, 0.98),
    },
    "f_ring.03.L": {
      x: tunedNumber(AVATAR_TUNING.hands?.fingerTipCurlX, 0.82),
    },
    "f_pinky.01.L": {
      x: tunedNumber(AVATAR_TUNING.hands?.fingerBaseCurlX, 1.16),
      z: tunedNumber(AVATAR_TUNING.hands?.fingerPinkySpreadZ, -0.05),
    },
    "f_pinky.02.L": {
      x: tunedNumber(AVATAR_TUNING.hands?.fingerMidCurlX, 0.98),
    },
    "f_pinky.03.L": {
      x: tunedNumber(AVATAR_TUNING.hands?.fingerTipCurlX, 0.82),
    },
    "hand.R": {
      x: tunedNumber(AVATAR_TUNING.hands?.wristBendX, 0.16),
      z: -tunedNumber(AVATAR_TUNING.hands?.wristSplayZ, 0.03),
    },
    "thumb.01.R": {
      x: tunedNumber(AVATAR_TUNING.hands?.thumbBaseX, 0.2),
      y: -tunedNumber(AVATAR_TUNING.hands?.thumbBaseY, 0.62),
      z: -tunedNumber(AVATAR_TUNING.hands?.thumbBaseZ, 0.56),
    },
    "thumb.02.R": {
      x: tunedNumber(AVATAR_TUNING.hands?.thumbMidX, 0.16),
      y: -tunedNumber(AVATAR_TUNING.hands?.thumbMidY, 0.32),
      z: -tunedNumber(AVATAR_TUNING.hands?.thumbMidZ, 0.28),
    },
    "thumb.03.R": {
      x: tunedNumber(AVATAR_TUNING.hands?.thumbTipX, 0.12),
      y: -tunedNumber(AVATAR_TUNING.hands?.thumbTipY, 0.16),
      z: -tunedNumber(AVATAR_TUNING.hands?.thumbTipZ, 0.14),
    },
    "f_index.01.R": {
      x: tunedNumber(AVATAR_TUNING.hands?.fingerBaseCurlX, 1.16),
      z: -tunedNumber(AVATAR_TUNING.hands?.fingerIndexSpreadZ, 0.04),
    },
    "f_index.02.R": {
      x: tunedNumber(AVATAR_TUNING.hands?.fingerMidCurlX, 0.98),
    },
    "f_index.03.R": {
      x: tunedNumber(AVATAR_TUNING.hands?.fingerTipCurlX, 0.82),
    },
    "f_middle.01.R": {
      x: tunedNumber(AVATAR_TUNING.hands?.fingerBaseCurlX, 1.16),
      z: -tunedNumber(AVATAR_TUNING.hands?.fingerMiddleSpreadZ, 0.01),
    },
    "f_middle.02.R": {
      x: tunedNumber(AVATAR_TUNING.hands?.fingerMidCurlX, 0.98),
    },
    "f_middle.03.R": {
      x: tunedNumber(AVATAR_TUNING.hands?.fingerTipCurlX, 0.82),
    },
    "f_ring.01.R": {
      x: tunedNumber(AVATAR_TUNING.hands?.fingerBaseCurlX, 1.16),
      z: -tunedNumber(AVATAR_TUNING.hands?.fingerRingSpreadZ, -0.02),
    },
    "f_ring.02.R": {
      x: tunedNumber(AVATAR_TUNING.hands?.fingerMidCurlX, 0.98),
    },
    "f_ring.03.R": {
      x: tunedNumber(AVATAR_TUNING.hands?.fingerTipCurlX, 0.82),
    },
    "f_pinky.01.R": {
      x: tunedNumber(AVATAR_TUNING.hands?.fingerBaseCurlX, 1.16),
      z: -tunedNumber(AVATAR_TUNING.hands?.fingerPinkySpreadZ, -0.05),
    },
    "f_pinky.02.R": {
      x: tunedNumber(AVATAR_TUNING.hands?.fingerMidCurlX, 0.98),
    },
    "f_pinky.03.R": {
      x: tunedNumber(AVATAR_TUNING.hands?.fingerTipCurlX, 0.82),
    },
  };

  const STANCE_DIRECTION_OFFSETS = {
    "thigh.L": { x: tunedNumber(AVATAR_TUNING.stance?.thighDirectionSpread, 0.0) },
    "thigh.R": { x: -tunedNumber(AVATAR_TUNING.stance?.thighDirectionSpread, 0.0) },
    "shin.L": { x: tunedNumber(AVATAR_TUNING.stance?.shinDirectionSpread, 0.0) },
    "shin.R": { x: -tunedNumber(AVATAR_TUNING.stance?.shinDirectionSpread, 0.0) },
    "foot.L": { x: tunedNumber(AVATAR_TUNING.stance?.footDirectionSpread, 0.0) },
    "foot.R": { x: -tunedNumber(AVATAR_TUNING.stance?.footDirectionSpread, 0.0) },
  };

  const SHOULDER_POSITION_OFFSETS = {
    "shoulder.L": {
      x: tunedNumber(AVATAR_TUNING.shoulders?.widthOffset, 0.03),
    },
    "shoulder.R": {
      x: -tunedNumber(AVATAR_TUNING.shoulders?.widthOffset, 0.03),
    },
    "upper_arm.L": {
      x: tunedNumber(AVATAR_TUNING.shoulders?.armRootOffset, 0.012),
    },
    "upper_arm.R": {
      x: -tunedNumber(AVATAR_TUNING.shoulders?.armRootOffset, 0.012),
    },
  };

  const FOOT_TURN_Y = tunedNumber(AVATAR_TUNING.stance?.footTurnY, 0.0);
  const TOE_TURN_Y = tunedNumber(AVATAR_TUNING.stance?.toeTurnY, 0.12);
  const HEAD_YAW_OFFSET_Y = tunedNumber(AVATAR_TUNING.head?.yawOffsetY, 0.0);
  const NECK_THICKNESS_SCALE_XZ = tunedNumber(AVATAR_TUNING.neck?.thicknessScaleXZ, 1.0);
  const STANCE_ROTATION_OFFSETS = {
    "foot.L": { y: -FOOT_TURN_Y },
    "foot.R": { y: FOOT_TURN_Y },
    "toe.L": { y: -TOE_TURN_Y },
    "toe.R": { y: TOE_TURN_Y },
  };

  const LOCK_FEET_TO_GROUND = AVATAR_TUNING.feet?.lockToGround !== false;
  const FREEZE_FOOT_ROTATION = AVATAR_TUNING.feet?.freezeRotation !== false;
  const FOOT_FREEZE_YAW_OFFSET = tunedNumber(AVATAR_TUNING.feet?.freezeYawOffsetY, Math.PI);
  const KEEP_FEET_FLAT = AVATAR_TUNING.feet?.keepFlat !== false;
  const FOOT_VERTICAL_INFLUENCE = tunedNumber(AVATAR_TUNING.feet?.verticalInfluence, 0.0);

  const BVH_SEGMENTS_TO_GLB = [
    ["hips", "Chest", "spine"],
    ["Chest", "Chest2", "spine.001"],
    ["Chest2", "Chest3", "spine.002"],
    ["Chest3", "Neck", "spine.003"],
    ["Neck", "Head", "spine.004"],
    ["Head", "Head_End", "spine.005"],
    ["LeftCollar", "LeftShoulder", "shoulder.L"],
    ["LeftShoulder", "LeftElbow", "upper_arm.L"],
    ["LeftElbow", "LeftWrist", "forearm.L"],
    ["RightCollar", "RightShoulder", "shoulder.R"],
    ["RightShoulder", "RightElbow", "upper_arm.R"],
    ["RightElbow", "RightWrist", "forearm.R"],
    ["LeftHip", "LeftKnee", "thigh.L"],
    ["LeftKnee", "LeftAnkle", "shin.L"],
    ["LeftAnkle", "LeftToe", "foot.L"],
    ["RightHip", "RightKnee", "thigh.R"],
    ["RightKnee", "RightAnkle", "shin.R"],
    ["RightAnkle", "RightToe", "foot.R"],
  ];

  const GLB_CHILD_BONES = {
    spine: "spine.001",
    "spine.001": "spine.002",
    "spine.002": "spine.003",
    "spine.003": "spine.004",
    "spine.004": "spine.005",
    "shoulder.L": "upper_arm.L",
    "upper_arm.L": "forearm.L",
    "forearm.L": "hand.L",
    "shoulder.R": "upper_arm.R",
    "upper_arm.R": "forearm.R",
    "forearm.R": "hand.R",
    "thigh.L": "shin.L",
    "shin.L": "foot.L",
    "foot.L": "toe.L",
    "thigh.R": "shin.R",
    "shin.R": "foot.R",
    "foot.R": "toe.R",
  };

  const BVH_ROOT_SCALE = 0.0045;
  const BVH_AXIS = {
    X: new THREE.Vector3(1, 0, 0),
    Y: new THREE.Vector3(0, 1, 0),
    Z: new THREE.Vector3(0, 0, 1),
  };

  function canonicalBoneName(name) {
    const raw = String(name || "");
    const spineMatch = raw.match(/^spine(\d{3})$/);
    if (spineMatch) return `spine.${spineMatch[1]}`;
    const fingerMatch = raw.match(/^(f_index|f_middle|f_ring|f_pinky|thumb)(\d{2})([LR])$/);
    if (fingerMatch) return `${fingerMatch[1]}.${fingerMatch[2]}.${fingerMatch[3]}`;
    const heelMatch = raw.match(/^heel(\d{2})([LR])$/);
    if (heelMatch) return `heel.${heelMatch[1]}.${heelMatch[2]}`;
    const pelvisMatch = raw.match(/^pelvis([LR])$/);
    if (pelvisMatch) return `pelvis.${pelvisMatch[1]}`;
    const sideMatch = raw.match(/^(shoulder|upper_arm|forearm|hand|thigh|shin|foot|toe)([LR])$/);
    if (sideMatch) return `${sideMatch[1]}.${sideMatch[2]}`;
    return raw;
  }

  class AvatarScene {
    constructor({ stage, message, data, modelUrl }) {
      this.stage = stage;
      this.message = message;
      this.data = data || {};
      this.modelUrl = modelUrl || "media/avatar/male_base_mesh.glb";
      this.landmarkIndex = this.data.landmark_index || {};
      this.renderer = null;
      this.scene = null;
      this.camera = null;
      this.clock = new THREE.Clock();
      this.rigs = {};
      this.motion = {};
      this.lines = {};
      this.resizeObserver = null;
      this.latestFrame = null;
      this.ready = false;
    }

    async init() {
      this.installFileProtocolFetchPatch();
      this.createRenderer();
      this.createWorld();
      if (DEBUG_SKELETON) {
        this.createSkeletonLines();
      }
      this.createHighlights();
      this.resize();
      this.animate();

      await Promise.all([this.loadModel(), this.loadMotionAssets()]);
      this.ready = Boolean(this.rigs.user && this.rigs.reference && this.motion.user && this.motion.reference);
      if (this.ready) {
        this.hideMessage();
        if (this.latestFrame) this.applyFrame(this.latestFrame);
      } else {
        this.setMessage("아바타 모션 준비 실패", "모델 또는 모션 JSON을 확인해주세요.");
      }
    }

    installFileProtocolFetchPatch() {
      if (
        typeof window === "undefined" ||
        window.location?.protocol !== "file:" ||
        window.__WORKWITH_FILE_FETCH_PATCHED__ ||
        typeof window.fetch !== "function" ||
        typeof window.Response !== "function"
      ) {
        return;
      }

      const originalFetch = window.fetch.bind(window);
      window.__WORKWITH_FILE_FETCH_PATCHED__ = true;
      window.fetch = async (...args) => {
        const response = await originalFetch(...args);
        if (!response.ok && response.status === 0) {
          return new Response(await response.blob(), {
            status: 200,
            statusText: "OK",
            headers: response.headers,
          });
        }
        return response;
      };
    }

    createRenderer() {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.outputEncoding = THREE.sRGBEncoding;
      this.renderer.shadowMap.enabled = true;
      this.stage.appendChild(this.renderer.domElement);

      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.stage);
      window.addEventListener("resize", () => this.resize(), { passive: true });
    }

    createWorld() {
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x04080d);
      this.scene.fog = new THREE.Fog(0x04080d, 4.2, 7.2);

      this.camera = new THREE.PerspectiveCamera(tunedNumber(AVATAR_TUNING.camera?.fov, 38), 1, 0.01, 20);
      this.camera.position.copy(tunedVector3(AVATAR_TUNING.camera?.position, { x: 4.55, y: 1.05, z: 0.0 }));
      const lookAt = tunedVector3(AVATAR_TUNING.camera?.lookAt, { x: 0.0, y: 0.72, z: 0.0 });
      this.camera.lookAt(lookAt);

      this.scene.add(new THREE.HemisphereLight(0xdaf7ff, 0x0b1016, 1.25));

      const key = new THREE.DirectionalLight(0xffffff, tunedNumber(AVATAR_TUNING.lights?.key?.intensity, 1.35));
      key.position.copy(tunedVector3(AVATAR_TUNING.lights?.key, { x: 2.4, y: 3.4, z: -1.5 }));
      key.castShadow = true;
      this.scene.add(key);

      const rim = new THREE.DirectionalLight(0x57ceff, tunedNumber(AVATAR_TUNING.lights?.rim?.intensity, 0.7));
      rim.position.copy(tunedVector3(AVATAR_TUNING.lights?.rim, { x: -2.6, y: 1.9, z: 2.2 }));
      this.scene.add(rim);

      const grid = new THREE.GridHelper(3.4, 12, 0x1c6f92, 0x12303f);
      grid.position.y = 0;
      grid.material.opacity = 0.22;
      grid.material.transparent = true;
      this.scene.add(grid);
    }

    createSkeletonLines() {
      this.lines.reference = this.createLine(0x57ceff, 0.42);
      this.lines.user = this.createLine(0xffffff, 0.62);
      this.scene.add(this.lines.reference, this.lines.user);
    }

    createLine(color, opacity) {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(BODY_SEGMENTS.length * 2 * 3);
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setDrawRange(0, 0);
      return new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity,
        }),
      );
    }

    createHighlights() {
      // Highlight overlays are created per rig after the GLB is loaded.
    }

    async loadMotionAssets() {
      const [userBvhText, referenceBvhText] = await Promise.all([
        this.fetchText("media/motions/wrong_bvh.bvh"),
        this.fetchText("media/motions/correct_bvh.bvh"),
      ]);
      this.motion.user = this.parseBvh(userBvhText, "wrong_bvh");
      this.motion.reference = this.parseBvh(referenceBvhText, "correct_bvh");
    }

    async fetchText(url) {
      const fullUrl = this.withCacheBust(url);
      try {
        const response = await fetch(fullUrl, { cache: "no-store" });
        if (!response.ok && response.status !== 0) {
          throw new Error(`Could not load BVH avatar motion: ${url}`);
        }
        return response.text();
      } catch (error) {
        if (window.location?.protocol === "file:") {
          return this.fetchTextWithXhr(fullUrl, url);
        }
        throw error;
      }
    }

    fetchTextWithXhr(fullUrl, sourceUrl) {
      return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("GET", fullUrl, true);
        if (typeof request.overrideMimeType === "function") {
          request.overrideMimeType("text/plain");
        }
        request.onload = () => {
          if ((request.status >= 200 && request.status < 300) || request.status === 0) {
            resolve(request.responseText);
            return;
          }
          reject(new Error(`Could not load BVH avatar motion: ${sourceUrl}`));
        };
        request.onerror = () => reject(new Error(`Could not load BVH avatar motion: ${sourceUrl}`));
        request.send();
      });
    }

    parseBvh(text, source) {
      const lines = String(text || "").replace(/\r/g, "").split("\n");
      const joints = [];
      const jointMap = new Map();
      const stack = [];
      let channelCount = 0;
      let motionLine = -1;

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index].trim();
        if (!line) continue;
        if (line === "MOTION") {
          motionLine = index;
          break;
        }
        if (line.startsWith("End Site")) {
          stack.push({ endSite: true });
          continue;
        }
        if (line.startsWith("ROOT ") || line.startsWith("JOINT ")) {
          const name = line.split(/\s+/)[1];
          const parent = stack.length ? stack[stack.length - 1] : null;
          const joint = {
            name,
            parent: parent?.endSite ? null : parent,
            offset: [0, 0, 0],
            channels: [],
            channelOffset: 0,
          };
          joints.push(joint);
          jointMap.set(name, joint);
          stack.push(joint);
          continue;
        }
        if (line.startsWith("OFFSET ")) {
          const current = stack[stack.length - 1];
          if (current && !current.endSite) {
            current.offset = line.split(/\s+/).slice(1, 4).map((value) => Number(value) || 0);
          }
          continue;
        }
        if (line.startsWith("CHANNELS ")) {
          const current = stack[stack.length - 1];
          if (current && !current.endSite) {
            const parts = line.split(/\s+/);
            const count = Number(parts[1]) || 0;
            current.channelOffset = channelCount;
            current.channels = parts.slice(2, 2 + count);
            channelCount += current.channels.length;
          }
          continue;
        }
        if (line === "}") {
          stack.pop();
        }
      }

      if (motionLine < 0) {
        throw new Error(`BVH MOTION block not found: ${source}`);
      }

      let expectedFrames = 0;
      let frameTime = 1 / 30;
      const frames = [];
      for (let index = motionLine + 1; index < lines.length; index += 1) {
        const line = lines[index].trim();
        if (!line) continue;
        if (line.startsWith("Frames:")) {
          expectedFrames = Number(line.split(":")[1]) || 0;
          continue;
        }
        if (line.startsWith("Frame Time:")) {
          frameTime = Number(line.split(":")[1]) || frameTime;
          continue;
        }
        if (/^[+\-\d.]/.test(line)) {
          const values = line.split(/\s+/).map((value) => Number(value) || 0);
          if (values.length >= channelCount) {
            frames.push(values);
          }
        }
      }

      if (expectedFrames && frames.length !== expectedFrames) {
        console.warn(`BVH frame count mismatch for ${source}: expected ${expectedFrames}, got ${frames.length}`);
      }

      const rootJoint = jointMap.get("hips") || joints[0];
      const rootBase = frames[0] && rootJoint ? this.getBvhRootPosition(rootJoint, frames[0]) : [0, 0, 0];
      return {
        source,
        frameTime,
        fps: 1 / frameTime,
        durationSec: Math.max(frameTime, Math.max(frames.length - 1, 0) * frameTime),
        joints,
        jointMap,
        frames,
        rootBase,
      };
    }

    getBvhRootPosition(joint, values) {
      const position = [0, 0, 0];
      if (!joint || !values) return position;
      joint.channels.forEach((channel, index) => {
        const value = values[joint.channelOffset + index] || 0;
        if (channel === "Xposition") position[0] = value;
        if (channel === "Yposition") position[1] = value;
        if (channel === "Zposition") position[2] = value;
      });
      return position;
    }

    getBvhJointQuaternion(joint, values) {
      const quaternion = new THREE.Quaternion();
      const step = new THREE.Quaternion();
      joint.channels.forEach((channel, index) => {
        if (!channel.endsWith("rotation")) return;
        const axisName = channel.charAt(0);
        const axis = BVH_AXIS[axisName];
        if (!axis) return;
        const radians = THREE.MathUtils.degToRad(values[joint.channelOffset + index] || 0);
        step.setFromAxisAngle(axis, radians);
        quaternion.multiply(step);
      });
      return quaternion;
    }

    computeBvhWorldPose(motion, values) {
      const positions = new Map();
      const rotations = new Map();
      motion.joints.forEach((joint) => {
        const localRotation = this.getBvhJointQuaternion(joint, values);
        const offset = new THREE.Vector3(joint.offset[0], joint.offset[1], joint.offset[2]);
        if (!joint.parent) {
          const rootPosition = this.getBvhRootPosition(joint, values);
          positions.set(joint.name, new THREE.Vector3(rootPosition[0], rootPosition[1], rootPosition[2]).add(offset));
          rotations.set(joint.name, localRotation);
          return;
        }

        const parentPosition = positions.get(joint.parent.name);
        const parentRotation = rotations.get(joint.parent.name);
        if (!parentPosition || !parentRotation) return;
        positions.set(joint.name, offset.applyQuaternion(parentRotation).add(parentPosition));
        rotations.set(joint.name, parentRotation.clone().multiply(localRotation));
      });
      return { positions, rotations };
    }

    bvhVectorToAvatar(vector) {
      return new THREE.Vector3(vector.x, vector.y, -vector.z);
    }

    withCacheBust(url) {
      if (!url || url.startsWith("data:") || url.startsWith("blob:")) return url;
      if (window.location?.protocol === "file:") return url;
      const separator = url.includes("?") ? "&" : "?";
      return `${url}${separator}v=${ASSET_VERSION}`;
    }

    async loadModel() {
      if (!THREE.GLTFLoader) {
        throw new Error("GLTFLoader is not loaded.");
      }

      const loader = new THREE.GLTFLoader();
      const url = this.withCacheBust(this.modelUrl);
      const response = await fetch(url);
      const buffer = await response.arrayBuffer();

      await new Promise((resolve, reject) => {
        loader.parse(
          buffer,
          "",
          (gltf) => {
            const source = gltf.scene;
            this.rigs.reference = this.createRig(source, "reference");
            this.rigs.user = this.createRig(source, "user");
            this.scene.add(this.rigs.reference.group, this.rigs.user.group);
            resolve();
          },
          reject,
        );
      });
    }

    createRig(source, role) {
      const group = new THREE.Group();
      const root = THREE.SkeletonUtils?.clone ? THREE.SkeletonUtils.clone(source) : source.clone(true);
      const appearance = RIG_APPEARANCE[role] || RIG_APPEARANCE.user;
      const skinnedMeshes = [];
      const baseMaterials = [];
      root.traverse((child) => {
        if (child.isMesh || child.isSkinnedMesh) {
          const material = new THREE.MeshStandardMaterial({
            color: appearance.color,
            transparent: true,
            opacity: appearance.opacity,
            roughness: 0.78,
            metalness: 0.02,
            emissive: new THREE.Color(appearance.emissive),
            emissiveIntensity: appearance.emissiveIntensity,
            depthWrite: false,
          });
          if (child.isSkinnedMesh) {
            material.skinning = true;
            skinnedMeshes.push(child);
          }
          material.needsUpdate = true;
          child.castShadow = true;
          child.receiveShadow = true;
          child.frustumCulled = false;
          child.renderOrder = role === "reference" ? 3 : 4;
          child.material = material;
          baseMaterials.push(material);
        }
      });

      group.add(root);
      this.fitModel(root);
      const bones = this.collectBones(root);
      const highlightRegions = role === "user" ? this.createRigHighlightRegions(skinnedMeshes) : new Map();
      const offset = AVATAR_OFFSETS[role].clone();
      group.position.copy(offset);

      return {
        role,
        group,
        root,
        offset,
        bones,
        baseMaterials,
        highlightRegions,
        footAnchorBaseWorld: null,
      };
    }

    getModelBoneLookup(root) {
      const lookup = new Map();
      root.traverse((object) => {
        if (!object.isBone) return;
        lookup.set(object.name, object);
        lookup.set(canonicalBoneName(object.name), object);
      });
      return lookup;
    }

    resolveModelFrontRotation(root) {
      const bones = this.getModelBoneLookup(root);
      const forward = new THREE.Vector3();
      [
        ["foot.L", "toe.L"],
        ["foot.R", "toe.R"],
      ].forEach(([footName, toeName]) => {
        const foot = bones.get(footName);
        const toe = bones.get(toeName);
        if (!foot || !toe) return;
        const direction = toe.position.clone();
        direction.y = 0;
        if (direction.lengthSq() <= 1e-8) return;
        forward.add(direction.normalize());
      });

      if (forward.lengthSq() <= 1e-8) {
        return MODEL_FRONT_FINE_TUNE_Y;
      }

      forward.normalize();
      return -Math.atan2(forward.x, forward.z) + MODEL_FRONT_FINE_TUNE_Y;
    }

    fitModel(root) {
      root.rotation.set(0, this.resolveModelFrontRotation(root), 0);
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = size.y > 0 ? tunedNumber(AVATAR_TUNING.modelScale, 1.52) / size.y : 1;
      root.scale.setScalar(scale);
      root.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
      root.updateMatrixWorld(true);
    }

    collectBones(root) {
      const bones = new Map();
      root.traverse((object) => {
        if (!object.isBone) return;
        const entry = {
          bone: object,
          restPosition: object.position.clone(),
          restQuaternion: object.quaternion.clone(),
          restScale: object.scale.clone(),
          restWorldQuaternion: object.getWorldQuaternion(new THREE.Quaternion()),
          restDirectionParent: null,
        };
        bones.set(object.name, entry);
        const canonicalName = canonicalBoneName(object.name);
        if (canonicalName !== object.name) {
          bones.set(canonicalName, entry);
        }
      });
      bones.forEach((entry, boneName) => {
        const childName = GLB_CHILD_BONES[boneName];
        const childEntry = childName ? bones.get(childName) : null;
        if (!childEntry) return;
        const childDirection = childEntry.bone.position.clone();
        if (childDirection.lengthSq() <= 1e-8) return;
        childDirection.normalize();
        entry.restDirectionParent = childDirection.clone().applyQuaternion(entry.restQuaternion).normalize();
      });
      return bones;
    }

    createRigHighlightRegions(skinnedMeshes) {
      const regions = new Map();
      skinnedMeshes.forEach((mesh) => {
        const skeletonGroups = this.collectSkeletonBoneIndices(mesh.skeleton);
        Object.entries(HIGHLIGHT_REGION_BONES).forEach(([regionName, regionBones]) => {
          const mask = this.buildHighlightMask(mesh.geometry, skeletonGroups, regionBones);
          if (!mask) return;
          const overlay = this.createHighlightOverlay(mesh, mask);
          const entries = regions.get(regionName) || [];
          entries.push(overlay);
          regions.set(regionName, entries);
        });
      });
      return regions;
    }

    collectSkeletonBoneIndices(skeleton) {
      const groups = new Map();
      (skeleton?.bones || []).forEach((bone, index) => {
        const name = canonicalBoneName(bone.name);
        const entries = groups.get(name) || [];
        entries.push(index);
        groups.set(name, entries);
      });
      return groups;
    }

    buildHighlightMask(geometry, skeletonGroups, regionBones) {
      const skinIndex = geometry.getAttribute("skinIndex");
      const skinWeight = geometry.getAttribute("skinWeight");
      if (!skinIndex || !skinWeight) return null;

      const activeIndices = new Set();
      regionBones.forEach((boneName) => {
        (skeletonGroups.get(boneName) || []).forEach((index) => activeIndices.add(index));
      });
      if (!activeIndices.size) return null;

      const mask = new Float32Array(skinIndex.count);
      let hasVisibleVertex = false;
      for (let index = 0; index < skinIndex.count; index += 1) {
        let value = 0;
        const indices = [skinIndex.getX(index), skinIndex.getY(index), skinIndex.getZ(index), skinIndex.getW(index)];
        const weights = [skinWeight.getX(index), skinWeight.getY(index), skinWeight.getZ(index), skinWeight.getW(index)];
        for (let slot = 0; slot < 4; slot += 1) {
          if (activeIndices.has(indices[slot])) {
            value += weights[slot];
          }
        }
        mask[index] = value;
        if (value > 0.08) {
          hasVisibleVertex = true;
        }
      }

      return hasVisibleVertex ? mask : null;
    }

    createHighlightOverlay(sourceMesh, mask) {
      const overlayGeometry = sourceMesh.geometry.clone();
      overlayGeometry.setAttribute("highlightMask", new THREE.BufferAttribute(mask, 1));

      const material = new THREE.MeshStandardMaterial({
        color: 0xff5e52,
        emissive: 0xff2b20,
        emissiveIntensity: 0,
        transparent: true,
        opacity: 0,
        roughness: 0.42,
        metalness: 0.04,
        skinning: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        side: THREE.DoubleSide,
      });
      this.decorateHighlightMaterial(material);

      const overlay = new THREE.SkinnedMesh(overlayGeometry, material);
      overlay.bindMode = sourceMesh.bindMode;
      overlay.bind(sourceMesh.skeleton, sourceMesh.bindMatrix.clone());
      overlay.position.copy(sourceMesh.position);
      overlay.quaternion.copy(sourceMesh.quaternion);
      overlay.scale.copy(sourceMesh.scale);
      overlay.frustumCulled = false;
      overlay.visible = false;
      overlay.renderOrder = 8;
      sourceMesh.parent.add(overlay);

      return {
        mesh: overlay,
        material,
      };
    }

    decorateHighlightMaterial(material) {
      material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace(
          "void main() {",
          "attribute float highlightMask;\nvarying float vHighlightMask;\nvoid main() {",
        );
        shader.vertexShader = shader.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\n  vHighlightMask = highlightMask;",
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          "void main() {",
          "varying float vHighlightMask;\nvoid main() {",
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <dithering_fragment>",
          "float highlightAlpha = smoothstep(0.08, 0.52, vHighlightMask);\nif (highlightAlpha <= 0.01) discard;\ngl_FragColor.a *= highlightAlpha;\n#include <dithering_fragment>",
        );
      };
      material.customProgramCacheKey = () => "workwith-highlight-mask-v1";
      material.needsUpdate = true;
    }

    update(frame, options = {}) {
      if (!frame) return;
      this.latestFrame = { frame, options };
      if (!this.ready) return;
      this.applyFrame(this.latestFrame);
    }

    applyFrame({ frame, options }) {
      const playbackTimeSec = Number.isFinite(options.playbackTimeSec)
        ? options.playbackTimeSec
        : (Number.isFinite(frame.time_sec) ? frame.time_sec : 0);
      const playbackDurationSec = Number.isFinite(options.playbackDurationSec)
        ? options.playbackDurationSec
        : null;

      this.applyBvhFrame(this.rigs.user, this.motion.user, playbackTimeSec, playbackDurationSec);
      this.applyBvhFrame(this.rigs.reference, this.motion.reference, playbackTimeSec, playbackDurationSec);
      this.updateHighlights(options.highlightedJointNames || frame.highlighted_joint_names || []);

      if (DEBUG_SKELETON) {
        this.updateDebugLine(this.lines.user, this.collectPoints(frame, "wrong"), "user");
        this.updateDebugLine(this.lines.reference, this.collectPoints(frame, "reference"), "reference");
      }
    }

    applyBvhFrame(rig, motion, playbackTimeSec, playbackDurationSec) {
      if (!rig || !motion?.frames?.length) return;
      const motionDurationSec = motion.durationSec || Math.max(motion.frameTime, motion.frames.length * motion.frameTime);
      const timeRatio = Number.isFinite(playbackDurationSec) && playbackDurationSec > 0
        ? THREE.MathUtils.clamp(playbackTimeSec / playbackDurationSec, 0, 1)
        : THREE.MathUtils.clamp(playbackTimeSec / motionDurationSec, 0, 1);
      const motionTimeSec = timeRatio * motionDurationSec;
      const frameIndex = Math.max(0, Math.min(Math.round(motionTimeSec / motion.frameTime), motion.frames.length - 1));
      const values = motion.frames[frameIndex];
      if (!values) return;

      rig.bones.forEach((entry) => {
        entry.bone.position.copy(entry.restPosition);
        entry.bone.quaternion.copy(entry.restQuaternion);
        entry.bone.scale.copy(entry.restScale);
      });

      const rootJoint = motion.jointMap.get("hips") || motion.joints[0];
      const root = this.getBvhRootPosition(rootJoint, values);
      const base = motion.rootBase || [0, 0, 0];
      const rootOffset = new THREE.Vector3(
        (root[0] - base[0]) * BVH_ROOT_SCALE,
        (root[1] - base[1]) * BVH_ROOT_SCALE,
        -(root[2] - base[2]) * BVH_ROOT_SCALE,
      ).applyAxisAngle(BVH_AXIS.Y, MOTION_WORLD_ROTATION_Y);
      rig.group.position.set(
        rig.offset.x + rootOffset.x,
        rig.offset.y + rootOffset.y,
        rig.offset.z + rootOffset.z,
      );

      const pose = this.computeBvhWorldPose(motion, values);
      rig.group.updateMatrixWorld(true);
      BVH_SEGMENTS_TO_GLB.forEach(([fromName, toName, glbName]) => {
        if (FREEZE_FOOT_ROTATION && glbName.startsWith("foot.")) return;
        const from = pose.positions.get(fromName);
        const to = pose.positions.get(toName);
        if (!from || !to) return;
        const direction = this.bvhVectorToAvatar(new THREE.Vector3().subVectors(to, from))
          .applyAxisAngle(BVH_AXIS.Y, MOTION_WORLD_ROTATION_Y);
        if (direction.lengthSq() <= 1e-8) return;
        this.applyStanceDirectionOffset(glbName, direction);
        this.stabilizeFootDirection(glbName, direction);
        this.pointBoneToward(rig, glbName, direction.normalize());
      });
      this.applyShoulderPose(rig);
      this.applyStancePose(rig);
      this.applyHandPose(rig);
      this.applyHeadPose(rig);
      this.applyNeckPose(rig);
      this.freezeFootWorldRotations(rig);
      rig.group.updateMatrixWorld(true);
      this.lockRigFeetToGround(rig);
      if (DEBUG_RETARGET) {
        this.writeRetargetDebug(rig, motion, frameIndex);
      }
    }

    pointBoneToward(rig, boneName, targetWorldDirection) {
      const entry = rig.bones.get(boneName);
      if (!entry?.restDirectionParent) return;
      const parent = entry.bone.parent || rig.root;
      const parentRotation = new THREE.Quaternion();
      parent.getWorldQuaternion(parentRotation);
      const targetParentLocal = targetWorldDirection.clone().applyQuaternion(parentRotation.invert()).normalize();
      const delta = new THREE.Quaternion().setFromUnitVectors(entry.restDirectionParent, targetParentLocal);
      entry.bone.quaternion.copy(delta.multiply(entry.restQuaternion));
      entry.bone.updateMatrixWorld(true);
    }

    applyHandPose(rig) {
      Object.entries(HAND_POSE_ROTATIONS).forEach(([boneName, rotation]) => {
        const entry = rig.bones.get(boneName);
        if (!entry) return;
        entry.bone.quaternion.copy(entry.restQuaternion);
        if (rotation.x) {
          entry.bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(BVH_AXIS.X, rotation.x));
        }
        if (rotation.y) {
          entry.bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(BVH_AXIS.Y, rotation.y));
        }
        if (rotation.z) {
          entry.bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(BVH_AXIS.Z, rotation.z));
        }
      });
    }

    applyHeadPose(rig) {
      if (!HEAD_YAW_OFFSET_Y) return;
      const entry = rig.bones.get("spine.004");
      if (!entry) return;
      entry.bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(BVH_AXIS.Y, HEAD_YAW_OFFSET_Y));
      entry.bone.updateMatrixWorld(true);
    }

    applyNeckPose(rig) {
      if (!Number.isFinite(NECK_THICKNESS_SCALE_XZ) || Math.abs(NECK_THICKNESS_SCALE_XZ - 1) <= 1e-4) return;
      const neckEntry = rig.bones.get("spine.004");
      if (!neckEntry) return;

      neckEntry.bone.scale.set(
        neckEntry.restScale.x * NECK_THICKNESS_SCALE_XZ,
        neckEntry.restScale.y,
        neckEntry.restScale.z * NECK_THICKNESS_SCALE_XZ,
      );

      const headEntry = rig.bones.get("spine.005");
      if (headEntry) {
        headEntry.bone.scale.set(
          headEntry.restScale.x / NECK_THICKNESS_SCALE_XZ,
          headEntry.restScale.y,
          headEntry.restScale.z / NECK_THICKNESS_SCALE_XZ,
        );
      }
    }

    applyShoulderPose(rig) {
      Object.entries(SHOULDER_POSITION_OFFSETS).forEach(([boneName, offset]) => {
        const entry = rig.bones.get(boneName);
        if (!entry) return;
        entry.bone.position.set(
          entry.restPosition.x + (offset.x || 0),
          entry.restPosition.y + (offset.y || 0),
          entry.restPosition.z + (offset.z || 0),
        );
      });
    }

    applyStanceDirectionOffset(boneName, direction) {
      const offset = STANCE_DIRECTION_OFFSETS[boneName];
      if (!offset) return;
      direction.x += offset.x || 0;
      direction.y += offset.y || 0;
      direction.z += offset.z || 0;
    }

    stabilizeFootDirection(boneName, direction) {
      if (!KEEP_FEET_FLAT || !boneName.startsWith("foot.")) return;
      const horizontalLength = Math.hypot(direction.x, direction.z);
      if (horizontalLength <= 1e-6) return;
      direction.y *= FOOT_VERTICAL_INFLUENCE;
    }

    applyStancePose(rig) {
      Object.entries(STANCE_ROTATION_OFFSETS).forEach(([boneName, rotation]) => {
        if (FREEZE_FOOT_ROTATION && /^(foot|toe)\./.test(boneName)) return;
        const entry = rig.bones.get(boneName);
        if (!entry) return;
        if (rotation.x) {
          entry.bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(BVH_AXIS.X, rotation.x));
        }
        if (rotation.y) {
          entry.bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(BVH_AXIS.Y, rotation.y));
        }
        if (rotation.z) {
          entry.bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(BVH_AXIS.Z, rotation.z));
        }
      });
    }

    freezeFootWorldRotations(rig) {
      if (!FREEZE_FOOT_ROTATION) return;
      rig.group.updateMatrixWorld(true);
      ["foot.L", "foot.R"].forEach((boneName) => {
        const entry = rig.bones.get(boneName);
        if (!entry?.restWorldQuaternion) return;
        const parent = entry.bone.parent || rig.root;
        const targetWorldQuaternion = new THREE.Quaternion()
          .setFromAxisAngle(BVH_AXIS.Y, FOOT_FREEZE_YAW_OFFSET)
          .multiply(entry.restWorldQuaternion);
        const parentWorldQuaternion = parent.getWorldQuaternion(new THREE.Quaternion()).invert();
        entry.bone.quaternion.copy(parentWorldQuaternion.multiply(targetWorldQuaternion));
        entry.bone.updateMatrixWorld(true);
      });
    }

    getFootAnchorWorld(rig) {
      const points = [];
      [
        "foot.L",
        "foot.R",
        "toe.L",
        "toe.R",
        "heel.02.L",
        "heel.02.R",
      ].forEach((boneName) => {
        const entry = rig.bones.get(boneName);
        if (!entry) return;
        const point = new THREE.Vector3();
        entry.bone.getWorldPosition(point);
        points.push(point);
      });
      if (!points.length) {
        return null;
      }

      const anchor = new THREE.Vector3();
      points.forEach((point) => anchor.add(point));
      anchor.multiplyScalar(1 / points.length);
      anchor.y = Math.min(...points.map((point) => point.y));
      return anchor;
    }

    lockRigFeetToGround(rig) {
      if (!LOCK_FEET_TO_GROUND) return;
      const currentAnchorWorld = this.getFootAnchorWorld(rig);
      if (!currentAnchorWorld) return;

      if (!rig.footAnchorBaseWorld) {
        rig.footAnchorBaseWorld = currentAnchorWorld.clone();
        return;
      }

      const delta = currentAnchorWorld.sub(rig.footAnchorBaseWorld);
      rig.group.position.sub(delta);
      rig.group.updateMatrixWorld(true);
    }

    writeRetargetDebug(rig, motion, frameIndex) {
      if (!this.stage) return;
      const prefix = rig.role === "reference" ? "reference" : "user";
      this.stage.dataset[`${prefix}BvhSource`] = motion.source;
      this.stage.dataset[`${prefix}BvhFrame`] = String(frameIndex);
      this.stage.dataset[`${prefix}BoneCount`] = String(rig.bones.size);
      this.stage.dataset[`${prefix}HasThighL`] = String(rig.bones.has("thigh.L"));
      this.stage.dataset[`${prefix}BoneNames`] = [...rig.bones.keys()].slice(0, 12).join(",");
      this.stage.dataset[`${prefix}LeftKnee`] = this.measureBoneAngle(rig, "thigh.L", "shin.L", "foot.L");
      this.stage.dataset[`${prefix}RightKnee`] = this.measureBoneAngle(rig, "thigh.R", "shin.R", "foot.R");
      this.stage.dataset[`${prefix}LeftElbow`] = this.measureBoneAngle(rig, "upper_arm.L", "forearm.L", "hand.L");
      this.stage.dataset[`${prefix}RightElbow`] = this.measureBoneAngle(rig, "upper_arm.R", "forearm.R", "hand.R");
      const footAnchor = this.getFootAnchorWorld(rig);
      if (footAnchor) {
        this.stage.dataset[`${prefix}FootAnchor`] = [
          footAnchor.x.toFixed(4),
          footAnchor.y.toFixed(4),
          footAnchor.z.toFixed(4),
        ].join(",");
      }
    }

    measureBoneAngle(rig, aName, bName, cName) {
      const a = rig.bones.get(aName)?.bone;
      const b = rig.bones.get(bName)?.bone;
      const c = rig.bones.get(cName)?.bone;
      if (!a || !b || !c) return "";
      const aPosition = new THREE.Vector3();
      const bPosition = new THREE.Vector3();
      const cPosition = new THREE.Vector3();
      a.getWorldPosition(aPosition);
      b.getWorldPosition(bPosition);
      c.getWorldPosition(cPosition);
      const ba = aPosition.sub(bPosition).normalize();
      const bc = cPosition.sub(bPosition).normalize();
      const radians = Math.acos(THREE.MathUtils.clamp(ba.dot(bc), -1, 1));
      return String(Math.round(THREE.MathUtils.radToDeg(radians)));
    }

    isUserKneeBent() {
      const userRig = this.rigs.user;
      if (!userRig) return false;
      const angles = [
        Number(this.measureBoneAngle(userRig, "thigh.L", "shin.L", "foot.L")),
        Number(this.measureBoneAngle(userRig, "thigh.R", "shin.R", "foot.R")),
      ].filter((angle) => Number.isFinite(angle));
      if (!angles.length) return false;
      return Math.min(...angles) <= HIGHLIGHT_KNEE_BENT_MAX_ANGLE_DEG;
    }

    updateHighlights(names) {
      const userRig = this.rigs.user;
      if (!userRig?.highlightRegions) return;
      const kneeBent = this.isUserKneeBent();
      const activeRegions = new Set(
        kneeBent
          ? names
              .filter((name) => HIGHLIGHT_ALLOWED_JOINTS.has(name))
              .map((name) => HIGHLIGHT_BONE_MAP[name])
              .filter(Boolean)
          : [],
      );
      const pulse = 0.72 + Math.sin(this.clock.elapsedTime * 10.5) * 0.18;

      userRig.highlightRegions.forEach((entries, regionName) => {
        const active = activeRegions.has(regionName);
        entries.forEach(({ mesh, material }) => {
          mesh.visible = active;
          material.opacity = active ? 0.64 + pulse * 0.16 : 0;
          material.emissiveIntensity = active ? 1.2 + pulse * 0.85 : 0;
        });
      });
    }

    collectPoints(frame, streamName) {
      const stream = frame[streamName];
      const landmarks = stream?.world_landmarks || [];
      const points = {};
      Object.entries(this.landmarkIndex).forEach(([name, index]) => {
        const raw = landmarks[index];
        if (!raw || raw.length < 3) return;
        if (raw.length > 3 && Number.isFinite(raw[3]) && raw[3] < 0.12) return;
        points[name] = new THREE.Vector3(Number(raw[0]) || 0, -(Number(raw[1]) || 0), -(Number(raw[2]) || 0));
      });

      points.hips = this.midpoint(points.left_hip, points.right_hip);
      points.shoulders = this.midpoint(points.left_shoulder, points.right_shoulder);
      points.neck = points.shoulders || points.nose;
      points.head = points.nose || this.midpoint(points.left_ear, points.right_ear);
      return points;
    }

    midpoint(a, b) {
      if (!a || !b) return null;
      return new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    }

    updateDebugLine(line, points, role) {
      if (!line) return;
      const positions = line.geometry.attributes.position.array;
      let cursor = 0;
      BODY_SEGMENTS.forEach(([from, to]) => {
        const start = points[from];
        const end = points[to];
        if (!start || !end) return;
        const a = this.toScenePoint(start, role);
        const b = this.toScenePoint(end, role);
        positions[cursor++] = a.x;
        positions[cursor++] = a.y;
        positions[cursor++] = a.z;
        positions[cursor++] = b.x;
        positions[cursor++] = b.y;
        positions[cursor++] = b.z;
      });
      line.geometry.setDrawRange(0, cursor / 3);
      line.geometry.attributes.position.needsUpdate = true;
    }

    toScenePoint(point, role) {
      const offset = AVATAR_OFFSETS[role] || AVATAR_OFFSETS.user;
      return new THREE.Vector3(
        point.x * 2.35 + offset.x,
        point.y * 2.35 + 1.02,
        point.z * 2.35 + offset.z,
      );
    }

    setMessage(title, detail) {
      if (!this.message) return;
      this.message.hidden = false;
      const titleEl = this.message.querySelector("strong");
      const detailEl = this.message.querySelector("em");
      if (titleEl) titleEl.textContent = title;
      if (detailEl) detailEl.textContent = detail;
    }

    hideMessage() {
      if (this.message) {
        this.message.hidden = true;
      }
    }

    resize() {
      if (!this.renderer || !this.camera || !this.stage) return;
      const rect = this.stage.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }

    animate() {
      window.requestAnimationFrame(() => this.animate());
      this.renderer.render(this.scene, this.camera);
    }
  }

  let sceneInstance = null;

  window.WorkWithAvatarScene = {
    init(options) {
      if (sceneInstance) return Promise.resolve(sceneInstance);
      sceneInstance = new AvatarScene(options);
      return sceneInstance.init().then(() => sceneInstance);
    },
    update(frame, options) {
      sceneInstance?.update(frame, options);
    },
    resize() {
      sceneInstance?.resize();
    },
  };
})();
