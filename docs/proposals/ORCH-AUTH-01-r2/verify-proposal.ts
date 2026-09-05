import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { evidenceContext, writeReceipt, writeManualEvidenceFailure } from '../../../tools/evidence.mjs';
import { validateCommandReceiptDirectory } from '../../../tools/milestone-orchestrator/src/verifier.js';

import { NORMATIVE_PATHS, classifyProposalFile, createProposalReview, assertAdvisoryRefresh } from './proposal-review.js';

// Document integrity only. This command neither approves nor activates authority.
const dir = import.meta.dirname;
const root = resolve(dir, '../../..');
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 8_388_608 }).trim();
const read = (path: string) => readFile(resolve(dir, path));
const json = async (path: string) => JSON.parse((await read(path)).toString('utf8'));
const emit = async (path: string, value: unknown) => writeFile(resolve(dir, path), JSON.stringify(value, null, 2) + '\n');
const sort = (values: string[]) => [...values].sort();
const args = process.argv.slice(2);
assert(args.length === 0 || (args.length === 1 && ['--seal','--refresh-package'].includes(args[0]!)));
assert.equal(process.version, 'v24.18.0');
const auditSubdirectory='audit/run-'+new Date().toISOString().replaceAll(/[^0-9]/g,'')+'-'+process.pid;
process.env.LOOP_VERIFY_COMMAND_ARTIFACT_DIR = resolve(dir, auditSubdirectory);
const context = await evidenceContext('authority-proposal-integrity', 'ORCH-AUTH-01-r2-document-audit');
const checks: { id: string; summary: string }[] = [];
const checked = (id: string, summary: string) => checks.push({ id, summary });

function leaves(value: any, pointer = ''): { pointer: string; value: any }[] {
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => leaves(child, pointer + '/' + key.replaceAll('~', '~0').replaceAll('/', '~1')));
  }
  return [{ pointer, value }];
}

async function filesUnder(path = ''): Promise<string[]> {
  const items = await readdir(resolve(dir, path), { withFileTypes: true });
  const files: string[] = [];
  for (const item of items) {
    assert(!item.isSymbolicLink(), 'No proposal symlinks: ' + item.name);
    const relative = path ? path + '/' + item.name : item.name;
    if (item.isDirectory()) files.push(...await filesUnder(relative));
    else files.push(relative);
  }
  return files;
}

