---
name: ui-to-canvas-capture
description: Turn any real, already-built webpage into an editable Design Component (a Main.dc.html file) that Claude Design's canvas editor can open. Use when someone wants to bring a live UI — any page, any framework, any stack — into a design canvas to edit it visually, rather than mocking it up from scratch.
---

# UI → Canvas Capture

This skill bundles one file: `ui-to-canvas-capture.mjs`. It is a Node.js script, not an AI
workflow — running it requires no model reasoning, only Node and Playwright.

## When to use this

The user wants a real, live page (or one element/region of it) editable inside a design canvas,
pixel-exact to how it actually renders — not a hand-drawn approximation of it.

## How it works, briefly

It opens the target URL in a real headless browser, walks the target element's subtree, and for
each node reads the browser's own **computed style** (`getComputedStyle`) — the final, resolved
style after every cascade, token and reset has applied — rather than copying CSS source rules by
selector. That is what makes it stack-agnostic: it never reads source code, only what a real
browser renders, so it works identically whether the page is React, vanilla JS, or anything else.
Full mechanism and the specific bugs this design avoids are documented in the script's own header
comment and inline comments — read those before modifying it.

## Running it

```
node ui-to-canvas-capture.mjs <url> <selector> <outDir> [viewportWidth] ["click:sel|hover:sel|wait:ms|group:sel1,sel2|..."]
```

- `<url>` — the live page to capture.
- `<selector>` — a CSS selector for the element (or region) to capture.
- `<outDir>` — where to write the output (`Main.dc.html` plus any extracted images).
- `[viewportWidth]` — optional, defaults to an iPhone-class 390px.
- The optional steps string replays interactions needed to reach the right state before capturing:
  `click:<selector>`, `hover:<selector>`, `wait:<ms>`, and `group:<sel1>,<sel2>,...` (merges loose
  sibling elements with no shared wrapper into one captured unit, in the order given).

Requires `npm install playwright` in whatever project runs this script.

## After capturing

The output (`Main.dc.html`) is a flat, self-contained HTML file with no external CSS dependency —
every element's style is baked inline. Open it in Claude Design's canvas editor (or hand it to
Claude to seed and publish there) to edit freely.

**Before treating any capture as done, render it and visually compare it against the real page or
a supplied reference — do not publish or hand it over unverified.** A capture that "looks right"
without being checked is exactly how a small, real bug (a missing hover state, a clipped row, a
misapplied radius) ships unnoticed. This applies to every capture, not only ones that look complex.

## Approaching a brand-new site: a repeatable method, not a one-off

Every new site costs real time the first time — new selectors, new auth, new layout quirks. That
cost does NOT need to repeat itself. Follow this order every time; it is the distilled result of a
real stress test (an unfamiliar external site — nothing about it was known going in):

1. **Skeleton first, one piece at a time, approved before the next.** Capture the page's own
   top-level structural regions (nav, header/toolbar, main content area) as their real measured
   boxes before filling in any detail. Get each piece confirmed correct before moving to the next —
   catching a wrong assumption (a wrong region height, a missing sub-row) costs nothing at this
   stage and a lot once ten more pieces are built on top of it.
2. **Find selectors by STABLE identity, never by generated class names.** `data-testid`,
   `aria-label`, `role`, or a plain semantic tag (`header`, `main`, `nav`) survive a re-render;
   hashed/generated classes (`css-4kayew`, `css-18dut0i`) are build artifacts that can change on
   the next deploy and tell you nothing about what the element IS. Search for stable attributes or
   distinctive visible text first; fall back to structural position only when nothing stable exists.
