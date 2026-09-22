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

4. **Publish it as a live canvas using the Artifact tool's own "Design" Artifact type — this is the
   reliable, official path, not a fallback.** An earlier version of this step tried to reuse a
   `seed-canvas.mjs` script scavenged from a skill's bundled-file cache, which depended on ephemeral
   session state (needed a person to run `/design` first, got silently wiped on container restarts) and
   failed constantly. None of that applies here: this uses the Artifact tool the ordinary, documented way.
   `Main.dc.html` is already a complete, valid `.dc.html` artboard (the capture script writes the
   required `<script src="./support.js"></script>` head line, `<x-dc>` wrapper, and
   `<script type="text/x-dc" data-dc-script>` block itself — nothing to patch).
   - Call the Artifact tool: `action: "quickstart"`, `intent: "design"`, `design_systems: false`. Its
     result names the Design type's `type_url` — always fetch it fresh this way, never hardcode a
     previously-seen url, it can change.
   - Call the Artifact tool: `action: "publish"`, `type_url`: that url, `title`: a short name for the
     capture, `auto_open: "after_first_write"`, no `file_path`. This creates the canvas and returns its
     own `url` — use that `url` for every following call on this canvas, never `type_url` again.
   - In a scratch work dir, lay out `project/canvas.json` (`{"v":3,"createdOnFiles":{"v":1,"at":"<now,
     RFC 3339>"},"title":"<same short name>","launch":{"view":"focused","file":"Main.dc.html"},"pages":[],"boards":{"Main.dc.html":{"x":0,"y":0,"w":<capture
     width>,"h":<capture height>}},"order":["Main.dc.html"],"notes":{},"designSystems":[]}`) and
     `project/Main.dc.html` plus every image file the capture wrote alongside it (same relative names —
     the capture script already references them by relative `src`, so no rewriting needed).
   - Call the Artifact tool: `action: "publish"`, `url`: the canvas's own url from the second call,
     `root`: that scratch dir, `file_path`: the absolute path to `project/canvas.json` in it, `files`:
     every other file by its `project/…` path (e.g. `{"project/Main.dc.html": "project/Main.dc.html",
     "project/img1.svg": "project/img1.svg"}`). This is the ONE call that actually writes the content.
   - Open the canvas's own url automatically — the person should not have to click anything to see it.
   This has no dependency on `/design`, no bundled-skill search, and works identically in every
   claude.ai-hosted session. If any of these calls errors, say exactly which one and why, and fall back
   to publishing `Main.dc.html` itself as a plain static Artifact with a note to import it into
   claude.ai/design manually — but treat that as a real failure worth explaining, not the expected path.

5. **Report briefly**: what was captured, any real discrepancies found in step 3, and the canvas link.
