"""Prime exact-lockfile pnpm policy metadata in a new task-owned public cache.

Runs setup with network access outside the guest; no controller or package script
runs. The offline guest keeps the same supply-chain verification defaults.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tarfile
import time
import uuid

assert os.getuid() == 1000
prefix = Path('/home/duncan/oc3-b13lp2vx')
root = prefix/('cache-preparation-' + str(uuid.uuid4()))
root.mkdir()
(root/'executed-preparer.py').write_bytes(Path(__file__).read_bytes())


def digest(path):
    with open(path, 'rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


node = Path('/home/duncan/oa1-CKn8x9/node-v24.18.0-linux-x64/bin/node')
assert node.is_file() and not node.is_symlink()
assert digest(node) == '41a74efb34cbde5c7632cdac0cf8bd1a14d0b8d73dc1e82755014d9a9ce70f5c'
before = digest('/var/lib/dpkg/status')
for archive, destination in [('pnpm.tgz', root/'pnpm'), ('store.tar', root/'store')]:
    destination.mkdir()
    with tarfile.open(prefix/'input'/archive) as tar:
        tar.extractall(destination, filter='data')
pnpm = root/'pnpm/package/bin/pnpm.mjs'
assert json.loads((root/'pnpm/package/package.json').read_text())['version'] == '11.15.1'
(root/'bin').mkdir()
(root/'bin/node').symlink_to(node)
(root/'bin/pnpm').write_text('#!/bin/sh\nexec ' + str(node) + ' ' + str(pnpm) + ' "$@"\n')
(root/'bin/pnpm').chmod(0o755)
(root/'home').mkdir()
environment = {'HOME': str(root/'home'), 'PATH': str(root/'bin') + ':/usr/bin:/bin', 'LANG': 'C', 'CI': 'true', 'pnpm_config_store_dir': str(root/'store'), 'pnpm_config_cache_dir': str(root/'cache'), 'COREPACK_ENABLE_NETWORK': '0'}
commands = []


def run(name, argv, cwd=root):
    started = time.monotonic()
    with (root/(name+'.stdout')).open('wb') as stdout, (root/(name+'.stderr')).open('wb') as stderr:
        p = subprocess.run(argv, cwd=cwd, env=environment, stdout=stdout, stderr=stderr, timeout=600)
    result = {'name': name, 'argv': argv, 'cwd': str(cwd), 'exitCode': p.returncode, 'durationMs': round((time.monotonic()-started)*1000)}
    (root/(name+'.json')).write_text(json.dumps(result, indent=2)+'\n')
    commands.append(result)
    assert p.returncode == 0, result
    print(json.dumps(result), flush=True)


print(json.dumps({'root': str(root)}), flush=True)
run('clone', ['/usr/bin/git', 'clone', '--no-hardlinks', str(prefix/'input/source.bundle'), str(root/'source')])
for name, cwd in [('source', root/'source'), ('fixture', root/'source/fixtures/oci-candidate')]:
    workspace = ['--ignore-workspace'] if name == 'fixture' else []
    run(name+'-prime', [str(node), str(pnpm), 'install', '--frozen-lockfile', '--ignore-scripts', '--package-import-method', 'copy', *workspace], cwd)
    run(name+'-offline', [str(node), str(pnpm), 'install', '--frozen-lockfile', '--ignore-scripts', '--offline', '--package-import-method', 'copy', *workspace], cwd)
    assert subprocess.run(['/usr/bin/git', 'diff', '--exit-code'], cwd=root/'source', capture_output=True).returncode == 0
cache = root/'cache'
assert {p.name for p in cache.iterdir()} <= {'v11', 'lockfile-verified.jsonl'}
records = [json.loads(line) for line in (cache/'lockfile-verified.jsonl').read_text().splitlines()]
assert {r['lockfile']['path'] for r in records} == {str(root/'source/pnpm-lock.yaml'), str(root/'source/fixtures/oci-candidate/pnpm-lock.yaml')}
assert all(r['policy']['minimumReleaseAge'] == 1440 and r['policy']['integrityRequired'] is True and r['policy']['tarballUrlBinding'] is True for r in records)
for path in cache.rglob('*'):
    assert not path.is_symlink() and (path.is_file() or path.is_dir())
archive = prefix/'input/pnpm-cache.tar'
assert not archive.exists()
with tarfile.open(archive, 'w') as tar:
    for path in sorted(cache.iterdir()):
        tar.add(path, arcname=path.name)
assert digest('/var/lib/dpkg/status') == before
(root/'result.json').write_text(json.dumps({'status': 'PRIMED_AND_REUSED_BY_EXACT_PNPM', 'commands': commands, 'archive': str(archive), 'bytes': archive.stat().st_size, 'sha256': digest(archive), 'policyRecords': records, 'sharedPackagesUnchanged': True, 'controllerDispatched': False, 'completionEligible': False}, indent=2)+'\n')
print(json.dumps({'cache': str(archive), 'bytes': archive.stat().st_size, 'sha256': digest(archive)}), flush=True)
