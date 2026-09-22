# Canvas Capture

Capture any live webpage into a file Claude Design can open and edit freely. Then put the edit back into your codebase without breaking a shared component or freezing live data.

## What this actually is

Two parts, one job: move a real UI in and out of [claude.ai/design](https://claude.ai/design) safely.

**1. The capture script** (`skills/1-ui-to-canvas-capture/ui-to-canvas-capture.mjs`)
A Node.js + Playwright script. Point it at any live URL and a CSS selector, and it walks the rendered DOM reading the browser's own resolved `getComputedStyle` for every element - not source CSS rules, not a framework's internal state, just the final answer the browser already computed. It never looks at a stylesheet. That's what makes it framework-agnostic: React, vanilla JS, Vue, Angular, Web Components, whatever rendered the page, the computed styles look the same to this script.

Output is a self-contained `Main.dc.html` - a Design Component that opens in Claude Design's canvas editor, fully free to edit: drag, resize, restyle, anything. Nothing is locked into a shared component for convenience. That choice happens later, at Return time, not here.

**2. The Return ruleset** (`skills/2-canvas-to-ui/SKILL.md`)
No code. A small set of judgment calls for taking an edit made in the canvas and putting it back into real source:

- The edited element is a one-off? Patch it directly.
- It's an instance of a shared component used elsewhere? Stop and ask: update everywhere, or split into a one-off? Never decide that silently.
- Its content is bound to live data - an API, a database? Never write the captured snapshot back as a literal value. That freezes one user's data for everyone. Style edits to a live-data element are still safe to patch.

This is the part that doesn't exist anywhere else. Capture tools are common. A ruleset that knows the difference between "this button" and "every button like it," and between a style and a fact, is not.

## Install

```
npm install playwright
```

## Usage

```
node skills/1-ui-to-canvas-capture/ui-to-canvas-capture.mjs <url> <selector> <outDir> [viewportWidth] [interaction-steps]
```

- `url` - the live page to capture
- `selector` - the CSS selector for the element (or root) you want
- `outDir` - where `Main.dc.html` gets written
- `viewportWidth` - optional, defaults to desktop
- `interaction-steps` - optional, for elements that need a click, scroll, or hover before they render (lazy panels, dropdowns, tooltips)

Open the resulting `Main.dc.html` in Claude Design to edit it. Publishing into the live canvas from here is still a manual step - see Limitations.

**Using Claude Code?** Clone this repo, open a session in it, and run `/capture <url>` - it drives the script, verifies the result against the live page, and publishes a preview link automatically. See `.claude/commands/capture.md`.

## How this compares

Two real alternatives already exist. Worth naming plainly instead of pretending this is the only option.

- **Claude Design's own "Web Capture"** - paste a URL into the composer. Built in, zero setup.
- **WebGrabber for Claude Design** - a Chrome extension, click an element and it captures computed styles into the composer.

Both are capture-only, one element or one page at a time, one direction. Neither gets you back to source code - once you edit in the canvas, you're on your own for the return trip.

The capture script here draws on the same basic idea both of those already ship: read computed styles, not source CSS. What's actually new is the Return ruleset - the ask-first shared-component check and the never-freeze-live-data rule - built specifically for getting an edit back into a real codebase.

The capture script itself has also been hardened against real bugs, not just the happy path. Testing against Grafana, CoinMarketCap, Yahoo/Google Finance, Plausible, Angular Material, Vue/Vuetify, Web Components with shadow DOM, and Chart.js pages with code editors turned up 24+ documented issues: quoted `font-family` values silently truncating the rest of a style attribute, SVG `<use>` sprite references breaking once isolated from their source page, shadow-DOM content invisible to a naive DOM walk, single-line text wrapping differently in a slightly narrower host, lazy-loaded panels needing a real scroll-trigger instead of a fixed wait. Every one of those is fixed in the current script.

Nobody's run a direct pixel-comparison between this and native Web Capture or WebGrabber. That'd be a good test - open to it, haven't done it.

## Known limitations

- **No programmatic publish.** Getting `Main.dc.html` into the live claude.ai/design canvas is a manual step - open Claude Design and seed or upload the file, or hand it to Claude to publish.
- **No automatic data-provenance tagging.** The script can't yet tell a hardcoded value apart from one bound to live data. That call is manual, made at Return time, per the ruleset above.
- **Untested territory:** auth-gated pages, WebGL, and video content are a different risk class and haven't been run through this yet.

## Why this exists

Claude Design's canvas is genuinely good for editing a UI by hand. Getting a real, already-deployed page into it, and getting an edit back out without silently breaking something else, wasn't solved anywhere I could find. This is that missing middle, built to be used, not to be the first of its kind.
