---
description: Capture a live webpage into a Claude Design canvas, verify it against the real page, and publish a preview link automatically.
argument-hint: <url> [css-selector]
---

The argument is "$ARGUMENTS". First token is the URL to capture. Second token, if present, is a
CSS selector for the region to capture — default to `body` if none is given.

Do this, in order, without asking for confirmation at each step unless something fails:

1. **Ensure the tool can run.** Check `node_modules/playwright` exists in this repo; if not, run
   `npm install playwright` first.

2. **Run the capture.** `node skills/1-ui-to-canvas-capture/ui-to-canvas-capture.mjs <url> <selector> <outDir>`
   — use a fresh `outDir` under a scratch/tmp location, never inside this repo's tracked tree.
   Read the script's own stderr output for warnings (networkidle timeout, root not near page top,
   etc.) — these are normal and documented in `skills/1-ui-to-canvas-capture/SKILL.md`, not failures,
   but note them.

3. **Verify before showing anything — no exceptions, this is a standing rule for this tool.**
   Render the captured `Main.dc.html` locally (a plain Playwright screenshot at the same viewport
   width the capture used) and take a matching screenshot of the real live page/selector. Look at
   both. If something real and structural is missing (not a font-rendering difference), say so
   plainly rather than publishing a broken result silently.

4. **Publish and open automatically.** Use the Artifact tool to publish the verified `Main.dc.html`
   plus its extracted image files as a static preview page, then open it — the person should not
   have to click anything to see the result. Be explicit in your reply that this is a static preview
   (not the live, interactive claude.ai/design canvas) — publishing into the real canvas is still a
   manual step: open claude.ai/design and import the file there yourself.

5. **Report briefly**: what was captured, any real discrepancies found in step 3, and the preview link.
