import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import {
  assertCommissioningInput,
  canonicalManifestBytes,
  manifestFromInput,
} from "./commissioning.js";
import type {
  CommissioningInput,
  VerificationManifest,
  VerificationScopePolicy,
} from "./contracts.js";
import { canonicalJson } from "./package-graph.js";
import {
  assertVerificationManifest,
  assertVerificationScopePolicy,
} from "./schema.js";
import {
  assertVerificationScheduleProjection,
  type VerificationScheduleProjection,
} from "./schedule-projection.js";
import {
  recomposeSourceCommands,
  recomposeSourcePolicy,
  SOURCE_COMMISSIONING_ID,
  SOURCE_SCOPE_V2,
  sourceScheduleGeneration,
} from "./source-schedule.js";
import {
  buildScopeCheckCatalogue,
  orderScopeCheckIds,
} from "./affected-scope.js";

export const AMENDMENT_PATHS = {
  input: "tools/milestone-orchestrator/config/source-commissioning-input.json",
  policy: "tools/milestone-orchestrator/config/verification-scope-policy.json",
  manifest: ".agent/verification-manifest.json",
} as const;
export const AMENDMENT_LEDGER_PATH =
  ".agent/completed/verification-manifest-amendments.json";
export const AMENDMENT_PENDING_PATH =
  ".agent/.verification-manifest-amendment.pending.json";
export const AMENDMENT_DECISION =
  "2026-09-04 — WP6e recomposition direction and transition requirements approved";
export const GENERATION_KEYS = ["input", "policy", "manifest"] as const;
export type GenerationKey = (typeof GENERATION_KEYS)[number];
export type GenerationHashes = Readonly<Record<GenerationKey, string>>;
export interface SourceGeneration {
  readonly files: Readonly<Record<GenerationKey, string>>;
  readonly hashes: GenerationHashes;
}
export interface AmendmentDescriptor {
  readonly schemaVersion: "verification-manifest-amendment-request.v1";
  readonly paths: typeof AMENDMENT_PATHS;
  readonly expected: {
    readonly hashes: GenerationHashes;
    readonly chainTip: string | null;
  };
  readonly proposed: { readonly input: string; readonly policy: string };
  readonly decisionHeading: typeof AMENDMENT_DECISION;
}
export interface AmendmentIdentity {
  readonly headCommit: string;
  readonly headTree: string;
  readonly branch: string;
}
export interface AmendmentPlanDiff {
  readonly tier: VerificationScheduleProjection["tier"];
  readonly added: readonly string[];
  readonly removed: readonly string[];
}
export interface AmendmentEntry {
  readonly ordinal: number;
  readonly previousEntrySha256: string | null;
  readonly descriptorPath: string;
  readonly descriptorSha256: string;
  readonly decisionHeading: typeof AMENDMENT_DECISION;
  readonly invocation: AmendmentIdentity;
  readonly prior: SourceGeneration;
  readonly next: SourceGeneration;
  readonly beforePlans: readonly VerificationScheduleProjection[];
  readonly afterPlans: readonly VerificationScheduleProjection[];
  readonly diff: readonly AmendmentPlanDiff[];
  readonly contentSha256: string;
}
export interface AmendmentLedger {
  readonly schemaVersion: "verification-manifest-amendments.v1";
  readonly paths: typeof AMENDMENT_PATHS;
  readonly anchor: {
    readonly commit: string;
    readonly tree: string;
    readonly generation: SourceGeneration;
  };
  readonly entries: readonly AmendmentEntry[];
}

export const amendmentHash = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");
export const amendmentJson = (value: unknown): string =>
  `${JSON.stringify(value, null, 2)}\n`;
export const amendmentEqual = (a: unknown, b: unknown): boolean =>
  canonicalJson(a) === canonicalJson(b);

export function amendmentObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !amendmentEqual(Object.keys(value).sort(), [...keys].sort())
  )
    throw new Error(`${label} has unknown or missing fields.`);
  return value as Record<string, unknown>;
}

