"""Trusted offline guest job. The outer coordinator owns admission and dispatch."""
import base64
import grp
import hashlib
import json
import os
from pathlib import Path
import pwd
import shutil
import signal
import subprocess
import tarfile
import time
import traceback

binding=json.loads(Path('/run/orch-binding.json').read_text())
channel=open('/dev/virtio-ports/orch.job','r+b',buffering=0)
raw=Path('/var/lib/orch-evidence')
raw.mkdir()
environment={'PATH':'/opt/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
             'HOME':'/home/qualifier','LANG':'C','LC_ALL':'C','CI':'true',
             'pnpm_config_store_dir':'/opt/pnpm-store','COREPACK_ENABLE_NETWORK':'0'}
environment['pnpm_config_cache_dir']='/opt/pnpm-cache'

def digest(path):
    with open(path,'rb') as f: return hashlib.file_digest(f,'sha256').hexdigest()

def send(kind,**fields):
    line=json.dumps({'kind':kind,'runId':binding['runId'],'nonce':binding['nonce'],**fields},separators=(',',':')).encode()+b'\n'
    assert len(line)<262144
    while line:
        written=channel.write(line)
        assert written and written>0,'Guest channel write made no progress'
        line=line[written:]

def receive(expected):
    line=channel.readline(262144)
    assert len(line)<262144 and line.endswith(b'\n')
    value=json.loads(line)
    assert value=={'kind':expected,'runId':binding['runId'],'nonce':binding['nonce']}

def run(name,argv,cwd='/',user=False,timeout=300):
    send('progress',phase=name)
    start=time.monotonic()
    def identity():
        os.setgroups([grp.getgrnam('docker').gr_gid]);os.setgid(1000);os.setuid(1000)
    with (raw/(name+'.stdout')).open('wb') as stdout,(raw/(name+'.stderr')).open('wb') as stderr:
        p=subprocess.Popen(argv,cwd=cwd,env=environment,stdout=stdout,stderr=stderr,
                           preexec_fn=identity if user else None,start_new_session=True)
        timedOut=False
        while p.poll() is None:
            remaining=timeout-(time.monotonic()-start)
            if remaining<=0:
                timedOut=True
                os.killpg(p.pid,signal.SIGKILL)
                p.wait(timeout=5)
                break
            try:p.wait(timeout=min(15,remaining))
            except subprocess.TimeoutExpired:
                fs=os.statvfs('/')
                send('heartbeat',phase=name,pid=p.pid,elapsedMs=round((time.monotonic()-start)*1000),rootAvailableBytes=fs.f_bavail*fs.f_frsize)
    record={'argv':argv,'cwd':cwd,'uid':1000 if user else 0,'exitCode':p.returncode,'timedOut':timedOut,'durationMs':round((time.monotonic()-start)*1000)}
    (raw/(name+'.json')).write_text(json.dumps(record,indent=2)+'\n')
    assert not timedOut,(name,'command deadline exceeded')
    assert p.returncode==0,(name,p.returncode,(raw/(name+'.stderr')).read_text()[-3000:])
    return (raw/(name+'.stdout')).read_text()

def inspect(paths):
    result=[]
    for path in paths:
        p=Path(path);real=p.resolve(strict=True);data=real.read_bytes()
        result.append({'path':path,'canonical':str(real),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'prefix':data[:64].hex()})
    return result

