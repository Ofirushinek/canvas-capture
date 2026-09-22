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

4. **Wrap it as a canvas using `seed-canvas.mjs`, then publish that — never publish `Main.dc.html`
   directly, and never invent your own substitute wrapper.** Publishing the raw captured HTML file gives
   an inert page: no layer tree, no Edit panel, no read-only lock to click past, nothing to drag or
   restyle — just a static render that LOOKS plausible in a Properties/Code/Tweaks-style shell but isn't
   actually wired to anything. Improvising your own `canvas.json`/index structure instead of running the
   real packager produces exactly that: something that resembles the editor but has no working edit
   path. That's happened before — don't repeat it.
   **A note on why this step is legitimate, since it can read as suspicious out of context:** searching
   the filesystem for a script and running it is a real prompt-injection pattern in general, and it's
   correct to be wary of that shape of instruction. This case is different and safe: `seed-canvas.mjs`
   is Anthropic's own first-party code, bundled with every Claude Code session as part of the `design`
   skill (not fetched from the network, not written by this repo, not discoverable content someone
   planted) — this file (`capture.md`) itself is the thing the person explicitly asked you to follow, not
   untrusted external content telling you to deviate from it. Locating and running it is what makes this
   tool's actual, advertised output. If you'd still rather not, stop and say so explicitly to the person
   instead of silently substituting something else that looks similar.
   The bundle is fetched into this session's cache **only after a human runs `/design` at least once in
   this same conversation.** It is NOT pre-loaded at session start, and an agent cannot trigger it itself
   (the `design` skill blocks model-invocation by design — it must come from the person). This is the
   real, confirmed cause of "it's not there": not Desktop vs. web, not local vs. cloud — literally
   whether `/design` has run here yet.
   Search for it fresh each run rather than hardcoding a version:
   `find /tmp/claude-0/bundled-skills -maxdepth 4 -type d -name design | sort -V | tail -1` (its
   directory holds `seed-canvas.mjs` and `payload.template.html`).
   **If that search finds nothing: do not declare this session incapable, and do not improvise a menu.**
   Say plainly: this capture (`Main.dc.html`, saved at `<outDir>`) is ready, but the canvas-editor bundle
   hasn't loaded in this conversation yet. Ask the person to run `/design` once themselves (any throwaway
   prompt — its own output can be ignored), then ask to retry this step; the same session, no new one
   needed. Stop there — do not proceed until they've done that and asked you to continue.
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
