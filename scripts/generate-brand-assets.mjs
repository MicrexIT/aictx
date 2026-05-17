import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const logoPath = path.join(root, "site/public/assets/logo/memory-constellation-logo.svg");

const faviconSvg = await readFile(logoPath, "utf8");
const iconSvgBuffer = Buffer.from(faviconSvg);

const faviconTargets = [
  "site/public/favicon.svg",
  "docs/public/favicon.svg",
  "viewer/public/favicon.svg",
];

const icoTargets = ["site/public/favicon.ico", "viewer/public/favicon.ico"];

for (const target of faviconTargets) {
  await writeProjectFile(target, faviconSvg);
}

const ico = await createIco(iconSvgBuffer, [16, 32, 48, 64]);
for (const target of icoTargets) {
  await writeProjectFile(target, ico);
}

await patchReadmeHowItWorks();
await patchViewerScreenshot("site/public/assets/viewer-demo.png", {
  sidebar: { left: 29, top: 33, size: 26, cover: 34 },
  hero: { left: 413, top: 61, size: 44, cover: 54 },
});
await patchViewerScreenshot("site/public/assets/readme-visual-memory.png", {
  sidebar: { left: 188, top: 129, size: 32, cover: 42 },
  hero: { left: 661, top: 163, size: 55, cover: 66 },
});

console.log("Wrote constellation brand assets and patched static image logos.");

async function writeProjectFile(relativePath, contents) {
  const absolutePath = path.join(root, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents);
}

async function createIco(svgBuffer, sizes) {
  const images = await Promise.all(
    sizes.map(async (size) => ({
      size,
      data: await sharp(svgBuffer).resize(size, size).png().toBuffer(),
    })),
  );

  const headerSize = 6 + images.length * 16;
  const totalSize = headerSize + images.reduce((sum, image) => sum + image.data.length, 0);
  const buffer = Buffer.alloc(totalSize);
  buffer.writeUInt16LE(0, 0);
  buffer.writeUInt16LE(1, 2);
  buffer.writeUInt16LE(images.length, 4);

  let imageOffset = headerSize;
  images.forEach((image, index) => {
    const entryOffset = 6 + index * 16;
    buffer.writeUInt8(image.size === 256 ? 0 : image.size, entryOffset);
    buffer.writeUInt8(image.size === 256 ? 0 : image.size, entryOffset + 1);
    buffer.writeUInt8(0, entryOffset + 2);
    buffer.writeUInt8(0, entryOffset + 3);
    buffer.writeUInt16LE(1, entryOffset + 4);
    buffer.writeUInt16LE(32, entryOffset + 6);
    buffer.writeUInt32LE(image.data.length, entryOffset + 8);
    buffer.writeUInt32LE(imageOffset, entryOffset + 12);
    image.data.copy(buffer, imageOffset);
    imageOffset += image.data.length;
  });

  return buffer;
}

