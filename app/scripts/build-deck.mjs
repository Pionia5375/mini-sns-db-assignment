#!/usr/bin/env node
// 슬라이드 HTML → PNG (1920×1080) → PPTX 빌드
//
// usage:  node deck/build.mjs

import { chromium } from "playwright";
import PptxGenJS from "pptxgenjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, "..", "..");
const SLIDES_DIR = path.join(ROOT, "deck", "slides");
const ASSETS_DIR = path.join(ROOT, "deck", "assets");
const OUT_PPTX   = path.join(ROOT, "MiniSNS_발표.pptx");

await mkdir(ASSETS_DIR, { recursive: true });

const slideFiles = (await readdir(SLIDES_DIR))
  .filter((f) => f.endsWith(".html"))
  .sort();

if (slideFiles.length === 0) {
  console.error("❌ slides 폴더에 .html 파일이 없습니다.");
  process.exit(1);
}

console.log(`🎨 ${slideFiles.length} 슬라이드 렌더링 시작 (1920×1080, deviceScaleFactor 2)`);

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

const pngs = [];
for (const file of slideFiles) {
  const htmlPath = path.join(SLIDES_DIR, file);
  const pngPath  = path.join(ASSETS_DIR, file.replace(/\.html$/, ".png"));
  await page.goto("file://" + htmlPath, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250); // 폰트 페인트 안정화
  await page.screenshot({
    path: pngPath,
    clip: { x: 0, y: 0, width: 1920, height: 1080 },
  });
  console.log(`  📸 ${file} → ${path.basename(pngPath)}`);
  pngs.push(pngPath);
}

await browser.close();

console.log("\n📦 PPTX 묶는 중…");

const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE";   // 13.333" × 7.5" = 16:9
pptx.title  = "MiniSNS — DB 과제";
pptx.author = "DB 과제";
pptx.company = "MiniSNS";

for (const png of pngs) {
  const slide = pptx.addSlide();
  slide.background = { color: "0A0E1A" };
  slide.addImage({
    path: png,
    x: 0,
    y: 0,
    w: "100%",
    h: "100%",
  });
}

await pptx.writeFile({ fileName: OUT_PPTX });

console.log(`\n✅ 완료 → ${OUT_PPTX}`);
