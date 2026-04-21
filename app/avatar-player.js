/**
 * avatar-player.js
 *
 * Lightweight avatar animation player for iOS (file://) builds.
 * Instead of running Three.js + BVH in WKWebView (which fails on file://),
 * this plays a pre-rendered MP4 video of the avatar animation in sync
 * with the session playback timeline.
 *
 * The MP4 is generated during the CI build by tools/render-frames.cjs.
 */
(() => {
  const VIDEO_SRC = "media/avatar/avatar-animation.mp4";

  class AvatarPlayer {
    constructor() {
      this.video = null;
      this.stage = null;
      this.message = null;
      this.ready = false;
      this.playbackDurationSec = 1;
      this._lastSeekSec = -1;
    }

    init({ stage, message }) {
      this.stage = stage;
      this.message = message;

      return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        video.src = VIDEO_SRC;
        video.muted = true;
        video.playsInline = true;
        video.setAttribute("playsinline", "");
        video.setAttribute("webkit-playsinline", "");
        video.preload = "auto";
        video.loop = false;
        video.style.cssText =
          "width:100%;height:100%;object-fit:contain;background:#04080d;display:block;";

        // Clear stage and insert video
        stage.innerHTML = "";
        stage.appendChild(video);
        this.video = video;

        // Hide the loading message once video is ready
        const onReady = () => {
          video.removeEventListener("canplaythrough", onReady);
          video.removeEventListener("loadeddata", onReady);
          this.ready = true;
          if (this.message) this.message.hidden = true;
          resolve();
        };

        video.addEventListener("canplaythrough", onReady, { once: true });
        // Fallback in case canplaythrough never fires
        video.addEventListener("loadeddata", () => {
          setTimeout(() => {
            if (!this.ready) onReady();
          }, 500);
        }, { once: true });

        video.onerror = () => {
          if (this.message) {
            this.message.hidden = false;
            const t = this.message.querySelector("strong");
            const d = this.message.querySelector("em");
            if (t) t.textContent = "아바타 영상 로드 실패";
            if (d) d.textContent = "";
          }
          reject(new Error("Avatar video failed to load"));
        };

        // Trigger load
        video.load();
      });
    }

    /**
     * Called by app.js on each frame update.
     * Seeks the video to the matching playback time.
     */
    update(frame, options) {
      if (!this.ready || !this.video) return;

      const playbackTimeSec = Number.isFinite(options?.playbackTimeSec)
        ? options.playbackTimeSec
        : 0;
      const playbackDurationSec = Number.isFinite(options?.playbackDurationSec)
        ? options.playbackDurationSec
        : this.playbackDurationSec;

      if (playbackDurationSec > 0) {
        this.playbackDurationSec = playbackDurationSec;
      }

      // Map session playback time to video time
      const videoDuration = this.video.duration || 1;
      const ratio = Math.min(playbackTimeSec / Math.max(playbackDurationSec, 0.001), 1);
      const targetSec = ratio * videoDuration;

      // Only seek if the target changed by more than half a frame
      if (Math.abs(targetSec - this._lastSeekSec) > 0.02) {
        this.video.currentTime = targetSec;
        this._lastSeekSec = targetSec;
      }
    }

    resize() {
      // Video element auto-resizes via CSS; nothing to do
    }
  }

  // Expose the same interface shape as WorkWithAvatarScene
  let instance = null;

  window.WorkWithAvatarPlayer = {
    init(options) {
      if (instance && instance.ready) return Promise.resolve(instance);
      instance = new AvatarPlayer();
      return instance.init(options).then(() => instance);
    },
    update(frame, options) {
      if (instance) instance.update(frame, options);
    },
    resize() {
      if (instance) instance.resize();
    },
  };
})();
