// verify-capture.mjs — the step-3 verification screenshots, ready-made.
//
// Every single field report on this tool independently hand-wrote its own
// version of this script, and every single one hit the SAME two bugs doing
// it: (1) run it from the scratchpad/output dir instead of this repo, and
// it can't resolve the `playwright` package at all ("Cannot find package
// 'playwright'" / ERR_MODULE_NOT_FOUND); (2) launch the live-page browser
// without this repo's own proxy/TLS config, and it fails with
// net::ERR_CERT_AUTHORITY_INVALID or goes direct instead of through the
// sandbox's egress proxy. Confirmed across at least 8 independent runs.
// Shipping ONE correct script here — reusing the exact launch config
// ui-to-canvas-capture.mjs already uses — means nobody has to rediscover
// either bug again.
//
// Usage: node skills/1-ui-to-canvas-capture/verify-capture.mjs <mainDcHtmlPath> <liveUrl> <viewportWidth> <outDir>
// Writes <outDir>/capture.png and <outDir>/live.png, and prints a JSON
// summary. Run this from the repo root (or anywhere — it resolves
// `playwright` from ITS OWN location, not the caller's cwd).

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const [, , dcHtmlPath, liveUrl, vw, outDir] = process.argv;
if (!dcHtmlPath || !liveUrl || !outDir) {
  console.error('usage: node verify-capture.mjs <mainDcHtmlPath> <liveUrl> <viewportWidth> <outDir>');
  process.exit(1);
}
const viewportWidth = parseInt(vw || '1440', 10);
fs.mkdirSync(outDir, { recursive: true });

// Identical to ui-to-canvas-capture.mjs's own launch config — a verification
// browser that can't reach the live page the same way the real capture did
// produces a false reading (a TLS interstitial or a proxy block page, not
// the real site), not a comparison.
const CAPTURE_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: ['--ignore-certificate-errors'],
  proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
});

// Render the local capture output.
// Real bug, found live: a fixed 1200ms wait instead of waiting for fonts to
// actually finish loading meant this screenshot could be taken BEFORE a
// locally-downloaded @font-face swapped in, catching a temporary fallback
// font's wider glyph metrics — which can flip a heading from one line to
// two in THIS screenshot alone, even though the real font (and the real
// published canvas) never renders that way. ui-to-canvas-capture.mjs
// itself already waits for `document.fonts.ready` before measuring
// anything for exactly this reason; this script needs the same guarantee.
const absHtmlPath = path.resolve(dcHtmlPath);
const capturePage = await browser.newPage({ viewport: { width: viewportWidth, height: 1000 }, ignoreHTTPSErrors: true });
await capturePage.goto(`file://${absHtmlPath}`);
await capturePage.evaluate(() => document.fonts.ready);
await capturePage.waitForTimeout(300);
const captureHeight = await capturePage.evaluate(() => document.body.scrollHeight);
await capturePage.setViewportSize({ width: viewportWidth, height: Math.max(captureHeight, 100) });
await capturePage.screenshot({ path: path.join(outDir, 'capture.png'), fullPage: true });
await capturePage.close();

// Render the real live page, same viewport width, scrolled through once
// first (many real dashboards/lazy-load a widget only once it's been
// scrolled into view — a fixed-scroll-position screenshot of the LIVE page
// can itself be the thing that's wrong, not the capture; confirmed live on
// plausible.io's own analytics dashboard widget).
const livePage = await browser.newPage({ viewport: { width: viewportWidth, height: 1000 }, ignoreHTTPSErrors: true, userAgent: CAPTURE_UA });
const navResp = await livePage.goto(liveUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch((e) => {
  console.error(`live page navigation failed: ${e.message}`);
  return null;
});
if (navResp && !navResp.ok()) {
  console.error(`live page returned HTTP ${navResp.status()} ${navResp.statusText()} — this comparison may be against an error page, not the real site`);
}
try { await livePage.waitForLoadState('networkidle', { timeout: 15000 }); } catch (e) { /* fine, proceed anyway */ }
try { await livePage.evaluate(() => document.fonts.ready); } catch (e) { /* fine, proceed anyway */ }
await livePage.evaluate(async () => {
  const step = Math.max(200, Math.floor(window.innerHeight / 2));
  for (let y = 0; y < document.body.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 150));
  }
  window.scrollTo(0, 0);
});
await livePage.waitForTimeout(500);
const liveHeight = await livePage.evaluate(() => document.body.scrollHeight);
await livePage.setViewportSize({ width: viewportWidth, height: Math.max(liveHeight, 100) });
await livePage.screenshot({ path: path.join(outDir, 'live.png'), fullPage: true });
await livePage.close();

await browser.close();

console.log(JSON.stringify({
  capturePng: path.join(outDir, 'capture.png'),
  livePng: path.join(outDir, 'live.png'),
  captureHeight,
  liveHeight,
  note: 'Now run diff-screenshots.py on these two files.',
}));
