# Canvas Capture

Capture any live webpage straight into your Claude Code conversation — the full drag/resize/restyle canvas editor opens right there, no separate app, no export/import round trip. Then put the edit back into your codebase without breaking a shared component or freezing live data.

Built by [Ofir Ushinek](https://github.com/Ofirushinek) and his Claude agent team.

## Quickstart

In a new Claude Code conversation, send these two prompts, one at a time, in order:

**1.**
```
Clone https://github.com/Ofirushinek/canvas-capture.git and cd into it.
```

**2.**
```
Follow .claude/commands/capture.md to capture ADD_YOUR_URL_HERE
```

That's it. Repeat prompt 2 alone with a new URL for every capture after the first — no `/design`, no
extra setup, nothing to run first. You'll get a verified, real capture that opens as a live editable
canvas right there in the conversation, every time.

## What this is

Two parts, one job: move a real UI into the same canvas editor Claude Design uses, without leaving your conversation, and get an edit back into source safely.

**1. The capture script** (`skills/1-ui-to-canvas-capture/ui-to-canvas-capture.mjs`)
A Node.js + Playwright script. Point it at any live URL and a CSS selector, and it walks the rendered DOM reading the browser's own resolved `getComputedStyle` for every element — the final answer the browser already computed, not source CSS rules and not a framework's internal state. It never looks at a stylesheet, which is what makes it framework-agnostic: React, vanilla JS, Vue, Angular, Web Components — whatever rendered the page, the computed styles look the same to this script.

Output is a self-contained `Main.dc.html` — a Design Component. Using Claude Code's `/capture` command, it opens right in your conversation as a live canvas: drag, resize, restyle by hand, or just ask Claude to make the change, same editor either way. [claude.ai/design](https://claude.ai/design) opens the identical editor standalone, if you'd rather start there without a conversation. Nothing is locked into a shared component for convenience — that choice happens later, at Return time.

**2. The Return ruleset** (`skills/2-canvas-to-ui/SKILL.md`)
No code — a judgment discipline for taking an edit made in the canvas and putting it back into real source, safely:

- The edited element is a one-off? Patch it directly.
- It's an instance of a shared component used elsewhere? Stop and ask: update everywhere, or split into a one-off? Never decide that silently.
- Its content is bound to live data — an API, a database? Never write the captured snapshot back as a literal value. That freezes one user's data for everyone. Style edits to a live-data element are still safe to patch.

## How it works, step by step

What actually happens between sending `/capture <url>` and a live canvas appearing in your conversation:

1. **Set up.** Check `node_modules/playwright` and Pillow are installed; install whichever is missing (a few seconds — the repo pins an exact Playwright version matched to this environment's pre-installed Chromium build, so this never triggers a real browser download).
2. **Capture.** Launch headless Chromium, navigate to the URL, wait for the page to actually settle (spinners cleared, animations frozen, lazy content scrolled into view, fonts loaded), then walk the live, rendered DOM — reading each element's real `getComputedStyle`, never source CSS — and bake it into one self-contained `Main.dc.html`. Images and font files referenced anywhere in the page get downloaded and relinked locally alongside it.
3. **Verify.** Render that output file and take a fresh screenshot of the real live page, side by side, at the same viewport width. Pixel-diff the two — not eyeballed — to find any region that's actually wrong versus ordinary font-rendering noise. Fix anything real and re-check, up to a few rounds, before ever showing you anything.
4. **Publish.** Create a canvas using Claude's own Design Artifact type (the same editor behind [claude.ai/design](https://claude.ai/design)), write the capture and its assets into it, and open it directly in the conversation.

No step here needs `/design`, a separate app, or any manual setup beyond step 1 — and step 1 only runs once per session.

## External tools this depends on

- **[Playwright](https://playwright.dev/)** — drives headless Chromium: navigation, waiting for the page to settle, and reading every element's real computed style.
- **Chromium** — the actual browser doing the rendering. In a Claude Code on the web session, a matching build is already pre-installed; nothing downloads on a fresh clone.
- **[Pillow](https://python-pillow.org/)** (Python) — downsamples and re-encodes every captured image, and detects real transparency to decide PNG vs. JPEG.
- **The Artifact tool's Design type** (Anthropic, claude.ai) — the actual canvas editor and its file format (`.dc.html`); this repo produces content for it, it doesn't reimplement it.
- **Node.js 18+** and **Python 3** — the two runtimes everything above runs on.

Nothing here is optional or swappable piece-by-piece — the pipeline is this specific stack end to end.

## Install

Requires Node.js 18+ and Python 3 with Pillow (the capture script shells out to Python for image resizing).

```
npm install playwright
pip install Pillow
```

On a locked-down network (corporate proxy, restricted egress), Playwright's browser-binary download can fail silently — `npm install` exits clean but the browser is missing. If the capture script errors on launch, run `npx playwright install chromium` and check its output directly. In a sandboxed environment with a pre-installed Chromium build that doesn't match the npm-installed Playwright version, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to that build's path. If outbound requests need to go through a proxy, `HTTPS_PROXY` is picked up automatically for both Node's own requests and the browser's.

## Usage

```
node skills/1-ui-to-canvas-capture/ui-to-canvas-capture.mjs <url> <selector> <outDir> [viewportWidth] [interaction-steps]
```

- `url` — the live page to capture
- `selector` — the CSS selector for the element (or root) you want
- `outDir` — where `Main.dc.html` gets written
- `viewportWidth` — optional, defaults to desktop
- `interaction-steps` — optional, for elements that need a click, scroll, or hover before they render (lazy panels, dropdowns, tooltips)

Fastest path: use the `/capture` Claude Code command below — it opens the result right in your conversation as a full live canvas, ready to drag, resize, restyle, or just ask for a change.

**Using Claude Code?** Clone this repo, open a session in it, and run `/capture <url>` — it drives the script, verifies the result against the live page, and opens the live canvas right there in the conversation. See `.claude/commands/capture.md`.

## Why this exists

Getting a real, already-deployed page in front of Claude, into the same canvas you'd get on claude.ai/design, without leaving the conversation — and getting an edit back out without silently breaking something else — is what this closes.

## License

[Business Source License 1.1](LICENSE) — free to use, copy, modify, and self-host for any purpose, personal or commercial. The one thing you can't do is offer this (as-is or modified) as a hosted/managed service to others for a fee. Converts to Apache 2.0 four years after each release.
