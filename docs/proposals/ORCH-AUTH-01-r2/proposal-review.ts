import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const NORMATIVE_PATHS=[
 'APPROVAL-SCOPE.md','approval-scope.json','TRANSITION-CONTRACT.md','ACCEPTANCE-MAPPING.md','acceptance-mapping.json',
 'proposed/PROJECT_GOAL.md','proposed/AGENTS.md','proposed/CONTRACT.md','proposed/evals/ACCEPTANCE.md',
 'proposed/evals/acceptance-manifest.json','proposed/evals/HIDDEN_VALIDATION_PROTOCOL.md',
 'proposed/evals/immutable-contract-lock.json','proposed/qualification-target-contract.json'
].sort();
const sha=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function classifyProposalFile(path:string){
 if(NORMATIVE_PATHS.includes(path))return 'normative-contract';
 if(path.startsWith('baseline/')||['baseline-index.json','revision-baseline.json','prior-review-manifest.json'].includes(path))return 'historical-reference';
 if(/\.(ts|mjs)$/.test(path))return 'reproduction-tool';
 return 'advisory-implementation';
}
export function createProposalReview(entries:any[],baseline:any,scope:any){
 assert.deepEqual(scope.normativePaths,NORMATIVE_PATHS);
 assert.equal(scope.advisoryMayOverrideNormative,false);assert.equal(scope.packageIntegrityDigestAuthorizesAuthority,false);
 const paths=entries.map(entry=>entry.path);
 assert.equal(new Set(paths).size,paths.length);assert.deepEqual(paths,[...paths].sort());
 for(const path of NORMATIVE_PATHS)assert(paths.includes(path),'Missing normative file: '+path);
 for(const entry of entries){
  assert(!entry.path.startsWith('/')&&!entry.path.includes('\\')&&!entry.path.split('/').some((part:string)=>part==='..'||part==='.'));
  assert.equal(entry.role,classifyProposalFile(entry.path),'File classification drift: '+entry.path);
  assert.match(entry.sha256,/^[a-f0-9]{64}$/);assert(Number.isSafeInteger(entry.bytes)&&entry.bytes>=0);
 }
 const payload={schemaVersion:'authority-proposal-approval.v2',revisionId:'ORCH-AUTH-01',status:'PROPOSED_NOT_APPROVED',
 baselineCommit:baseline.commit,baselineTree:baseline.tree,contractId:'milestone-loop-orchestrator-source.v1',authorityEpoch:'orch-template.v1',
 digestAlgorithm:'sha256(JSON.stringify(payload), UTF-8)',files:entries.filter(entry=>entry.role==='normative-contract')};
 const contentDigest=sha(payload);
 const packagePayload={schemaVersion:'authority-proposal-package.v2',revisionId:'ORCH-AUTH-01',proposalRevision:'r2',contentDigest,files:entries};
 return {schemaVersion:'authority-proposal-review.v2',proposalRevision:'r2',payload,contentDigest,packagePayload,packageIntegrityDigest:sha(packagePayload)};
}
export function assertAdvisoryRefresh(previous:any,next:any){
 assert.equal(previous.schemaVersion,'authority-proposal-review.v2');
 assert.equal(previous.contentDigest,sha(previous.payload),'Previous approval seal is corrupt');
 assert.equal(previous.packageIntegrityDigest,sha(previous.packagePayload),'Previous package seal is corrupt');
 assert.equal(previous.contentDigest,next.contentDigest,'Normative content changed; prepare a newly reviewed proposal instead of an advisory refresh');
 assert.deepEqual(previous.payload,next.payload);
}

