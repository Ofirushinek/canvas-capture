# Canvas Capture

Capture any live webpage into a file Claude Design can open and edit freely. Then put the edit back into your codebase without breaking a shared component or freezing live data.

## What this is

Two parts, one job: move a real UI in and out of [claude.ai/design](https://claude.ai/design) safely.

**1. The capture script** (`skills/1-ui-to-canvas-capture/ui-to-canvas-capture.mjs`)
A Node.js + Playwright script. Point it at any live URL and a CSS selector, and it walks the rendered DOM reading the browser's own resolved `getComputedStyle` for every element — the final answer the browser already computed, not source CSS rules and not a framework's internal state. It never looks at a stylesheet, which is what makes it framework-agnostic: React, vanilla JS, Vue, Angular, Web Components — whatever rendered the page, the computed styles look the same to this script.

Output is a self-contained `Main.dc.html` — a Design Component that opens in Claude Design's canvas editor, fully free to edit: drag, resize, restyle, anything. Nothing is locked into a shared component for convenience. That choice happens later, at Return time, not here.

**2. The Return ruleset** (`skills/2-canvas-to-ui/SKILL.md`)
No code — a judgment discipline for taking an edit made in the canvas and putting it back into real source, safely:

- The edited element is a one-off? Patch it directly.
- It's an instance of a shared component used elsewhere? Stop and ask: update everywhere, or split into a one-off? Never decide that silently.
- Its content is bound to live data — an API, a database? Never write the captured snapshot back as a literal value. That freezes one user's data for everyone. Style edits to a live-data element are still safe to patch.

## Install

```
npm install playwright
```

## Usage

```
node skills/1-ui-to-canvas-capture/ui-to-canvas-capture.mjs <url> <selector> <outDir> [viewportWidth] [interaction-steps]
```

- `url` — the live page to capture
- `selector` — the CSS selector for the element (or root) you want
- `outDir` — where `Main.dc.html` gets written
- `viewportWidth` — optional, defaults to desktop
- `interaction-steps` — optional, for elements that need a click, scroll, or hover before they render (lazy panels, dropdowns, tooltips)

Open the resulting `Main.dc.html` in Claude Design to edit it.

**Using Claude Code?** Clone this repo, open a session in it, and run `/capture <url>` — it drives the script, verifies the result against the live page, and publishes a preview link automatically. See `.claude/commands/capture.md`.

## Why this exists

Claude Design's canvas is genuinely good for editing a UI by hand. Getting a real, already-deployed page into it — and getting an edit back out without silently breaking something else — is what this closes.
