// ui-to-canvas-capture.mjs — turns any real, already-built webpage into a
// self-contained "Main.dc.html" file: an editable Design Component that
// Claude Design's canvas editor (claude.ai/design, or the equivalent
// preview inside Claude Code) can open and let you drag/restyle freely.
//
// Requires Node.js and Playwright (`npm install playwright`) — no other
// setup. Works regardless of what built the page (React, plain JS, a
// framework, a static site) because it never reads that source at all; it
// only reads what a real browser renders.
//
// Core idea: don't copy CSS source rules by selector (a `.hero`, a `.btn`)
// — that misses anything that doesn't happen to share a class with your
// target, most dangerously a global reset. Instead, ask the BROWSER ITSELF
// for each element's fully resolved computed style, after every cascade,
// token and reset has already been applied, and bake that directly onto
// the element as an inline `style="..."` attribute. This can never miss a
// rule "that doesn't share a classname," because it never looks at
// stylesheet rules at all — only the browser's own final answer.
//
// Output: one flat HTML file with zero external CSS dependency. Open it in
// Claude Design's canvas (or hand it to Claude to publish there) to edit
// every element freely. There is no separate "return to code" tool here —
// mapping an edit back into your real source is a manual, judgment-driven
// step, not something this script does.
//
// Usage: node ui-to-canvas-capture.mjs <url> <selector> <outDir> [viewportWidth] ["click:sel|hover:sel|wait:ms|group:sel1,sel2|..."]

import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [, , url, selector, outDir, vw, stepsArg] = process.argv;
if (!url || !selector || !outDir) {
  console.error('usage: node ui-to-canvas-capture.mjs <url> <selector> <outDir> [viewportWidth] ["click:sel|hover:sel|wait:ms|group:sel1,sel2|..."]');
  process.exit(1);
}
// Steps run in order before capture: click:<selector>, hover:<selector>,
// wait:<ms>. Needed for any state that takes more than one interaction to
// reach (sign in, then switch tab, then hover a specific bar to freeze its
// tooltip) — a single clickSelector couldn't express that sequence.
const STEPS = (stepsArg || '').split('|').filter(Boolean).map((s) => {
  const idx = s.indexOf(':');
  return { kind: s.slice(0, idx), arg: s.slice(idx + 1) };
});
const viewportWidth = parseInt(vw || '390', 10); // real default: iPhone-class width, not a guess

fs.mkdirSync(outDir, { recursive: true });

// Visually-relevant computed properties. Deliberately NOT "every CSS
// property" (there are ~300, most irrelevant to look) — this is the same
// curated-allowlist approach real "inline the page" tools use.
const PROPS = [
  'display', 'position', 'top', 'right', 'bottom', 'left', 'zIndex',
  'boxSizing', 'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
  'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
  'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius',
  'backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat',
  'boxShadow', 'opacity', 'visibility', 'overflow', 'objectFit', 'objectPosition',
  'color', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight',
  'letterSpacing', 'textAlign', 'textDecoration', 'textTransform', 'whiteSpace', 'textWrap', 'verticalAlign',
  'display', 'flexDirection', 'flexWrap', 'justifyContent', 'alignItems', 'alignSelf',
  'flexGrow', 'flexShrink', 'flexBasis', 'gap', 'rowGap', 'columnGap',
  'gridTemplateColumns', 'gridTemplateRows', 'gridColumn', 'gridRow',
  'cursor', 'transform', 'direction', 'listStyleType',
  'fontFeatureSettings', 'fontVariationSettings', 'webkitTextFillColor',
];

// Tags whose captured height gets dropped when they're wrapping text (see
// the styleAttr() comment below) — declared once, up top, since both the
// in-browser capture pass and the Node-side renderer need the same set.
const TEXT_FLOW_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'li', 'label']);

const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] });
const page = await browser.newPage({ viewport: { width: viewportWidth, height: 1000 }, ignoreHTTPSErrors: true });

// Route around the known "Supabase CDN blocked -> whole page blank" bug
// (already logged, not this tool's job to fix) so capture can proceed.
await page.addInitScript(() => {
  window.supabase = window.supabase || { createClient: () => ({
    auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }) },
    from: () => ({ select: async () => ({ data: [], error: null }) }),
  }) };
});

// 'networkidle' never fires on pages with continuous background traffic
// (ad networks, analytics beacons, live-price polling, a live analytics
// dashboard's own polling — real examples on real sites) even though the
// actual content finished rendering long ago. The first version of this
// fallback re-navigated with `page.goto(url, {waitUntil:'load'})` on a
// networkidle timeout — but `goto` always performs a fresh navigation even
// to the same URL, so that "fallback" was actually a full page RELOAD,
// discarding whatever the page had already rendered and restarting every
// async widget's own fetch-then-draw cycle from zero. Confirmed on a real
// analytics dashboard (multiple lazy-loaded chart panels, each fetching its
// own data): the live page fully renders within ~1-2s of its OWN single
// load, but our capture — after burning the full 20s networkidle timeout,
// then reloading, then only waiting a fixed 800ms more — captured several
// panels still showing their loading spinner, because the reload's fresh
// render cycle never got far enough in that leftover 800ms.
// Fix: never re-navigate. Advance through domcontentloaded -> load ->
// networkidle as three checkpoints of the SAME single navigation, each
// with its own timeout; a networkidle timeout just means proceeding
// without it, never restarting anything already rendered.
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
try {
  await page.waitForLoadState('load', { timeout: 15000 });
} catch (e) {
  console.error('load state timed out, continuing anyway:', e.message);
}
try {
  await page.waitForLoadState('networkidle', { timeout: 20000 });
} catch (e) {
  console.error('networkidle timed out, continuing anyway:', e.message);
}
await page.waitForTimeout(800);

