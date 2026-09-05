import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { evidenceContext, writeReceipt, writeManualEvidenceFailure } from '../../../tools/evidence.mjs';
import { validateCommandReceiptDirectory } from '../../../tools/milestone-orchestrator/src/verifier.js';

// Reproduction of the handoff's bytes and scope, not a human authenticator or migration.
const root = resolve(import.meta.dirname, '../../..');
const base = 'e590e38c32de2b5baa7423f66bbd8a0230b61839';
const proposal = 'docs/proposals/ORCH-AUTH-01-r2';
const approvalPath = 'evals/authority-revisions/ORCH-AUTH-01/approval.json';
const digest = '53d38a2c2038cd9c5ffc240275043709d23dd33a81237e3d12018a38a8378108';
const packageDigest = '2db01416302e24f3bda9d1991f44a1ac05b8ef5fad70b09c18bc4f037d267a2c';
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const read = (path: string) => readFile(resolve(root, path));
const json = async (path: string) => JSON.parse((await read(path)).toString('utf8'));
const gitBytes = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { maxBuffer: 16_777_216 });
const git = (...args: string[]) => gitBytes(...args).toString('utf8').trim();
assert.equal(process.version, 'v24.18.0');
assert.equal(process.argv.length, 2);
const output = 'artifacts/orch-auth-01-handoff/run-' + new Date().toISOString().replaceAll(/[^0-9]/g, '') + '-' + process.pid;
process.env.LOOP_VERIFY_COMMAND_ARTIFACT_DIR = resolve(root, output);
const context = await evidenceContext('authority-handoff-integrity', 'ORCH-AUTH-01-handoff-audit');
const checks: { id: string; summary: string }[] = [];
const checked = (id: string, summary: string) => checks.push({ id, summary });

async function filesUnder(path: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(resolve(root, path), { withFileTypes: true })) {
    assert(!entry.isSymbolicLink(), path + '/' + entry.name);
    const next = path + '/' + entry.name;
    if (entry.isDirectory()) out.push(...await filesUnder(next));
    else out.push(next);
  }
  return out.sort();
}

