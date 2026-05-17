import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const output = path.join(root, "site/public/assets/readme-value-header.png");
const paintingPath = path.join(root, "site/public/assets/monet-water-lilies.jpg");
const logoPath = path.join(root, "site/public/assets/logo/memory-constellation-logo.svg");
const painting = `data:image/jpeg;base64,${(await readFile(paintingPath)).toString("base64")}`;
const markSvg = (await readFile(logoPath, "utf8")).replace(/<\?xml[^>]*>\s*/u, "");

const width = 2400;
const height = 1120;

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
        padding: 112px 142px;
        background:
          linear-gradient(
            90deg,
            rgba(247, 245, 238, 0.04),
            rgba(247, 245, 238, 0.5) 48%,
            rgba(247, 245, 238, 0.08)
          ),
          url("${painting}") center / cover;
      }

      .frame::after {
        content: "";
        position: absolute;
        inset: 0;
        background: rgba(255, 252, 246, 0.26);
        pointer-events: none;
      }

      .panel {
        position: relative;
        z-index: 1;
        display: grid;
        grid-template-columns: 1.08fr 0.92fr;
        gap: 108px;
        align-items: center;
        width: 100%;
        height: 100%;
        padding: 104px 148px;
        border: 1px solid rgba(36, 38, 39, 0.08);
        background:
          linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.96),
            rgba(255, 255, 255, 0.9)
          ),
          rgba(255, 255, 255, 0.92);
        box-shadow:
          0 42px 96px rgba(26, 31, 33, 0.18),
          inset 0 1px rgba(255, 255, 255, 0.9);
      }

      .eyebrow {
        display: flex;
        align-items: center;
        gap: 24px;
        margin-bottom: 34px;
        font-size: 32px;
        font-weight: 780;
      }

      .mark {
        width: 60px;
        height: 60px;
        flex: 0 0 auto;
      }

      .mark svg {
        display: block;
        width: 100%;
        height: 100%;
      }

      h1 {
        max-width: 920px;
        margin: 0;
        font-size: 84px;
        line-height: 1.1;
        letter-spacing: 0;
      }

      .subhead {
        max-width: 760px;
        margin: 46px 0 64px;
        font-size: 40px;
        line-height: 1.22;
        font-weight: 780;
      }

      .chips {
        display: flex;
        gap: 22px;
        flex-wrap: wrap;
      }

      .chip {
        display: inline-flex;
        align-items: center;
        height: 66px;
        padding: 0 26px;
        border: 2px solid rgba(17, 18, 20, 0.12);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.75);
        font-size: 24px;
        font-weight: 760;
      }

      .proof {
        justify-self: end;
        width: 730px;
        border: 2px solid rgba(17, 18, 20, 0.12);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.95);
        box-shadow: 0 40px 92px rgba(34, 37, 38, 0.18);
      }

      .proof-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 30px 40px 26px;
        border-bottom: 1px solid rgba(17, 18, 20, 0.08);
      }

      .proof-kicker {
        margin: 0 0 6px;
        color: #6f7680;
        font-size: 19px;
        font-weight: 760;
        text-transform: uppercase;
      }

      .proof-title {
        margin: 0;
        font-size: 31px;
        font-weight: 820;
      }

      .dots {
        display: flex;
        gap: 12px;
      }

      .dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: #b5b0aa;
      }

      .task {
        display: grid;
        grid-template-columns: 84px 1fr;
        gap: 20px;
        align-items: center;
        padding: 28px 40px 18px;
      }

      .label {
        color: #737b86;
        font-size: 22px;
        font-weight: 760;
      }

      .command {
        height: 54px;
        display: flex;
        align-items: center;
        padding: 0 24px;
        border-radius: 8px;
        background: #f1f0ed;
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
        font-size: 22px;
        font-weight: 760;
        color: #2e3035;
      }

      .pack {
        padding: 0 40px 28px;
      }

      .pack-card {
        display: grid;
        grid-template-columns: 14px 1fr;
        overflow: hidden;
        min-height: 100px;
        margin-top: 14px;
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

      .stripe.gotcha {
        background: #d6a574;
      }

      .pack-body {
        padding: 15px 22px 16px;
      }

      .type {
        color: #6f7680;
        font-size: 19px;
        font-weight: 820;
      }

      .memory {
        margin-top: 4px;
        font-size: 26px;
        line-height: 1.12;
        font-weight: 840;
      }

      .detail {
        margin-top: 4px;
        color: #4d535c;
        font-size: 20px;
        line-height: 1.2;
        font-weight: 620;
      }

      .footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 18px 40px 28px;
        color: #69717c;
        font-size: 20px;
        font-weight: 720;
      }

      .review {
        color: #111214;
      }
    </style>
  </head>
  <body>
    <main class="frame">
      <section class="panel">
        <div>
          <div class="eyebrow">
            <div class="mark">${markSvg}</div>
            <div>Local-first and open source</div>
          </div>

          <h1>Stop re-explaining your repo to AI agents.</h1>

          <div class="subhead">
            Memory saves durable project knowledge as reviewable repo memory.
          </div>

          <div class="chips">
            <div class="chip">not chat logs</div>
            <div class="chip">reviewable memory</div>
            <div class="chip">task-focused context</div>
          </div>
        </div>

        <aside class="proof" aria-label="Memory context pack example">
          <div class="proof-header">
            <div>
              <p class="proof-kicker">AI Context Pack</p>
              <p class="proof-title">Update viewer search behavior</p>
            </div>
            <div class="dots" aria-hidden="true">
              <div class="dot"></div>
              <div class="dot"></div>
              <div class="dot"></div>
            </div>
          </div>

          <div class="task">
            <div class="label">Ran</div>
            <div class="command">memory load "viewer search"</div>
          </div>

          <div class="pack">
            <div class="pack-card">
              <div class="stripe"></div>
              <div class="pack-body">
                <div class="type">Synthesis</div>
                <div class="memory">Canonical memory first.</div>
                <div class="detail">Keep guided views secondary.</div>
              </div>
            </div>

            <div class="pack-card">
              <div class="stripe decision"></div>
              <div class="pack-body">
                <div class="type">Decision</div>
                <div class="memory">Filters follow the schema.</div>
                <div class="detail">Avoid drift from storage contracts.</div>
              </div>
            </div>

            <div class="pack-card">
              <div class="stripe gotcha"></div>
              <div class="pack-body">
                <div class="type">Gotcha</div>
                <div class="memory">Viewer filters can drift.</div>
                <div class="detail">Verify against storage schema.</div>
              </div>
            </div>
          </div>

          <div class="footer">
            <span>Loaded only what this task needs</span>
            <span class="review">reviewable in Git</span>
          </div>
        </aside>
      </section>
    </main>
  </body>
</html>`;

await mkdir(path.dirname(output), { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({ path: output, fullPage: false });
} finally {
  await browser.close();
}

console.log(`Wrote ${path.relative(root, output)}`);
