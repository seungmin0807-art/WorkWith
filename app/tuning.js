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
    zoom: 1.4,
    translateXPercent: 0,
    translateYPercent: 0,
  },

  avatar: {
    // Whole model sizing / placement.
    modelScale: 1.5,
    modelFrontFineTuneY: -2,
    motionWorldRotationY: 0,

    // Distance between the two avatars.
    offsets: {
      reference: { x: -0.012, y: -0.18, z: -0.07 },
      user: { x: 0.012, y: -0.18, z: 0.07 },
    },

    camera: {
      fov: 38,
      position: { x: 4.5, y: 0.6, z: 0.0 },
      lookAt: { x: 0.0, y: 1.3, z: 0.0 },
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
        opacity: 0.9,
        emissive: 0x141a22,
        emissiveIntensity: 0.12,
      },
    },

    highlights: {
      // Red body-part highlights only appear while either avatar knee is bent below this angle.
      kneeBentMaxAngleDeg: 150,
    },

    shoulders: {
      widthOffset: 0.064,
      armRootOffset: 0.026,
    },

    // Widen the stance by rotating leg/foot directions, not by moving toe endpoints.
    // This preserves bone lengths so the feet do not stretch.
    stance: {
      thighDirectionSpread: 0.025,
      shinDirectionSpread: 0.105,
      footDirectionSpread: 0.0,
      footTurnY: 0.0,
      toeTurnY: 0.08,
    },

    feet: {
      lockToGround: true,
      // BVH toe landmarks can tilt upward while standing; keep foot bones close to the floor plane.
      keepFlat: true,
      verticalInfluence: 0.0,
    },

    // Closed-fist defaults.
    hands: {
      wristBendX: 0.16,
      wristSplayZ: 0.03,
      thumbBaseX: 0.2,
      thumbBaseY: 0.62,
      thumbBaseZ: 0.56,
      thumbMidX: 0.16,
      thumbMidY: 0.32,
      thumbMidZ: 0.28,
      thumbTipX: 0.12,
      thumbTipY: 0.16,
      thumbTipZ: 0.14,
      fingerBaseCurlX: 1.16,
      fingerMidCurlX: 0.98,
      fingerTipCurlX: 0.82,
      fingerIndexSpreadZ: 0.04,
      fingerMiddleSpreadZ: 0.01,
      fingerRingSpreadZ: -0.02,
      fingerPinkySpreadZ: -0.05,
    },
  },
};