// A widget that never starts loading until it's scrolled into view
// (IntersectionObserver-based lazy loading — common for anything
// below-the-fold and expensive to render: a map, a data table, a chart)
// will show its loading spinner FOREVER at a fixed scroll position, no
// matter how long anything waits — the fetch that would resolve it was
// never even triggered. Confirmed on a real analytics dashboard: three
// separate panels stayed on their spinner through 30+ seconds of waiting
// at scroll position 0, then all three resolved with real data within
// a few seconds of the page actually being scrolled past them once.
// Fix: scroll all the way down the page (in steps, so anything gated on
// "has entered the viewport" actually sees that happen) and back to the
// top before measuring anything — mimicking the one thing a real visitor
// does that a stationary headless tab never did on its own.
await page.evaluate(async () => {
  const step = 400;
  const max = document.body.scrollHeight;
  for (let y = 0; y < max; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 250));
  }
  window.scrollTo(0, 0);
});
await page.waitForTimeout(500);

// 'networkidle' answers "has network traffic gone quiet," not "has every
// panel actually finished loading" — a page whose widgets fetch their own
// data in a STAGGERED sequence (finish one, briefly go idle, start the
// next) can legitimately go network-idle for 500ms between two panels
// that are each still mid-fetch, resolving 'networkidle' long before the
// last one is done. The scroll-through above covers panels gated on
// visibility; this covers ones that were already visible but simply
// slower to fetch. A loading spinner is near-universally an
// infinitely-looping CSS animation, so instead of guessing a fixed
// duration, poll for any such animation still running anywhere on the
// page and wait for it to clear, up to a bounded ceiling — long enough
// for a real staggered dashboard, bounded so a page with one
// deliberately-persistent spinner (a genuinely broken widget, a "live"
// indicator that's meant to never stop) can't hang the capture forever.
try {
  await page.waitForFunction(() => {
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (cs.animationIterationCount === 'infinite' && cs.animationPlayState !== 'paused') {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return false;
      }
    }
    return true;
  }, undefined, { timeout: 15000 });
} catch (e) {
  console.error('spinners never cleared within budget, continuing anyway:', e.message);
}

// Grab font <link>s and any @font-face rules, from the SAME page/context
// the capture is about to run in. Icon-ligature fonts (Google's "Material
// Icons" / "Google Symbols": the icon is literal text like "settings" or
// "keyboard_arrow_down", substituted for a glyph only once that specific
// font is loaded) commonly ship as an inline @font-face rather than a
// fonts.googleapis.com <link> — without it, font-family is captured
// correctly but the font itself never arrives, and the literal icon-name
// text shows verbatim instead of an icon.
//
// A flat `for (const rule of sheet.cssRules)` loop misses this: real Google
// Fonts CSS wraps each @font-face in an `@media` unicode-range subset block
// (one per language range) to avoid downloading glyphs a given locale never
// needs, so the @font-face rules only exist NESTED one level inside those
// @media rules — never at the stylesheet's own top level. Confirmed on a
// real site (Google Finance) where every icon font's @font-face existed
// exclusively this way: a flat scan found the stylesheet (3000+ top-level
// rules) but zero font-faces in it, while a recursive scan of that same
// stylesheet found dozens, correctly nested one @media layer down. The walk
// below descends into any rule that itself holds more rules (@media,
// @supports, @layer, @container, ...) instead of assuming @font-face only
// ever appears at the top.
const fontLinksRaw = await page.evaluate(() => {
  const links = [...document.querySelectorAll('link[href*="fonts.googleapis.com"]')].map((l) => l.outerHTML);
  const fontFaceRules = [];
  function walk(rules) {
    for (const rule of rules) {
      if (rule.constructor.name === 'CSSFontFaceRule') fontFaceRules.push(rule.cssText);
      else if (rule.cssRules) walk(rule.cssRules);
    }
  }
  for (const sheet of document.styleSheets) {
    try { walk(sheet.cssRules); } catch (e) { /* cross-origin sheet — can't read its rules, skip it */ }
  }
  return { links, fontFaceRules };
});
const fontLinks = fontLinksRaw.links.join('\n  ') + '\n  ' +
  (fontLinksRaw.fontFaceRules.length ? `<style>\n${fontLinksRaw.fontFaceRules.join('\n')}\n</style>` : '');

// The requested "just this" region is often several loose sibling elements
// in the real DOM (a heading block + a separately-bordered table, with no
// shared wrapper) rather than one element with a single selector. `group`
// moves those real elements (not clones — their own computed layout must
// travel with them) into one new wrapper div, in the order given, and that
// wrapper becomes the capture root. Their own inline spacing (e.g. a
// `margin-top` already on one of them) still applies once they're siblings
// inside the wrapper, so relative spacing is preserved without extra rules.
let rootSelector = selector;
let groupMeta = null; // set only by a `group` step — see below for why capture must NOT move DOM nodes
for (const step of STEPS) {
  if (step.kind === 'click') { await page.click(step.arg); await page.waitForTimeout(400); }
  else if (step.kind === 'hover') { await page.hover(step.arg); await page.waitForTimeout(200); }
  else if (step.kind === 'wait') { await page.waitForTimeout(parseInt(step.arg, 10)); }
  else if (step.kind === 'group') {
    const sels = step.arg.split(',');
    // NEVER move the real elements to build the group (an earlier version
    // did, via appendChild into a synthetic wrapper). Real, reproducible
    // bug found capturing 4 real dashboard panels: one used a CSS
    // container query to pick `flex-direction: column` vs `row` based on
    // ITS OWN rendered width/context. Re-parenting it into a new wrapper
    // changed that context, and its computed style silently flipped to a
    // different layout than the one actually on the page — confirmed by
    // reading the real page's computed style directly (`column`) against
    // the moved copy's (`row`). getComputedStyle is only ground truth for
    // an element that never left its real position. So: elements are
    // stamped in place with an id attribute (metadata only, changes
    // nothing visually or structurally) and their real positions are
    // recorded here; the actual grouping happens later, in the main
    // per-element style walk, by serializing each element AT ITS REAL
    // DOM POSITION and only THEN placing the resulting (already-correct)
    // node into a synthetic wrapper in the output tree — never in the
    // live page.
    groupMeta = await page.evaluate((sels) => {
      const els = sels.map((s) => {
        const el = document.querySelector(s);
        if (!el) throw new Error(`group: selector "${s}" not found`);
        return el;
      });
      const rects = els.map((el) => el.getBoundingClientRect());
      const unionLeft = Math.min(...rects.map((r) => r.left));
      const unionTop = Math.min(...rects.map((r) => r.top));
      const unionRight = Math.max(...rects.map((r) => r.right));
      const unionBottom = Math.max(...rects.map((r) => r.bottom));
      const items = els.map((el, i) => {
        const id = `__capture_group_item_${i}__`;
        el.setAttribute('data-capture-group-id', id);
        return { id, left: rects[i].left - unionLeft, top: rects[i].top - unionTop };
      });
      return { unionW: unionRight - unionLeft, unionH: unionBottom - unionTop, items };
    }, sels);
  }
  else { console.error(`unknown step kind "${step.kind}" in "${step.kind}:${step.arg}"`); process.exit(1); }
}

