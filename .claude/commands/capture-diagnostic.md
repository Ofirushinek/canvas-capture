---
description: Capture a URL like /capture, but produce a strict, structured timing/diagnostic report at the end instead of a free-form narrative — for comparing runs against each other.
argument-hint: <url> [css-selector]
---

Follow `.claude/commands/capture.md` exactly for the actual work — same steps, same rules, no
shortcuts. The only difference is what you report at the end.

**Timing discipline while you work:** before starting each phase below, run `date +%s`; when it ends,
run `date +%s` again and compute the real elapsed seconds. Never estimate or round from memory — if
you didn't capture a real timestamp for a phase, write "not measured" for it rather than guessing.

When you're done (whether it succeeded, partially succeeded, or failed), output a report in EXACTLY
this format — every field filled from something you actually observed or measured this run, not
inferred:

```
RUN REPORT
URL: <the url you captured>
Date: <today's date>
Start time: <HH:MM:SS, your first action>
End time: <HH:MM:SS, when you finished>
Total wall-clock time: <Xm Ys>

ENVIRONMENT (run these and paste real output, don't paraphrase)
- Playwright version: `cat node_modules/playwright/package.json | grep '"version"'`
- Chromium revision Playwright expects: `cat node_modules/playwright-core/browsers.json | grep -A2 '"name": "chromium"'`
- Chromium revisions actually on disk: `ls /opt/pw-browsers/`
- Pillow installed before you started? yes/no

PHASE TIMINGS (real seconds only)
1. Clone + repo setup: <Xs>
2. Dependency check (playwright/Pillow) — already present, or installed fresh: <Xs>, which ones installed
3. Capture attempts — one line PER ATTEMPT, including failed ones:
   - Attempt 1: <Xs> — success / failed (<exact error message>)
   - Attempt 2: <Xs> — success / failed (<exact error message>)
   ...
4. Verification (screenshots + diff): <Xs>
5. Publish to canvas: <Xs>

ERRORS HIT (every one, even ones you fixed in seconds — no filtering "not worth mentioning")
- <error> → <exact fix applied> → <time lost to this specific error>

RESULT
- Canvas URL:
- Dimensions / image count / file size:
- Overall diff% against live page (if step 3's diff tool ran):
- Any defect left unresolved:
```

Do not skip the ENVIRONMENT section even if everything worked — a clean run's environment numbers are
just as diagnostic as a broken one's, for comparing across sessions.
