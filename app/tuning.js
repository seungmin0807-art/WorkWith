window.WORKWITH_TUNING = {
  playback: {
    // Keep the analysis timeline matched to the real user.mp4 duration.
    useExactUserVideoDuration: true,
    fallbackDurationSec: 14.47,
  },

  userOverlay: {
    // MediaPipe analysis generated from user.mp4 directly.
    dataPath: "data/user-overlay-analysis.json",
  },

  userVideo: {
    // "cover" fills the whole left panel by cropping the sides.
    objectFit: "cover",

    // Set either value to null to use the auto focus from the generated overlay JSON.
    focusX: null,
    focusY: null,

    // Final scale/offset applied to both the video and the overlay canvas together.
    zoom: 1.12,
    translateXPercent: 0,
    translateYPercent: 0,
  },

  avatar: {
    // Whole model sizing / placement.
    modelScale: 1.52,
    modelFrontFineTuneY: 0,
    motionWorldRotationY: 0,

    // Distance between the two avatars.
    offsets: {
      reference: { x: -0.018, y: -0.18, z: -0.075 },
      user: { x: 0.018, y: -0.18, z: 0.075 },
    },

    camera: {
      fov: 38,
      position: { x: 4.55, y: 1.05, z: 0.0 },
      lookAt: { x: 0.0, y: 0.72, z: 0.0 },
    },

    lights: {
      key: { x: 2.4, y: 3.4, z: -1.5, intensity: 1.35 },
      rim: { x: -2.6, y: 1.9, z: 2.2, intensity: 0.7 },
    },

    appearance: {
      reference: {
        color: 0x59cfff,
        opacity: 0.62,
        emissive: 0x08304d,
        emissiveIntensity: 0.38,
      },
      user: {
        color: 0xf5f9ff,
        opacity: 0.78,
        emissive: 0x141a22,
        emissiveIntensity: 0.12,
      },
    },

    shoulders: {
      widthOffset: 0.04,
      armRootOffset: 0.016,
    },

    // Widen the stance from the lower legs / feet only so the pelvis does not look wider.
    stance: {
      shinSpread: 0.0,
      footSpread: 0.125,
      toeSpread: 0.08,
      toeTurnY: 0.3,
    },

    feet: {
      lockToGround: true,
    },

    // Hand / wrist shaping. Increase wristBackBendX if you want more backward bend.
    hands: {
      wristBackBendX: 1.06,
      wristSplayZ: 0.14,
      thumbBaseX: -0.08,
      thumbBaseY: 0.18,
      thumbBaseZ: 0.34,
      thumbMidX: -0.04,
      thumbMidY: 0.08,
      thumbMidZ: 0.16,
      thumbTipX: -0.02,
      thumbTipY: 0.03,
      thumbTipZ: 0.08,
      fingerBaseBendX: -0.08,
      fingerIndexSpreadZ: 0.08,
      fingerMiddleSpreadZ: 0.03,
      fingerRingSpreadZ: -0.03,
      fingerPinkySpreadZ: -0.08,
    },
  },
};
