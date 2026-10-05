---
name: Bug report
about: Report a reproducible defect in the Orders & KDS frontend
title: "fix(<scope>): <short description>"
labels: ["bug", "needs-triage", "frontend"]
assignees: []
---

## Describe the bug

<!-- A clear and concise description of what the bug is.
     State the actual behaviour and how it differs from the expected one. -->

**Actual behaviour:**

**Expected behaviour:**

## Related requirement

<!-- Which RF/RNF is violated?  Check the catalogue in docs/VyV_OrdenesKDS.md §3. -->

Violates: <!-- RF-XX / RNF-XX -->

## Steps to reproduce

1. <!-- First step -->
2. <!-- Second step -->
3. <!-- ... -->

## Environment

- **Branch:** `develop` / `main` / `<branch-name>`
- **Commit SHA:** <!-- git rev-parse --short HEAD -->
- **Node version:** <!-- node --version -->
- **Browser / device:** <!-- e.g. Chrome 128, KDS monitor landscape 1920×1080 -->
- **Screen / context:** <!-- KDS board / Order Ticket Widget / Intermediate Dishes -->

## Console output / error

```
<!-- Paste relevant browser console errors here (scrub any credentials). -->
```

## Regression test

<!-- Describe (or paste) the Vitest/Playwright test that would catch this bug. -->
<!-- Every bug fix must ship with a regression test (CONTRIBUTING §8). -->

## Additional context

<!-- Screenshots, screen recordings, or any other helpful information.
     For KDS bugs: include a screenshot at 1920×1080 landscape if possible. -->
