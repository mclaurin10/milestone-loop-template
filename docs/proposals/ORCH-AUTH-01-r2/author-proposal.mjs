import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
// Derived proposal outputs only. No approval, original-proposal or active-source writes.
const dir=import.meta.dirname, root=resolve(dir,'../../..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const baseline=JSON.parse(await readFile(resolve(dir,'baseline-index.json'),'utf8'));
assert.equal(execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),baseline.commit);
for(const entry of baseline.files)assert.equal(sha(await readFile(resolve(root,entry.path))),entry.sha256,entry.path);
const lockPath=resolve(dir,'proposed/evals/immutable-contract-lock.json');
const lock=JSON.parse(await readFile(lockPath,'utf8'));
for(const entry of lock.files){const hash=sha(await readFile(resolve(dir,'proposed',entry.path)));entry.epochBaselineSha256=hash;entry.activeSha256=hash;}
await writeFile(lockPath,JSON.stringify(lock,null,2)+'\n');
let diff='';
for(const path of [...lock.files.map(entry=>entry.path),'evals/immutable-contract-lock.json','AGENTS.md','CONTRACT.md']){
 try{diff+=execFileSync('git',['diff','--no-index','--',resolve(root,path),resolve(dir,'proposed',path)],{encoding:'utf8',maxBuffer:8388608});}
 catch(error){if(error.status!==1)throw error;diff+=error.stdout;}
}
await writeFile(resolve(dir,'exact-authority.diff'),diff);
process.stdout.write(JSON.stringify({updated:['proposed/evals/immutable-contract-lock.json','exact-authority.diff'],activeFilesChanged:false,approvalReceived:false})+'\n');

