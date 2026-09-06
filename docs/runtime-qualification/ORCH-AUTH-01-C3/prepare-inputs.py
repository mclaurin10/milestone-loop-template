"""Prepare offline guest inputs. No shared installation or service mutation."""
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import tempfile
import time
import urllib.request
import base64
import datetime
import email.utils
import urllib.error
import sys
import uuid

repo = Path('/mnt/c/Dev/loop-extraction/milestone-loop-template')
root = Path(sys.argv[1]) if len(sys.argv)==2 else Path(tempfile.mkdtemp(prefix='oc3-', dir='/home/duncan'))
assert re.fullmatch(r'/home/duncan/oc3-[A-Za-z0-9_-]+',str(root)) and root.resolve()==root and root.stat().st_uid==os.getuid()
raw = root / ('preparation-'+str(uuid.uuid4()) if (root/'preparation').exists() else 'preparation')
raw.mkdir()
shutil.copyfile(__file__,raw/'executed-preparer.py')
payload = root / 'input'
payload.mkdir(exist_ok=True)
(repo / 'artifacts/wp6e-continuation-20260906/prepared-root.txt').write_text(str(root)+'\n')
print(str(root), flush=True)

def digest(path, algorithm='sha256'):
    with open(path, 'rb') as stream:
        return hashlib.file_digest(stream, algorithm).hexdigest()

def run(name, argv, timeout=180):
    started = time.monotonic()
    p = subprocess.run(argv, capture_output=True, timeout=timeout, cwd=root,
                       env={'PATH':'/usr/bin:/bin','HOME':str(root),'LANG':'C','LC_ALL':'C'})
    (raw/(name+'.stdout')).write_bytes(p.stdout)
    (raw/(name+'.stderr')).write_bytes(p.stderr)
    (raw/(name+'.json')).write_text(json.dumps({'argv':argv,'exitCode':p.returncode,
        'durationMs':round((time.monotonic()-started)*1000)},indent=2)+'\n')
    if p.returncode:
        raise RuntimeError(name+': '+p.stderr.decode(errors='replace'))
    return p.stdout

def download(url, path, maximum):
    if path.exists():
        assert path.is_file() and not path.is_symlink() and path.stat().st_size<=maximum
        return {'expectedOriginUrl':url,'file':path.name,'bytes':path.stat().st_size,'sha256':digest(path),'rehashedExistingInput':True}
    start=time.monotonic()
    with urllib.request.urlopen(url,timeout=30) as response, path.open('xb') as stream:
        count=0
        while chunk:=response.read(1024*1024):
            count+=len(chunk)
            if count>maximum or time.monotonic()-start>600:
                raise RuntimeError('Download bound exceeded')
            stream.write(chunk)
    return {'url':url,'file':path.name,'bytes':path.stat().st_size,'sha256':digest(path)}

before=digest('/var/lib/dpkg/status')
status=Path('/var/lib/dpkg/status').read_text()
installed={}
for stanza in status.split('\n\n'):
    fields=dict(re.findall(r'^(\S+): (.*)$',stanza,re.M))
    if fields.get('Status')=='install ok installed':
        installed[fields['Package']]=fields
available={}
indexes=[]
key=Path('/usr/share/keyrings/ubuntu-archive-keyring.gpg')
assert digest(key)=='80a36b0a6de2f69f49d2df75ef473ccde121e9e190b9ea01d20a4f63778d5c31'
shutil.copyfile(key,raw/key.name)
for suite in ['noble','noble-updates','noble-security']:
    candidates=list(Path('/var/lib/apt/lists').glob('*_dists_'+suite+'_InRelease'))
    assert len(candidates)==1,(suite,candidates)
    release=candidates[0]
    shutil.copyfile(release,raw/(suite+'-InRelease'))
    run(suite+'-signature',['/usr/bin/gpgv','--status-fd','1','--keyring',str(key),str(release)])
    signed=release.read_text()
    assert 'Origin: Ubuntu\n' in signed and ('Suite: '+suite+'\n') in signed
    section=signed.split('\nSHA256:\n')[1].split('\nSHA512:')[0]
    checks={p:(int(size),sha) for sha,size,p in re.findall(r'^ ([0-9a-f]{64})\s+(\d+)\s+(\S+)$',section,re.M)}
    for component in ['main','universe']:
        path=release.with_name(release.name.removesuffix('InRelease')+component+'_binary-amd64_Packages')
        data=path.read_bytes()
        expected=checks[component+'/binary-amd64/Packages']
        assert (len(data),hashlib.sha256(data).hexdigest())==expected
        for stanza in data.decode().split('\n\n'):
            fields=dict(re.findall(r'^(\S+): (.*)$',stanza,re.M))
            name=fields.get('Package')
            if name:
                available.setdefault(name,[]).append({'index':suite+'-'+component+'-Packages.gz','fields':fields})
        retained=raw/(suite+'-'+component+'-Packages.gz')
        retained.write_bytes(gzip.compress(data,mtime=0))
        indexes.append({'file':retained.name,'suite':suite,'component':component,'bytes':len(data),'sha256':expected[1]})
