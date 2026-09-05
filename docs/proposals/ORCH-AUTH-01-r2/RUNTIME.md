# Runtime assessment and qualification route

Inspection on 2026-09-05 found Ubuntu 24.04.4 on WSL 2 (kernel `6.6.87.2-microsoft-standard-WSL2`) with systemd. Docker is already installed as Ubuntu's `docker.io` package version `29.1.3-0ubuntu3~24.04.2`. `docker version` successfully returned both client and server version 29.1.3 and `systemctl is-active docker` returned `active`. The default WSL user has UID 1000. The Windows PATH still has no Docker executable.

No installation, upgrade, package removal, daemon reconfiguration or administrator action was performed. Read-only discovery started the previously stopped Ubuntu distribution. The old WP6e missing-runtime observation remains true for its recorded host/invocation; it is not a claim about this newly inspected WSL environment.

## Recommendation

Use the existing Ubuntu/WSL Docker Engine for local Linux qualification. Prepare a clean standalone clone in the Linux filesystem, keep the Windows checkout and its untracked roadmap untouched, install the exact Node/pnpm in that task-local environment, and qualify the existing engine against the repository's real OCI fixture. WSL is a Linux qualification route, not native Windows parity evidence or the candidate containment mechanism itself.

This avoids an unnecessary second installation. Microsoft recommends keeping Linux-command-line projects in the Linux filesystem for performance: [WSL filesystems](https://learn.microsoft.com/en-us/windows/wsl/filesystems). Docker documents a WSL-integrated Desktop route but cautions about conflicting Engine/CLI installations inside the distribution: [Docker Desktop WSL backend](https://docs.docker.com/desktop/features/wsl/). If the existing engine fails the real policy tests, diagnose that concrete failure before considering a replacement. Docker's official Ubuntu package installation is an available alternative: [Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/). This proposal does not select a mutable latest image or authorize package replacement.

## Still required before an eligible candidate run

1. Inspect daemon identity/context, socket ownership and effective capability policy from the actual qualification user. A reachable daemon alone is not sandbox attestation.
2. Build or acquire the repository's exact-runtime fixture image from its tracked recipe, verify the actual immutable digest, and record it in the separately scoped runtime configuration. No digest is guessed here.
3. Run the real containment/resource/descendant matrix and validate its receipts and runtime inspection. Keep network denied in candidates, immutable dependency inputs read-only, disposable writable workspaces, fixed limits and no host credentials or Docker socket in a candidate container.
4. Execute verification from the clean WSL clone with distinct evidence roots. Qualification must distinguish Windows-controller evidence, WSL/Linux-controller evidence, generated-adopter identity, and inner OCI identity.

Admin approval is available if a later concrete setup step needs it. No user runtime action is presently required to prepare or review ORCH-AUTH-01. Runtime qualification remains separate from approval of the frozen authority revision.
