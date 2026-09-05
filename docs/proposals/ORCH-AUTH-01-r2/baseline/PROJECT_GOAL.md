# Example Project

## Autonomous Goal Specification (placeholder authority)

> **This file is the template's placeholder authority document.** Replace its
> content with your project's frozen goal, then record its hash in
> `evals/immutable-contract-lock.json`. Keep the section skeleton: the loop's
> planner, worker, and reviewer read this file first, and its name is
> configured at `project.authorityFile` in
> `tools/milestone-orchestrator/config/default.json`.

## 1. Purpose and Completion Contract

Describe, in frozen terms, what finished software this repository must
produce. Completion is defined exclusively by the acceptance contract in
`evals/` plus the readiness gate below; nothing in `.agent/`, docs, or plans
may amend it.

## 2. Product Vision

Describe the product: who uses it, the core outcome it delivers, and the
design pillars an autonomous developer must preserve while making local
decisions.

## 3. Required Systems and Content Breadth

Enumerate the systems the finished product must contain and any minimum
breadth counts. These are the categories the vertical-spine keyword policy
(`project.verticalSpine`) guards against bundling into a single milestone.

## 4. Technical Architecture and Toolchain

Pin the stack, the deterministic simulation/rendering separation (if any),
and the exact toolchain versions. The verification harness enforces exact
Node and pnpm pins from `package.json`.

## 5. Autonomous Development Mandate

Development proceeds through the autonomous milestone loop: one bounded,
objectively verified milestone at a time, planned against this document,
implemented in an isolated clone, machine-verified through
`scripts/verify.mjs` and the tiered verification commands, and independently
reviewed before integration.

## 6. Determinism, Validation, and Seeds

State the determinism requirements (fixed-tick rules, replay, save/load
parity) and the seed policy, including any hidden validation seeds whose
values must never enter this repository (`evals/HIDDEN_VALIDATION_PROTOCOL.md`).

## 7. Completion Metrics and One-Time Calibration

The frozen completion metrics live in `evals/acceptance-manifest.json`.
Provisionally calibrated thresholds may be adjusted exactly once (`CAL-1`),
after which every threshold is immutable.

## 8. Autonomous Readiness Gate and Human Verification

`AUTONOMOUS-READINESS-01` aggregates every required validation layer with no
compensation between requirements. A human acceptance pass
(`HUMAN-ACCEPT-01`) follows the machine gate and is never replaced by it.

## 9. Explicit Non-Goals

List what this project must not build, so scope pressure has a frozen
boundary.

## 10. Authority and Change Control

This document and the original evaluation contract are immutable except
through explicit human revision. `evals/immutable-contract-lock.json` records
their baseline and active hashes; a mismatch is a blocking contract defect.
