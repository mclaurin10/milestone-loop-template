# Alpine Loop Lab

## Autonomous Goal Specification

## 1. Purpose and Completion Contract

Build a deterministic browser-based milestone laboratory whose finished scope
is defined only by this authority and the acceptance contract in `evals/`.

## 2. Product Vision

Give maintainers a small, inspectable application for rehearsing one bounded
milestone loop without hidden state or privileged automation paths.

## 3. Required Systems and Content Breadth

The finished product must eventually define its milestone, observation,
recovery, and reporting systems in separately verified increments. The initial
bootstrap is only the shared technical scaffold and does not satisfy this
breadth.

## 4. Technical Architecture and Toolchain

Use Node.js 24.18.0, pnpm 11.15.1, TypeScript, Vitest, and a desktop Chromium
browser. One deterministic rule owner must serve Node, Worker, replay, and
save/load paths; rendering may observe state but may not own simulation rules.

## 5. Autonomous Development Mandate

Develop one bounded, objectively verified milestone at a time through the
repository's planner, worker, reviewer, and exact verification boundaries.

## 6. Determinism, Validation, and Seeds

Fixed action logs must replay to canonical byte-identical checkpoints. Hidden
seed values remain outside the repository and bots may act only through public
user actions.

## 7. Completion Metrics and One-Time Calibration

The completion metrics in `evals/acceptance-manifest.json` may receive only the
single CAL-1 transition defined by the immutable lock lifecycle.

## 8. Autonomous Readiness Gate and Human Verification

Every machine requirement in `AUTONOMOUS-READINESS-01` must pass without
compensation before the separate `HUMAN-ACCEPT-01` review. Bootstrap evidence
is never autonomous-readiness evidence.

## 9. Explicit Non-Goals

The bootstrap must not implement product-domain breadth, production bot policy,
hidden validation, or claim autonomous readiness.

## 10. Authority and Change Control

This file and the original evaluation contract are frozen through
`evals/immutable-contract-lock.json`. A mismatch is a blocking defect, not
permission to regenerate trust roots after commissioning.