3. **A "not found" or suspiciously-empty page is almost always a timing or scoping problem, not a
   missing element.** Before concluding an element doesn't exist: (a) check whether the SAME class
   or `data-testid` matches more than one element (a hidden duplicate elsewhere on the page will
   silently win a `querySelector`) — scope the selector narrower; (b) confirm the page actually
   finished loading (`document.body.innerText.length` near-zero means it hasn't) — heavy SPAs often
   need `networkidle`, not `load`, and occasionally need one retry on a transient timeout.
4. **Verify with a real number, not a look.** Screenshot the capture, screenshot the same region of
   the real reference, and diff them (even a plain pixel-closeness ratio via Pillow is enough) —
   this turns "looks about right" into a concrete score you can watch move as you fix things, and
   makes it obvious when a fix actually worked versus just looked like it might have.
5. **When you fix a fundamental bug, re-test everything you'd previously written off as unsolved —
   don't assume each visual symptom needs its own separate fix.** One root cause can produce several
   seemingly unrelated symptoms. Concretely: a bug where an unescaped `"` in a computed value (a
   quoted font-family) truncated the rest of a style attribute was, in hindsight, ALSO the real
   explanation for an earlier "moving an element broke its CSS" finding that got a whole separate
   fix — the separate fix was still worth keeping, but it wasn't the true root cause of what had
   been observed.
6. **A container's assigned height is a guess until you measure the real content against it.**
   A "fold" wrapper sized to fill the remaining viewport (e.g. 888px) can sit on top of content
   that only actually needs a fraction of that (e.g. 495px) — the real page had almost no gap
   between sections, but the capture had a ~380px dead zone. Before building the next piece on top
   of a container, measure the real page's content bottom (`getBoundingClientRect()` on the last
   real element) and match the container to it, rather than trusting an initial size guess.
7. **Before every publish/republish, diff "images referenced in the HTML" against "images actually
   included."** `grep -o 'src="[^"]*"'` on the output vs. the file list you're about to upload —
   any name in the first set missing from the second is a guaranteed broken image. This is an easy
   miss specifically on a RE-publish: it's natural to re-copy only the files you just touched (e.g.
   new `.jpg`s) and forget older ones already referenced (e.g. `.svg` icons) that were sitting in
   the same output folder the whole time.
