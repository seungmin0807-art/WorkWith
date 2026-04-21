#!/usr/bin/env node
/**
 * render-frames.cjs
 *
 * Headless Puppeteer script that renders the Three.js avatar scene
 * frame-by-frame, then encodes the PNGs into an MP4 video via ffmpeg.
 *
 * Requirements (all satisfied on GitHub Actions macos-15 / ubuntu-latest):
 *   - Node.js >= 18
 *   - puppeteer (npm install puppeteer)
 *   - ffmpeg in $PATH
 *
 * Usage:
 *   cd app/tools && npm install puppeteer && node render-frames.cjs
 *
 * Output:
 *   ../media/avatar/avatar-animation.mp4
 */

const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { execSync } = require("child_process");

const FRAME_SIZE = 480;
const FRAMES_DIR = path.resolve(__dirname, "_frames");
const MP4_PATH = path.resolve(__dirname, "..", "media", "avatar", "avatar-animation.mp4");

/* ---------- tiny static file server ---------- */

function createServer(root) {
  const MIME = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".bvh": "text/plain",
    ".mp4": "video/mp4",
  };

  return http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);
    let filePath = path.join(root, urlPath);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      return res.end("Not found");
    }
    if (fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ---------- main ---------- */

(async () => {
  const appDir = path.resolve(__dirname, "..");

  // 1. Start local server
  const server = createServer(appDir);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const PORT = server.address().port;
  console.log(`[render] Static server on http://127.0.0.1:${PORT}`);

  // 2. Launch headless browser
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--use-gl=swiftshader",
      "--disable-gpu-sandbox",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: FRAME_SIZE, height: FRAME_SIZE, deviceScaleFactor: 1 });

  // 3. Load the render page
  console.log("[render] Loading render-page.html ...");
  await page.goto(`http://127.0.0.1:${PORT}/tools/render-page.html`, {
    waitUntil: "networkidle0",
    timeout: 120_000,
  });

  // 4. Wait for Three.js scene to finish initializing
  await page.waitForFunction("!!window.__RENDER_READY__ || !!window.__RENDER_ERROR__", {
    timeout: 120_000,
  });

  const renderError = await page.evaluate("window.__RENDER_ERROR__");
  if (renderError) {
    console.error("[render] Scene init failed:", renderError);
    await browser.close();
    server.close();
    process.exit(1);
  }

  const config = await page.evaluate("window.__RENDER_CONFIG__");
  console.log(
    `[render] Scene ready — ${config.totalFrames} frames, ${config.fps} fps, ${config.duration.toFixed(1)}s`,
  );

  // 5. Render each frame
  fs.mkdirSync(FRAMES_DIR, { recursive: true });

  for (let i = 0; i < config.totalFrames; i++) {
    await page.evaluate(`window.renderFrame(${i})`);
    // Wait two rAFs so the WebGL canvas is guaranteed to contain the rendered image
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );

    const canvas = await page.$("#avatarStage canvas");
    if (!canvas) {
      console.error("[render] Canvas element not found!");
      await browser.close();
      server.close();
      process.exit(1);
    }

    const framePath = path.join(FRAMES_DIR, `frame_${String(i).padStart(4, "0")}.png`);
    await canvas.screenshot({ path: framePath, omitBackground: false });

    if (i % 100 === 0 || i === config.totalFrames - 1) {
      console.log(`[render]   ${i + 1} / ${config.totalFrames}`);
    }
  }

  await browser.close();
  server.close();

  // 6. Encode to MP4
  console.log("[render] Encoding MP4 ...");
  fs.mkdirSync(path.dirname(MP4_PATH), { recursive: true });
  execSync(
    [
      "ffmpeg -y",
      `-framerate ${config.fps}`,
      `-i "${path.join(FRAMES_DIR, "frame_%04d.png")}"`,
      "-c:v libx264 -pix_fmt yuv420p -crf 23",
      '-vf "pad=ceil(iw/2)*2:ceil(ih/2)*2"',
      `"${MP4_PATH}"`,
    ].join(" "),
    { stdio: "inherit" },
  );

  const stats = fs.statSync(MP4_PATH);
  console.log(`[render] MP4 saved: ${MP4_PATH} (${(stats.size / 1024).toFixed(0)} KB)`);

  // 7. Clean up temp frames
  fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
  console.log("[render] Done.");
})();
