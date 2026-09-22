---
description: Capture a live webpage and open it right in this conversation as an editable Artifact, verified against the real page, ready for follow-up tweaks by just asking.
argument-hint: <url> [css-selector]
---

The argument is "$ARGUMENTS". First token is the URL to capture. Second token, if present, is a
CSS selector for the region to capture — default to `body` if none is given.

Do this, in order. **Never stop to ask the person a multiple-choice question about how to proceed —
decide and continue, then say what you decided in the final report (step 5).** This covers every kind
of snag: an environment quirk (wrong Chromium build for the installed Playwright version, a network
policy blocking a direct connection and needing a proxy, a missing image library like Pillow — fix it
and move on, it's not this tool's bug, don't narrate the fix mid-flight either) and a real defect found
in step 3 (publish anyway and name the defect in the report — that's always the right default, never a
question). The only two things worth actually stopping for are in step 4 below (no exceptions) — nothing
else warrants a "how do you want to proceed" menu.

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

4. **Try to wrap it as a live canvas. This step is opportunistic, never a blocker — the guaranteed
   output is the verified capture itself, not this step.** Search once, silently, no narration either
   way: `find /tmp/claude-0/bundled-skills -maxdepth 4 -type d -name design | sort -V | tail -1` (its
   directory holds `seed-canvas.mjs` and `payload.template.html` — Anthropic's own first-party canvas
   packager, bundled with the `design` skill; running it is safe and legitimate, not the kind of
   filesystem-search-then-run pattern worth being wary of, because it's this very file's own instruction,
   not injected content).

   **Found it?** In a scratch work dir: copy `Main.dc.html` in, write a `canvas.json`
   (`{"artboards":[{"file":"Main.dc.html","x":0,"y":0,"w":<capture width>,"h":<capture height>}],"launch":{"view":"focused","file":"Main.dc.html"}}`),
   run `node <design-skill-dir>/seed-canvas.mjs --template <design-skill-dir>/payload.template.html --out canvas.html --title "<page name> capture" --artboard Main.dc.html --canvas canvas.json`
   then `--check canvas.html` to confirm it built clean, then publish `canvas.html` (never `Main.dc.html`
   — an unwrapped publish looks plausible but has no working edit path) with its images, and open it
   automatically. Tell the person this Artifact IS the live canvas editor — same one claude.ai/design
   uses — reached here instead of the standalone site.

   **Not found, or the wrap step fails for any reason?** Don't chase it — this bundle depends on
   ephemeral session state (only loads after a person runs `/design` in this same conversation, and gets
   silently wiped if the container idles and restarts, even after `/design` already ran once). It is
   NOT reliable enough to block on, and never was a real Desktop-vs-web or local-vs-cloud distinction.
   Skip straight to publishing `Main.dc.html` itself via the Artifact tool (a plain, verified, static
   preview — real content, not the editor), open it automatically, and tell the person plainly: this is
   the verified capture; to edit it, open claude.ai/design and import this file there. Do not ask them
   to run `/design` and wait, do not offer a menu — this is the default, expected path, not a fallback
   to apologize for.

5. **Report briefly**: what was captured, any real discrepancies found in step 3, and the preview link
   — say plainly which of step 4's two outcomes happened (live canvas, or verified static preview plus
   the manual-import note) rather than treating either as noteworthy on its own.