# Read dpkg as data before using its standard Debian version comparison.
dpkg=Path('/usr/bin/dpkg')
data=dpkg.read_bytes()
assert not dpkg.is_symlink() and data[:4]==b'\x7fELF'
(raw/'dpkg-inspection.json').write_text(json.dumps({'path':str(dpkg),'bytes':len(data),'sha256':digest(dpkg),'prefix':data[:64].hex()},indent=2)+'\n')
records={}
pending=['docker.io','containerd','runc','iptables','git']
fixed={name:installed[name]['Version'] for name in ['docker.io','containerd','runc']}
while pending:
    name=pending.pop()
    if name in records: continue
    assert name in available,name
    candidates=available[name]
    if name in fixed:
        candidates=[c for c in candidates if c['fields']['Version']==fixed[name]]
    assert candidates,name
    selected=candidates[0]
    for other in candidates[1:]:
        comparison=subprocess.run(['/usr/bin/dpkg','--compare-versions',other['fields']['Version'],'gt',selected['fields']['Version']],capture_output=True,timeout=10)
        assert comparison.returncode in [0,1]
        if comparison.returncode==0: selected=other
    records[name]=selected
    fields=selected['fields']
    for relation in (fields.get('Depends','')+','+fields.get('Pre-Depends','')).split(','):
        if not relation.strip(): continue
        choices=[re.split(r'[: (]',item.strip())[0] for item in relation.split('|')]
        dependency=next((c for c in choices if c in installed and c in available),None)
        if dependency is None: dependency=next((c for c in choices if c in available),None)
        if dependency is None:
            dependency=next((n for n,f in installed.items() if n in available and any(c in [p.strip().split(' ')[0] for p in f.get('Provides','').split(',')] for c in choices)),None)
        assert dependency,(name,choices)
        pending.append(dependency)
assert 1<len(records)<160
packages=payload/'packages'
packages.mkdir(exist_ok=True)
downloads=[]
for name in sorted(records):
    record=records[name]; fields=record['fields']; filename=fields['Filename']
    assert filename.startswith('pool/') and '..' not in filename.split('/')
    target=packages/Path(filename).name
    url='https://archive.ubuntu.com/ubuntu/'+filename
    try:
        observation=download(url,target,150*1024*1024)
    except urllib.error.HTTPError as error:
        (raw/(name+'-download-failure.json')).write_text(json.dumps({'url':url,'status':error.code,'message':str(error)})+'\n')
        if error.code!=404: raise
        suite=record['index'].split('-'+('universe' if '-universe-' in record['index'] else 'main')+'-Packages.gz')[0]
        signed=(raw/(suite+'-InRelease')).read_text()
        published=email.utils.parsedate_to_datetime(re.search(r'^Date: (.+)$',signed,re.M)[1])
        snapshot=(published+datetime.timedelta(days=1)).strftime('%Y%m%dT%H%M%SZ')
        observation=download('https://snapshot.ubuntu.com/ubuntu/'+snapshot+'/'+filename,target,150*1024*1024)
    assert observation['sha256']==fields['SHA256'] and observation['bytes']==int(fields['Size'])
    observation.update({'package':name,'version':fields['Version'],'index':record['index']})
    downloads.append(observation)
    # Inspect the data archive only. Install/configuration happens only inside the disposable guest.
    names=run(name+'-contents',['/usr/bin/dpkg-deb','--contents',str(target)])
    assert names and len(names)<8*1024*1024
    print('verified '+name,flush=True)