export function amendmentGit(root: string, ...args: readonly string[]): string {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function amendmentRelativePath(path: string): string {
  if (
    !path ||
    isAbsolute(path) ||
    /^[A-Za-z]:/u.test(path) ||
    /[\\\0\r\n]/u.test(path) ||
    path
      .split("/")
      .some((part) => !part || part === "." || part === ".." || part === ".git")
  )
    throw new Error(
      "Amendment path must be a contained repository-relative file.",
    );
  return path;
}

export async function readAmendmentFile(
  root: string,
  path: string,
): Promise<string | null> {
  amendmentRelativePath(path);
  const absolute = resolve(root, path);
  let metadata;
  try {
    metadata = await lstat(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (!metadata.isFile() || metadata.isSymbolicLink())
    throw new Error(`Amendment file is not a contained regular file: ${path}.`);
  const realRoot = await realpath(root);
  const realFile = await realpath(absolute);
  const within = relative(realRoot, realFile);
  if (!within || within.startsWith("..") || isAbsolute(within))
    throw new Error(`Amendment file is not a contained regular file: ${path}.`);
  return await readFile(absolute, "utf8");
}

export async function assertNoPendingAmendment(root: string): Promise<void> {
  if ((await readAmendmentFile(root, AMENDMENT_PENDING_PATH)) !== null)
    throw new Error(
      "Verification manifest amendment publication is incomplete; resume its recorded descriptor.",
    );
}

export function amendmentIdentity(root: string): AmendmentIdentity {
  const headCommit = amendmentGit(root, "rev-parse", "HEAD").trim();
  const headTree = amendmentGit(root, "rev-parse", "HEAD^{tree}").trim();
  const branch = amendmentGit(
    root,
    "symbolic-ref",
    "--quiet",
    "--short",
    "HEAD",
  ).trim();
  if (
    !/^[a-f0-9]{40}$/u.test(headCommit) ||
    !/^[a-f0-9]{40}$/u.test(headTree) ||
    !branch
  )
    throw new Error("Amendment requires a canonical attached Git identity.");
  return { headCommit, headTree, branch };
}

export function sourceGeneration(
  files: SourceGeneration["files"],
): SourceGeneration {
  return {
    files,
    hashes: Object.fromEntries(
      GENERATION_KEYS.map((key) => [key, amendmentHash(files[key])]),
    ) as unknown as GenerationHashes,
  };
}

export function parseSourceGeneration(value: unknown): {
  readonly generation: SourceGeneration;
  readonly input: CommissioningInput;
  readonly policy: VerificationScopePolicy;
  readonly manifest: VerificationManifest;
} {
  const record = amendmentObject(
    value,
    ["files", "hashes"],
    "Source generation",
  );
  const files = amendmentObject(
    record["files"],
    GENERATION_KEYS,
    "Generation files",
  );
  const hashes = amendmentObject(
    record["hashes"],
    GENERATION_KEYS,
    "Generation hashes",
  );
  for (const key of GENERATION_KEYS) {
    if (
      typeof files[key] !== "string" ||
      amendmentHash(files[key]) !== hashes[key]
    )
      throw new Error(`Generation ${key} hash differs from its bytes.`);
  }
  const generation = value as SourceGeneration;
  const input = assertCommissioningInput(
    JSON.parse(generation.files.input) as unknown,
  );
  const policy = assertVerificationScopePolicy(
    JSON.parse(generation.files.policy) as unknown,
  );
  const manifest = assertVerificationManifest(
    JSON.parse(generation.files.manifest) as unknown,
  );
  if (
    input.commissioning.id !== SOURCE_COMMISSIONING_ID ||
    generation.files.manifest !==
      canonicalManifestBytes(
        manifestFromInput(input, manifest.commissioning.createdAt),
      ).toString("utf8")
  )
    throw new Error(
      "Source generation does not match the canonical commissioning input render.",
    );
  sourceScheduleGeneration(manifest, policy);
  return { generation, input, policy, manifest };
}

export function assertAmendmentDescriptor(value: unknown): AmendmentDescriptor {
  const record = amendmentObject(
    value,
    ["schemaVersion", "paths", "expected", "proposed", "decisionHeading"],
    "Amendment descriptor",
  );
  const expected = amendmentObject(
    record["expected"],
    ["hashes", "chainTip"],
    "Descriptor expectation",
  );
  const hashes = amendmentObject(
    expected["hashes"],
    GENERATION_KEYS,
    "Descriptor hashes",
  );
  const proposed = amendmentObject(
    record["proposed"],
    ["input", "policy"],
    "Descriptor proposal",
  );
  if (
    record["schemaVersion"] !== "verification-manifest-amendment-request.v1" ||
    !amendmentEqual(record["paths"], AMENDMENT_PATHS) ||
    record["decisionHeading"] !== AMENDMENT_DECISION ||
    !GENERATION_KEYS.every(
      (key) =>
        typeof hashes[key] === "string" && /^[a-f0-9]{64}$/u.test(hashes[key]),
    ) ||
    !(
      expected["chainTip"] === null ||
      (typeof expected["chainTip"] === "string" &&
        /^[a-f0-9]{64}$/u.test(expected["chainTip"]))
    ) ||
    typeof proposed["input"] !== "string" ||
    typeof proposed["policy"] !== "string"
  )
    throw new Error(
      "Amendment descriptor identity, paths, hashes, or proposal is invalid.",
    );
  assertCommissioningInput(JSON.parse(proposed["input"]) as unknown);
  assertVerificationScopePolicy(JSON.parse(proposed["policy"]) as unknown);
  return value as AmendmentDescriptor;
}

export function expectedSourceGeneration(
  anchor: SourceGeneration,
  version: "v1" | "v2",
): SourceGeneration {
  if (version === "v1") return anchor;
  const baseline = parseSourceGeneration(anchor);
  const input: CommissioningInput = {
    ...baseline.input,
    focusedCommands: recomposeSourceCommands(baseline.input.focusedCommands),
    scopePolicyId: SOURCE_SCOPE_V2,
  };
  return sourceGeneration({
    input: amendmentJson(input),
    policy: amendmentJson(recomposeSourcePolicy(baseline.policy)),
    manifest: canonicalManifestBytes(
      manifestFromInput(input, baseline.manifest.commissioning.createdAt),
    ).toString("utf8"),
  });
}

export function assertAllowedGeneration(
  anchor: SourceGeneration,
  generation: SourceGeneration,
): void {
  const parsed = parseSourceGeneration(generation);
  const version = sourceScheduleGeneration(parsed.manifest, parsed.policy);
  const expected = version ? expectedSourceGeneration(anchor, version) : null;
  // The committed request and ledger bind exact source text. Formatting may
  // differ for v2, but every parsed field and canonical manifest must equal
  // the reviewed transformation. Reversal restores the exact original bytes.
  const permitted =
    expected &&
    (version === "v1"
      ? amendmentEqual(generation, expected)
      : amendmentEqual(parsed.input, parseSourceGeneration(expected).input) &&
        amendmentEqual(parsed.policy, parseSourceGeneration(expected).policy) &&
        generation.files.manifest === expected.files.manifest);
  if (!permitted)
    throw new Error(
      "Amendment changes fields outside the reviewed source schedule and policy.",
    );
}

export function amendmentContentEqual(
  left: SourceGeneration,
  right: SourceGeneration,
): boolean {
  const parsedLeft = parseSourceGeneration(left);
  const parsedRight = parseSourceGeneration(right);
  return (
    amendmentEqual(parsedLeft.input, parsedRight.input) &&
    amendmentEqual(parsedLeft.policy, parsedRight.policy) &&
    amendmentEqual(parsedLeft.manifest, parsedRight.manifest)
  );
}

export function amendmentPlanDiff(
  before: readonly VerificationScheduleProjection[],
  after: readonly VerificationScheduleProjection[],
): readonly AmendmentPlanDiff[] {
  return before.map((plan, index) => {
    const next = after[index];
    if (!next || next.tier !== plan.tier)
      throw new Error("Amendment tier plans have different contexts or order.");
    return {
      tier: plan.tier,
      added: next.actualCheckIds.filter(
        (id) => !plan.actualCheckIds.includes(id),
      ),
      removed: plan.actualCheckIds.filter(
        (id) => !next.actualCheckIds.includes(id),
      ),
    };
  });
}

export function amendmentEntryHash(
  entry: Omit<AmendmentEntry, "contentSha256"> | AmendmentEntry,
): string {
  const unsigned = Object.fromEntries(
    Object.entries(entry).filter(([key]) => key !== "contentSha256"),
  );
  return amendmentHash(canonicalJson(unsigned));
}

function generationAt(root: string, commit: string): SourceGeneration {
  return sourceGeneration(
    Object.fromEntries(
      GENERATION_KEYS.map((key) => [
        key,
        amendmentGit(root, "show", `${commit}:${AMENDMENT_PATHS[key]}`),
      ]),
    ) as unknown as SourceGeneration["files"],
  );
}

export function commissionedSourceAnchor(
  root: string,
): AmendmentLedger["anchor"] {
  const commit = amendmentGit(
    root,
    "log",
    "--reverse",
    "--format=%H",
    "--diff-filter=A",
    "HEAD",
    "--",
    AMENDMENT_PATHS.manifest,
  )
    .trim()
    .split("\n")[0];
  if (!commit)
    throw new Error(
      "Source amendment requires a committed original commissioning anchor.",
    );
  const generation = generationAt(root, commit);
  const original = parseSourceGeneration(generation);
  if (sourceScheduleGeneration(original.manifest, original.policy) !== "v1")
    throw new Error(
      "Source commissioning Git anchor must be the original v1 generation.",
    );
  amendmentGit(
    root,
    "merge-base",
    "--is-ancestor",
    original.manifest.commissioning.baseCommit,
    commit,
  );
  if (original.manifest.commissioning.baseCommit === commit)
    throw new Error(
      "Source commissioning anchor must follow its authority base.",
    );
  return {
    commit,
    tree: amendmentGit(root, "rev-parse", `${commit}^{tree}`).trim(),
    generation,
  };
}

function validateLedger(
  root: string,
  value: unknown,
  anchor: AmendmentLedger["anchor"],
  boundCommit: string,
): AmendmentLedger {
  const record = amendmentObject(
    value,
    ["schemaVersion", "paths", "anchor", "entries"],
    "Amendment ledger",
  );
  if (
    record["schemaVersion"] !== "verification-manifest-amendments.v1" ||
    !amendmentEqual(record["paths"], AMENDMENT_PATHS) ||
    !amendmentEqual(record["anchor"], anchor) ||
    !Array.isArray(record["entries"]) ||
    record["entries"].length === 0
  )
    throw new Error(
      "Amendment ledger has an invalid Git anchor, paths, or entries.",
    );
  const ledger = value as AmendmentLedger;
  let previous: AmendmentEntry | null = null;
  for (const [index, entry] of ledger.entries.entries()) {
    amendmentObject(
      entry,
      [
        "ordinal",
        "previousEntrySha256",
        "descriptorPath",
        "descriptorSha256",
        "decisionHeading",
        "invocation",
        "prior",
        "next",
        "beforePlans",
        "afterPlans",
        "diff",
        "contentSha256",
      ],
      "Amendment entry",
    );
    amendmentObject(
      entry.invocation,
      ["headCommit", "headTree", "branch"],
      "Amendment invocation",
    );
    if (
      !/^[a-f0-9]{40}$/u.test(entry.invocation.headCommit) ||
      !/^[a-f0-9]{40}$/u.test(entry.invocation.headTree)
    )
      throw new Error(
        "Amendment invocation requires exact commit and tree identities.",
      );
    if (
      entry.ordinal !== index + 1 ||
      entry.previousEntrySha256 !== (previous?.contentSha256 ?? null) ||
      entry.contentSha256 !== amendmentEntryHash(entry) ||
      !amendmentEqual(entry.prior, previous?.next ?? anchor.generation)
    )
      throw new Error("Amendment ledger hash chain is invalid.");
    assertAllowedGeneration(anchor.generation, entry.prior);
    assertAllowedGeneration(anchor.generation, entry.next);
    if (amendmentContentEqual(entry.prior, entry.next))
      throw new Error("Amendment ledger contains a no-op.");
    amendmentGit(
      root,
      "merge-base",
      "--is-ancestor",
      entry.invocation.headCommit,
      boundCommit,
    );
    amendmentGit(
      root,
      "merge-base",
      "--is-ancestor",
      anchor.commit,
      entry.invocation.headCommit,
    );
    const prefixHistory = amendmentGit(
      root,
      "log",
      "-1",
      "--format=%H",
      entry.invocation.headCommit,
      "--",
      AMENDMENT_LEDGER_PATH,
    ).trim();
    if (index === 0) {
      if (prefixHistory)
        throw new Error(
          "First amendment invocation already has a ledger history.",
        );
    } else {
      const prefix = amendmentObject(
        JSON.parse(
          amendmentGit(
            root,
            "show",
            `${entry.invocation.headCommit}:${AMENDMENT_LEDGER_PATH}`,
          ),
        ) as unknown,
        ["schemaVersion", "paths", "anchor", "entries"],
        "Invocation ledger prefix",
      );
      if (
        !amendmentEqual(prefix["entries"], ledger.entries.slice(0, index)) ||
        !amendmentEqual(prefix["anchor"], anchor) ||
        !amendmentEqual(prefix["paths"], AMENDMENT_PATHS)
      )
        throw new Error(
          "Amendment invocation does not extend its exact committed ledger prefix.",
        );
    }
    if (
      entry.invocation.headTree !==
        amendmentGit(
          root,
          "rev-parse",
          `${entry.invocation.headCommit}^{tree}`,
        ).trim() ||
      entry.invocation.branch !==
        parseSourceGeneration(anchor.generation).input.commissioning
          .targetBranch
    )
      throw new Error("Amendment invocation Git identity is invalid.");
    const descriptorText = amendmentGit(
      root,
      "show",
      `${entry.invocation.headCommit}:${amendmentRelativePath(entry.descriptorPath)}`,
    );
    const descriptor = assertAmendmentDescriptor(
      JSON.parse(descriptorText) as unknown,
    );
    if (
      amendmentHash(descriptorText) !== entry.descriptorSha256 ||
      descriptor.decisionHeading !== entry.decisionHeading ||
      !amendmentEqual(descriptor.expected, {
        hashes: entry.prior.hashes,
        chainTip: entry.previousEntrySha256,
      }) ||
      !amendmentEqual(descriptor.proposed, {
        input: entry.next.files.input,
        policy: entry.next.files.policy,
      })
    )
      throw new Error("Amendment entry differs from its committed descriptor.");
    const decisions = amendmentGit(
      root,
      "show",
      `${entry.invocation.headCommit}:docs/decision-log.md`,
    );
    if (!decisions.split(/\r?\n/u).includes(`## ${entry.decisionHeading}`))
      throw new Error(
        "Amendment decision heading is not committed at invocation.",
      );
    for (const plans of [entry.beforePlans, entry.afterPlans]) {
      if (!Array.isArray(plans) || plans.length !== 4)
        throw new Error("Amendment must record every tier projection.");
      plans.forEach(assertVerificationScheduleProjection);
      if (
        !amendmentEqual(
          plans.map(({ tier }) => tier),
          ["iteration", "candidate", "milestone", "periodic"],
        )
      )
        throw new Error("Amendment tier projection ordering is invalid.");
    }
    for (const [generation, plans] of [
      [entry.prior, entry.beforePlans],
      [entry.next, entry.afterPlans],
    ] as const) {
      const { manifest, policy } = parseSourceGeneration(generation);
      const catalogue = buildScopeCheckCatalogue(manifest);
      for (const plan of plans) {
        // The persisted context is commissioning.ts in the source workspace.
        // Reproduce its tag selection and direct workspace/trigger additions
        // without consulting a future checkout's changed-file context.
        const selected = new Set(
          manifest.focusedCommands
            .filter((command) => command.tiers.includes(plan.tier as never))
            .map(({ id }) => id),
        );
        if (plan.tier === "candidate" || plan.tier === "milestone") {
          for (const id of [
            ...policy.mandatoryChecks["orchestrator-evidence"],
            ...(policy.workspaceChecks["@milestone-loop/orchestrator"] ?? []),
          ])
            selected.add(id);
        }
        if (plan.tier === "milestone" || plan.tier === "periodic")
          selected.add("exact-readiness");
        const ids = orderScopeCheckIds(selected, catalogue);
        const commands = ids.map((id) => {
          const command = catalogue.entries.find((entry) => entry.id === id)!;
          return {
            id,
            argv: command.argv,
            expectedArtifactKinds: command.expectedArtifactKinds,
          };
        });
        if (
          !amendmentEqual(plan.actualCheckIds, ids) ||
          !amendmentEqual(plan.commands, commands)
        )
          throw new Error(
            "Amendment projections differ from their recorded generation and fixed commissioning context.",
          );
      }
    }
    if (
      !amendmentEqual(
        entry.diff,
        amendmentPlanDiff(entry.beforePlans, entry.afterPlans),
      ) ||
      !amendmentEqual(entry.beforePlans[0], entry.afterPlans[0]) ||
      !amendmentEqual(entry.beforePlans[3], entry.afterPlans[3])
    )
      throw new Error(
        "Amendment tier diff changes iteration or exact periodic closure.",
      );
    previous = entry;
  }
  return ledger;
}

export async function inspectSourceAmendmentAudit(
  root: string,
  options: {
    readonly ignorePending?: boolean;
    readonly liveFiles?: SourceGeneration;
    readonly ledgerText?: string | null;
  } = {},
): Promise<{
  readonly anchor: AmendmentLedger["anchor"];
  readonly generation: SourceGeneration;
  readonly ledger: AmendmentLedger | null;
  readonly ledgerText: string | null;
}> {
  if (!options.ignorePending) await assertNoPendingAmendment(root);
  const anchor = commissionedSourceAnchor(root);
  const head = amendmentIdentity(root).headCommit;
  const changes = amendmentGit(
    root,
    "log",
    "--reverse",
    "--format=%H",
    "HEAD",
    "--",
    AMENDMENT_LEDGER_PATH,
  )
    .trim()
    .split("\n")
    .filter(Boolean);
  let committed: AmendmentLedger | null = null;
  for (const commit of changes) {
    const text = amendmentGit(
      root,
      "show",
      `${commit}:${AMENDMENT_LEDGER_PATH}`,
    );
    const ledger = validateLedger(
      root,
      JSON.parse(text) as unknown,
      anchor,
      commit,
    );
    if (
      committed &&
      !amendmentEqual(
        ledger.entries.slice(0, committed.entries.length),
        committed.entries,
      )
    )
      throw new Error(
        "Committed amendment ledger prefix was rewritten or truncated.",
      );
    committed = ledger;
  }
  const ledgerText =
    options.ledgerText === undefined
      ? await readAmendmentFile(root, AMENDMENT_LEDGER_PATH)
      : options.ledgerText;
  const ledger =
    ledgerText === null
      ? null
      : validateLedger(root, JSON.parse(ledgerText) as unknown, anchor, head);
  if (
    committed &&
    (!ledger ||
      !amendmentEqual(
        ledger.entries.slice(0, committed.entries.length),
        committed.entries,
      ))
  )
    throw new Error(
      "Live amendment ledger was deleted, truncated, or differs from its committed prefix.",
    );
  const committedLength = committed?.entries.length ?? 0;
  if (
    ledger &&
    (ledger.entries.length > committedLength + 1 ||
      (ledger.entries.length > committedLength &&
        ledger.entries.at(-1)?.invocation.headCommit !== head))
  )
    throw new Error(
      "Uncommitted amendment extension must belong to the current HEAD.",
    );
  const live =
    options.liveFiles ??
    sourceGeneration(
      Object.fromEntries(
        await Promise.all(
          GENERATION_KEYS.map(async (key) => {
            const text = await readAmendmentFile(root, AMENDMENT_PATHS[key]);
            if (text === null)
              throw new Error(
                `Source generation file is missing: ${AMENDMENT_PATHS[key]}.`,
              );
            return [key, text];
          }),
        ),
      ) as unknown as SourceGeneration["files"],
    );
  parseSourceGeneration(live);
  if (!amendmentEqual(live, ledger?.entries.at(-1)?.next ?? anchor.generation))
    throw new Error(
      "Active input, policy, or manifest differs from its Git-anchored amendment generation.",
    );
  return { anchor, generation: live, ledger, ledgerText };
}

export async function assertActiveCommissioningAudit(
  root: string,
): Promise<void> {
  await assertNoPendingAmendment(root);
  // Generated adopters commission a different input and retain their bootstrap
  // lifecycle. Source deletion is detected from history, not from a live ID.
  const sourceHistory = amendmentGit(
    root,
    "log",
    "-1",
    "--format=%H",
    "HEAD",
    "--",
    AMENDMENT_PATHS.input,
  ).trim();
  if (
    sourceHistory ||
    (await readAmendmentFile(root, AMENDMENT_LEDGER_PATH)) !== null
  )
    await inspectSourceAmendmentAudit(root);
}
