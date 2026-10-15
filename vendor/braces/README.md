# braces

This directory is the published **braces 3.0.3** package (MIT, Jon Schlinkert, https://github.com/micromatch/braces), plus one local change.

`package.json` stays at `3.0.3`. There is no upstream `3.0.4`. Do not invent a version to hide the advisory.

## Why the patch is here

`GHSA-vfj7-8cjw-p6xm` (CVE-2026-93687) is a stack overflow in `braces` through deeply nested `{a,b}` patterns. The advisory covers every published release, including 3.0.3. The fix is an unmerged nesting-depth cap (`MAX_DEPTH` 100) from micromatch/braces pull request 72. `npm audit fix` cannot apply it, because nothing newer is on the registry.

`eslint-config-next` reaches this package through `@next/eslint-plugin-next`, `fast-glob`, and `micromatch`. The root `package.json` overrides `braces` to `file:vendor/braces`, so the lint tools load this copy. The app image does not install it.

`npm audit` still reports the advisory, because the version is the real upstream version the advisory lists. The depth guard is what stops the overflow: a pattern nested past 100 levels throws instead of walking until the stack overflows.

`npm audit --omit=dev` reports 0 vulnerabilities. A full `npm audit` reports 5 high findings. All five are this dev-only braces advisory, reached through `eslint-config-next` (`@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces`). Production dependencies do not include it. App Team Lead accepted that result. The version stays 3.0.3.