nodebase='https://nodejs.org/dist/v24.18.0/'
download(nodebase+'SHASUMS256.txt',raw/'SHASUMS256.txt',1024*1024)
node='node-v24.18.0-linux-x64.tar.xz'
nodeRecord=download(nodebase+node,payload/node,50*1024*1024)
expected=[line.split()[0] for line in (raw/'SHASUMS256.txt').read_text().splitlines() if line.split()[-1]==node]
assert expected==[nodeRecord['sha256']]
download('https://registry.npmjs.org/pnpm/11.15.1',raw/'pnpm-metadata.json',1024*1024)
metadata=json.loads((raw/'pnpm-metadata.json').read_bytes())
assert metadata['name']=='pnpm' and metadata['version']=='11.15.1'
assert metadata['dist']['tarball']=='https://registry.npmjs.org/pnpm/-/pnpm-11.15.1.tgz'
pnpmRecord=download(metadata['dist']['tarball'],payload/'pnpm.tgz',20*1024*1024)
assert metadata['dist']['integrity']=='sha512-'+base64.b64encode(bytes.fromhex(digest(payload/'pnpm.tgz','sha512'))).decode()
for archive in [payload/node,payload/'pnpm.tgz']:
    with tarfile.open(archive) as tar:
        for member in tar:
            assert not member.name.startswith('/') and '..' not in Path(member.name).parts
            assert member.isfile() or member.isdir() or member.issym() or member.islnk()
            if member.issym() or member.islnk():
                assert not member.linkname.startswith('/')

image='sha256:e405e2790e743243dd669f8e58eeaff6c585df3cbc77e9a4316a7f07b4e2eaad'
imageInfo=json.loads(run('image-inspect',['/usr/bin/docker','image','inspect',image]))
assert len(imageInfo)==1 and imageInfo[0]['Id']==image
tag='milestone-loop-executor:0392ec049d9c168fdefb9ab22fe38f91'
assert tag in imageInfo[0]['RepoTags']
if not (payload/'oci.tar').exists():
    run('image-export',['/usr/bin/docker','image','save','--output',str(payload/'oci.tar'),tag],600)
else:
    assert not (payload/'oci.tar').is_symlink()
    (raw/'image-export-reused.json').write_text(json.dumps({'path':str(payload/'oci.tar'),'sha256':digest(payload/'oci.tar'),'source':'prior preparation image-export observation; this invocation rehashes it'})+'\n')
assert (payload/'oci.tar').stat().st_size<1024*1024*1024

# Store data contains public package content only; no pnpm config, auth or home directory is copied.
store=Path('/home/duncan/.local/share/pnpm/store/v11')
assert store.resolve()==store and store.is_dir()
storeFiles=0; storeBytes=0
for directory,dirs,files in os.walk(store,followlinks=False):
    if Path(directory)==store: dirs[:]=[name for name in dirs if name!='projects']
    for name in dirs+files:
        p=Path(directory)/name
        assert not p.is_symlink()
    for name in files:
        p=Path(directory)/name
        assert p.is_file()
        storeFiles+=1;storeBytes+=p.stat().st_size
assert storeFiles<100000 and storeBytes<2*1024**3,(storeFiles,storeBytes)
assert not (payload/'store.tar').exists()
run('store-export',['/usr/bin/tar','--exclude=v11/projects','-C',str(store.parent),'-cf',str(payload/'store.tar'),'v11'],600)
assert digest('/var/lib/dpkg/status')==before
result={'schemaVersion':'orch-c3-preparation.v1','root':str(root),'uid':os.getuid(),
    'hostPackagesBefore':before,'hostPackagesAfter':digest('/var/lib/dpkg/status'),
    'indexes':indexes,'packages':downloads,'node':nodeRecord,'pnpm':pnpmRecord,
    'image':image,'imageInputSha256':imageInfo[0]['Config']['Labels']['io.milestone-loop.image-input-sha256'],
    'store':{'files':storeFiles,'bytes':storeBytes,'projectLinksExcluded':True},'sharedInstallation':False,'controllerDispatched':False,'completionEligible':False}
(raw/'preparation.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'root':str(root),'packages':len(downloads),'store':result['store'],'status':'PREPARED_INPUTS_ONLY'}),flush=True)
