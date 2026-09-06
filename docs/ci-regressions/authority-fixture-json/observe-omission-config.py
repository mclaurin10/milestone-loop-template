"""Observe the unchanged omission command with explicit isolated pnpm settings."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

source = Path('/mnt/c/Dev/loop-extraction/milestone-loop-template')
receiver = source/'artifacts/wp6e-authority-fixture-repair-20260906/omission-diagnostic-linux-6'
repo = Path('/home/duncan/c6a-_6e4w_cd/repo')
node = Path('/home/duncan/oa1-CKn8x9/node-v24.18.0-linux-x64/bin/node')
pnpm = Path('/home/duncan/oa1-CKn8x9/pnpm/node_modules/pnpm/bin/pnpm.mjs')
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
assert os.getuid() == 1000 and repo.resolve(strict=True) == repo
assert sha(node) == '41a74efb34cbde5c7632cdac0cf8bd1a14d0b8d73dc1e82755014d9a9ce70f5c'
assert sha(pnpm) == 'ff3224d46b47fbb24a7e9fe15fededef7e00892d07d4e376b6762d4899906bfd'
receiver.mkdir()
(receiver/'executed-observer.py').write_bytes(Path(__file__).read_bytes())
config = repo/'pnpm-workspace.yaml'
assert config.read_bytes() == (source/'pnpm-workspace.yaml').read_bytes().replace(b'\r\n', b'\n')
(receiver/'pnpm-workspace.before.yaml').write_bytes(config.read_bytes())
config.write_bytes(config.read_bytes()+b'\nenableGlobalVirtualStore: false\n')
(receiver/'pnpm-workspace.after.yaml').write_bytes(config.read_bytes())
output = repo/'artifacts/omission-diagnostic-20260906-6'
assert not output.exists()
env = dict(os.environ, PATH=str(repo.parent/'bin')+':'+str(node.parent)+':/usr/bin:/bin', CI='true', pnpm_config_store_dir=str(repo.parent/'store'), pnpm_config_offline='true', LOOP_VERIFY_STAGE_ID='wp6-shadow-omission-mutation', LOOP_VERIFY_COMMAND_ID='test:partitions:shadow:omission-mutation', LOOP_VERIFY_COMMAND_ARTIFACT_DIR=str(output), LOOP_VERIFY_RUN_ID='wp6-omission-integration', MILESTONE_LOOP_TEST_OMISSION_MUTATION='1')
for key in ('NODE_OPTIONS', 'MILESTONE_LOOP_TEST_RUN_PROBE_DIR', 'MILESTONE_LOOP_TEST_RUN_PROBE_ID'):
    env.pop(key, None)
argv = [str(node), str(repo/'node_modules/tsx/dist/cli.mjs'), 'tools/milestone-orchestrator/src/test-partition-cli.ts', 'omission-mutation']
result = subprocess.run(argv, cwd=repo, env=env, capture_output=True, timeout=90)
(receiver/'stdout.log').write_bytes(result.stdout)
(receiver/'stderr.log').write_bytes(result.stderr)
shutil.copytree(output, receiver/'evidence')
manifest = json.loads((output/'manifest.json').read_bytes())
observation = {'schemaVersion':'omission-explicit-config-diagnostic.v1','status':'OBSERVED','completionEligible':False,'claimScope':'isolated-Linux-diagnostic-with-workspace-config-overlay','argv':argv,'cwd':str(repo),'exitCode':result.returncode,'configurationOverlaySha256':sha(config),'manifestStatus':manifest['status'],'failureClassification':manifest.get('failureClassification'),'reductionPresent':(output/'test-run-summary-reduction.json').exists(),'passReceiptPresent':(output/'result.json').exists()}
(receiver/'observation.json').write_text(json.dumps(observation,indent=2)+'\n')
print(json.dumps(observation))