try {
  git('merge-base', '--is-ancestor', base, 'HEAD');
  const reviewBytes = await read(proposal + '/review-manifest.json');
  const review = JSON.parse(reviewBytes.toString('utf8'));
  assert.equal(sha(JSON.stringify(review.payload)), digest);
  assert.equal(review.contentDigest, digest);
  assert.equal(sha(JSON.stringify(review.packagePayload)), packageDigest);
  assert.equal(review.packageIntegrityDigest, packageDigest);
  assert.equal(review.packagePayload.contentDigest, digest);
  assert.equal(review.payload.files.length, 13);
  assert.equal(review.packagePayload.files.length, 35);
  for (const entry of review.packagePayload.files) {
    const bytes = await read(proposal + '/' + entry.path);
    assert.equal(bytes.length, entry.bytes, entry.path);
    assert.equal(sha(bytes), entry.sha256, entry.path);
  }
  assert.deepEqual(review.payload.files, review.packagePayload.files.filter((entry: any) => entry.role === 'normative-contract'));
  const approval = await json(approvalPath);
  assert.equal(approval.status, 'APPROVED');
  assert.equal(approval.revisionId, 'ORCH-AUTH-01');
  assert.equal(approval.proposalRevision, 'r2');
  assert.equal(approval.approvedContentDigest, digest);
  assert.equal(approval.packageIntegrityDigestAtApproval, packageDigest);
  assert.equal(approval.reviewManifestSha256, sha(reviewBytes));
  assert.equal(approval.reviewManifestPath, proposal + '/review-manifest.json');
  assert.deepEqual(approval.normativeFiles, review.payload.files);
  for (const key of ['baselineCommit', 'baselineTree', 'contractId', 'authorityEpoch']) assert.equal(approval[key], review.payload[key]);
  assert.equal(approval.source.kind, 'direct-maintainer-message');
  assert.equal(approval.source.quote, 'Proposal approved.');
  assert.equal(approval.source.threadId, '01a06f9b-0953-73b2-ae67-06e37d884e4e');
  assert.equal(approval.source.turnId, '01a07344-cedf-7562-9ca4-8f5af8586c39');
  assert.equal(approval.source.machineGrantedApproval, false);
  assert.equal(approval.source.standaloneRecordAuthenticatesHuman, false);
  assert.equal(approval.activationStatus, 'NOT_APPLIED');
  assert.deepEqual(approval.authorization, {
    stagedImplementationOfApprovedRevision: true,
    activationRequiresApprovedTransitionSafeguards: true,
    conformingAdvisoryChangesNeedRenewedAuthorityApproval: false,
    normativeChangesNeedNewHumanApproval: true,
    humanProductAcceptanceGranted: false,
    wp6eCompletionOrWp6fInterpretationGranted: false,
    stateAdoptionGrantedByThisRecord: false
  });
  checked('APPROVAL-BINDING', 'The separate human-message transcription names the unchanged r2 normative and full package digests; it grants no product acceptance or automatic activation/adoption.');

  const prior = await json(proposal + '/revision-baseline.json');
  assert.equal(prior.files.length, 33);
  for (const entry of prior.files) {
    const bytes = await read('docs/proposals/ORCH-AUTH-01/' + entry.path);
    assert.equal(bytes.length, entry.bytes);
    assert.equal(sha(bytes), entry.sha256, entry.path);
  }
  const baseline = await json(proposal + '/baseline-index.json');
  const recordPaths = ['.agent/current-exec-plan.md', 'docs/autonomy-log.md', 'docs/decision-log.md'];
  for (const entry of baseline.files.filter((entry: any) => !recordPaths.includes(entry.path))) {
    const bytes = await read(entry.path);
    assert.equal(bytes.length, entry.bytes, entry.path);
    assert.equal(sha(bytes), entry.sha256, entry.path);
  }
  assert.deepEqual(await read('.agent/history/wp6e-e590e38.md'), gitBytes('show', base + ':.agent/current-exec-plan.md'));
  for (const path of ['docs/autonomy-log.md', 'docs/decision-log.md']) {
    const previous = gitBytes('show', base + ':' + path).toString('utf8');
    const current = (await read(path)).toString('utf8');
    const boundary = previous.indexOf('## ');
    assert(current.startsWith(previous.slice(0, boundary)), path);
    assert(current.endsWith(previous.slice(boundary)), path + ' historical text changed');
  }
  assert.equal(sha(await read('Implementation-ready improvement plan 8-5-26.txt')), '53ea98fb1cb880163a02d3b1d9365963e3fe891025ae3630f00bd4c9232293b1');
  assert.equal(git('for-each-ref', '--format=%(refname)', 'refs/milestone-loop/'), '');
  assert(!existsSync(resolve(root, 'evals/authority-epochs/orch-template.v1/root')));
  const originalAttributes = gitBytes('show', base + ':.gitattributes').toString('utf8');
  assert.equal((await read('.gitattributes')).toString('utf8'), originalAttributes + '\n# Preserve the exact bytes of sealed authority review packages.\n/docs/proposals/ORCH-AUTH-01/** binary\n/docs/proposals/ORCH-AUTH-01-r2/** binary\n');
  checked('PRESERVATION', 'Original r1 files, all live protected execution/authority bytes, complete historical logs, archived WP6e plan, private-ref absence and user roadmap are preserved; sealed packages are stored as immutable byte assets.');

  const receiptDirectories = ['docs/proposals/ORCH-AUTH-01/audit'];
  for (const entry of await readdir(resolve(root, proposal, 'audit'), { withFileTypes: true })) if (entry.isDirectory()) receiptDirectories.push(proposal + '/audit/' + entry.name);
  for (const directory of receiptDirectories) {
    const r2 = directory.startsWith(proposal + '/');
    await validateCommandReceiptDirectory({ directory: resolve(root, directory), expectedStageId: 'authority-proposal-integrity', expectedCommandId: r2 ? 'ORCH-AUTH-01-r2-document-audit' : 'ORCH-AUTH-01-document-audit', requiredKinds: ['authority-proposal-audit', 'authority-proposal-content-manifest'] });
  }
  checked('HISTORICAL-RECEIPTS', 'Every retained r1/r2 document receipt and its actual artifact hashes validate through the production receipt reader; proposal-time status stays historical.');

  await validateCommandReceiptDirectory({ directory: resolve(root, 'docs/authority-handoffs/ORCH-AUTH-01/evidence/contract-integrity'), expectedStageId: 'invariant-suite', expectedCommandId: 'contract-integrity', requiredKinds: ['contract-integrity-report'] });
  const contract = await json('docs/authority-handoffs/ORCH-AUTH-01/evidence/contract-integrity/contract-integrity-report.json');
  assert.equal(contract.status, 'PASS');
  checked('LIVE-CONTRACT', 'The unchanged production contract-integrity command passed thirteen checks; its actual receipt and report hashes validate independently.');

  git('diff', '--exit-code');
  git('diff', '--check');
  git('diff', '--cached', '--check');
  const staged = git('diff', '--cached', '--name-only').length > 0;
  const mode = staged ? 'staged' : 'committed';
  const paths = [
    '.gitattributes', ...recordPaths, '.agent/history/wp6e-e590e38.md', approvalPath,
    ...await filesUnder('docs/proposals'),
    ...await filesUnder('docs/authority-handoffs/ORCH-AUTH-01')
  ].sort();
  const allowed = new Set(paths);
  for (const path of git('diff', base, '--name-only').split(/\r?\n/).filter(Boolean)) assert(allowed.has(path), 'Unexpected change: ' + path);
  const inventory = [];
  for (const path of paths) {
    const bytes = await read(path);
    assert.deepEqual(bytes, gitBytes('show', (staged ? ':' : 'HEAD:') + path), 'Git storage would alter reviewed bytes: ' + path);
    inventory.push({ path, bytes: bytes.length, sha256: sha(bytes) });
  }
  for (const line of git('status', '--porcelain=v1', '--untracked-files=all').split(/\r?\n/).filter(Boolean)) {
    if (line.startsWith('?? ')) assert.equal(line, '?? "Implementation-ready improvement plan 8-5-26.txt"');
  }
  checked('GIT-HANDOFF', 'The exact staged/committed handoff inventory matches disk, including the sealed CRLF reference; no unrelated source change or untracked file is included.');

  const report = {
    schemaVersion: 'authority-handoff-integrity.v1', status: 'PASS', claim: 'approval handoff document integrity only',
    observedAt: new Date().toISOString(), head: git('rev-parse', 'HEAD'), tree: git(staged ? 'write-tree' : 'rev-parse', ...(staged ? [] : ['HEAD^{tree}'])), mode,
    approvedContentDigest: digest, packageIntegrityDigest: packageDigest,
    checks, inventory, historicalReceiptsValidated: receiptDirectories.length,
    activationPerformed: false, completionEligible: false, runtimeQualificationPerformed: false, productVerificationPerformed: false,
    limits: ['This audit does not authenticate a human from repository prose or a candidate-authored record.', 'Approval originated in the recorded direct maintainer message; migration still validates the maintainer boundary and every transition safeguard.', 'No source readiness, WP6 completion, native platform qualification or state adoption is established.']
  };
  await writeFile(resolve(context.artifactDirectory, 'handoff-audit.json'), JSON.stringify(report, null, 2) + '\n');
  await writeReceipt(context, checks, [{ path: 'handoff-audit.json', kind: 'authority-handoff-audit' }]);
  await validateCommandReceiptDirectory({ directory: context.artifactDirectory, expectedStageId: context.stageId, expectedCommandId: context.commandId, requiredKinds: ['authority-handoff-audit'] });
  console.log(JSON.stringify({ status: 'PASS', mode, head: report.head, tree: report.tree, approvedContentDigest: digest, files: inventory.length, historicalReceiptsValidated: receiptDirectories.length, receipt: output + '/result.json', completionEligible: false }));
} catch (error) {
  await writeManualEvidenceFailure(context, { kind: 'product', message: String(error) });
  throw error;
}
