import { createHash } from "node:crypto";

import type { CandidateIdentity } from "./contracts.js";

const IDENTITY_FIELDS = [
  "baseCommit",
  "commit",
  "tree",
  "clean",
  "changedEntriesDigest",
] as const;

export function computeChangedEntriesDigest(
  entries: readonly string[],
): string {
  return createHash("sha256")
    .update(["cid-v1", ...[...entries].sort()].join("\0"))
    .digest("hex");
}

export function candidateIdentityFrom(
  baseCommit: string,
  inspection: {
    readonly headCommit: string;
    readonly tree: string;
    readonly clean: boolean;
    readonly changedEntries: readonly string[];
  },
): CandidateIdentity {
  return {
    baseCommit,
    commit: inspection.headCommit,
    tree: inspection.tree,
    clean: inspection.clean,
    changedEntriesDigest: computeChangedEntriesDigest(
      inspection.changedEntries,
    ),
  };
}

export function differingIdentityFields(
  expected: CandidateIdentity,
  observed: CandidateIdentity,
): readonly string[] {
  return IDENTITY_FIELDS.filter((field) => expected[field] !== observed[field]);
}

export function candidateIdentitiesEqual(
  left: CandidateIdentity,
  right: CandidateIdentity,
): boolean {
  return differingIdentityFields(left, right).length === 0;
}

export class CandidateIdentityMismatchError extends Error {
  readonly boundary: string;
  readonly differingFields: readonly string[];

  constructor(boundary: string, differingFields: readonly string[]) {
    super(
      `Candidate identity changed at ${boundary}: [${differingFields.join(", ")}] no longer match the machine-verified candidate.`,
    );
    this.name = "CandidateIdentityMismatchError";
    this.boundary = boundary;
    this.differingFields = differingFields;
  }
}

export function assertCandidateIdentityUnchanged(
  boundary: string,
  expected: CandidateIdentity,
  observed: CandidateIdentity,
): void {
  const fields = differingIdentityFields(expected, observed);
  if (fields.length > 0)
    throw new CandidateIdentityMismatchError(boundary, fields);
}