8. **A missing CSS property in the capture list produces a specific, recognizable failure — learn to
   recognize it instead of re-diagnosing from scratch.** Three real, confirmed cases: text rendering
   doubled/overlapping (a `visibility:hidden` "ghost" copy — used to reserve width for a bold hover
   state without layout shift — became visible because `visibility` wasn't captured at all); an
   inline icon or image sitting too high/clipped next to text (`vertical-align` wasn't captured, so
   the element fell back to baseline alignment instead of the page's own `middle`/`top`/etc.); and
   an SVG icon rendering as a blank box even though its markup is present (it uses a sprite pattern,
   `<use href="#some-icon-id">`, pointing at a `<symbol>` defined once elsewhere in the real page —
   often near `<body>` — never inside the icon's own subtree, so the id resolves to nothing once
   that one `<svg>` is isolated into its own file). All three are now fixed in the tool itself, but
   the general lesson outlives these three: a symptom that looks purely visual (overlap, misalignment,
   a blank icon) is often a computed-style property the tool simply never asked the browser for, or a
   reference into DOM the capture didn't bring along — check both before assuming it's a one-off.
9. **When picking a container selector by "walk up until it's wide enough," a missing border/divider
   usually means you stopped one level too early.** A sidebar's actual CONTENT (the list of items)
   and the VISUALLY BORDERED shell around it (the element that actually carries `border-right`) are
   often different elements — the content box can already look "wide enough" to a stop-at-first-match
   heuristic while the real border lives on its parent. Concretely: capturing a 3-column layout
   (sidebar | main | panel) came out with no vertical dividers between columns even though the real
   page clearly has them — the sidebar and panel selectors had stopped at the content box, one level
   inside the actual bordered shell. Fix: when walking up to find a container, keep going until you
   find an ancestor whose OWN computed `border` is non-none in the direction you'd expect a divider
   (`border-right` for a left sidebar, `border-left` for a right panel) — don't stop at the first
   element that's merely the right width.

10. **A stylesheet scan that only checks top-level rules will miss anything wrapped in `@media`,
    `@supports`, or `@layer`.** Google's own font CSS wraps every `@font-face` in a per-language
    unicode-range `@media` block — a flat loop over `sheet.cssRules` finds the stylesheet (often
    thousands of top-level rules) but zero font-faces inside it, because the font-faces are nested
    one level down. Any scan of `document.styleSheets` for a specific rule type needs to recurse
    into every rule that itself holds `.cssRules` (`@media`, `@supports`, `@layer`, `@container`),
    not just iterate the top level once.
11. **Loading the right font isn't enough for an icon-ligature font — the browser also needs to be
    told to substitute the ligature.** `font-family` being correct and the font file actually
    downloading (check `document.fonts` status) can still render literal icon-name text if
    `font-feature-settings` (the `liga` flag) and, for variable icon fonts, `font-variation-settings`
    aren't captured too — both are ordinary computed-style properties, easy to forget precisely
    because the icon LOOKS like a font problem rather than a "missing CSS property" problem.
12. **When verifying a capture yourself, launch the verification browser with the same TLS/cert
    flags the actual environment needs, or a real fix will look like a failure.** In a proxied
    sandbox, a remote font fetch that 404s or fails cert validation during your OWN screenshot step
    can produce the exact same "icon renders as literal text" symptom as the real bug — wasting a
    full re-investigation cycle chasing a bug that was already fixed, until the network error in the
    verification browser's own console gives it away.
13. **A page that's a real CSS Grid, not just flex rows, needs the CHILD's placement captured too, not
    just the parent's track definition.** Capturing `grid-template-columns`/`grid-template-rows` alone
    is only half the layout: a child using `grid-column: 1 / -1` (Tailwind's `col-span-full`) to span
    every column falls back to normal auto-placement without its own `grid-column`/`grid-row` also
    captured, visually scrambling the whole page — a header, a stat-tile row, and a chart card all
    landed in single grid cells alongside unrelated siblings instead of spanning full width.
14. **An SVG element styled purely by CSS class (no literal `fill`/`stroke` attribute at all) needs its
    computed paint value baked just as much as one that has the attribute already.** Gating that bake
    on "does this element already have the attribute" misses exactly the elements a utility-CSS
    framework (Tailwind's `stroke-indigo-500 fill-none`, etc.) styles this way — the isolated capture
    loses the color/fill-none entirely and falls back to SVG's own default (opaque black), turning a
    thin colored line into a solid black spike. Bake the live computed value unconditionally for every
    paintable node; computed style is correct regardless of whether a literal attribute, a class, or
    an inherited rule produced it.
15. **A panel gated behind scroll-into-view lazy loading (IntersectionObserver) will never resolve at a
    fixed scroll position, no matter how long you wait.** Confirmed: three separate widgets on one page
    stayed on their loading spinner through 30+ seconds of waiting at scroll-top, then all three
    resolved within seconds of the page actually being scrolled past them once. If a capture shows a
    panel permanently stuck on a spinner, scroll the full page height (in steps, then back to top)
    before giving up on "it just needs more time" — the fetch was likely never triggered at all.
16. **A `networkidle`-timeout fallback that "just re-navigates" is actually a full page reload, and a
    reload discards render progress.** `goto(url, {waitUntil:...})` always performs a fresh navigation
    even to the identical URL already loaded — using it as a fallback after a networkidle timeout
    restarts every async widget's fetch-then-draw cycle from zero, right before only allowing a short
    fixed wait. Advance through `domcontentloaded` → `load` → `networkidle` as checkpoints of ONE
    navigation instead; a timeout on any later checkpoint just means proceeding, never restarting.
17. **A string-derived file extension must come from the last PATH SEGMENT, never the whole URL** — a
    bare domain has a dot too (`plausible.io`), and a query string can itself contain an encoded `/`
    (`%2F`), both of which corrupt a naive `url.split('.').pop()`. A dynamically-generated image
    endpoint (a favicon-by-domain service, an avatar generator) commonly has no real extension in its
    URL at all. Preferring the fetch response's own `Content-Type` header, with a sanitized
    last-segment parse only as fallback, sidesteps the whole class of URL-shape guessing.
18. **The mechanism itself is automation-library-agnostic — Playwright and Puppeteer produce pixel-
    identical output**, since only the Node-side browser-control calls (launch, goto, waitFor*) differ
    between them; everything that actually determines the result (the DOM walk, computed-style
    reading, SVG handling) runs as plain in-page JavaScript inside `page.evaluate()`, which neither
    library touches. Swapping the harness to `puppeteer-core` + a local Chrome (skipping Playwright's
    ~300MB bundled-Chromium download) changes nothing about capture quality.
19. **A selector that resolves to a semantic content tag (`main`, a dashboard's own inner wrapper) commonly
    has a real `<header>`/`<nav>` as a SIBLING, not an ancestor — found this exact mistake twice now on
    two unrelated real sites.** A capture whose root doesn't start near the top of the page (checkable:
    `rootBox.y` well above 0) is missing whatever sits above it. The tool now warns about this
    automatically when it happens; the fix is still a human one — add the sibling to a `group:` step.
20. **`getComputedStyle` can report a margin that disagrees with where the browser actually painted the
    element — confirmed directly, repeatedly, on a real site.** A lone child centered via `margin: 0
    auto` (a common "container" utility class) read back computed `marginLeft` as `"0px"` on some fresh
    page loads and the correct `"140px"` on others — same element, same class, same real position
    (`getBoundingClientRect` never moved), zero CSS animation active either time. This is NOT a timing
    issue a longer wait fixes: the value was stable for an entire page load's lifetime, just sometimes
    stably wrong. The reliable fix is to stop trusting the computed value outright for this one case and
    derive it from real geometry instead (child edge vs. parent's content-box edge) — scoped to
    only-children specifically, since the same arithmetic would wrongly blame a middle item in a
    multi-sibling flex/grid row (spaced via `justify-content`/`gap`, not margin) for the whole gap since
    its last sibling.
21. **A Web Component's real visual structure lives inside its shadow root, not its light-DOM children —
    walking `el.childNodes` directly captures none of it.** Confirmed on a real component library
    (Shoelace's `<sl-card>`): came out as bare unstyled text and an image with zero chrome at all — no
    border, no padding, no button styling, no rating icons — because every bit of that markup lives
    inside the shadow root, completely outside what a light-DOM walk ever sees. Fix: when an element has
    an OPEN shadow root (`el.shadowRoot`, non-null — the common case; a closed one is genuinely
    inaccessible to any outside script and stays uncapturable), walk the shadow root's own children
    instead. A `<slot>` found there is where the light-DOM content the page author actually passed in
    ends up placed, in the browser's own "flattened tree" — substitute its `assignedNodes({flatten:true})`
    there (falling back to the slot's own children when nothing was assigned) rather than treating the
    `<slot>` tag itself as a normal element. `::slotted()` styling and everything else about the slotted
    element's own appearance needs no special handling at all — `getComputedStyle` on the real light-DOM
    element already reflects it correctly, same as any other computed style this tool reads.
22. **A live code-editor component hides its invisible `<textarea>` overlay via `-webkit-text-fill-color`,
    not `color` or `visibility`.** The standard in-browser code editor pattern is a transparent, real
    `<textarea>` (for actual typing/selection/cursor) stacked directly on top of a syntax-highlighted
    `<pre>` (for display) — and the textarea's own `color` is often a plain, visible value; only
    `-webkit-text-fill-color: transparent` actually hides its text. Missing that property bakes the
    textarea's text as a visible ghost duplicate directly on top of the properly highlighted code
    beneath it. Note when adding a vendor-prefixed property to PROPS: kebab-casing it needs a leading
    dash (`-webkit-text-fill-color`) that a plain per-capital-letter replace doesn't add on its own.
23. **Collapsing whitespace-only text nodes to a single space is only correct for ordinary inline flow —
    inside a `white-space: pre`/`pre-wrap` context it destroys the content.** A syntax-highlighted code
    block (one `<span>` per token) has a real newline-plus-indentation text node between nearly every
    pair of tokens; collapsing every one of those the same way as an incidental space between two UI
    labels flattens an entire multi-line, indented code sample into one continuous line. Check the
    parent's computed `white-space` before collapsing — preserve the text verbatim when it's
    `pre`/`pre-wrap`/`pre-line`/`break-spaces`.
24. **When scoping a fix to "an only child," `previousElementSibling`/`nextElementSibling` alone aren't
    enough — they skip text-node siblings entirely.** Found immediately after adding finding 20's
    geometry-based margin override: a trailing icon right after a link's own text (`<a>text<i>icon</i>
    </a>`) has no sibling ELEMENT on either side, so it qualified as "lone child" too, even though real
    text sits right before it — the override then measured the icon's distance to the PARENT's edge
    (spanning the whole preceding text run) and flung it away from the text it belongs next to. Check
    for any real sibling CONTENT instead — filter `childNodes` down to non-whitespace-only nodes and
    confirm exactly one remains and it's the element in question — not just sibling elements. A
    generalizable lesson beyond this one fix: any "is this the only thing here" check needs to ask about
    every kind of sibling a DOM node can have, not just the element kind.

None of the above is specific to any one site, framework, or library — that is the point. Following
it is what makes the SECOND unfamiliar site faster than the first, and the tenth faster still,
instead of every new site starting the investigation over from zero.

## This skill does not cover the return direction

Mapping an edit made in the canvas back into real source code is a separate skill —
`canvas-to-ui` in this same repo. It is judgment-driven, not something this script does, and
deliberately has no code of its own.
