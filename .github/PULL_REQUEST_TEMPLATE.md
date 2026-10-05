## Summary

<!-- One or two sentences: what does this PR do and why?
     Start with an imperative verb: "Add ...", "Fix ...", "Refactor ..." -->

## Related requirements

<!-- List every RF/RNF this PR satisfies, e.g.: RF-24, RF-25, RNF-01.
     If the change cannot be linked to a requirement, explain why and get
     explicit approval in the comments before merging. -->

Satisfies: <!-- RF-XX, RNF-XX -->
Closes / Refs: <!-- #issue-number (if applicable) -->

## Type of change

<!-- Check the box that applies (one per PR; if two apply, split the PR). -->

- [ ] `feat` — new component, view or exposed module
- [ ] `fix` — bug fix (include a regression test)
- [ ] `refactor` — code restructuring without behaviour change
- [ ] `test` — tests only (no production code change)
- [ ] `docs` — documentation only
- [ ] `build` — dependencies, Dockerfile, vite config
- [ ] `ci` — CI/CD configuration (workflows, sonar, thresholds)
- [ ] `chore` — maintenance that does not touch `src/` or `tests/`

## Description

<!-- Explain the *why*, not the *what* (the diff explains the what).
     Mention open points (OP-XX) you resolved and the assumption you made.
     Link the corresponding backend PR if contracts changed (CONTRIBUTING §9). -->

## Checklist

<!-- CONTRIBUTING_Frontend.md §8 — run these locally before opening the PR. -->

### Code quality
- [ ] `eslint .` and `tsc --noEmit` pass with no errors
- [ ] All code, comments, logs, and test names are in English (GUIDELINES §2)
- [ ] No `any` (TypeScript) introduced — use Zod schemas or explicit types
- [ ] Function length ≤ 40 lines; file length ≤ 400 lines

### UI / Accessibility rules
- [ ] No global CSS rules (`body`, `html`, `:root`, unscoped selectors) — all styles scoped to `.orders-kds-root`
- [ ] Tailwind `preflight: false` respected — no base/reset styles imported
- [ ] KDS actions are fully operable by keyboard (Bump Bar); no pointer-only interactions
- [ ] Touch targets ≥ 44 px on portrait / handheld screens (TASK-16 DoD)
- [ ] `aria-live` regions updated for async state changes (REJECTED, loading, errors)
- [ ] User-facing notes and messages are rendered escaped (no `dangerouslySetInnerHTML`)

### State management
- [ ] Server state fetched through TanStack Query; no `localStorage` for auth tokens
- [ ] JWT comes from the Shell session, never from a form field
- [ ] WebSocket: full refetch triggered on reconnection; invalid messages are discarded

### Tests
- [ ] `pnpm run test:unit` passes locally
- [ ] `pnpm run test:e2e` passes locally (requires `pnpm build && pnpm preview`)
- [ ] New behaviour covered by at least one unit test (success path + error path)
- [ ] Bug fixes include a regression test (red → green)

### Security
- [ ] No secrets, tokens, or internal paths in code, tests or Docker image
- [ ] `VITE_` variables contain no credentials — only public URLs

### Contracts (if API calls or event types changed)
- [ ] Zod schemas updated in `shared/api/`
- [ ] Error codes mirrored from `app/core/error_codes.py` (backend) into `shared/api/errorCodes.ts`
- [ ] MSW handlers updated in `src/mocks/`
- [ ] Backend PR opened and linked (same branch name if possible — CONTRIBUTING §9)

### Open points
- [ ] No open point (OP-01 … OP-09) was resolved silently — any assumption is
      stated explicitly in the description above

## Screenshots / recordings (UI changes)

<!-- Drop a screenshot or a short screen recording for any visual change.
     For KDS changes: show the landscape layout at 1920×1080.
     For widget changes: show both portrait and landscape contexts. -->

## Deployment notes

<!-- List any manual steps needed after merging:
     - New environment variables to add to GitHub Secrets / .env.example
     - Module Federation key changes to communicate to the Shell/Menu teams
     - Leave empty if none. -->
