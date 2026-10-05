---
name: Feature request / Task
about: Propose a new component, view, or improvement to the frontend
title: "feat(<scope>): <short description>"
labels: ["enhancement", "needs-triage", "frontend"]
assignees: []
---

## Summary

<!-- One paragraph: what is being proposed and why it is needed. -->

## Related requirement

<!-- Link to the RF/RNF this feature satisfies.
     If there is no matching requirement, explain why and get explicit approval
     before implementation (DEVELOPMENT_GUIDELINES §3.3). -->

Satisfies: <!-- RF-XX / RNF-XX -->
Open point: <!-- OP-XX if applicable -->

## Proposed solution

<!-- Describe the implementation approach:
     - Which layer(s) change (view / component / shared/api / shared/realtime)?
     - New exposed module?  New Zod schema?
     - Module Federation key changes to communicate to Shell or Menu teams?
     - Contracts that change (MSW handler, error codes mirror)? -->

## Acceptance criteria

<!-- List testable conditions that must be true for this feature to be
     considered done.  Use the "Given / When / Then" format if applicable.
     For KDS features: specify keyboard-only operability requirements. -->

- [ ] ...
- [ ] ...

## Definition of Done checklist

<!-- This section mirrors the PR template checklist; fill it in when the
     feature is ready for review. -->

- [ ] `eslint .` and `tsc --noEmit` pass
- [ ] Unit tests cover success, error and boundary paths
- [ ] E2E test added if the feature involves a full user flow
- [ ] KDS actions operable by Bump Bar (keyboard-only)
- [ ] Accessibility: `axe-core` reports no new violations
- [ ] No global CSS rules introduced
- [ ] Open points not resolved silently

## Alternatives considered

<!-- Why is this approach preferred over alternatives? -->

## Additional context

<!-- Wireframes, component sketches, references to architecture docs, etc.
     Mention if this is a blocker for another task. -->
