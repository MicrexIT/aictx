import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const output = path.join(root, ".github/social-preview.png");
const hdOutput = path.join(root, ".github/social-preview-hd.png");
const paintingPath = path.join(root, "site/public/assets/monet-water-lilies.jpg");
const logoPath = path.join(root, "site/public/assets/logo/memory-constellation-logo.svg");
const painting = `data:image/jpeg;base64,${(await readFile(paintingPath)).toString("base64")}`;
const markSvg = (await readFile(logoPath, "utf8")).replace(/<\?xml[^>]*>\s*/u, "");

const width = 1280;
const height = 640;

const html = String.raw`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        width: ${width}px;
        height: ${height}px;
        overflow: hidden;
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
          "Segoe UI", sans-serif;
        color: #111214;
        background: #f5f2ed;
      }

      .frame {
        position: relative;
        width: ${width}px;
        height: ${height}px;
        padding: 54px 64px;
        background:
          linear-gradient(
            90deg,
            rgba(247, 245, 238, 0.04),
            rgba(247, 245, 238, 0.48) 52%,
            rgba(247, 245, 238, 0.1)
          ),
          url("${painting}") center / cover;
      }

      .frame::after {
        content: "";
        position: absolute;
        inset: 0;
        background: rgba(255, 252, 246, 0.22);
      }

      .panel {
        position: relative;
        z-index: 1;
        display: grid;
        grid-template-columns: 1fr 356px;
        gap: 54px;
        align-items: center;
        width: 100%;
        height: 100%;
        padding: 58px 70px 56px;
        border: 1px solid rgba(36, 38, 39, 0.1);
        border-radius: 8px;
        background:
          linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.97),
            rgba(255, 255, 255, 0.9)
          ),
          rgba(255, 255, 255, 0.94);
        box-shadow:
          0 32px 78px rgba(26, 31, 33, 0.18),
          inset 0 1px rgba(255, 255, 255, 0.88);
      }

      .identity {
        display: flex;
        align-items: center;
        gap: 18px;
        margin-bottom: 30px;
      }

      .mark {
        width: 58px;
        height: 58px;
        flex: 0 0 auto;
      }

      .mark svg {
        display: block;
        width: 100%;
        height: 100%;
      }

      .name {
        font-size: 30px;
        font-weight: 840;
      }

      .tag {
        margin-top: 2px;
        color: #68707a;
        font-size: 18px;
        font-weight: 760;
        text-transform: uppercase;
      }

      h1 {
        max-width: 640px;
        margin: 0;
        font-size: 58px;
        line-height: 1.08;
        letter-spacing: 0;
      }

      .subhead {
        max-width: 670px;
        margin: 26px 0 34px;
        color: #2f3338;
        font-size: 27px;
        line-height: 1.2;
        font-weight: 760;
      }

      .repo {
        display: inline-flex;
        align-items: center;
        min-height: 46px;
        padding: 0 18px;
        border: 2px solid rgba(17, 18, 20, 0.1);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.7);
        color: #373b41;
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
        font-size: 22px;
        font-weight: 740;
      }

      .proof {
        overflow: hidden;
        border: 2px solid rgba(17, 18, 20, 0.12);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.96);
        box-shadow: 0 20px 48px rgba(34, 37, 38, 0.13);
      }

      .proof-header {
        padding: 26px 30px 22px;
        border-bottom: 1px solid rgba(17, 18, 20, 0.08);
      }

      .proof-kicker {
        color: #6f7680;
        font-size: 15px;
        font-weight: 820;
        text-transform: uppercase;
      }

      .proof-title {
        margin-top: 3px;
        font-size: 24px;
        font-weight: 850;
      }

      .command {
        margin: 22px 30px 18px;
        height: 50px;
        display: flex;
        align-items: center;
        padding: 0 20px;
        border-radius: 8px;
        background: #f1f0ed;
        color: #2e3035;
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
        font-size: 17px;
        font-weight: 760;
        white-space: nowrap;
      }

      .pack {
        padding: 0 30px 28px;
      }

      .pack-card {
        display: grid;
        grid-template-columns: 10px 1fr;
        overflow: hidden;
        min-height: 82px;
        margin-top: 12px;
        border: 2px solid rgba(17, 18, 20, 0.12);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.92);
      }

      .stripe {
        background: #9fb6a1;
      }

      .stripe.decision {
        background: #8aa5bd;
      }

      .stripe.review {
        background: #d6a574;
      }

      .pack-body {
        padding: 12px 16px 13px;
      }

      .type {
        color: #6f7680;
        font-size: 14px;
        font-weight: 820;
        text-transform: uppercase;
      }

      .memory {
        margin-top: 4px;
        font-size: 21px;
        line-height: 1.08;
        font-weight: 850;
      }
    </style>
  </head>
  <body>
    <main class="frame">
      <section class="panel">
        <div>
          <div class="identity">
            <div class="mark">${markSvg}</div>
            <div>
              <div class="name">Memory by Aictx</div>
              <div class="tag">Local-first project memory</div>
            </div>
          </div>

          <h1>A local wiki for AI agents.</h1>

          <div class="subhead">
            Agents load repo context, keep it current, and you review changes in Git.
          </div>

          <div class="repo">github.com/aictx/memory</div>
        </div>

        <aside class="proof" aria-label="Memory context pack example">
          <div class="proof-header">
            <div>
              <div class="proof-kicker">AI Context Pack</div>
              <div class="proof-title">Task-ready repo memory</div>
            </div>
          </div>

          <div class="command">memory load "next task"</div>

          <div class="pack">
            <div class="pack-card">
              <div class="stripe"></div>
              <div class="pack-body">
                <div class="type">Synthesis</div>
                <div class="memory">Load only what matters.</div>
              </div>
            </div>

            <div class="pack-card">
              <div class="stripe decision"></div>
              <div class="pack-body">
                <div class="type">Decision</div>
                <div class="memory">Keep context reviewable.</div>
              </div>
            </div>

            <div class="pack-card">
              <div class="stripe review"></div>
              <div class="pack-body">
                <div class="type">Git</div>
                <div class="memory">Diff, inspect, merge.</div>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </main>
  </body>
</html>`;

await mkdir(path.dirname(output), { recursive: true });

const browser = await chromium.launch();
try {
  for (const target of [
    { path: output, scale: 1 },
    { path: hdOutput, scale: 2 },
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: target.scale,
    });
    await page.setContent(html, { waitUntil: "load" });
    await page.screenshot({ path: target.path, fullPage: false });
    await page.close();
  }
} finally {
  await browser.close();
}

for (const target of [
  { path: output, width, height },
  { path: hdOutput, width: width * 2, height: height * 2 },
]) {
  const { size } = await stat(target.path);
  console.log(
    `Wrote ${path.relative(root, target.path)} (${target.width}x${target.height}, ${Math.round(size / 1024)} KB)`,
  );
}
