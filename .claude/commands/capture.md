---
description: Capture a live webpage and open it right in this conversation as an editable Artifact, verified against the real page, ready for follow-up tweaks by just asking.
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

4. **Wrap it as a canvas, then publish that — never publish `Main.dc.html` directly.** Publishing the
   raw captured HTML file gives an inert page: no layer tree, no Edit panel, no read-only lock to click
   past, nothing to drag or restyle — just a static render. That is NOT this tool's output; it is a
   common mistake this step exists to prevent. The actual editor comes from a canvas packager bundled
   with the session itself — confirmed present in a claude.ai-hosted Claude Code session (the web app at
   claude.ai/code), confirmed ABSENT in the standalone Desktop app (a real search there, across the app
   bundle and Claude config directories, found nothing). Locate it fresh each run rather than hardcoding
   a version:
   `find /tmp/claude-0/bundled-skills -maxdepth 4 -type d -name design | sort -V | tail -1` (picks the
   highest bundled version if more than one is present; its directory holds
   `seed-canvas.mjs` and `payload.template.html`).
   **If that search finds nothing — this session cannot do this step. Do not improvise a menu of
   alternatives or ask the user how to proceed. Say plainly: this capture (`Main.dc.html`, saved at
   `<outDir>`) is ready, but wrapping it as a live canvas needs a claude.ai-hosted session — paste it
   into a claude.ai/code browser tab and ask it to open the capture as a canvas there. Stop.**
   Found it? Continue, in a scratch work dir:
   - Copy `Main.dc.html` in.
   - Write a `canvas.json` next to it: `{"artboards":[{"file":"Main.dc.html","x":0,"y":0,"w":<capture width>,"h":<capture height>}],"launch":{"view":"focused","file":"Main.dc.html"}}`.
   - Run `node <design-skill-dir>/seed-canvas.mjs --template <design-skill-dir>/payload.template.html --out canvas.html --title "<page name> capture" --artboard Main.dc.html --canvas canvas.json`, then
     `node <design-skill-dir>/seed-canvas.mjs --check canvas.html` to confirm it built clean.
   - Publish `canvas.html` (not `Main.dc.html`) via the Artifact tool, with its image files, then open
     it automatically — the person should not have to click anything to see the result.
   Be explicit in your reply that this Artifact IS the live canvas editor — the same one claude.ai/design
   uses (same layer tree, same Edit/Code/Tweaks panel, same style properties, same drawing tools) —
   reached here inside the conversation instead of the standalone site. It opens read-only; one click
   past that lock and they can drag, resize, and restyle by hand right here, or just ask for changes in
   chat — same editor either way, not an extra manual step to become "real." Mention claude.ai/design
   only as a separate, optional path if they'd rather start there without a conversation.

5. **Report briefly**: what was captured, any real discrepancies found in step 3, and the preview link —
   note that it's the live canvas editor, ready for hands-on edits or chat requests right here.
