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
in step 3 (fix it yourself and re-verify, per step 3's own loop — publish-anyway-and-name-it is only the
fallback once that loop is genuinely exhausted, never a question). The only two things worth actually
stopping for are in step 4 below (no exceptions) — nothing else warrants a "how do you want to proceed"
menu.

1. **Ensure the tool can run.** Check `node_modules/playwright` exists in this repo; if not, run
   `npm install playwright` first.

2. **Run the capture.** `node skills/1-ui-to-canvas-capture/ui-to-canvas-capture.mjs <url> <selector> <outDir>`
   — use a fresh `outDir` under a scratch/tmp location, never inside this repo's tracked tree.
   Read the script's own stderr output for warnings (networkidle timeout, root not near page top,
   etc.) — these are normal and documented in `skills/1-ui-to-canvas-capture/SKILL.md`, not failures,
   but note them.

3. **Verify AND FIX before showing anything — no exceptions, this is a standing rule for this tool.**
   Render the captured `Main.dc.html` locally (a plain Playwright screenshot at the same viewport
   width the capture used) and take a matching screenshot of the real live page/selector. Look at
   both — you have vision, use it directly, the same way you already fix a discrepancy in seconds
   whenever the person pastes you a screenshot after the fact. **Don't wait for the person to be the
   one who spots it and pastes it back — that round trip is pure waste if you can already see both
   images yourself, right now, before publishing.**
   If something real and structural is off (not a font-rendering nuance): identify the specific
   difference, fix it, re-render, re-screenshot, re-compare — up to 3 rounds. Two kinds of fix:
   - **Specific to this one capture** (a baked style value that's simply off, a broken image URL): edit
     `Main.dc.html` directly and re-check. This is a hand-patch, not a script change — fine when the
     cause is a one-off value, not a class of bug.
   - **A real bug in the capture script itself** (something that would misfire on ANY page with this
     shape, not just this one): fix `skills/1-ui-to-canvas-capture/ui-to-canvas-capture.mjs` and re-run
     the capture from scratch instead of hand-patching the output — a script fix benefits every future
     capture; a hand-patch benefits only this one file and leaves the real bug in place for next time.
   Only after 3 rounds still show a real discrepancy should you fall back to publishing anyway and
   naming the residual defect plainly in the report (step 5) — that's the exception now, not the
   default. Never publish a first-pass result with a visible, fixable discrepancy just because "that's
   what came out" — closing the loop yourself IS the job here, not optional polish.
   **A same-looking pair of screenshots is not proof of correctness if both came from the same flawed
   pipeline** — a real bug this exact check missed once: a timing issue that baked a handful of icons at
   the full page width hit the capture AND the "live" reference screenshot the same way, independently,
   because both were rendered by the same script; they matched each other and were both wrong. After
   comparing screenshots, also open the actual published canvas (or its `Main.dc.html` rendered full-page,
   not cropped) and look at it as a whole once before calling this step done — an icon or element sized
   wildly out of proportion, or a height that's a small fraction of what the page should be, is the kind
   of defect a side-by-side crop comparison can miss entirely.
   **A screenshot match proves visual fidelity, not that the Design canvas will render it at all —
   these are different failure modes and this check only catches the first.** Real bug, found live on
   apple.com: capturing the default `body` selector serialized a nested `<body>` inside the output's own
   wrapper `<body>`. A plain browser (and Playwright's own Chromium) parses that leniently enough to
   render visually correct — matching the live screenshot perfectly — but the Design canvas's own
   artboard parser does not tolerate it and silently drops the whole board with zero error surfaced. This
   is now fixed at the source (a captured root's tag is renamed if it collides with `body`/`html`/`head`),
   but the LESSON generalizes: if a real "the canvas is empty / no artboards to show" report ever comes
   back despite step 3 passing, treat it as a DC-parser-level structural bug first (a reserved-tag
   collision, an unbalanced tag, something a lenient browser tolerated silently) — not a pan/zoom/caching
   glitch to explain away, and not something a browser screenshot re-check can rule out.

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
     **The Design type caps a board's `h` at 8000px** — if the capture's real height is taller than
     that, the canvas.json write silently clamps it while `Main.dc.html` itself stays the real height,
     which mismatches the frame against its content. A capture legitimately over 8000px tall is rare but
     real (a very long page, or one inflated by an unfixed bug); if it happens, say so plainly in the
     report rather than letting it look like an ordinary successful publish.
     **The Design type also has an undocumented single-artboard BYTE-SIZE ceiling, somewhere between 2MB
     and 3MB** — confirmed by bisection on a real dense page (2MB artboard rendered, 3MB from the same
     page did not). Above it, the publish itself succeeds with no error and the canvas shows "No
     artboards to show in this view." with nothing pointing at why. The capture script now handles this
     itself: if `Main.dc.html` would exceed ~1.8MB (a safety margin under the observed range), it
     automatically crops the page height from the top down — binary-searching the tallest cutoff that
     still fits, using each element's real captured Y-position at any depth (never by truncating the HTML
     text, which breaks tag balance and the trailing `<script data-dc-script>` block, and never by
     deleting whole top-level sections or random leaf nodes, both of which were tried and produced a
     gutted or gap-riddled page — see the script's own comments on the two earlier broken versions of
     this). The result is a real, working canvas covering the top of the page — a deliberate product
     choice: a working partial capture beats a complete one that silently fails to publish. If it fires,
     say so plainly in the report (what fraction of the page height survived) — never present a cropped
     capture as a complete one.
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
