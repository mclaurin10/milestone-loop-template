# Fresh Adopter Bootstrap Scaffold

This repository was created by the Milestone Loop template workflow from an
adopter-owned definition. Its package-default `bootstrap` verifier proves only
the technical scaffold: a real production build, static checks, Vitest, one
shared deterministic smoke kernel, save/load continuation, and rendered
desktop-Chromium evidence. It is not autonomous-readiness evidence.

The repository has an authority-base commit followed by a tracked
`tools/milestone-orchestrator/config/commissioning-input.json` commit. Install
the pinned dependencies, commission exactly once, review and commit the active
manifest, then run the literal no-argument verifier:

```bash
pnpm install --frozen-lockfile
pnpm loop:commission -- --input tools/milestone-orchestrator/config/commissioning-input.json
git add .agent/verification-manifest.json
git commit -m "commission verification manifest"
pnpm verify
```

Do not add `.agent/readiness-profile-activated.json` during bootstrap. A later
bounded plan may activate readiness exactly once after bootstrap completion;
from that point the marker is permanent and the package default cannot return
to bootstrap.