// A webfont (Heebo/Inter here) can still be swapping in when steps finish —
// networkidle only proves the font FILE arrived, not that the font FACE has
// applied and reflowed text. Measuring the root's height before that swap
// bakes a too-short height (fallback-font line metrics) into this hardcoded
// `height:__px;overflow:hidden` wrapper, while the deeper per-element walk
// below runs a moment later and reads the taller, post-swap row heights —
// so real content quietly clips against the too-small shell. Waiting for
// fonts.ready first makes both measurements agree.
await page.evaluate(() => document.fonts.ready);

// A page whose global stylesheet applies a broad `transition: all` (a
// common reset, or just a component library's default) can genuinely
// render the SAME url, SAME viewport, in two different real layout states
// depending on split-second timing: a hydration-driven late class change
// on some element gets ANIMATED by that catch-all transition, and reading
// computed style in the middle of it returns a real-but-transient value —
// not corrupted, just not the page's actual resting state. Confirmed on a
// real site: the exact same centered nav bar read back computed
// `margin-left: 0px` on some loads and the correct `140px` on others, with
// getAnimations() showing nothing actively running either time — the
// window this can be caught in is narrow, not an infinite loop, but real.
// A single measurement can't tell "the resting state" from "mid-flux";
// two measurements a beat apart can — if the page's overall layout
// fingerprint hasn't changed between them, it's settled.
//
// Checking getBoundingClientRect() alone is NOT enough: on the real site
// this was found on, the affected element's PAINTED position was already
// correct (140px from the edge) in every sample, while getComputedStyle's
// reported marginLeft for that exact element flip-flopped between "0px"
// and "140px" across separate loads — a desync between what the style
// engine reports and what the compositor already painted, not a visual
// shift. A bounding-box fingerprint can never see that, because the
// pixels never moved. The fingerprint has to include the actual computed
// VALUES this tool bakes (PROPS), not just rendered geometry.
async function layoutFingerprint() {
  return page.evaluate((props) => {
    const parts = [];
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const cs = getComputedStyle(el);
      let sig = Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.width) + ',' + Math.round(r.height);
      for (const p of props) sig += ',' + cs[p];
      parts.push(sig);
    }
    return parts.join('|');
  }, PROPS);
}
let prevFingerprint = await layoutFingerprint();
for (let i = 0; i < 4; i++) {
  await page.waitForTimeout(400);
  const nextFingerprint = await layoutFingerprint();
  if (nextFingerprint === prevFingerprint) break;
  prevFingerprint = nextFingerprint;
  if (i === 3) console.error('layout never fully stabilized after 4 checks — capturing anyway, may reflect a transient state');
}

let rootBox;
if (groupMeta) {
  // The union rect was already measured, live, before anything else ran —
  // that IS the real root box; no single live element to re-measure.
  rootBox = { width: groupMeta.unionW, height: groupMeta.unionH };
} else {
  const rootHandle = await page.$(rootSelector);
  if (!rootHandle) {
    console.error(`selector "${rootSelector}" not found on ${url}`);
    process.exit(1);
  }
  rootBox = await rootHandle.boundingBox();
  // A selector that resolves to a semantic content tag (`main`, a
  // dashboard's own inner wrapper) commonly has a real `<header>`/`<nav>`
  // as a SIBLING, not an ancestor — visually part of "the page" to anyone
  // looking at it, but outside whatever got selected. Found twice now on
  // two unrelated real sites (a finance dashboard, an analytics dashboard):
  // both times the capture was otherwise correct and fully verified, and
  // both times the outer site header was simply never in the selected
  // subtree at all, silently missing from the result until a human caught
  // it by eye. A root element that starts well below the top of the page
  // is the exact, checkable signature of that gap — flag it loudly instead
  // of letting it repeat a third time.
  if (rootBox && rootBox.y > 20) {
    console.error(
      `WARNING: captured root "${rootSelector}" starts at y=${Math.round(rootBox.y)}px, not near the top of the page. ` +
      `There is ${Math.round(rootBox.y)}px of real content ABOVE it that this capture does NOT include — ` +
      `if that's a header/nav a viewer would expect to see as part of "the page," add it to a group: step instead of capturing this selector alone.`
    );
  }
}