try {
  const baseline = await json('baseline-index.json');
  assert.equal(git('rev-parse', 'HEAD'), baseline.commit);
  assert.equal(git('rev-parse', 'HEAD^{tree}'), baseline.tree);
  git('diff', '--exit-code');
  git('diff', '--cached', '--exit-code');
  git('diff', '--check');
  const status = git('status', '--porcelain=v1', '--untracked-files=all');
  for (const line of status.split(/\r?\n/u).filter(Boolean)) {
    assert(line === '?? "Implementation-ready improvement plan 8-5-26.txt"' || (line.startsWith('?? docs/proposals/ORCH-AUTH-01/') || line.startsWith('?? docs/proposals/ORCH-AUTH-01-r2/')), 'Unexpected working-tree change: ' + line);
  }
  assert.equal(baseline.files.length, 26);
  for (const entry of baseline.files) {
    const bytes = await readFile(resolve(root, entry.path));
    assert.equal(bytes.length, entry.bytes, entry.path);
    assert.equal(sha(bytes), entry.sha256, entry.path);
  }
  for (const commit of [baseline.authorityBaseCommit, baseline.scheduleAnchorCommit]) {
    assert.match(commit, /^[a-f0-9]{40}$/u);
    assert.notEqual(commit, baseline.commit);
    git('merge-base', '--is-ancestor', commit, baseline.commit);
  }
  checked('ACTIVE-UNCHANGED', 'Exact HEAD/tree and all 26 protected file hashes match inspection; no tracked/index changes, only the proposal and protected pre-existing roadmap are untracked.');

  const priorBaseline=await json('revision-baseline.json');
  assert.equal(priorBaseline.priorDirectory,'docs/proposals/ORCH-AUTH-01');
  assert.equal(priorBaseline.priorContentDigest,'333bb70e0db13459304a9051fcbd862a567d7debf62bb6d6ebfc5c6c22a1011a');
  const priorRoot=resolve(root,priorBaseline.priorDirectory);
  for(const entry of priorBaseline.files){
    const bytes=await readFile(resolve(priorRoot,entry.path));assert.equal(bytes.length,entry.bytes);assert.equal(sha(bytes),entry.sha256,entry.path);
  }
  const priorReview=await json('prior-review-manifest.json');
  assert.equal(sha(JSON.stringify(priorReview.payload)),priorReview.contentDigest);
  assert.equal(priorReview.contentDigest,priorBaseline.priorContentDigest);
  assert.equal(sha(await read('prior-review-manifest.json')),priorBaseline.priorReviewManifestSha256);
  assert.deepEqual(await read('prior-review-manifest.json'),await readFile(resolve(priorRoot,'review-manifest.json')));
  for(const entry of priorReview.payload.files){const bytes=await readFile(resolve(priorRoot,entry.path));assert.equal(bytes.length,entry.bytes);assert.equal(sha(bytes),entry.sha256);}
  await validateCommandReceiptDirectory({directory:resolve(priorRoot,'audit'),expectedStageId:'authority-proposal-integrity',expectedCommandId:'ORCH-AUTH-01-document-audit',requiredKinds:['authority-proposal-audit','authority-proposal-content-manifest']});
  checked('PRIOR-REVIEW-PRESERVED','All 33 original proposal files, the exact r1 seal, original receipt and artifacts remain unchanged. User agreement is refinement direction only.');
  const legacy = await json('baseline/evals/acceptance-manifest.json');
  const oldLock = await json('baseline/evals/immutable-contract-lock.json');
  assert.equal(oldLock.schemaVersion, '1.0.0');
  assert.deepEqual(oldLock.calibrationTransition, { state: 'open_not_started', completedCount: 0, maximumCount: 1, recordPath: null });
  const authorityPaths = oldLock.files.map((entry: any) => entry.path);
  assert.equal(authorityPaths.length, 4);
  for (const path of [...authorityPaths, 'evals/immutable-contract-lock.json']) {
    assert.deepEqual(await read('baseline/' + path), await readFile(resolve(root, path)), path);
  }
  for (const entry of oldLock.files) {
    assert.equal(entry.baselineSha256, entry.activeSha256);
    assert.equal(sha(await read('baseline/' + entry.path)), entry.activeSha256);
  }
  checked('LEGACY-BYTES', 'Four authority files and original lock are preserved byte-for-byte; original active/baseline hashes and unused CAL-1 state agree.');

  const manifest = await json('proposed/evals/acceptance-manifest.json');
  const mapping = await json('acceptance-mapping.json');
  const proposedLock = await json('proposed/evals/immutable-contract-lock.json');
  const commands = await json('proposed/source-command-contract.json');
  assert.equal(manifest.schemaVersion, 'source-template-acceptance.v1');
  assert.equal(manifest.contractId, 'milestone-loop-orchestrator-source.v1');
  assert.equal(manifest.authorityEpoch, 'orch-template.v1');
  assert.equal(manifest.claimScope, 'orchestrator-template');
  assert.equal(mapping.legacyManifestSha256, sha(await read('baseline/evals/acceptance-manifest.json')));
  const oldLeaves = leaves(legacy);
  assert.equal(oldLeaves.length, 87);
  const mappedLeaves = new Map(mapping.legacyManifestLeaves.map((row: any) => [row.pointer, row]));
  assert.equal(mappedLeaves.size, oldLeaves.length);
  assert.equal(mapping.legacyManifestLeaves.length, oldLeaves.length);
  for (const leaf of oldLeaves) {
    const row: any = mappedLeaves.get(leaf.pointer);
    assert(row, leaf.pointer);
    assert.deepEqual(row.value, leaf.value, leaf.pointer);
    assert(row.disposition.length > 0 && row.explanation.length > 0);
  }
  const oldIds = oldLeaves.filter(({ pointer }) => /\/(?:id|gateId|successGateId|integrityGateId|additiveRequirementId)$/u.test(pointer) || /^\/operationalChains\/[0-9]+$/u.test(pointer)).map(({ value }) => value);
  assert.equal(new Set(oldIds).size, 24);
  assert.deepEqual(sort(mapping.legacyIds.map((row: any) => row.oldId)), sort(oldIds));
  const newIds = new Set<string>(leaves(manifest).filter(({ pointer }) => /\/id$/u.test(pointer)).map(({ value }) => value));
  for (const row of [...mapping.legacyIds, ...mapping.legacyManifestLeaves]) {
    for (const id of row.newIds) assert(newIds.has(id), 'Unknown mapping target: ' + id);
    if (row.oldRequirementId) assert(oldIds.includes(row.oldRequirementId));
  }
  assert.deepEqual(mapping.goalSections.map((row: any) => row.section), Array.from({ length: 10 }, (_, i) => String(i + 1)));
  checked('ACCEPTANCE-MAPPING', 'All 24 legacy IDs, all 87 exact JSON leaf values and all ten goal sections have explicit dispositions; all replacement IDs exist.');

  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const verifierText = await readFile(resolve(root, 'scripts/verify.mjs'), 'utf8');
  const declaredScripts = [...verifierText.matchAll(/scripts:\s*\[([^\]]*)\]/gs)].flatMap(match => [...match[1]!.matchAll(/"([^"]+)"/g)].map(item => item[1]!));
  const expectedCommands = [...new Set([...declaredScripts, ...Object.keys(pkg.scripts).filter(key => key.startsWith('verify:domain-')), 'verify:dependencies', 'lint:architecture', 'pnpm verify'])];
  assert.equal(expectedCommands.length, 33);
  assert.deepEqual(sort(mapping.commands.map((row: any) => row.oldCommand)), sort(expectedCommands));
  for (const row of mapping.commands) {
    assert.equal(row.oldDefinition, pkg.scripts[row.oldCommand] ?? null);
    if (row.sourceReplacement) assert(commands.packageAdditions.scripts[row.sourceReplacement]);
  }
  for (const name of Object.keys(commands.packageAdditions.scripts)) assert(!Object.hasOwn(pkg.scripts, name), name + ' must be additive');
  assert.equal(commands.preserveExistingPackageScriptDefinitions, true);
  assert.equal(commands.existingDownstreamAndBootstrapRegistries, 'unchanged');
  assert.equal(commands.packageAdditions.milestoneLoop.verification.defaultProfile, pkg.milestoneLoop.verification.defaultProfile);
  assert.equal(commands.packageAdditions.milestoneLoop.verification.contractId, manifest.contractId);
  assert.equal(commands.sourceCommissioningIdentity, manifest.contractId);
  assert.equal(commands.packageAdditions.milestoneLoop.productionBuild.script, 'build:production');
  checked('COMMAND-MAPPING', 'All 33 directly declared aggregate/domain-placeholder commands retain exact old definitions; nine proposed scripts are additive and source scheduling has its own anchored contract.');

  const requirementIds = manifest.requirements.map((row: any) => row.id);
  assert.equal(requirementIds.length, 12);
  assert.equal(new Set(requirementIds).size, 12);
  assert.equal(manifest.negativeScenarios.length, 16);
  assert.deepEqual(manifest.negativeScenarios.map((row: any) => row.id), Array.from({ length: 16 }, (_, i) => 'NEG-' + String(i + 1).padStart(2, '0')));
  for (const row of [...manifest.requirements, ...manifest.negativeScenarios]) {
    assert.deepEqual(row.requiredPlatforms, ['windows', 'linux']);
    if (row.requirementIds) for (const id of row.requirementIds) assert(requirementIds.includes(id));
    else { assert.equal(row.required, true); assert(row.requiredArtifactKinds.length > 0); }
  }
  for (const row of manifest.negativeScenarios) {
    assert.equal(row.requiredVariantFraction, 1);
    assert.equal(row.earlierInfrastructureFailureSatisfiesScenario, false);
  }
  const stages = commands.sourceStages;
  assert.equal(manifest.plannedCommandSurface.sourceStages,undefined);
  assert.equal(stages.length, 11);
  assert.equal(new Set(stages.map((row: any) => row.id)).size, 11);
  const priorStages=JSON.parse(await readFile(resolve(priorRoot,'proposed/evals/acceptance-manifest.json'),'utf8')).plannedCommandSurface.sourceStages;
  assert.deepEqual(stages, priorStages, 'Full qualification stage obligations changed from r1');
  for (const stage of stages) {
    assert.equal(stage.required, true);
    for (const name of stage.scripts) assert(pkg.scripts[name] || commands.packageAdditions.scripts[name]);
    for (const id of stage.acceptanceIds) assert(requirementIds.includes(id));
  }
  const domains = stages.find((row: any) => row.id === 'orchestration-domain').acceptanceIds;
  assert.equal(domains.length, 8);
  assert.deepEqual(sort(domains), sort(requirementIds.slice(3, 11)));
  assert.deepEqual(stages.find((row: any) => row.id === 'source-acceptance').acceptanceIds, requirementIds);
  assert.equal(commands.candidateScriptOrder[0], 'test:invariants');
  assert.equal(new Set(commands.candidateScriptOrder).size, commands.candidateScriptOrder.length);
  assert.deepEqual(commands.candidateScriptOrder.filter((name: string) => name.startsWith('test:partition:')), ['test:partition:controller-runtime', 'test:partition:repository-tooling', 'test:partition:adopter-template', 'test:partition:trusted-container-fixture']);
  assert(!commands.candidateScriptOrder.some((name: string) => name.startsWith('verify:domain-')));
  checked('WORKFLOW-COVERAGE', 'Twelve outcomes, eight domains, sixteen mandatory failure families and eleven stages are internally consistent; all references resolve and all four partitions remain once with invariants first.');

  const priorManifest=JSON.parse(await readFile(resolve(priorRoot,'proposed/evals/acceptance-manifest.json'),'utf8'));
  for(const key of ['requirements','negativeScenarios','completionMetrics','humanAcceptanceGate','requiredToolchain','platforms','calibration','claimBoundaries']){
    assert.deepEqual(manifest[key],priorManifest[key],'Final outcome or safeguard changed: '+key);
  }
  const cadence=manifest.verificationCadence;
  assert.equal(cadence.id,'ORCH-CADENCE-01');assert.equal(cadence.freeze,'HUMAN_REVISION_ONLY');
  for(const key of ['addsVerificationProfile','changesExistingIntegrationRequirements','scopeSuppressionAuthorized'])assert.equal(cadence[key],false);
  for(const stage of [cadence.iteration,cadence.candidate]){assert.equal(stage.completionEligible,false);assert.equal(stage.automaticFullPlatformDispatch,false);}
  assert.deepEqual(cadence.candidate.ownerOrder,['controller-runtime','repository-tooling','adopter-template','trusted-container-fixture']);
  assert.deepEqual(cadence.candidate.requiredFloor,['canonical-invariants-first','exact-dependencies','format-lint-architecture-typecheck','single-real-payload-build-and-bounded-external-consumer-smoke','all-four-owner-partitions-exactly-once']);
  assert.equal(cadence.candidate.excludesExistingMandatoryRegressionCases,false);
  assert.deepEqual(cadence.candidate.omittedFromAutomaticDispatch,['full-native-platform-matrix','all-workflow-negative-variants','cross-platform-parity','complete-two-adopter-matrix','independent-repeated-build-matrix','full-containment-and-supervision-corpus']);
  assert.equal(cadence.candidate.supportingEvidenceAuthorizesReadinessOrRequiredExactIntegration,false);
  assert.deepEqual(cadence.full.requiredPlatforms,['windows','linux']);
  assert.equal(cadence.full.freshCompleteQualificationRequired,true);
  assert.equal(cadence.full.allOutcomesMetricsAndNegativeVariantsRequired,true);
  assert.equal(cadence.full.previousSameCommitQualificationReusable,false);
  assert.equal(cadence.full.candidateReceiptsReusableAsClosure,false);
  assert.deepEqual(cadence.full.entrypoints,['literal-no-argument-pnpm-verify','milestone-exact-closure','periodic-exact-closure','before-any-operation-that-requires-full-exact-readiness']);
  assert.equal(cadence.dispatch.purposeAndCoveragePlanRequired,true);
  assert.equal(cadence.dispatch.actualCostRecordRequired,true);
  assert.equal(cadence.dispatch.duplicateProducerDispatchForMultipleConsumersRequired,false);
  assert.equal(cadence.dispatch.distinctMandatoryObservationsMayBeDeduplicated,false);
  assert.equal(cadence.dispatch.protectedFiveJobCiUnchanged,true);
  assert.equal(cadence.dispatch.automaticPerCommitFullReleaseTriggerAdded,false);
  assert.equal(commands.documentRole,'advisory-implementation');
  assert.deepEqual(commands.candidateScriptOrder,['test:invariants','verify:source-dependencies','format:check','lint','lint:source-architecture','typecheck','build','test:partition:controller-runtime','test:partition:repository-tooling','test:partition:adopter-template','test:partition:trusted-container-fixture']);
  assert.equal(commands.additionalCandidateChecks.completionEligible,false);
  assert.equal(commands.additionalCandidateChecks.automaticFullPlatformDispatch,false);
  assert.equal(manifest.evidence.candidateSupportingEvidenceCompletionEligible,false);
  assert.deepEqual(commands.fullQualificationScriptOrder,stages.flatMap((stage:any)=>stage.scripts));
  checked('COST-CADENCE','Candidate keeps its floor and focused supporting checks without automatic full-matrix dispatch. All r1 final outcomes/metrics/faults/platforms and integration safeguards remain; future dispatches must record purpose and actual cost.');
  const metrics = Object.fromEntries(manifest.completionMetrics.map((row: any) => [row.id, row]));
  assert.equal(Object.keys(metrics).length, 5);
  assert.equal(metrics['ORCH-METRIC-COVERAGE'].requiredDomains, domains.length);
  assert.equal(metrics['ORCH-METRIC-COVERAGE'].requiredMachineOutcomes, requirementIds.length);
  assert.equal(metrics['ORCH-METRIC-COVERAGE'].requiredFraction, 1);
  assert.equal(metrics['ORCH-METRIC-NEGATIVE'].requiredScenarioFamilies, 16);
  assert.equal(metrics['ORCH-METRIC-NEGATIVE'].requiredFamilyPassesPerPlatform, 16);
  assert.equal(metrics['ORCH-METRIC-NEGATIVE'].requiredVariantFraction, 1);
  assert.equal(metrics['ORCH-METRIC-INTEGRITY'].maximumUnexpectedIntegrityViolations, 0);
  assert.equal(metrics['ORCH-METRIC-REPRODUCIBILITY'].independentCleanBuildsPerPlatform, 2);
  assert.equal(metrics['ORCH-METRIC-REPRODUCIBILITY'].requiredIdenticalPortablePayloadInventories, true);
  const bounds = metrics['ORCH-METRIC-BOUNDS'];
  assert.deepEqual([bounds.commandOutputLimitBytes, bounds.commandKillGraceMs, bounds.containerCpuCount, bounds.containerMemoryBytes, bounds.containerPids, bounds.ownerTierTimeoutMs, bounds.otherFocusedTierTimeoutMs], [67_108_864, 5_000, 2, 2_147_483_648, 256, 3_900_000, 1_200_000]);
  for (const metric of manifest.completionMetrics) assert.equal(metric.freeze, 'HUMAN_REVISION_ONLY');
  assert.deepEqual(manifest.calibration, { policy: 'human-revision-only', provisionalFields: [], consumesLegacyCal1: false });
  assert.deepEqual(manifest.productBotRequirements, []);
  assert.equal(manifest.publicProductSeedGate, null);
  assert.equal(manifest.hiddenProductSeedGate, null);
  assert.equal(manifest.requiredToolchain.node, pkg.engines.node);
  assert.equal('pnpm@' + manifest.requiredToolchain.pnpm, pkg.packageManager);
  assert.equal(manifest.requiredToolchain.typescript, pkg.devDependencies.typescript);
  assert.equal(manifest.requiredToolchain.vitest, pkg.devDependencies.vitest);
  checked('METRICS-AND-PINS', 'Fixed coverage/failure/build/resource metrics match the proposed outcomes and current pins; no provisional source field or legacy calibration use is introduced.');

  const gate = manifest.readinessGate;
  assert.equal(gate.id, 'ORCH-AUTONOMOUS-READINESS-01');
  assert.equal(gate.aggregation, 'all');
  assert.equal(gate.compensationBetweenRequirementsAllowed, false);
  assert.deepEqual(gate.requirements, [...requirementIds, ...manifest.completionMetrics.map((row: any) => row.id), 'ORCH-PROFILE-01', 'ORCH-EVIDENCE-01', 'all_negative_scenario_variants_on_both_platforms', 'fresh_clean_exact_default_source_verification_with_both_native_platforms', 'independently_validated_hosted_and_real_provider_evidence','ORCH-CADENCE-01']);
  assert.equal(manifest.humanAcceptanceGate.id, 'ORCH-HUMAN-ACCEPT-01');
  assert.equal(manifest.humanAcceptanceGate.aggregation, 'all');
  assert.equal(manifest.humanAcceptanceGate.machineMayAssertHumanApproval, false);
  assert(manifest.humanAcceptanceGate.requirements.includes(gate.id));
  assert(manifest.humanAcceptanceGate.requirements.includes('live_configured_planner_worker_reviewer_workflow'));
  for (const platform of manifest.platforms) {
    assert.equal(platform.nativeControllerRequired, true);
    assert.equal(platform.realProviderRequired, true);
  }
  assert.equal(manifest.claimBoundaries.wp6eOrWp6fCompletionAuthorized, false);
  assert.equal(manifest.evidence.crossScopePassInheritance, false);
  assert.equal(manifest.evidence.unitSuccessSubstitutesForWorkflow, false);
  assert.equal(manifest.evidence.qualifierHostAndCandidateProviderIdentitiesSeparate, true);
  assert.equal(manifest.evidence.exactCompletionEvidenceReusable, false);
  assert.equal(manifest.plannedCommandSurface.profileContract.markerAndHistoryPreserved, true);
  assert.equal(manifest.plannedCommandSurface.profileContract.bootstrapIsSourceReadinessEvidence, false);
  const fixture = await json('proposed/qualification-target-contract.json');
  assert.notEqual(fixture.contractId, manifest.contractId);
  assert.equal(fixture.claimScope, 'source-qualification-target');
  assert.equal(fixture.requirements.length, 7);
  assert.deepEqual(fixture.readinessGate.requirements, fixture.requirements.map((row: any) => row.id));
  assert.equal(fixture.readinessGate.waivesNoIntegrationSafeguard, true);
  assert.equal(fixture.claimBoundaries.sourceGateInheritance, false);
  assert.equal(fixture.claimBoundaries.specialApprovalOrIntegrationBypass, false);
  checked('CLAIM-BOUNDARIES', 'Source machine/human gates, generated bootstrap, downstream completion and the bounded target remain separate; human approval, real provider/native platforms and fail-closed eligibility are required by the proposal.');

  assert.equal(proposedLock.schemaVersion, '2.0.0');
  assert.equal(proposedLock.authorityEpoch, manifest.authorityEpoch);
  assert.equal(proposedLock.authoritySnapshotPrefix, 'evals/authority-epochs/orch-template.v1/root');
  assert.equal(proposedLock.origin.legacyAuthorityBaseCommit, baseline.authorityBaseCommit);
  assert.equal(proposedLock.origin.legacyLockSha256, sha(await read('baseline/evals/immutable-contract-lock.json')));
  assert.deepEqual(proposedLock.files.map((row: any) => row.path), authorityPaths);
  for (const entry of proposedLock.files) {
    assert.equal(entry.changeClass, 'HUMAN_REVISION_ONLY');
    assert.equal(entry.epochBaselineSha256, entry.activeSha256);
    assert.equal(entry.activeSha256, sha(await read('proposed/' + entry.path)), entry.path);
  }
  assert.equal(proposedLock.calibrationPolicy.legacyTransitionConsumed, false);
  assert(!existsSync(resolve(root, proposedLock.approvalRecordPath)), 'No approval has been supplied or may be fabricated');
  assert(!existsSync(resolve(root, proposedLock.authoritySnapshotPrefix)), 'Proposed epoch must remain inert');
  checked('EPOCH-LOCK', 'The proposed lock binds exactly the four new authority bytes and the preserved old lock/base; no approval or active new epoch exists.');

  const oldAgents = await readFile(resolve(root, 'AGENTS.md'), 'utf8');
  const newAgents = (await read('proposed/AGENTS.md')).toString('utf8');
  const oldTail = oldAgents.slice(oldAgents.indexOf('## Operating Loop')).replace('Keep simulation rules shared by rendered, headless, bot, save/load, and replay paths.', 'Keep the applicable production rules shared by public CLI/controller paths; generated or downstream simulation rules remain shared by rendered, headless, bot, save/load, and replay paths.');
  assert.equal(newAgents.slice(newAgents.indexOf('## Operating Loop')), oldTail);
  const oldContract = await readFile(resolve(root, 'CONTRACT.md'), 'utf8');
  const newContract = (await read('proposed/CONTRACT.md')).toString('utf8');
  const insertion = newContract.indexOf('## Source authority scope (orch-template.v1)');
  const resume = newContract.indexOf('## 1. Frozen authority set');
  assert(insertion > 0 && resume > insertion);
  assert.equal(newContract.slice(0, insertion) + newContract.slice(resume), oldContract);
  let expectedDiff = '';
  for (const path of [...authorityPaths, 'evals/immutable-contract-lock.json', 'AGENTS.md', 'CONTRACT.md']) {
    try { expectedDiff += execFileSync('git', ['diff', '--no-index', '--', resolve(root, path), resolve(dir, 'proposed', path)], { encoding: 'utf8', maxBuffer: 8_388_608 }); }
    catch (error: any) { if (error.status !== 1) throw error; expectedDiff += error.stdout; }
  }
  assert.equal((await read('exact-authority.diff')).toString('utf8'), expectedDiff);
  checked('SUPPORTING-DIFF', 'AGENTS retains its operating/safety text except the declared shared-rule sentence; CONTRACT is an insertion-only change; the seven-file unified diff exactly matches proposed bytes.');

  const approvalScope=await json('approval-scope.json');
  assert.deepEqual(approvalScope.normativePaths,NORMATIVE_PATHS);
  const allFiles = await filesUnder();
  const evidenceFiles = (path: string) => path.startsWith('audit/') || ['review-manifest.json', 'proposal-audit.json'].includes(path);
  const reviewFiles = allFiles.filter(path => !evidenceFiles(path)).sort();
  assert(reviewFiles.includes('verify-proposal.ts') && reviewFiles.includes('QUALIFICATION-PROTOCOL.md'));
  for (const path of reviewFiles.filter(path => path.endsWith('.json'))) await json(path);
  const entries = [];
  for (const path of reviewFiles) {
    const bytes = await read(path);
    entries.push({ path, bytes: bytes.length, sha256: sha(bytes), role: classifyProposalFile(path) });
  }
  const reviewManifest=createProposalReview(entries,baseline,approvalScope);
  const contentDigest=reviewManifest.contentDigest;
  const advisoryMutated=entries.map(entry=>entry.path==='CHECK-DESIGN.md'?{...entry,sha256:'1'.repeat(64)}:entry);
  const advisoryReview=createProposalReview(advisoryMutated,baseline,approvalScope);
  assert.equal(advisoryReview.contentDigest,contentDigest);
  assert.notEqual(advisoryReview.packageIntegrityDigest,reviewManifest.packageIntegrityDigest);
  assertAdvisoryRefresh(reviewManifest,advisoryReview);
  const normativeMutated=entries.map(entry=>entry.path==='proposed/PROJECT_GOAL.md'?{...entry,sha256:'2'.repeat(64)}:entry);
  const normativeReview=createProposalReview(normativeMutated,baseline,approvalScope);
  assert.notEqual(normativeReview.contentDigest,contentDigest);
  assert.throws(()=>assertAdvisoryRefresh(reviewManifest,normativeReview));
  assert.throws(()=>createProposalReview(entries.filter(entry=>entry.path!=='proposed/PROJECT_GOAL.md'),baseline,approvalScope));
  assert.throws(()=>createProposalReview(entries.map(entry=>entry.path==='proposed/PROJECT_GOAL.md'?{...entry,role:'advisory-implementation'}:entry),baseline,approvalScope));
  assert.throws(()=>createProposalReview(entries,baseline,{...approvalScope,normativePaths:approvalScope.normativePaths.filter((path:string)=>path!=='proposed/PROJECT_GOAL.md')}));
  checked('APPROVAL-SCOPE','Normative-only approval and full package integrity are separate. Five finite mutation cases prove advisory changes affect only package integrity; normative changes, missing/reclassified normative files and classification changes cannot use advisory refresh.');
  if(args[0]==='--seal'){
    assert(!existsSync(resolve(dir,'review-manifest.json')),'Seal already exists; preserve it and create a reviewed revision');
    await emit('review-manifest.json',reviewManifest);
  }else if(args[0]==='--refresh-package'){
    assertAdvisoryRefresh(await json('review-manifest.json'),reviewManifest);
    await emit('review-manifest.json',reviewManifest);
  }else assert.deepEqual(await json('review-manifest.json'),reviewManifest,'Review package changed; do not silently overwrite its seal');
  // Links to generated audit files are checked after they are written below.
  for (const path of reviewFiles.filter(path => path.endsWith('.md') && !path.startsWith('baseline/') && !path.startsWith('proposed/'))) {
    const source = (await read(path)).toString('utf8');
    for (const match of source.matchAll(/\]\(([^)]+)\)/gu)) {
      const target = match[1]!;
      if (/^(?:https?:|#)/u.test(target)) continue;
      const destination = resolve(dir, target.split('#')[0]!);
      if (['proposal-audit.json', 'audit/result.json'].includes(target)) continue;
      assert(existsSync(destination), path + ': missing link ' + target);
    }
  }
  checked('CONTENT-SEAL', 'All proposed JSON parses and review links resolve. The approval digest binds normative files; the separate package digest inventories normative, historical, advisory and reproduction files with actual sizes and hashes. Only generated manifests/audit outputs are excluded to avoid self-reference.');

  const report = {
    schemaVersion: 'authority-proposal-audit.v2', revisionId: 'ORCH-AUTH-01', proposalRevision:'r2', status: 'PASS', disposition: 'proposal_consistent', observedAt: new Date().toISOString(),
    baselineCommit: baseline.commit, baselineTree: baseline.tree, workingTreeDirty: status.length > 0,
    proposalContentDigest: contentDigest, packageIntegrityDigest:reviewManifest.packageIntegrityDigest, normativeFileCount:NORMATIVE_PATHS.length, priorFilesPreserved:priorBaseline.files.length, receiptPath:auditSubdirectory+'/result.json', approvalReceived: false, activeAuthorityModified: false,
    wp6ScopeOrEvidenceModified: false, completionEligible: false, productVerificationPerformed: false,
    counts: { protectedFiles: baseline.files.length, legacyIds: oldIds.length, legacyManifestLeaves: oldLeaves.length, goalSections: mapping.goalSections.length, legacyCommands: expectedCommands.length, newScripts: Object.keys(commands.packageAdditions.scripts).length, sourceMachineRequirements: requirementIds.length, orchestrationDomains: domains.length, negativeFamilies: manifest.negativeScenarios.length, sourceStages: stages.length, sealedFiles: entries.length },
    checks: checks.map(check => ({ ...check, status: 'PASS' })),
    limits: ['Document/hash/reference consistency only; no product or migration implementation is tested.', 'No authority, acceptance, commissioning, WP6 plan or existing log has been changed.', 'Source qualification, live human acceptance and runtime policy qualification remain future work.']
  };
  await emit('proposal-audit.json', report);
  await mkdir(resolve(dir, 'audit'), { recursive: true });
  await emit(auditSubdirectory+'/proposal-audit.json', report);
  await emit(auditSubdirectory+'/review-manifest.json', reviewManifest);
  await writeReceipt(context, checks, [
    { path: 'proposal-audit.json', kind: 'authority-proposal-audit' },
    { path: 'review-manifest.json', kind: 'authority-proposal-content-manifest' }
  ]);
  const validated = await validateCommandReceiptDirectory({ directory: context.artifactDirectory, expectedStageId: context.stageId, expectedCommandId: context.commandId, requiredKinds: ['authority-proposal-audit', 'authority-proposal-content-manifest'] });
  assert.equal(validated.artifacts.length, 2);
  assert.deepEqual(await read(auditSubdirectory+'/proposal-audit.json'), await read('proposal-audit.json'));
  git('diff', '--exit-code');
  git('diff', '--cached', '--exit-code');
  console.log(JSON.stringify({ status: 'PASS', claim: 'proposal document integrity only', contentDigest, ...report.counts, receipt: 'docs/proposals/ORCH-AUTH-01-r2/'+auditSubdirectory+'/result.json', packageIntegrityDigest:reviewManifest.packageIntegrityDigest, normativeFileCount:NORMATIVE_PATHS.length, completionEligible: false }));
} catch (error) {
  await writeManualEvidenceFailure(context, { kind: 'product', message: String(error) });
  throw error;
}