def export():
    archive=Path('/var/lib/orch-export.tar.gz')
    with tarfile.open(archive,'w:gz') as tar:
        tar.add(raw,arcname='guest',recursive=True)
        if Path('/work/source/artifacts').exists():
            tar.add('/work/source/artifacts',arcname='artifacts',recursive=True)
    size=archive.stat().st_size
    assert size<64*1024*1024
    send('archive-start',bytes=size,sha256=digest(archive))
    with archive.open('rb') as stream:
        for sequence in range((size+32767)//32768):
            send('archive-chunk',sequence=sequence,data=base64.b64encode(stream.read(32768)).decode())
    send('archive-end',sha256=digest(archive))

try:
    assert os.getuid()==0
    send('boot',bootId=Path('/proc/sys/kernel/random/boot_id').read_text().strip(),kernel=os.uname().release)
    manifestBytes=Path('/opt/input/input-manifest.json').read_bytes()
    assert hashlib.sha256(manifestBytes).hexdigest()==binding['inputManifestSha256']
    manifest=json.loads(manifestBytes)
    for item in manifest['files']:
        path=Path('/opt/input')/item['path']
        assert path.is_file() and not path.is_symlink() and path.stat().st_size==item['bytes'] and digest(path)==item['sha256']
    (raw/'input-manifest.json').write_bytes(manifestBytes)
    (raw/'binding.json').write_text(json.dumps(binding,indent=2)+'\n')
    (raw/'initial-launchers.json').write_text(json.dumps(inspect(['/usr/bin/apt-get','/usr/bin/dpkg','/usr/bin/tar','/usr/bin/python3.12','/usr/sbin/useradd','/usr/sbin/groupadd']),indent=2)+'\n')
    # This file exists solely in the owned disposable guest; no host service is changed.
    assert not Path('/usr/sbin/policy-rc.d').exists()
    Path('/usr/sbin/policy-rc.d').write_text('#!/bin/sh\nexit 101\n')
    Path('/usr/sbin/policy-rc.d').chmod(0o755)
    environment['DEBIAN_FRONTEND']='noninteractive'
    packages=sorted(str(p) for p in Path('/opt/input/packages').glob('*.deb'))
    # --no-download consumes APT's cache, including when local paths supply
    # package metadata. Populate only this guest's cache from verified inputs.
    for package in packages:
        destination=Path('/var/cache/apt/archives')/Path(package).name
        shutil.copyfile(package,destination)
        assert digest(destination)==digest(package)
    run('offline-package-plan',['/usr/bin/apt-get','--print-uris','--allow-downgrades','--no-install-recommends','-y','install',*packages])
    run('offline-packages',['/usr/bin/apt-get','--no-download','--allow-downgrades','--no-install-recommends','-y','install',*packages],timeout=600)
    for archive,destination in [('node-v24.18.0-linux-x64.tar.xz','/opt'),('pnpm.tgz','/opt/pnpm-extracted'),('store.tar','/opt/pnpm-store'),('pnpm-cache.tar','/opt/pnpm-cache')]:
        Path(destination).mkdir(exist_ok=True)
        with tarfile.open('/opt/input/'+archive) as tar: tar.extractall(destination,filter='data')
    Path('/opt/bin').mkdir()
    Path('/opt/bin/node').symlink_to('/opt/node-v24.18.0-linux-x64/bin/node')
    Path('/opt/bin/pnpm').write_text('#!/bin/sh\nexec /opt/node-v24.18.0-linux-x64/bin/node /opt/pnpm-extracted/package/bin/pnpm.mjs "$@"\n')
    Path('/opt/bin/pnpm').chmod(0o755)
    launchers=inspect(['/usr/bin/docker','/usr/bin/dockerd','/usr/bin/containerd','/usr/bin/runc','/usr/bin/git','/opt/bin/node','/opt/bin/pnpm','/opt/pnpm-extracted/package/bin/pnpm.mjs'])
    (raw/'provisioned-launchers.json').write_text(json.dumps(launchers,indent=2)+'\n')
    try: grp.getgrnam('docker')
    except KeyError: run('docker-group',['/usr/sbin/groupadd','--system','docker'])
    try: user=pwd.getpwuid(1000)
    except KeyError:
        run('qualifier-user',['/usr/sbin/useradd','--uid','1000','--create-home','--groups','docker','--shell','/bin/sh','qualifier'])
        user=pwd.getpwuid(1000)
    environment['HOME']=user.pw_dir
    # The unchanged provider resolves pnpm's default store with a sanitized
    # environment plus HOME. Place the owned store there, without a symlink or
    # relying on a configuration variable removed by that boundary.
    store=Path(user.pw_dir)/'.local/share/pnpm/store'
    assert not store.exists()
    store.parent.mkdir(parents=True,exist_ok=True)
    Path('/opt/pnpm-store').rename(store)
    environment['pnpm_config_store_dir']=str(store)
    Path('/work').mkdir()
    run('source-clone',['/usr/bin/git','clone','--no-hardlinks','/opt/input/source.bundle','/work/source'])
    run('source-branch',['/usr/bin/git','checkout','-B','master',binding['sourceCommit']],'/work/source')
    run('source-remote-remove',['/usr/bin/git','remote','remove','origin'],'/work/source')
    for owned in ['/work',str(store),'/opt/pnpm-cache']:
        assert Path(owned).resolve()==Path(owned)
        for directory,dirs,files in os.walk(owned):
            os.chown(directory,1000,1000)
            for name in files: os.chown(Path(directory)/name,1000,1000,follow_symlinks=False)
    # The source/store and every writeable clone are within this one disposable guest.
    run('source-install',['/opt/bin/pnpm','install','--frozen-lockfile','--offline','--ignore-scripts','--package-import-method','copy'],'/work/source',user=True)
    run('fixture-install',['/opt/bin/pnpm','install','--frozen-lockfile','--offline','--ignore-scripts','--ignore-workspace','--package-import-method','copy'],'/work/source/fixtures/oci-candidate',user=True)
    # Probe the production helper's sanitized-environment resolution itself.
    # Only this guest account or its explicitly owned /work store may receive
    # public package data; no candidate path selects a host write.
    query='import {resolveControllerPnpmStorePath} from "./tools/milestone-orchestrator/src/container-executor.ts"; import {homedir} from "node:os"; resolveControllerPnpmStorePath(30000).then(path=>console.log(JSON.stringify({path,home:homedir()})))'
    resolved=json.loads(run('provider-store-path',['/opt/bin/pnpm','exec','tsx','--eval',query],'/work/source',True))
    providerStore=Path(resolved['path'])
    assert providerStore.is_absolute() and providerStore.name=='v11'
    assert (providerStore.is_relative_to(Path(user.pw_dir)) or providerStore==Path('/work/.pnpm-store/v11')) and '..' not in providerStore.parts
    assert not providerStore.is_symlink()
    if not (providerStore/'index.db').exists():
        assert not providerStore.exists()
        providerStore.parent.mkdir(parents=True,exist_ok=True)
        (store/'v11').rename(providerStore)
        for directory,dirs,files in os.walk(providerStore):
            os.chown(directory,1000,1000)
            for name in files:os.chown(Path(directory)/name,1000,1000)
    assert (providerStore/'index.db').is_file() and (providerStore/'files').is_dir()
    environment['pnpm_config_store_dir']=str(providerStore.parent)
    run('guest-job-unit',['/usr/bin/systemctl','show','orch-guest-job.service','--property=InvocationID,MainPID,ControlGroup,RuntimeMaxUSec,KillMode,ActiveState'])
    run('provisioned-disk',['/usr/bin/df','--block-size=1','/'])
    dockerLog=(raw/'dockerd.log').open('wb')
    daemon=subprocess.Popen(['/usr/bin/dockerd','--host=unix:///run/docker.sock','--data-root=/var/lib/orch-docker','--exec-root=/run/orch-docker','--pidfile=/run/orch-docker.pid','--bridge=none','--iptables=false','--ip6tables=false','--ip-forward=false','--ip-masq=false','--userland-proxy=false'],stdout=dockerLog,stderr=subprocess.STDOUT,env=environment)
    for _ in range(300):
        if Path('/run/docker.sock').exists(): break
        assert daemon.poll() is None,'Docker daemon terminated'
        time.sleep(.1)
    run('image-load',['/usr/bin/docker','image','load','--input','/opt/input/oci.tar'],timeout=300)
    nodeVersion=run('node-version',['/opt/bin/node','--version']).strip()
    pnpmVersion=run('pnpm-version',['/opt/bin/pnpm','--version']).strip()
    docker=json.loads(run('docker-version',['/usr/bin/docker','version','--format','{{json .}}']))
    image=json.loads(run('image-inspect',['/usr/bin/docker','image','inspect',binding['imageDigest']]))
    head=run('source-head',['/usr/bin/git','rev-parse','HEAD'],'/work/source',True).strip()
    tree=run('source-tree',['/usr/bin/git','rev-parse','HEAD^{tree}'],'/work/source',True).strip()
    status=run('source-status',['/usr/bin/git','status','--porcelain'],'/work/source',True)
    private=run('source-private-refs',['/usr/bin/git','for-each-ref','--format=%(refname)','refs/milestone-loop/'],'/work/source',True)
    run('exact-toolchain',['/opt/bin/node','tools/milestone-orchestrator/ci/assert-exact-toolchain.mjs','--output','artifacts/setup/toolchain.json'],'/work/source',True)
    # Ubuntu's root account skeleton may contain an empty SSH directory. Never
    # accept credential data, even in this fresh guest; remove only empty files
    # and the verified empty directory and retain the precise observation.
    ssh=Path('/root/.ssh')
    sshEntries=[]
    if ssh.exists():
        assert ssh.is_dir() and not ssh.is_symlink()
        for path in sorted(ssh.iterdir()):
            assert path.is_file() and not path.is_symlink() and path.stat().st_size==0
            sshEntries.append({'name':path.name,'bytes':0,'sha256':digest(path)})
        for entry in sshEntries:(ssh/entry['name']).unlink()
        ssh.rmdir()
    (raw/'empty-guest-ssh-skeleton.json').write_text(json.dumps({'entries':sshEntries,'directoryAbsent':not ssh.exists()},indent=2)+'\n')
    ready={'bootId':Path('/proc/sys/kernel/random/boot_id').read_text().strip(),'platform':'linux','kernel':os.uname().release,'osRelease':Path('/etc/os-release').read_text(),'networkInterfaces':sorted(p.name for p in Path('/sys/class/net').iterdir()),'mounts':Path('/proc/self/mountinfo').read_text(),'cgroupControllers':Path('/sys/fs/cgroup/cgroup.controllers').read_text().split(),'nodeVersion':nodeVersion,'pnpmVersion':pnpmVersion,'dockerVersion':docker,'image':image,'source':{'commit':head,'tree':tree,'status':status,'privateRefs':private},'forbiddenPaths':{p:Path(p).exists() for p in ['/mnt/c','/mnt/wsl','/home/duncan/.ssh','/root/.ssh','/work/source/artifacts/orchestrator/state/state.json']}}
    (raw/'host-ready.json').write_text(json.dumps(ready,indent=2)+'\n')
    send('host-ready',observation=ready)
    receive('admit-oci-probe')
    (raw/'dispatch.json').write_text(json.dumps({'purpose':'candidate-support','controllerWorkflowsDispatched':False,'cases':['normal','boundary','artifact-link','artifact-quota','output-flood','hang'],'producerCount':1,'binding':binding},indent=2)+'\n')
    run('oci-matrix',['/opt/bin/pnpm','test:oci-container','--output','artifacts/oci'],'/work/source',True,timeout=1500)
    artifacts=Path('/work/source/artifacts')
    (artifacts/'matrix-exit-code.txt').write_text(str(json.loads((raw/'oci-matrix.json').read_text())['exitCode'])+'\n')
    shutil.copyfile(raw/'image-inspect.stdout',artifacts/'image-inspect.json')
    containers=run('post-containers',['/usr/bin/docker','ps','--all','--quiet']).strip()
    volumes=run('post-volumes',['/usr/bin/docker','volume','ls','--quiet']).strip()
    shutil.copyfile(raw/'post-containers.stdout',artifacts/'containers-after.txt')
    shutil.copyfile(raw/'post-volumes.stdout',artifacts/'volumes-after.txt')
    assert containers=='' and volumes=='', (containers,volumes)
    send('oci-completed',containers=containers,volumes=volumes)
    export()
    send('complete',controllerWorkflowsDispatched=False)
    receive('shutdown')
except Exception as error:
    failure=traceback.format_exc()
    send('failure',error=str(error)[-8000:],traceback=failure[-16000:])
    try:(raw/'failure.txt').write_text(failure)
    except OSError as writeError:send('diagnostic-write-failure',error=str(writeError))
    try: export()
    except Exception as exportError: send('export-failure',error=str(exportError))
finally:
    channel.close()
