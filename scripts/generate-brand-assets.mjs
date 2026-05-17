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
  const replacements = [
    { left: 276, top: 180, size: 56, cover: 68 },
    { left: 300, top: 660, size: 52, cover: 64 },
    { left: 952, top: 660, size: 52, cover: 64 },
    { left: 1604, top: 660, size: 52, cover: 64 },
  ];

  await patchIcons(file, replacements);
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