// Walk the subtree in-browser: for each element, dump tag, attrs, computed
// style (only props that differ from a bare <div>'s defaults, to keep output
// readable), and recurse. Images noted for extraction, not inlined here.
const tree = await page.evaluate(({ rootSel, PROPS, textFlowTags, groupMeta }) => {
  const IMG_URL_RE = /url\((['"]?)(.*?)\1\)/;
  const TEXT_FLOW_TAGS_BROWSER = new Set(textFlowTags);

  function computedOf(el) {
    const cs = getComputedStyle(el);
    const out = {};
    for (const p of PROPS) out[p] = cs[p];
    // A lone child centered via `margin: 0 auto` (a common "container" utility
    // pattern) can have getComputedStyle report a STALE margin that disagrees
    // with where the element is actually painted — confirmed on a real site:
    // the identical element, identical class, identical real position
    // (getBoundingClientRect never moved) read back computed marginLeft as
    // "0px" on some page loads and the correct "140px" on others, with zero
    // CSS animation active either time. Baking the stale value renders the
    // element flush against the edge instead of centered.
    // Fix, scoped narrowly: only for an ONLY child (no siblings to
    // mis-position by doing this) — instead of trusting the possibly-stale
    // computed margin, derive it from the real geometry (this element's edge
    // vs its parent's content-box edge), which can't desync from the paint
    // because it reads the paint directly. Left unscoped, this same
    // arithmetic would wrongly blame a middle item in a multi-sibling flex/
    // grid row (spaced via `justify-content`/`gap`, not margin) for the
    // whole gap since its last sibling — restricting it to only-children
    // avoids that entirely.
    // `previousElementSibling`/`nextElementSibling` only see ELEMENT
    // siblings — a real bug, found immediately after adding this fix: an
    // icon <i> sitting right after a link's own text node (`<a>text<i>
    // icon</i></a>`) has no sibling ELEMENT on either side, so it looked
    // like a lone-child "container" case too. It isn't one — the text
    // before it is real content this same arithmetic doesn't know about,
    // so "distance to the parent's edge" measured the icon's distance past
    // an entire text run, not its real ~4px gap after that text, and baked
    // a wildly oversized margin that visually flung small trailing icons
    // away from the text they belong next to. Check for any REAL sibling
    // content (text nodes included, insignificant whitespace-only text
    // excluded so pretty-printed markup still counts a genuinely lone
    // element as lone), not just element siblings.
    const realSiblings = el.parentElement
      ? [...el.parentElement.childNodes].filter((n) => !(n.nodeType === Node.TEXT_NODE && !n.textContent.trim()))
      : [];
    const soleContent = realSiblings.length === 1 && realSiblings[0] === el;
    if (soleContent && el.parentElement) {
      const parent = el.parentElement;
      const pRect = parent.getBoundingClientRect();
      const pCs = getComputedStyle(parent);
      const pContentLeft = pRect.left + parseFloat(pCs.borderLeftWidth) + parseFloat(pCs.paddingLeft);
      const pContentRight = pRect.right - parseFloat(pCs.borderRightWidth) - parseFloat(pCs.paddingRight);
      const cRect = el.getBoundingClientRect();
      const geomMarginLeft = cRect.left - pContentLeft;
      const geomMarginRight = pContentRight - cRect.right;
      if (Math.abs(geomMarginLeft - parseFloat(cs.marginLeft)) > 1) out.marginLeft = Math.max(0, Math.round(geomMarginLeft)) + 'px';
      if (Math.abs(geomMarginRight - parseFloat(cs.marginRight)) > 1) out.marginRight = Math.max(0, Math.round(geomMarginRight)) + 'px';
    }
    return out;
  }

  // A Web Component's real visual structure (its border, padding, layout —
  // everything that makes it look like anything at all) lives inside its
  // shadow root, not its light-DOM children. Walking `el.childNodes`
  // directly only sees whatever content the PAGE AUTHOR passed in (an
  // image, some text) — none of the wrapper markup the component itself
  // renders around it. Confirmed on a real component library: a card with
  // a real border, padding and footer separator captured as bare unstyled
  // text and an image with zero chrome, because none of that ever lived in
  // the light DOM this walk was reading. A `<slot>` inside the shadow root
  // is where the light-DOM content actually ends up placed (the browser's
  // own "flattened tree") — substituting its assigned nodes there
  // reproduces that placement; falling back to the slot's own children
  // covers a slot nothing was assigned to (its default content).
  function appendChildren(node, container) {
    for (const child of container.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE && child.tagName === 'SLOT') {
        const assigned = child.assignedNodes({ flatten: true });
        const sourceNodes = assigned.length ? assigned : [...child.childNodes];
        for (const n of sourceNodes) {
          const s = serialize(n);
          if (s) node.children.push(s);
        }
        continue;
      }
      const s = serialize(child);
      if (s) node.children.push(s);
    }
  }

  function serialize(el) {
    if (el.nodeType === Node.TEXT_NODE) {
      const t = el.textContent;
      if (!t) return null;
      // A whitespace-only text node (e.g. the literal " " between
      // `<span>+60.75</span> <span>+0.80%</span>`) still renders as a real
      // separating space when it sits between inline content — dropping it
      // via a bare `.trim()` check (real bug: a price and its percent
      // change came out jammed together with no space) silently ate that
      // space. Collapse it to one space instead of discarding it outright;
      // harmless when it's actually insignificant block-boundary
      // whitespace, since that just adds an invisible extra space there.
      //
      // EXCEPT inside a `white-space: pre`/`pre-wrap`/`pre-line` context —
      // a syntax-highlighted code block (one <span> per token) has a
      // whitespace-only text node between nearly every pair of tokens,
      // each one a REAL newline + indentation, not incidental spacing.
      // Collapsing every one of those to a single space is what "harmless
      // extra space" turns into here: an entire multi-line, indented code
      // sample rendering as one continuous line. Confirmed on a real
      // syntax-highlighted editor component. Preserve the node's real text
      // verbatim in that context instead of collapsing it.
      if (!t.trim() && /\s/.test(t)) {
        const parentWs = el.parentElement ? getComputedStyle(el.parentElement).whiteSpace : 'normal';
        if (parentWs === 'pre' || parentWs === 'pre-wrap' || parentWs === 'pre-line' || parentWs === 'break-spaces') {
          return { type: 'text', text: t };
        }
      }
      return t.trim() ? { type: 'text', text: t } : (/\s/.test(t) ? { type: 'text', text: ' ' } : null);
    }
    if (el.nodeType !== Node.ELEMENT_NODE) return null;
    const cs = getComputedStyle(el);
    // NOSCRIPT: invisible in a real browser with JS on, but the canvas
    // editor's frame-safety scanner refuses to preview ANY artboard that
    // contains one at all (can't verify what it hides with scripting on) —
    // so a full-page ("body") capture of any SPA must drop it, not just
    // elements that are actually display:none.
    if (cs.display === 'none' || el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'NOSCRIPT') return null;

    // SVG icons: their visual content lives in attributes (d, viewBox, fill,
    // stroke-width...) that plain getComputedStyle().style flattening never
    // captures, so decomposing an <svg> into styled children renders empty
    // boxes. Keep the whole subtree as one raw HTML blob instead — icons are
    // small and self-contained, and their own inline sizing/color already
    // travels via currentColor + the wrapper's captured layout style.
    //
    // Exception: a chart-style SVG's fill/stroke can be set by anything the
    // stylesheet does — a literal `var(--token)` reference, or a :hover/
    // :focus-visible rule (e.g. a transparent hit-target that darkens on
    // hover) — never assume the raw attribute is the final answer. The
    // captured page never ships that stylesheet, so a literal var() or a
    // pseudo-class rule both resolve to nothing once replayed. Fix: always
    // read the LIVE computed fill/stroke (getComputedStyle reflects the
    // truth right now, hover state included) and bake that into a clone
    // before taking its outerHTML — never mutate the live page itself, and
    // never trust the static attribute over what's actually rendering.
    if (el.tagName === 'svg') {
      // NON_PAINTABLE: structural/definition tags with no visual fill or
      // stroke of their own — baking a stray fill/stroke onto one of these
      // is harmless to rendering but pointless attribute noise.
      const NON_PAINTABLE = new Set(['defs', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'pattern', 'symbol', 'title', 'desc', 'style']);
      const live = [el, ...el.querySelectorAll('*')];
      const resolved = live.map((node) => {
        // Real bug, found on a chart library that colors its line/area
        // purely through Tailwind classes (`stroke-indigo-500 fill-none`),
        // never a literal `fill`/`stroke` attribute: gating this on
        // `hasAttribute('fill'/'stroke')` skipped baking entirely for such
        // a node, so its class-driven color — real only as long as the
        // site's own stylesheet is attached — vanished once isolated, and
        // the SVG default fill (opaque black) painted a solid black shape
        // over what should have been an unfilled, colored stroke line.
        // Baking the LIVE computed value regardless of how it got set is
        // the only way that's true for every source (attribute, class,
        // inherited, :hover) at once — computed style doesn't care which.
        if (NON_PAINTABLE.has(node.tagName.toLowerCase())) return { fill: null, stroke: null, strokeDasharray: null };
        const ncs = getComputedStyle(node);
        return {
          fill: ncs.fill,
          stroke: ncs.stroke,
          // A chart SVG's own inline <style> block (e.g. a stroke-dasharray
          // rule, sometimes gated behind a @container query) works fine
          // rendered standalone, but a viewer that sanitizes embedded HTML
          // before display can legitimately strip <style> tags — including
          // ones nested inside an SVG — as an XSS precaution, silently
          // undoing whatever that rule did. Bake the resolved dash pattern
          // straight onto the element as an attribute so the line/area
          // chart looks right with or without that stylesheet surviving.
          strokeDasharray: ncs.strokeDasharray,
        };
      });
      const clone = el.cloneNode(true);
      const cloned = [clone, ...clone.querySelectorAll('*')];
      cloned.forEach((node, i) => {
        if (resolved[i].fill) node.setAttribute('fill', resolved[i].fill);
        if (resolved[i].stroke) node.setAttribute('stroke', resolved[i].stroke);
        if (resolved[i].strokeDasharray) node.setAttribute('stroke-dasharray', resolved[i].strokeDasharray);
      });
      // Every value this SVG needs is now baked directly onto its elements
      // as attributes (fill/stroke/stroke-dasharray above; d/viewBox/etc.
      // were already real attributes) — an inline <style> block only ever
      // set presentation details that are now redundant, and removing it
      // means nothing breaks if a viewer's sanitizer strips <style> tags
      // (including ones nested inside SVGs) before display.
      clone.querySelectorAll('style').forEach((s) => s.remove());
      // A chart SVG sized only via CSS (style="width:100%;height:100%"),
      // with no width/height ATTRIBUTE and only a viewBox, relies on the
      // embedding page's own box model to resolve that percentage — a
      // viewer with a different CSS reset or box-sizing default for SVG
      // can resolve it against the wrong box and render the chart
      // stretched, clipped, or collapsed. Pin real width/height attributes
      // (using the just-measured layout size) alongside the CSS, so sizing
      // no longer depends on how any particular viewer computes percentages
      // for an un-attributed SVG.
      if (!clone.hasAttribute('width') && !clone.hasAttribute('height')) {
        const liveRect = el.getBoundingClientRect();
        if (liveRect.width > 0 && liveRect.height > 0) {
          clone.setAttribute('width', String(Math.round(liveRect.width)));
          clone.setAttribute('height', String(Math.round(liveRect.height)));
        }
      }
      // A sprite-sheet icon (`<use href="#chevron-down-icon">`) points at a
      // <symbol> defined once, elsewhere in the real page's DOM (often a
      // hidden sprite injected near <body>) — never inside this SVG's own
      // subtree. Copied as raw outerHTML in isolation, that id doesn't
      // exist anywhere in the output file, so the <use> resolves to
      // nothing and the icon silently vanishes. Fix: resolve every <use>
      // against the LIVE document right now and inline a clone of whatever
      // it points to as a local <defs>, so the reference still works once
      // this SVG is the only thing left in the file.
      const uses = clone.querySelectorAll('use');
      if (uses.length) {
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        uses.forEach((use) => {
          const href = use.getAttribute('href') || use.getAttribute('xlink:href') || '';
          const id = href.startsWith('#') ? href.slice(1) : null;
          if (!id) return;
          const target = document.getElementById(id);
          if (target) defs.appendChild(target.cloneNode(true));
        });
        if (defs.children.length) clone.insertBefore(defs, clone.firstChild);
      }
      return { type: 'raw', html: clone.outerHTML, style: computedOf(el) };
    }

    // <canvas> (charts drawn via the Canvas/WebGL API) and <iframe> (a
    // YouTube embed, any cross-origin widget) both have NOTHING for
    // getComputedStyle or DOM-walking to find — one paints pixels with no
    // markup, the other's content lives in a different, inaccessible
    // document entirely. Rather than emit an empty/blank box (found live:
    // a real YouTube embed on a real dashboard rendered as a solid black
    // rectangle), flag it here (a live DOM mutation: a stamped id) so the
    // Node side can screenshot the actual element with Playwright right
    // before closing the browser, and swap in that screenshot as a plain
    // image. The visual result survives; only fine-grained editing of
    // what's INSIDE it doesn't — the same trade this tool already makes
    // for SVG icons, extended to the other cases where decomposition is
    // impossible in principle, not just impractical.
    if (el.tagName === 'CANVAS' || el.tagName === 'IFRAME') {
      const id = `__capture_shot_${window.__captureShotCounter = (window.__captureShotCounter || 0) + 1}__`;
      el.setAttribute('data-capture-shot-id', id);
      return { type: 'screenshot-placeholder', shotId: id, style: computedOf(el) };
    }

    const node = {
      type: 'el',
      tag: el.tagName.toLowerCase(),
      style: computedOf(el),
      children: [],
    };
    if (el.tagName === 'IMG') {
      node.src = el.currentSrc || el.src;
      node.alt = el.getAttribute('alt') || '';
      node.naturalW = el.naturalWidth;
      node.naturalH = el.naturalHeight;
    }
    if (el.tagName === 'A') node.href = el.getAttribute('href') || '#';
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      node.placeholder = el.getAttribute('placeholder') || '';
      node.inputType = el.getAttribute('type') || 'text';
    }
    // Text that is CURRENTLY one line (not actually using its width to wrap)
    // gets its width captured as the exact content width with zero slack —
    // any host that renders a fraction of a pixel narrower (different font
    // hinting, subpixel rounding, an editor's own chrome) tips it into
    // wrapping. Flag it so the Node-side renderer can drop the exact width
    // and force nowrap instead, which real wrapping text still needs its
    // width for and keeps.
    //
    // Guarded to elements that actually HAVE text: a purely decorative,
    // empty tag (a legend swatch, a bullet/status dot — a <span> sized only
    // via CSS, no text node inside it) is not "one line of text" at all,
    // but its own scrollHeight (its literal box height, e.g. 10px) nearly
    // always sits under the ambient line-height it inherits — the same
    // check meant for text false-positives on it, and BOTH width and
    // height then get silently dropped from a real, explicitly-sized box,
    // collapsing it to nothing. Real bug, found capturing an ordinary
    // colored-dot legend swatch.
    if (TEXT_FLOW_TAGS_BROWSER.has(el.tagName.toLowerCase()) && el.textContent.trim()) {
      node.singleLine = el.scrollHeight <= parseFloat(cs.lineHeight) * 1.3;
    }
    const bgMatch = IMG_URL_RE.exec(cs.backgroundImage);
    if (bgMatch && bgMatch[2] && !bgMatch[2].startsWith('data:')) {
      node.bgImageUrl = new URL(bgMatch[2], location.href).href;
    }
    // An open shadow root's own markup — not this element's light-DOM
    // children — is what actually renders; see appendChildren's comment.
    // el.shadowRoot is null for a closed shadow root (rare, and genuinely
    // inaccessible to any script outside the component) or when there's no
    // shadow root at all, which is the overwhelmingly common case and
    // falls straight back to walking el itself exactly as before.
    appendChildren(node, el.shadowRoot || el);
    return node;
  }

  // Group mode: each real element is serialized IN PLACE (still attached
  // at its real DOM position, so container queries and any other
  // context-dependent CSS resolve exactly as they do on the live page),
  // and only the already-correct RESULT is placed into a synthetic
  // wrapper node — the live page itself is never touched. See the `group`
  // step above for the real bug this replaced (moving elements first
  // corrupted a container-query-driven layout).
  if (groupMeta) {
    const children = groupMeta.items.map((item) => {
      const el = document.querySelector(`[data-capture-group-id="${item.id}"]`);
      if (!el) return null;
      const node = serialize(el);
      if (!node) return null;
      node.style.position = 'absolute';
      node.style.left = item.left + 'px';
      node.style.top = item.top + 'px';
      node.style.right = 'auto';
      node.style.bottom = 'auto';
      node.style.margin = '0px';
      return node;
    }).filter(Boolean);
    const wrapperStyle = Object.fromEntries(PROPS.map((p) => [p, '']));
    wrapperStyle.position = 'relative';
    wrapperStyle.width = groupMeta.unionW + 'px';
    wrapperStyle.height = groupMeta.unionH + 'px';
    wrapperStyle.display = 'block';
    return { type: 'el', tag: 'div', style: wrapperStyle, children };
  }

  const root = document.querySelector(rootSel);
  const tree = serialize(root);

  // Floating companions (tooltips, popovers): position:fixed, so they're
  // WHATEVER is visible in the viewport, not necessarily inside `root` at
  // all (a tooltip is typically appended to <body> for z-index/overflow
  // reasons, wherever its trigger lives). If root doesn't already contain
  // one, look outside it: any visible fixed-position element not inside
  // root is almost certainly a hover/focus companion meant to be read
  // alongside whatever's captured. Splice it in, repositioned relative to
  // root's own box instead of the viewport — a fixed element's numbers are
  // meaningless without the exact scroll position they were measured at,
  // which a static capture can never reproduce.
  if (tree) {
    const rootRect = root.getBoundingClientRect();
    const candidates = [...document.querySelectorAll('body *')].filter((elCand) => {
      if (root.contains(elCand)) return false;
      const s = getComputedStyle(elCand);
      return s.position === 'fixed' && s.display !== 'none' && s.visibility !== 'hidden' && elCand.getBoundingClientRect().width > 0;
    });
    for (const floater of candidates) {
      const node = serialize(floater);
      if (!node) continue;
      const fr = floater.getBoundingClientRect();
      node.style.position = 'absolute';
      node.style.left = (fr.left - rootRect.left) + 'px';
      node.style.top = (fr.top - rootRect.top) + 'px';
      node.style.right = 'auto';
      node.style.bottom = 'auto';
      tree.children.push(node);
    }
  }
  return tree;
}, { rootSel: rootSelector, PROPS, textFlowTags: [...TEXT_FLOW_TAGS], groupMeta });

// Screenshot every <canvas>/<iframe> placeholder while the browser (and the
// real page) is still open — this MUST happen before browser.close(), and
// each one is queried fresh by its stamped id rather than reused from
// earlier, since the group step (if any) never moves elements and this is
// the first point some of them get individually addressed.
const screenshotNodes = [];
(function collectScreenshotNodes(node) {
  if (!node) return;
  if (node.type === 'screenshot-placeholder') screenshotNodes.push(node);
  if (node.children) node.children.forEach(collectScreenshotNodes);
})(tree);
let shotCounter = 0;
for (const node of screenshotNodes) {
  shotCounter += 1;
  const handle = await page.$(`[data-capture-shot-id="${node.shotId}"]`);
  if (!handle) { console.error(`screenshot placeholder "${node.shotId}" vanished before capture`); continue; }
  const filename = `shot${shotCounter}.jpg`;
  try {
    await handle.screenshot({ path: path.join(outDir, filename), type: 'jpeg', quality: 70 });
    node._filename = filename;
  } catch (e) {
    console.error('canvas/iframe screenshot failed:', node.shotId, e.message);
  }
}

await browser.close();

// ---- Collect + fetch images referenced anywhere in the tree ----
const images = []; // {url, filename}
function collectImages(node) {
  if (!node || node.type !== 'el') return;
  if (node.src) images.push(node);
  if (node.bgImageUrl) images.push({ src: node.bgImageUrl, isBg: true, node });
  node.children.forEach(collectImages);
}
collectImages(tree);

// Content-type -> extension. A dynamically-generated image endpoint (a
// favicon-by-domain service, an avatar generator) commonly has no file
// extension in its URL at all, so the extension has to come from what the
// server actually says it sent, not guessed from the URL shape.
const CONTENT_TYPE_EXT = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
  'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg',
  'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico', 'image/bmp': 'bmp',
};
let counter = 0;
for (const img of images) {
  const src = img.src;
  if (!src) continue;
  counter += 1;
  let buf, contentType;
  try {
    const resp = await fetch(src);
    contentType = (resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    buf = Buffer.from(await resp.arrayBuffer());
  } catch (e) {
    console.error('image fetch failed:', src, e.message);
    continue;
  }
  // Fallback when the server didn't send a recognized content-type: take
  // the extension from the LAST PATH SEGMENT only (never the whole URL —
  // a bare domain like "plausible.io" has a dot too, and a query string
  // can itself contain "/", both of which corrupt a naive whole-string
  // split), and sanitize to plain alphanumerics so a stray "/" or "%2F"
  // in the path can never turn into an unintended subdirectory when this
  // becomes part of a file path below.
  let ext = CONTENT_TYPE_EXT[contentType];
  if (!ext) {
    const lastSegment = src.split('?')[0].split('/').pop() || '';
    const rawExt = (lastSegment.includes('.') ? lastSegment.split('.').pop() : '').replace(/[^a-zA-Z0-9]/g, '');
    ext = rawExt ? rawExt.slice(0, 4) : 'jpg';
  }
  const rawPath = path.join(outDir, `_raw_${counter}.${ext}`);
  try {
    fs.writeFileSync(rawPath, buf);
  } catch (e) {
    console.error('image write failed:', src, e.message);
    continue;
  }
  // Real UIs commonly use an SVG as a background-image (decorative patterns,
  // gradients, icons) or as an <img> src — Pillow can only decode raster
  // formats and throws UnidentifiedImageError on one, crashing the whole
  // capture. Detected by CONTENT, not the URL's extension: a URL can serve
  // an SVG with no ".svg" in it at all (found capturing a real external
  // site's banner). An SVG is already small vector text, so it's copied
  // through as-is rather than run through the raster downsample pipeline.
  const isSvg = /^\s*(<\?xml|<svg)/i.test(buf.slice(0, 256).toString('utf8'));
  const finalName = isSvg ? `img${counter}.svg` : `img${counter}.jpg`;
  if (isSvg) {
    fs.renameSync(rawPath, path.join(outDir, finalName));
  } else {
    // downsample/recompress to keep each asset well under the canvas's per-image budget
    execSync(`python3 -c "
from PIL import Image
im = Image.open('${rawPath}').convert('RGB')
w,h = im.size
scale = min(1, 700/w)
im2 = im.resize((max(1,int(w*scale)), max(1,int(h*scale))))
im2.save('${path.join(outDir, finalName)}', format='JPEG', quality=62)
"`);
    fs.unlinkSync(rawPath);
  }
  if (img.isBg) img.node._bgFilename = finalName;
  else img._filename = finalName;
}

// ---- Render tree back to HTML with inline styles ----
// Forcing a literal height on a text-wrapping element freezes it at capture
// time's line count; if the flattened re-render wraps even slightly
// differently (sub-pixel width rounding, font timing), the text overflows
// that frozen box and visually overlaps the next sibling instead of
// reflowing. Width alone reproduces the same wrap point; height must stay
// auto for these tags, like real text does. Structural/leaf tags (img, div,
// section, picture) keep their captured height — they have no text to reflow.
// 'a'/'button' are excluded on purpose: they're usually white-space:nowrap
// (single line, deterministic height), where forcing height is safe and
// keeps consistent control sizing.
const RADIUS_KEYS = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'];

function styleAttr(style, node) {
  const decls = [];
  // Emit the 4 computed corner values as ONE shorthand `border-radius`
  // declaration, not 4 longhand ones. The canvas editor's "Radius" panel
  // field is bound to the shorthand property only — longhand corners render
  // correctly but read back as 0 in the panel, and the first edit through
  // that field then writes `border-radius:0` inline, silently squaring off
  // corners that were actually rounded. Collapsing here keeps panel and
  // render in sync from the start.
  if (RADIUS_KEYS.every((k) => style[k] !== undefined && style[k] !== null && style[k] !== '')) {
    decls.push(`border-radius:${RADIUS_KEYS.map((k) => style[k]).join(' ')}`);
  }
  // node.children.length === 0 catches the same empty-decorative-tag case
  // as the browser-side textContent check above: a childless <span>/<label>
  // etc. isn't flowing text at all, so it must keep its real height (an
  // empty, explicitly-sized swatch/dot would otherwise collapse to nothing).
  const dropHeight = TEXT_FLOW_TAGS.has(node.tag) && style.whiteSpace === 'normal' && !!(node.children && node.children.length > 0);
  // A single-line label's captured width is its exact content width with
  // zero slack (see the singleLine flag set during capture) — drop it and
  // force nowrap so a host that renders a hair narrower can't wrap it.
  // Real wrapping text (singleLine === false) keeps its width; that's what
  // fixes the wrap POINT.
  const dropWidthForNowrap = dropHeight && node.singleLine === true;
  for (const [k, v] of Object.entries(style)) {
    if (v === undefined || v === null || v === '') continue;
    if (RADIUS_KEYS.includes(k)) continue; // already emitted as shorthand above
    if (k === 'height' && dropHeight) continue;
    if (k === 'width' && dropWidthForNowrap) continue;
    if (k === 'whiteSpace' && dropWidthForNowrap) { decls.push('white-space:nowrap'); continue; }
    // Modern Chrome's `text-wrap` is a separate longhand from the legacy
    // `white-space` keyword, and when both are present as literal inline
    // declarations, `text-wrap` wins — so the captured page's real
    // `text-wrap:wrap` (present on ordinary paragraph/heading text) was
    // silently overriding the `white-space:nowrap` just forced above,
    // un-fixing the exact wrap-fragility bug that fix exists for. A real
    // title visibly wrapped to 2 lines in the canvas because of this.
    if (k === 'textWrap' && dropWidthForNowrap) { decls.push('text-wrap:nowrap'); continue; }
    // A vendor-prefixed computed-style property name (webkitTextFillColor)
    // needs a LEADING dash once kebab-cased (-webkit-text-fill-color) — the
    // plain per-capital-letter replace below produces "webkit-..." with no
    // leading dash, which is a different (invalid, ignored) property name.
    const cssKey = (k.startsWith('webkit') ? '-' : '') + k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
    let val = v;
    // `position:fixed` is relative to the VIEWPORT, which only means anything
    // in a live, scrollable browser tab — a static capture has no viewport of
    // its own, just the artboard's own coordinate space. A tooltip/popover
    // shown via a hover step keeps its exact left/top numbers (baked at
    // capture time, still correct within the artboard) but needs to anchor
    // to the artboard container instead of "the viewport", which is exactly
    // what position:absolute does here since the root wrapper is
    // position:relative and starts at the same (0,0) the fixed coords were
    // measured from.
    if (k === 'position' && v === 'fixed') val = 'absolute';
    if (k === 'backgroundImage' && node && node._bgFilename) {
      val = `url("${node._bgFilename}")`;
    } else if (k === 'backgroundImage' && val.includes('url(')) {
      continue; // no local file resolved for this one — drop rather than ship a broken/remote url
    }
    // A computed value can legitimately contain a literal double-quote —
    // font-family is the common case (`"Segoe UI", sans-serif`). This whole
    // declaration string is about to be embedded inside an HTML
    // `style="..."` attribute, itself double-quoted; an unescaped `"` here
    // closes that attribute early, and every declaration after it in
    // property order is silently dropped from the parsed HTML — a real,
    // serious bug (found because "text-decoration:none", positioned after
    // font-family in the property list, never took effect: the whole
    // attribute string was truncated right after `font-family:"Segoe`).
    // CSS accepts single quotes for the exact same string, so swapping
    // avoids needing full HTML-entity escaping.
    if (typeof val === 'string' && val.includes('"')) val = val.replace(/"/g, "'");
    decls.push(`${cssKey}:${val}`);
  }
  return decls.join(';');
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const VOID = new Set(['img', 'br', 'hr', 'input']);

function render(node) {
  if (node.type === 'text') return escapeHtml(node.text);
  if (node.type === 'raw') {
    // Wrap so the captured layout/sizing style (margins, flex sizing, color
    // for currentColor icons) still applies, while the inner markup keeps
    // its real d/viewBox/fill attributes untouched.
    return `<span style="${styleAttr(node.style, node)};display:inline-flex">${node.html}</span>`;
  }
  if (node.type === 'screenshot-placeholder') {
    // A <canvas>/<iframe> that got individually screenshotted (see the
    // pass right before browser.close() above) renders as a plain image —
    // same visual result, no pretense of it being editable inside.
    if (!node._filename) return '';
    return `<img style="${styleAttr(node.style, node)}" src="${node._filename}" alt="">`;
  }
  if (node.type !== 'el') return '';
  const attrs = [`style="${styleAttr(node.style, node)}"`];
  if (node.tag === 'a') attrs.push(`href="${node.href}"`);
  if (node.tag === 'img') {
    attrs.push(`src="${node._filename || ''}"`);
    attrs.push(`alt="${escapeHtml(node.alt || '')}"`);
  }
  if (node.tag === 'input' || node.tag === 'textarea') {
    attrs.push(`placeholder="${escapeHtml(node.placeholder || '')}"`);
    if (node.tag === 'input') attrs.push(`type="${node.inputType || 'text'}"`);
  }
  const openTag = `<${node.tag} ${attrs.join(' ')}>`;
  if (VOID.has(node.tag)) return openTag;
  const inner = node.children.map(render).join('');
  return `${openTag}${inner}</${node.tag}>`;
}

const bodyHtml = render(tree);
const w = Math.round(rootBox.width);
const h = Math.round(rootBox.height);

const dcHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  ${fontLinks}
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>
    body { margin: 0; }
    a { color: inherit; text-decoration: none; }
  </style>
</helmet>
<div style="width:${w}px;height:${h}px;overflow:hidden;position:relative;">
${bodyHtml}
</div>
</x-dc>
</body>
</html>
`;

fs.writeFileSync(path.join(outDir, 'Main.dc.html'), dcHtml);
console.log(`wrote ${path.join(outDir, 'Main.dc.html')} — root captured at ${w}x${h}px (real rendered size @ ${viewportWidth}px viewport), ${images.length} image(s)`);
