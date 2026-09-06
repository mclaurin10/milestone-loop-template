"""Independently validate and freeze the offline payload before a host launch."""
import base64
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import uuid

root=Path(sys.argv[1]);sourceCommit=sys.argv[2];sourceTree=sys.argv[3]
assert re.fullmatch(r'/home/duncan/oc3-[A-Za-z0-9_-]+',str(root)) and root.resolve()==root
assert root.stat().st_uid==os.getuid()==1000
for value in [sourceCommit,sourceTree]:assert re.fullmatch(r'[a-f0-9]{40}',value)
repo=Path('/mnt/c/Dev/loop-extraction/milestone-loop-template')
original=Path('/home/duncan/oc2-1_hj5pul')
payload=root/'input'
runId=str(uuid.uuid4())
raw=root/('freeze-'+runId);raw.mkdir()
shutil.copyfile(__file__,raw/'executed-freezer.py')
def digest(path,algorithm='sha256'):
    with open(path,'rb') as f:return hashlib.file_digest(f,algorithm).hexdigest()
def pin(path):return {'path':str(path),'bytes':path.stat().st_size,'sha256':digest(path)}
preparations=list(root.glob('preparation*/preparation.json'))
assert len(preparations)==1
preparationPath=preparations[0];preparation=json.loads(preparationPath.read_bytes());prepared=preparationPath.parent
assert preparation['sharedInstallation'] is False and preparation['controllerDispatched'] is False
key=prepared/'ubuntu-archive-keyring.gpg'
assert digest(key)=='80a36b0a6de2f69f49d2df75ef473ccde121e9e190b9ea01d20a4f63778d5c31'
for suite in ['noble','noble-updates','noble-security']:
    p=subprocess.run(['/usr/bin/gpgv','--status-fd','1','--keyring',str(key),str(prepared/(suite+'-InRelease'))],capture_output=True,timeout=30)
    (raw/(suite+'.stdout')).write_bytes(p.stdout);(raw/(suite+'.stderr')).write_bytes(p.stderr)
    assert p.returncode==0 and b'[GNUPG:] VALIDSIG ' in p.stdout
indexes={}
for item in preparation['indexes']:
    data=gzip.decompress((prepared/item['file']).read_bytes())
    assert len(data)==item['bytes'] and hashlib.sha256(data).hexdigest()==item['sha256']
    signed=(prepared/(item['suite']+'-InRelease')).read_text()
    section=signed.split('\nSHA256:\n')[1].split('\nSHA512:')[0]
    assert any(line.split()==[item['sha256'],str(item['bytes']),item['component']+'/binary-amd64/Packages'] for line in section.splitlines())
    indexes[item['file']]=[dict(re.findall(r'^(\S+): (.*)$',stanza,re.M)) for stanza in data.decode().split('\n\n')]
for package in preparation['packages']:
    matches=[r for r in indexes[package['index']] if r.get('Package')==package['package'] and r.get('Version')==package['version']]
    assert len(matches)==1
    fields=matches[0];path=payload/'packages'/package['file']
    assert path.is_file() and not path.is_symlink() and path.stat().st_size==int(fields['Size'])==package['bytes']
    assert digest(path)==fields['SHA256']==package['sha256']
    assert path.name==Path(fields['Filename']).name
node=payload/'node-v24.18.0-linux-x64.tar.xz'
assert [l.split()[0] for l in (prepared/'SHASUMS256.txt').read_text().splitlines() if l.split()[-1]==node.name]==[digest(node)]
metadata=json.loads((prepared/'pnpm-metadata.json').read_bytes())
assert metadata['version']=='11.15.1' and metadata['name']=='pnpm'
assert metadata['dist']['integrity']=='sha512-'+base64.b64encode(bytes.fromhex(digest(payload/'pnpm.tgz','sha512'))).decode()
image=preparation['image']
blobs={}
with tarfile.open(payload/'oci.tar') as tar:
    for member in tar:
        assert not member.name.startswith('/') and '..' not in Path(member.name).parts
        assert member.isdir() or member.isfile()
        if member.isfile() and re.fullmatch(r'blobs/sha256/[a-f0-9]{64}',member.name):
            stream=tar.extractfile(member);actual=hashlib.file_digest(stream,'sha256').hexdigest()
            assert actual==member.name.split('/')[-1]
            blobs[actual]=member.size
    assert image.removeprefix('sha256:') in blobs
    manifest=json.load(tar.extractfile('blobs/sha256/'+image.removeprefix('sha256:')))
    for descriptor in [manifest['config'],*manifest['layers']]:
        assert blobs[descriptor['digest'].removeprefix('sha256:')]==descriptor['size']
    config=json.load(tar.extractfile('blobs/sha256/'+manifest['config']['digest'].removeprefix('sha256:')))
    assert config['config']['Labels']['io.milestone-loop.image-input-sha256']=='0392ec049d9c168fdefb9ab22fe38f9127953639aa96701a6369fa10ed9556a3'
