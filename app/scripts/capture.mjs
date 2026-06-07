#!/usr/bin/env node
// Playwright 로 핵심 화면 자동 캡처
// 사전 조건: dev 서버가 http://localhost:3000 에서 실행 중, DB 시드가 깨끗한 상태

import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { SignJWT } from "jose";
import { config as loadEnv } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(__dirname, "..", ".env.local") });

const OUT_DIR = path.resolve(__dirname, "../../screenshots");
const BASE = "http://localhost:3000";

async function makeSessionCookie(uid, username) {
  const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
  const token = await new SignJWT({ uid, username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
  return {
    name: "sns_session",
    value: token,
    domain: "localhost",
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  };
}

await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  deviceScaleFactor: 2, // 레티나 품질
  colorScheme: "dark",
  locale: "ko-KR",
  timezoneId: "Asia/Seoul",
});
const page = await ctx.newPage();

async function shot(name, opts = {}) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true, ...opts });
  console.log(`  📸 ${name}.png`);
}

async function go(p) {
  await page.goto(BASE + p, { waitUntil: "networkidle" });
  // 페이지 안의 폰트/리소스 한 박자 더 기다림
  await page.waitForTimeout(300);
}

async function loginAs(uid, username) {
  const cookie = await makeSessionCookie(uid, username);
  await ctx.addCookies([cookie]);
}

console.log("🎬 캡처 시작 → " + OUT_DIR);

// ---- 비로그인 상태 ----
console.log("\n[비로그인]");
await go("/");
await shot("01-feed-public");

await go("/login");
await shot("02-login");

await go("/signup");
await shot("03-signup");

// ---- alice 로그인 (세션 쿠키 직접 주입) ----
console.log("\n[alice 로그인]");
await loginAs(1, "alice");

await go("/");
await shot("04-feed-logged-in");

await go("/u/alice");
await shot("05-profile-self");

await go("/u/bob");
await shot("06-profile-other-followable");

await go("/posts/2"); // bob 의 ACID 글: 좋아요·댓글 풍부
await shot("07-post-detail");

await go("/ledger");
await shot("08-ledger-before");

// ---- 후원 액션 시연 ----
console.log("\n[후원 액션]");
// 메인 피드로 가서 bob 의 ACID 글(post 2) 카드의 후원 버튼 클릭.
// 단일 게시글 상세 페이지에서 후원 form 만 노출시키는 게 셀렉터가 깨끗.
await go("/posts/2");
const tipAmount = page.locator('input[name="amount"]').first();
await tipAmount.waitFor({ state: "visible" });
await tipAmount.fill("50");
const tipBtn = page.getByRole("button", { name: /후원/ }).first();
await Promise.all([
  page.waitForLoadState("networkidle"),
  tipBtn.click(),
]);
await page.waitForTimeout(500);

await shot("09-feed-after-tip");

await go("/ledger");
await shot("10-ledger-after-tip");

await go("/u/bob");
await shot("11-profile-bob-after-tip");

await browser.close();
console.log("\n✅ 완료 — " + OUT_DIR);