async function patchReadmeHowItWorks() {
  const file = path.join(root, "site/public/assets/readme-how-it-works.png");
  const paintingPath = path.join(root, "site/public/assets/monet-water-lilies.jpg");
  const painting = (await readFile(paintingPath)).toString("base64");
  const logoData = Buffer.from(faviconSvg).toString("base64");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1040" viewBox="0 0 2400 1040">
  <defs>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="28" stdDeviation="30" flood-color="#1f2527" flood-opacity="0.13"/>
    </filter>
    <style>
      .sans { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; }
      .mono { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; }
      .ink { fill: #111214; }
      .muted { fill: #525965; }
      .faint { fill: #6f7680; }
    </style>
  </defs>
  <rect width="2400" height="1040" rx="26" fill="#f5f2ed"/>
  <image href="data:image/jpeg;base64,${painting}" width="2400" height="1040" preserveAspectRatio="xMidYMid slice" opacity="0.42"/>
  <rect width="2400" height="1040" rx="26" fill="#fffaf2" opacity="0.36"/>

  <rect x="140" y="100" width="2120" height="840" fill="#fffefa" opacity="0.94"/>
  <rect x="140.5" y="100.5" width="2119" height="839" fill="none" stroke="#111214" stroke-opacity="0.06"/>

  <g transform="translate(276 180)">
    <circle cx="28" cy="28" r="36" fill="#ffffff"/>
    <image href="data:image/svg+xml;base64,${logoData}" x="0" y="0" width="56" height="56"/>
    <text class="sans ink" x="80" y="40" font-size="33" font-weight="800">How Memory works</text>
  </g>

  <text class="sans ink" x="276" y="308" font-size="78" font-weight="850">Load wiki context. Work. Update it.</text>
  <text class="sans muted" x="276" y="392" font-size="34" font-weight="650">Give each agent the repo context it needs, then save durable updates</text>
  <text class="sans muted" x="276" y="438" font-size="34" font-weight="650">future sessions can trust.</text>

  <g transform="translate(276 496)">
    <rect x="0" y="0" width="264" height="68" rx="34" fill="#111214"/>
    <text class="sans" x="132" y="44" font-size="26" font-weight="820" fill="#ffffff" text-anchor="middle">load wiki</text>
    <path d="M300 34H382m0 0-18-18m18 18-18 18" fill="none" stroke="#b7b4ad" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="416" y="0" width="250" height="68" rx="34" fill="#f8f7f4" stroke="#dedbd4" stroke-width="2"/>
    <text class="sans ink" x="541" y="44" font-size="26" font-weight="820" text-anchor="middle">do work</text>
    <path d="M704 34H786m0 0-18-18m18 18-18 18" fill="none" stroke="#b7b4ad" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="820" y="0" width="320" height="68" rx="34" fill="#f8f7f4" stroke="#dedbd4" stroke-width="2"/>
    <text class="sans ink" x="980" y="44" font-size="26" font-weight="820" text-anchor="middle">save update</text>
  </g>

  <g filter="url(#softShadow)">
    <rect x="276" y="628" width="584" height="248" rx="14" fill="#ffffff" stroke="#dedbd4" stroke-width="2"/>
    <image href="data:image/svg+xml;base64,${logoData}" x="300" y="660" width="52" height="52"/>
    <text class="sans ink" x="372" y="684" font-size="34" font-weight="830">Load the right page</text>
    <rect x="372" y="712" width="384" height="44" rx="8" fill="#eeece7"/>
    <text class="mono ink" x="392" y="742" font-size="21" font-weight="800">memory load "auth routes"</text>
    <text class="sans muted" x="324" y="810" font-size="25" font-weight="660">Typed wiki entries are searched locally</text>
    <text class="sans muted" x="324" y="844" font-size="25" font-weight="660">and returned as a focused pack.</text>
  </g>

  <g filter="url(#softShadow)">
    <rect x="928" y="628" width="584" height="248" rx="14" fill="#ffffff" stroke="#dedbd4" stroke-width="2"/>
    <image href="data:image/svg+xml;base64,${logoData}" x="952" y="660" width="52" height="52"/>
    <text class="sans ink" x="1024" y="684" font-size="34" font-weight="830">Build with evidence</text>
    <rect x="1024" y="712" width="384" height="44" rx="8" fill="#eeece7"/>
    <text class="mono ink" x="1045" y="742" font-size="21" font-weight="800">repo + tests + memory</text>
    <text class="sans muted" x="976" y="810" font-size="25" font-weight="660">Current code stays authoritative</text>
    <text class="sans muted" x="976" y="844" font-size="25" font-weight="660">when facts conflict or drift.</text>
  </g>

  <g filter="url(#softShadow)">
    <rect x="1580" y="628" width="584" height="248" rx="14" fill="#ffffff" stroke="#dedbd4" stroke-width="2"/>
    <image href="data:image/svg+xml;base64,${logoData}" x="1604" y="660" width="52" height="52"/>
    <text class="sans ink" x="1676" y="684" font-size="34" font-weight="830">Save durable updates</text>
    <rect x="1676" y="712" width="384" height="44" rx="8" fill="#eeece7"/>
    <text class="mono ink" x="1696" y="742" font-size="21" font-weight="800">memory remember --stdin</text>
    <text class="sans muted" x="1628" y="810" font-size="25" font-weight="660">Decisions, workflows, gotchas,</text>
    <text class="sans muted" x="1628" y="844" font-size="25" font-weight="660">and source-backed syntheses stay current.</text>
  </g>
</svg>`;

  await sharp(Buffer.from(svg)).png().toFile(file);
}

async function patchViewerScreenshot(relativePath, positions) {
  const file = path.join(root, relativePath);
  await patchIcons(file, [positions.sidebar, positions.hero]);
}

async function patchIcons(file, replacements) {
  const image = sharp(file);
  const masks = replacements.map((replacement) => ({
    input: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${replacement.cover}" height="${replacement.cover}">
        <circle cx="${replacement.cover / 2}" cy="${replacement.cover / 2}" r="${replacement.cover / 2}" fill="#fcfcfa"/>
      </svg>`,
    ),
    left: Math.round(replacement.left - (replacement.cover - replacement.size) / 2),
    top: Math.round(replacement.top - (replacement.cover - replacement.size) / 2),
  }));
  const icons = await Promise.all(
    replacements.map(async (replacement) => ({
      input: await sharp(iconSvgBuffer).resize(replacement.size, replacement.size).png().toBuffer(),
      left: Math.round(replacement.left),
      top: Math.round(replacement.top),
    })),
  );
  const tempFile = `${file}.tmp`;

  await image
    .composite([...masks, ...icons])
    .png()
    .toFile(tempFile);

  await rename(tempFile, file);
}