with tarfile.open(payload/'store.tar') as tar:
    for member in tar:
        assert member.name=='v11' or member.name.startswith('v11/')
        assert not member.name.startswith('v11/projects') and '..' not in Path(member.name).parts
        assert member.isdir() or member.isfile()
cacheResults=list(root.glob('cache-preparation-*/result.json'))
assert len(cacheResults)==1
cacheResult=json.loads(cacheResults[0].read_bytes())
assert cacheResult['status']=='PRIMED_AND_REUSED_BY_EXACT_PNPM'
assert cacheResult['controllerDispatched'] is False and cacheResult['completionEligible'] is False
assert [c['name'] for c in cacheResult['commands']]==['clone','source-prime','source-offline','fixture-prime','fixture-offline']
assert all(c['exitCode']==0 for c in cacheResult['commands'])
assert cacheResult['archive']==str(payload/'pnpm-cache.tar')
assert digest(payload/'pnpm-cache.tar')==cacheResult['sha256']
with tarfile.open(payload/'pnpm-cache.tar') as tar:
    for member in tar:
        assert not member.name.startswith('/') and '..' not in Path(member.name).parts
        assert member.name=='lockfile-verified.jsonl' or member.name=='v11' or member.name.startswith('v11/')
        assert member.isdir() or member.isfile()
    assert [json.loads(line) for line in tar.extractfile('lockfile-verified.jsonl').read().decode().splitlines()]==cacheResult['policyRecords']
shutil.copyfile(repo/'docs/runtime-qualification/ORCH-AUTH-01-C3/guest-job.py',payload/'guest-job.py')
files=[]
for path in sorted(payload.rglob('*')):
    assert not path.is_symlink()
    if path.is_file() and path.name!='input-manifest.json':
        files.append({'path':path.relative_to(payload).as_posix(),'bytes':path.stat().st_size,'sha256':digest(path)})
assert any(f['path']=='source.bundle' for f in files)
manifestBytes=(json.dumps({'schemaVersion':'orch-c3-input.v1','source':{'commit':sourceCommit,'tree':sourceTree},'files':files},indent=2)+'\n').encode()
(payload/'input-manifest.json').write_bytes(manifestBytes)
imagePath=root/('input-'+runId+'.iso')
assert not imagePath.exists()
env={'PATH':'/usr/bin:/bin','LANG':'C','LC_ALL':'C','LD_LIBRARY_PATH':str(original/'provider/usr/lib/x86_64-linux-gnu')}
p=subprocess.run([str(original/'provider/usr/bin/genisoimage'),'-quiet','-iso-level','3','-rock','-joliet','-output',str(imagePath),str(payload)],capture_output=True,timeout=300,env=env)
(raw/'iso.stdout').write_bytes(p.stdout);(raw/'iso.stderr').write_bytes(p.stderr)
assert p.returncode==0,p.stderr
os.chmod(imagePath,0o444)
c2=json.loads((original/'frozen-inputs.json').read_bytes())
expected={'binding':{'purpose':'candidate-support','authorityDigest':'53d38a2c2038cd9c5ffc240275043709d23dd33a81237e3d12018a38a8378108','activeAuthorityEpoch':'legacy-source.v1','runId':runId,'nonce':os.urandom(32).hex(),'sourceCommit':sourceCommit,'sourceTree':sourceTree,'inputManifestSha256':hashlib.sha256(manifestBytes).hexdigest(),'imageDigest':image},'base':c2['inputs']['image'],'input':pin(imagePath),'launchers':c2['inputs']['launchers'],'hostRunnerSha256':digest(repo/'docs/runtime-qualification/ORCH-AUTH-01-C3/run-host.py'),'preparation':pin(preparationPath),'guestProgramSha256':digest(payload/'guest-job.py')}
(root/('expected-'+runId+'.json')).write_text(json.dumps(expected,indent=2)+'\n')
(raw/'audit.json').write_text(json.dumps({'status':'INPUTS_VALIDATED','packages':len(preparation['packages']),'ociBlobs':len(blobs),'files':len(files),'expected':expected,'completionEligible':False},indent=2)+'\n')
print(json.dumps({'expected':str(root/('expected-'+runId+'.json')),'files':len(files),'packages':len(preparation['packages']),'inputBytes':imagePath.stat().st_size}))
