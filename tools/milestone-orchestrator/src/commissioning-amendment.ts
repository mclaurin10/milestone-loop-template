import { randomUUID } from "node:crypto";
import { link, lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import {
  assertCanonicalProtectedFloor,
  assertFocusedPackageCommands,
  canonicalManifestBytes,
  constructTierPlans,
  inspectCommissionedRepository,
  manifestFromInput,
  type CommissioningDoctorDiagnostic,
} from "./commissioning.js";
import {
  AMENDMENT_LEDGER_PATH,
  AMENDMENT_PATHS,
  AMENDMENT_PENDING_PATH,
  GENERATION_KEYS,
  amendmentEntryHash,
  amendmentEqual,
  amendmentGit,
  amendmentHash,
  amendmentIdentity,
  amendmentJson,
  amendmentObject,
  amendmentPlanDiff,
  amendmentRelativePath,
  assertAllowedGeneration,
  assertAmendmentDescriptor,
  inspectSourceAmendmentAudit,
  parseSourceGeneration,
  readAmendmentFile,
  sourceGeneration,
  type AmendmentDescriptor,
  type AmendmentEntry,
  type AmendmentIdentity,
  type AmendmentLedger,
  type SourceGeneration,
} from "./commissioning-audit.js";
import {
  loadConfig,
  loadInvariantSuiteRegistry,
  loadPackageDefaultVerificationProfile,
} from "./config.js";
import {
  ControllerLease,
  releaseLeaseWithoutMasking,
} from "./controller-lease.js";
import { validateCommissionedAuthorityAnchor } from "./authority-anchor.js";
import { buildCanonicalProtectedSet } from "./protected-roots.js";
import { ensureContainedDirectory } from "./path-safety.js";
import { exclusiveWriteSerialized } from "./state-store.js";
import {
  assertVerificationManifestRegistryIdentities,
  assertVerificationManifestTargetBranch,
  resolveVerificationManifestProfile,
} from "./verification-manifest.js";

export interface AmendmentIntent {
  readonly schemaVersion: "verification-manifest-amendment-intent.v1";
  readonly invocation: AmendmentIdentity;
  readonly descriptorPath: string;
  readonly descriptorSha256: string;
  readonly prior: SourceGeneration;
  readonly next: SourceGeneration;
  readonly priorLedgerText: string | null;
  readonly nextLedgerText: string;
}

export interface AmendmentResult {
  readonly schemaVersion: "verification-manifest-amendment-result.v1";
  readonly status: "PASS";
  readonly completionEligible: false;
  readonly resumed: boolean;
  readonly invocation: AmendmentIdentity;
  readonly descriptorPath: string;
  readonly descriptorSha256: string;
  readonly entrySha256: string;
  readonly ledgerPath: typeof AMENDMENT_LEDGER_PATH;
  readonly ledgerSha256: string;
  readonly before: SourceGeneration["hashes"];
  readonly after: SourceGeneration["hashes"];
  readonly diff: AmendmentEntry["diff"];
  readonly doctor: CommissioningDoctorDiagnostic;
}

export interface AmendmentHooks {
  readonly afterIntent?: () => Promise<void> | void;
  readonly beforeReplace?: (path: string) => Promise<void> | void;
  readonly afterReplace?: (path: string) => Promise<void> | void;
  readonly afterStagedFile?: (path: string) => Promise<void> | void;
  readonly afterFinalization?: () => Promise<void> | void;
}

async function generationPlans(
  root: string,
  generation: SourceGeneration,
  identity: AmendmentIdentity,
) {
  const parsed = parseSourceGeneration(generation);
  const config = await loadConfig(root);
  const invariant = await loadInvariantSuiteRegistry(root);
  const profile = await loadPackageDefaultVerificationProfile(root);
  assertVerificationManifestTargetBranch(parsed.manifest, config.targetBranch);
  assertVerificationManifestRegistryIdentities(
    parsed.manifest,
    invariant.value.id,
    parsed.policy.id,
  );
  resolveVerificationManifestProfile(parsed.manifest, profile.value);
  const protectedPaths = buildCanonicalProtectedSet(config);
  assertCanonicalProtectedFloor(parsed.manifest, protectedPaths);
  await validateCommissionedAuthorityAnchor({
    repositoryRoot: root,
    baseCommit: parsed.manifest.commissioning.baseCommit,
    expectedImmutableContractLockSha256:
      parsed.input.sources.immutableContractLockSha256,
  });
  await assertFocusedPackageCommands(root, parsed.manifest);
  return constructTierPlans({
    repositoryRoot: root,
    manifest: parsed.manifest,
    scopePolicy: {
      path: AMENDMENT_PATHS.policy,
      absolutePath: resolve(root, AMENDMENT_PATHS.policy),
      value: parsed.policy,
      bytes: Buffer.byteLength(generation.files.policy),
      sha256: generation.hashes.policy,
    },
    protectedPaths,
    baseCommit: parsed.manifest.commissioning.baseCommit,
    headCommit: identity.headCommit,
    headTree: identity.headTree,
    workingTreeDirty: false,
  });
}

function assertAmendmentStatus(root: string, allowed: readonly string[]): void {
  if (amendmentGit(root, "diff", "--cached", "--name-only").trim())
    throw new Error("Amendment requires an unchanged Git index.");
  const entries = amendmentGit(
    root,
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  )
    .split("\0")
    .filter(Boolean);
  for (const entry of entries) {
    if (!allowed.includes(entry.slice(3).replaceAll("\\", "/")))
      throw new Error(
        `Amendment requires a clean tree except its recorded publication paths: ${entry}.`,
      );
  }
}

function assertInvocation(
  root: string,
  expected: AmendmentIdentity,
  generation: SourceGeneration,
): void {
  const identity = amendmentIdentity(root);
  const { input } = parseSourceGeneration(generation);
  if (
    !amendmentEqual(identity, expected) ||
    identity.branch !== input.commissioning.targetBranch ||
    identity.headCommit === input.commissioning.baseCommit
  )
    throw new Error(
      "Amendment HEAD, tree, or target branch changed or is invalid.",
    );
  amendmentGit(
    root,
    "merge-base",
    "--is-ancestor",
    input.commissioning.baseCommit,
    identity.headCommit,
  );
}

async function committedDescriptor(
  root: string,
  path: string,
  identity: AmendmentIdentity,
): Promise<{ text: string; descriptor: AmendmentDescriptor }> {
  amendmentRelativePath(path);
  const text = await readAmendmentFile(root, path);
  if (
    text === null ||
    text !== amendmentGit(root, "show", `${identity.headCommit}:${path}`)
  )
    throw new Error(
      "Amendment descriptor must be separately committed and unchanged.",
    );
  const descriptor = assertAmendmentDescriptor(JSON.parse(text) as unknown);
  if (
    !amendmentGit(root, "show", `${identity.headCommit}:docs/decision-log.md`)
      .split(/\r?\n/u)
      .includes(`## ${descriptor.decisionHeading}`)
  )
    throw new Error(
      "Amendment decision heading must be committed before invocation.",
    );
  return { text, descriptor };
}

function publicationFiles(intent: AmendmentIntent) {
  return [
    ...GENERATION_KEYS.map((key) => ({
      path: AMENDMENT_PATHS[key],
      prior: intent.prior.files[key],
      next: intent.next.files[key],
    })),
    {
      path: AMENDMENT_LEDGER_PATH,
      prior: intent.priorLedgerText,
      next: intent.nextLedgerText,
    },
  ];
}

async function assertPublicationState(
  root: string,
  intent: AmendmentIntent,
  requireIntent = false,
): Promise<void> {
  const recorded = await readAmendmentFile(root, AMENDMENT_PENDING_PATH);
  if (
    (requireIntent || recorded !== null) &&
    recorded !== amendmentJson(intent)
  )
    throw new Error(
      "Amendment recovery intent was changed or removed; publication refused.",
    );
  assertInvocation(root, intent.invocation, intent.prior);
  assertAmendmentStatus(root, [
    ...Object.values(AMENDMENT_PATHS),
    AMENDMENT_LEDGER_PATH,
    AMENDMENT_PENDING_PATH,
  ]);
  const descriptor = await committedDescriptor(
    root,
    intent.descriptorPath,
    intent.invocation,
  );
  if (amendmentHash(descriptor.text) !== intent.descriptorSha256)
    throw new Error("Recorded amendment descriptor changed.");
  for (const file of publicationFiles(intent)) {
    const live = await readAmendmentFile(root, file.path);
    if (live !== file.prior && live !== file.next)
      throw new Error(
        `Foreign change at ${file.path}; amendment preserves it and refuses recovery.`,
      );
  }
}

async function amendmentStagingPath(
  root: string,
  targetPath: string,
): Promise<string> {
  // The staged bytes also live durably in the intent. A process can die while
  // writing an atomic-replacement temporary, so put that scratch file in an
  // already-ignored cache. Recovery preserves orphaned temporaries and stages
  // fresh bytes; it never mistakes an unrecorded sibling for a foreign edit to
  // the generation or deletes somebody else's file to make the tree clean.
  let staging = root;
  for (const segment of [".agent", ".cache", "verification-amendments"]) {
    staging = resolve(staging, segment);
    try {
      await mkdir(staging);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const metadata = await lstat(staging);
    if (!metadata.isDirectory() || metadata.isSymbolicLink())
      throw new Error(
        "Amendment staging path must contain only real directories.",
      );
  }
  if ((await lstat(dirname(targetPath))).dev !== (await lstat(staging)).dev)
    throw new Error(
      "Amendment staging and publication must share one filesystem.",
    );
  return resolve(staging, `${randomUUID()}.tmp`);
}

async function replaceExactFile(
  root: string,
  file: ReturnType<typeof publicationFiles>[number],
  afterStagedFile?: AmendmentHooks["afterStagedFile"],
): Promise<void> {
  const path = resolve(root, file.path);
  await ensureContainedDirectory(root, dirname(path));
  const temporary = await amendmentStagingPath(root, path);
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(file.next, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await afterStagedFile?.(file.path);
  const cleanup = async () => {
    try {
      await unlink(temporary);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  };
  try {
    const live = await readAmendmentFile(root, file.path);
    if (live !== file.prior && live !== file.next)
      throw new Error(`Foreign change at ${file.path}; replacement refused.`);
    await rename(temporary, path);
  } catch (error) {
    try {
      await cleanup();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Amendment replacement and temporary-file cleanup both failed.",
        { cause: cleanupError },
      );
    }
    throw error;
  }
  await cleanup();
}

async function resultFor(
  root: string,
  intent: AmendmentIntent,
  resumed: boolean,
): Promise<AmendmentResult> {
  const audit = await inspectSourceAmendmentAudit(root);
  const entry = audit.ledger?.entries.at(-1);
  if (
    !entry ||
    entry.descriptorSha256 !== intent.descriptorSha256 ||
    audit.ledgerText !== intent.nextLedgerText
  )
    throw new Error("Amendment final audit does not identify this operation.");
  return {
    schemaVersion: "verification-manifest-amendment-result.v1",
    status: "PASS",
    completionEligible: false,
    resumed,
    invocation: intent.invocation,
    descriptorPath: intent.descriptorPath,
    descriptorSha256: intent.descriptorSha256,
    entrySha256: entry.contentSha256,
    ledgerPath: AMENDMENT_LEDGER_PATH,
    ledgerSha256: amendmentHash(intent.nextLedgerText),
    before: intent.prior.hashes,
    after: intent.next.hashes,
    diff: entry.diff,
    doctor: await inspectCommissionedRepository(root),
  };
}

export async function amendCommissionedRepository(input: {
  readonly repositoryRoot: string;
  readonly descriptorPath: string;
  readonly resume?: boolean;
  readonly hooks?: AmendmentHooks;
}): Promise<AmendmentResult> {
  const root = resolve(input.repositoryRoot);
  const descriptorPath = amendmentRelativePath(
    relative(root, resolve(root, input.descriptorPath)).replaceAll("\\", "/"),
  );
  const config = await loadConfig(root);
  const lease = await ControllerLease.acquire({
    repositoryRoot: root,
    statePath: config.statePath,
    operation: "commission-amend",
  });
  let failed = true;
  try {
    const identity = amendmentIdentity(root);
    const request = await committedDescriptor(root, descriptorPath, identity);
    const existing = await readAmendmentFile(root, AMENDMENT_PENDING_PATH);
    let intent: AmendmentIntent;
    if (existing !== null) {
      if (!input.resume)
        throw new Error(
          "An amendment publication is pending; use --resume with its descriptor.",
        );
      const record = amendmentObject(
        JSON.parse(existing) as unknown,
        [
          "schemaVersion",
          "invocation",
          "descriptorPath",
          "descriptorSha256",
          "prior",
          "next",
          "priorLedgerText",
          "nextLedgerText",
        ],
        "Amendment intent",
      );
      if (
        record["schemaVersion"] !==
          "verification-manifest-amendment-intent.v1" ||
        record["descriptorPath"] !== descriptorPath ||
        record["descriptorSha256"] !== amendmentHash(request.text) ||
        !amendmentEqual(record["invocation"], identity) ||
        typeof record["nextLedgerText"] !== "string" ||
        !(
          record["priorLedgerText"] === null ||
          typeof record["priorLedgerText"] === "string"
        )
      )
        throw new Error(
          "Pending amendment does not match this invocation and descriptor.",
        );
      intent = record as unknown as AmendmentIntent;
      const prior = await inspectSourceAmendmentAudit(root, {
        ignorePending: true,
        liveFiles: intent.prior,
        ledgerText: intent.priorLedgerText,
      });
      await inspectSourceAmendmentAudit(root, {
        ignorePending: true,
        liveFiles: intent.next,
        ledgerText: intent.nextLedgerText,
      });
      assertAllowedGeneration(prior.anchor.generation, intent.next);
      const entry = (
        JSON.parse(intent.nextLedgerText) as AmendmentLedger
      ).entries.at(-1)!;
      if (
        !amendmentEqual(
          entry.beforePlans,
          await generationPlans(root, intent.prior, identity),
        ) ||
        !amendmentEqual(
          entry.afterPlans,
          await generationPlans(root, intent.next, identity),
        )
      )
        throw new Error("Pending amendment tier plans no longer reproduce.");
    } else {
      const audit = await inspectSourceAmendmentAudit(root);
      if (input.resume) {
        const entry = audit.ledger?.entries.at(-1);
        if (
          !entry ||
          entry.descriptorPath !== descriptorPath ||
          entry.descriptorSha256 !== amendmentHash(request.text) ||
          !amendmentEqual(entry.invocation, identity)
        )
          throw new Error("No matching amendment operation exists to resume.");
        const priorLedger =
          audit.ledger!.entries.length === 1
            ? null
            : amendmentJson({
                ...audit.ledger,
                entries: audit.ledger!.entries.slice(0, -1),
              });
        intent = {
          schemaVersion: "verification-manifest-amendment-intent.v1",
          invocation: identity,
          descriptorPath,
          descriptorSha256: entry.descriptorSha256,
          prior: entry.prior,
          next: entry.next,
          priorLedgerText: priorLedger,
          nextLedgerText: audit.ledgerText!,
        };
        await assertPublicationState(root, intent);
        const result = await resultFor(root, intent, true);
        failed = false;
        return result;
      }
      assertAmendmentStatus(root, []);
      await inspectCommissionedRepository(root);
      assertInvocation(root, identity, audit.generation);
      if (
        !amendmentEqual(request.descriptor.expected, {
          hashes: audit.generation.hashes,
          chainTip: audit.ledger?.entries.at(-1)?.contentSha256 ?? null,
        })
      )
        throw new Error(
          "Amendment descriptor is stale: prior hashes or chain tip differ.",
        );
      const { input: proposedInput } = parseSourceGeneration(
        sourceGeneration({
          ...request.descriptor.proposed,
          manifest: canonicalManifestBytes(
            manifestFromInput(
              JSON.parse(request.descriptor.proposed.input) as Parameters<
                typeof manifestFromInput
              >[0],
              parseSourceGeneration(audit.generation).manifest.commissioning
                .createdAt,
            ),
          ).toString("utf8"),
        }),
      );
      const next = sourceGeneration({
        ...request.descriptor.proposed,
        manifest: canonicalManifestBytes(
          manifestFromInput(
            proposedInput,
            parseSourceGeneration(audit.generation).manifest.commissioning
              .createdAt,
          ),
        ).toString("utf8"),
      });
      assertAllowedGeneration(audit.anchor.generation, next);
      if (amendmentEqual(next, audit.generation))
        throw new Error("Amendment no-op is refused.");
      const beforePlans = await generationPlans(
        root,
        audit.generation,
        identity,
      );
      const afterPlans = await generationPlans(root, next, identity);
      const unsigned = {
        ordinal: (audit.ledger?.entries.length ?? 0) + 1,
        previousEntrySha256:
          audit.ledger?.entries.at(-1)?.contentSha256 ?? null,
        descriptorPath,
        descriptorSha256: amendmentHash(request.text),
        decisionHeading: request.descriptor.decisionHeading,
        invocation: identity,
        prior: audit.generation,
        next,
        beforePlans,
        afterPlans,
        diff: amendmentPlanDiff(beforePlans, afterPlans),
      };
      const entry: AmendmentEntry = {
        ...unsigned,
        contentSha256: amendmentEntryHash(unsigned),
      };
      const ledger: AmendmentLedger = {
        schemaVersion: "verification-manifest-amendments.v1",
        paths: AMENDMENT_PATHS,
        anchor: audit.anchor,
        entries: [...(audit.ledger?.entries ?? []), entry],
      };
      intent = {
        schemaVersion: "verification-manifest-amendment-intent.v1",
        invocation: identity,
        descriptorPath,
        descriptorSha256: amendmentHash(request.text),
        prior: audit.generation,
        next,
        priorLedgerText: audit.ledgerText,
        nextLedgerText: amendmentJson(ledger),
      };
      await inspectSourceAmendmentAudit(root, {
        liveFiles: next,
        ledgerText: intent.nextLedgerText,
      });
      await assertPublicationState(root, intent);
      const pendingPath = resolve(root, AMENDMENT_PENDING_PATH);
      const stagedIntentPath = await amendmentStagingPath(root, pendingPath);
      if (
        (await exclusiveWriteSerialized(
          stagedIntentPath,
          amendmentJson(intent),
        )) !== "created"
      )
        throw new Error("Amendment staging intent already exists.");
      // Exclusive hard-link publication exposes only the fsynced complete
      // intent. A crash on either side leaves scratch in the ignored cache.
      await link(stagedIntentPath, pendingPath);
      await unlink(stagedIntentPath);
      await input.hooks?.afterIntent?.();
    }
    for (const file of publicationFiles(intent)) {
      await input.hooks?.beforeReplace?.(file.path);
      await assertPublicationState(root, intent, true);
      if ((await readAmendmentFile(root, file.path)) !== file.next)
        await replaceExactFile(root, file, input.hooks?.afterStagedFile);
      await input.hooks?.afterReplace?.(file.path);
    }
    await assertPublicationState(root, intent, true);
    await inspectSourceAmendmentAudit(root, { ignorePending: true });
    if (
      (await readAmendmentFile(root, AMENDMENT_PENDING_PATH)) !==
      amendmentJson(intent)
    )
      throw new Error(
        "Amendment recovery intent was changed; finalization refused.",
      );
    await unlink(resolve(root, AMENDMENT_PENDING_PATH));
    await input.hooks?.afterFinalization?.();
    const result = await resultFor(root, intent, input.resume === true);
    failed = false;
    return result;
  } finally {
    await releaseLeaseWithoutMasking(() => lease.release(), failed);
  }
}
