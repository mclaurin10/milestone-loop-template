"""Observe unchanged omission finalization in the existing owned Linux checkout.

This preserves raw diagnostics, not a full-suite PASS or current-candidate claim.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

source = Path('/mnt/c/Dev/loop-extraction/milestone-loop-template')
receiver = Path(sys.argv[1]).resolve(strict=True)
assert receiver.name == 'omission-diagnostic-linux-3' and os.getuid() == 1000
state = json.loads((receiver/'projection.json').read_bytes())
assert state['sourceBase'] == '6ae4efb808652e24d565cf5562c0611aac5ed25a'
assert state['projectedTree'] == 'c94eb34007a13d2d342f331fb1422b8325cc0141'
repo = Path(state['repositoryRoot']).resolve(strict=True)
assert repo == Path('/home/duncan/c6a-_6e4w_cd/repo')
node = Path('/home/duncan/oa1-CKn8x9/node-v24.18.0-linux-x64/bin/node')
pnpm = Path('/home/duncan/oa1-CKn8x9/pnpm/node_modules/pnpm/bin/pnpm.mjs')
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
assert sha(node) == '41a74efb34cbde5c7632cdac0cf8bd1a14d0b8d73dc1e82755014d9a9ce70f5c'
assert sha(pnpm) == 'ff3224d46b47fbb24a7e9fe15fededef7e00892d07d4e376b6762d4899906bfd'
paths = ['tools/evidence.mjs', 'tools/milestone-orchestrator/src/test-partitions.ts', 'tools/milestone-orchestrator/src/test-partition-cli.ts', 'tools/milestone-orchestrator/src/test-run-summary.ts', 'tools/milestone-orchestrator/src/verifier.ts']
pins = []
for path in paths:
    assert sha(source / path) == sha(repo / path)
    pins.append({'path': path, 'sha256': sha(repo / path)})
launcher = repo.parent / 'bin/pnpm'
assert launcher.read_text() == f'#!/bin/sh\nexec "{node}" "{pnpm}" "$@"\n'
output = repo / 'artifacts/omission-diagnostic-20260906-3'
assert not output.exists()
assert json.loads((repo/'node_modules/.modules.yaml').read_bytes())['storeDir'] == str(repo.parent/'store/v11')
env = dict(os.environ, PATH=str(launcher.parent)+':'+str(node.parent)+':/usr/bin:/bin', CI='true', pnpm_config_store_dir=str(repo.parent/'store'), pnpm_config_offline='true', LOOP_VERIFY_STAGE_ID='wp6-shadow-omission-mutation', LOOP_VERIFY_COMMAND_ID='test:partitions:shadow:omission-mutation', LOOP_VERIFY_COMMAND_ARTIFACT_DIR=str(output), LOOP_VERIFY_RUN_ID='wp6-omission-integration', MILESTONE_LOOP_TEST_OMISSION_MUTATION='1')
for key in ('NODE_OPTIONS', 'MILESTONE_LOOP_TEST_RUN_PROBE_DIR', 'MILESTONE_LOOP_TEST_RUN_PROBE_ID'):
    env.pop(key, None)
argv = [str(node), str(repo/'node_modules/tsx/dist/cli.mjs'), 'tools/milestone-orchestrator/src/test-partition-cli.ts', 'omission-mutation']
(receiver/'executed-observer.py').write_bytes(Path(__file__).read_bytes())
config = repo/'.npmrc'
assert not config.exists()
config.write_text('store-dir='+str(repo.parent/'store')+'\noffline=true\n')
shutil.copyfile(config, receiver/'diagnostic.npmrc')
install = subprocess.run([str(node), str(pnpm), 'install', '--frozen-lockfile', '--offline', '--package-import-method=copy', '--store-dir', str(repo.parent/'store')], cwd=repo, env=env, capture_output=True, timeout=300)
(receiver/'configuration-install.stdout.log').write_bytes(install.stdout)
(receiver/'configuration-install.stderr.log').write_bytes(install.stderr)
assert install.returncode == 0
result = subprocess.run(argv, cwd=repo, env=env, capture_output=True, timeout=90)
(receiver/'stdout.log').write_bytes(result.stdout)
(receiver/'stderr.log').write_bytes(result.stderr)
shutil.copytree(output, receiver/'evidence')
manifest = json.loads((output/'manifest.json').read_bytes())
observation = {'schemaVersion':'omission-diagnostic-observation.v1','status':'OBSERVED','completionEligible':False,'claimScope':'fresh-Linux-development-checkout-with-explicit-private-store','argv':argv,'cwd':str(repo),'exitCode':result.returncode,'programPinsEqualToPrimary':pins,'diagnosticConfig':{'path':str(config),'sha256':sha(config),'committed':False},'configurationInstallExitCode':install.returncode,'manifestStatus':manifest['status'],'failureClassification':manifest.get('failureClassification'),'reductionPresent':(output/'test-run-summary-reduction.json').exists(),'passReceiptPresent':(output/'result.json').exists()}
(receiver/'observation.json').write_text(json.dumps(observation,indent=2)+'\n')
print(json.dumps(observation))
