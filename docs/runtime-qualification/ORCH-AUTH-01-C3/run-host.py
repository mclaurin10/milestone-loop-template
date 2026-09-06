"""Bounded privileged coordinator; QEMU itself runs as UID 65534 without capabilities.

Only the declared task unit and task-owned files are mutated. Guest data never
selects host commands, unit names, paths, approval or execution limits.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import select
import socket
import stat
import subprocess
import sys
import time
import traceback

assert os.getuid()==0
expectedPath=Path(sys.argv[1])
assert re.fullmatch(r'/home/duncan/oc3-[A-Za-z0-9_-]+/expected-[a-f0-9-]+\.json',str(expectedPath))
expected=json.loads(expectedPath.read_bytes())
root=expectedPath.parent
assert root.resolve()==root and root.stat().st_uid==1000
binding=expected['binding']
assert re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}',binding['runId'])
assert re.fullmatch(r'[a-f0-9]{64}',binding['nonce'])
assert binding['authorityDigest']=='53d38a2c2038cd9c5ffc240275043709d23dd33a81237e3d12018a38a8378108'
assert binding['purpose']=='candidate-support'
for k in ['sourceCommit','sourceTree']: assert re.fullmatch(r'[a-f0-9]{40}',binding[k])
assert binding['imageDigest']=='sha256:e405e2790e743243dd669f8e58eeaff6c585df3cbc77e9a4316a7f07b4e2eaad'
unit='orch-c3-'+binding['runId']+'.service'
directory=root/('guest-'+binding['runId'])
output=root/('observation-'+binding['runId'])
output.mkdir(mode=0o755)
output.joinpath('expected.json').write_bytes(expectedPath.read_bytes())
output.joinpath('executed-host.py').write_bytes(Path(__file__).read_bytes())
start=time.monotonic()
report={'schemaVersion':'orch-c3-host.v1','binding':binding,'unit':unit,'directory':str(directory),'status':'ERROR','controllerDispatched':False,'completionEligible':False,'launcher':{'uid':os.getuid(),'platform':sys.platform,'kernel':os.uname().release}}
process=None;qmp=None;job=None;pid=None;ownerBytes=None
qmpTranscript=[];events=[];archive=None

def digest(path):
    with open(path,'rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

def save(name,value):
    (output/name).write_text(json.dumps(value,indent=2)+'\n')

def run(name,argv,timeout=30,env=None):
    before=time.monotonic()
    p=subprocess.run(argv,capture_output=True,timeout=timeout,env=env or {'PATH':'/usr/bin:/bin','LANG':'C','LC_ALL':'C'},cwd=root)
    (output/(name+'.stdout')).write_bytes(p.stdout);(output/(name+'.stderr')).write_bytes(p.stderr)
    save(name+'.json',{'argv':argv,'exitCode':p.returncode,'durationMs':round((time.monotonic()-before)*1000)})
    assert p.returncode==0,(name,p.returncode,p.stderr.decode(errors='replace'))
    return p.stdout

def connect(path):
    for _ in range(300):
        assert process.poll() is None,'QEMU unit exited before channel connection'
        try:
            s=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);s.settimeout(1);s.connect(str(path));s.settimeout(10);return s
        except (FileNotFoundError,ConnectionRefusedError):s.close();time.sleep(.1)
    raise RuntimeError('QEMU channel unavailable')

def qmpCommand(command,arguments=None):
    index=len([v for v in qmpTranscript if v['direction']=='sent'])+1
    value={'execute':command,'id':index}
    if arguments is not None:value['arguments']=arguments
    qmpTranscript.append({'direction':'sent','value':value})
    qmp.write(json.dumps(value).encode()+b'\n')
    while True:
        line=qmp.readline(1048576)
        assert line and len(line)<1048576
        answer=json.loads(line);qmpTranscript.append({'direction':'received','value':answer})
        save('qmp.json',qmpTranscript)
        if answer.get('id')==index:
            assert 'error' not in answer,answer
            return answer['return']

def send(kind):
    job.sendall(json.dumps({'kind':kind,'runId':binding['runId'],'nonce':binding['nonce']}).encode()+b'\n')
    events.append({'direction':'sent','kind':kind,'atMs':round((time.monotonic()-start)*1000)})
    save('events.json',events)

try:
    assert digest(__file__)==expected['hostRunnerSha256']
    original=Path('/home/duncan/oc2-1_hj5pul')
    assert expected['base']['path']==str(original/'ubuntu-24.04-server-cloudimg-amd64.img')
    assert expected['base']['sha256']=='d0fe84bb5f80853425fa6be28e2c106f30104c3cfe8611933f2e65c9b63f0e30'
    assert re.fullmatch(re.escape(str(root))+r'/input-[a-f0-9-]+\.iso',expected['input']['path'])
    assert [p['path'] for p in expected['launchers']]==[str(original/'provider/usr/bin'/name) for name in ['qemu-system-x86_64','qemu-img','genisoimage']]
    assert [p['sha256'] for p in expected['launchers']]==['8a35ccba41582fc6c38b9df85fc9e35fa1d42f414d2d7d8090ee9b2f5e7c0854','634320b91165669917123e8e79cce1c4d00cee0a4aa4d662d7c0a8186479b3fb','9bacc5951ca0767701cfd8e6b47537f199977e51a6e943f4edfdcf9d639d99d2']
    for pin in [expected['base'],expected['input'],*expected['launchers']]:
        p=Path(pin['path']);s=p.lstat()
        assert not p.is_symlink() and p.is_file() and s.st_size==pin['bytes'] and digest(p)==pin['sha256']
    report['inputHashesBefore']={p['path']:digest(p['path']) for p in [expected['base'],expected['input'],*expected['launchers']]}
    report['packageStatusBefore']=digest('/var/lib/dpkg/status')
    assert int(re.search(r'MemAvailable:\s+(\d+)',Path('/proc/meminfo').read_text())[1])*1024>=5*1024**3
    directory.mkdir(mode=0o700);os.chown(directory,65534,65534)
    ownerBytes=(json.dumps({'unit':unit,'binding':binding,'directory':str(directory)})+'\n').encode()
    (directory/'owner.json').write_bytes(ownerBytes)
    sentinel=output/'outside-sentinel'
    sentinel.write_text(binding['nonce'])
    nativeEnv={'PATH':'/usr/bin:/bin','LANG':'C','LC_ALL':'C','LD_LIBRARY_PATH':str(original/'provider/usr/lib/x86_64-linux-gnu'),'QEMU_MODULE_DIR':str(original/'provider/usr/lib/x86_64-linux-gnu/qemu')}
    qemu=str(original/'provider/usr/bin/qemu-system-x86_64')
    qemuImg=str(original/'provider/usr/bin/qemu-img')
    iso=str(original/'provider/usr/bin/genisoimage')
    run('overlay',[qemuImg,'create','-f','qcow2','-F','qcow2','-b',expected['base']['path'],str(directory/'overlay.qcow2'),'16G'],env=nativeEnv)
    guestService=['/usr/bin/systemd-run','--no-block','--unit=orch-guest-job','--property=RuntimeMaxSec=1700','--property=KillMode=control-group','--property=TimeoutStopSec=5','--property=StandardOutput=tty','--property=StandardError=tty','--property=TTYPath=/dev/ttyS0','/usr/bin/python3.12','/opt/input/guest-job.py']
    boot="import json,pathlib,subprocess; pathlib.Path('/run/orch-binding.json').write_text("+repr(json.dumps(binding))+ "); pathlib.Path('/opt/input').mkdir(); subprocess.run(['/usr/bin/mount','-o','ro,nosuid,nodev','/dev/vdc','/opt/input'],check=True); subprocess.run("+repr(guestService)+",check=True)"
    seed={'user-data':'#cloud-config\n'+json.dumps({'users':[],'ssh_genkeytypes':[],'allow_public_ssh_keys':False,'network':{'config':'disabled'},'bootcmd':[['python3','-c',boot]]})+'\n','meta-data':json.dumps({'instance-id':binding['runId'],'local-hostname':'orch-c3'})+'\n','network-config':json.dumps({'version':2,'ethernets':{}})+'\n'}
    for name,value in seed.items():
        (directory/name).write_text(value);(output/name).write_text(value)
    run('seed',[iso,'-output',str(directory/'seed.iso'),'-volid','cidata','-joliet','-rock',*[str(directory/n) for n in seed]],env=nativeEnv)
    for path in directory.iterdir():os.chown(path,65534,65534)
    properties=['User=65534','Group=65534','SupplementaryGroups=993','MemoryMax=4G','MemorySwapMax=0','CPUQuota=200%','TasksMax=64','LimitFSIZE=18253611008','RuntimeMaxSec=1800','TimeoutStopSec=5','KillMode=control-group','NoNewPrivileges=yes','CapabilityBoundingSet=','ProtectSystem=strict','ProtectHome=tmpfs','PrivateTmp=yes','PrivateNetwork=yes','PrivateMounts=yes','RestrictAddressFamilies=AF_UNIX','RestrictSUIDSGID=yes','ProtectKernelTunables=yes','ProtectKernelModules=yes','ProtectControlGroups=yes','DevicePolicy=closed','DeviceAllow=/dev/kvm rw','InaccessiblePaths=/mnt /media /root -/run/docker.sock -/run/containerd -/etc/ssh -/etc/ssl/private',
        'BindReadOnlyPaths='+str(original/'provider')+' '+expected['base']['path']+' '+expected['input']['path'],
        'BindPaths='+str(directory),'ReadWritePaths='+str(directory),'WorkingDirectory='+str(directory),
        'Environment=LD_LIBRARY_PATH='+nativeEnv['LD_LIBRARY_PATH']+' QEMU_MODULE_DIR='+nativeEnv['QEMU_MODULE_DIR']]
    args=[qemu,'-no-user-config','-nodefaults','-display','none','-monitor','none','-machine','pc,accel=kvm,kernel-irqchip=split','-cpu','host','-m','3072','-smp','2','-nic','none','-no-reboot','-S','-name','orch-c3-'+binding['runId'],'-uuid',binding['runId'],'-sandbox','on,obsolete=deny,elevateprivileges=deny,spawn=deny,resourcecontrol=deny','-L',str(original/'provider/usr/share/qemu'),'-bios',str(original/'provider/usr/share/seabios/bios-256k.bin'),'-drive','file='+str(directory/'overlay.qcow2')+',if=virtio,format=qcow2','-drive','file='+str(directory/'seed.iso')+',if=virtio,format=raw,readonly=on','-drive','file='+expected['input']['path']+',if=virtio,format=raw,readonly=on','-serial','stdio','-qmp','unix:'+str(directory/'qmp.sock')+',server=on,wait=off','-chardev','socket,id=job,path='+str(directory/'job.sock')+',server=on,wait=off','-device','virtio-serial-pci','-device','virtserialport,chardev=job,name=orch.job']
    # QEMU's default I/O pool can itself grow to 64 threads, exceeding the
    # existing whole-unit task bound after vCPU/control threads are included.
    args.extend(['-object','main-loop,id=orch-main,thread-pool-min=0,thread-pool-max=16'])
    command=['/usr/bin/systemd-run','--unit='+unit,'--collect','--wait','--pipe','--quiet']
    for value in properties:command.extend(['--property',value])
    command+=args
    save('launch.json',{'argv':command,'properties':properties,'qemuArgv':args})
    serial=(output/'serial.log').open('wb');stderr=(output/'launcher.stderr').open('wb')
    process=subprocess.Popen(command,stdout=serial,stderr=stderr,env={'PATH':'/usr/bin:/bin','LANG':'C','LC_ALL':'C'})
    qmpSocket=connect(directory/'qmp.sock');qmp=qmpSocket.makefile('rwb',buffering=0)
    greeting=json.loads(qmp.readline(1048576));qmpTranscript.append({'direction':'received','value':greeting})
    qmpCommand('qmp_capabilities')
    observations={}
    for name in ['query-name','query-uuid','query-kvm','query-status','query-memory-size-summary','query-cpus-fast','query-block','query-chardev','query-pci']:
        observations[name]=qmpCommand(name)
    observations['network']=qmpCommand('human-monitor-command',{'command-line':'info network'})
    observations['qom-get']=qmpCommand('qom-get',{'path':'/objects/orch-main','property':'thread-pool-max'})
    assert observations['qom-get']==16
    assert observations['query-kvm']['enabled'] is True
    assert observations['query-status']['status']=='prelaunch'
    assert observations['query-memory-size-summary']['base-memory']==3072*1024**2
    assert len(observations['query-cpus-fast'])==2 and observations['network'].strip()==''
    assert observations['query-uuid']['UUID']==binding['runId']
    blocks=observations['query-block']
    assert len(blocks)==3
    for i,path in enumerate([str(directory/'overlay.qcow2'),str(directory/'seed.iso'),expected['input']['path']]):
        assert blocks[i]['inserted']['file']==path
        assert blocks[i]['inserted']['ro']==(i>0)
    assert blocks[0]['inserted']['backing_file']==expected['base']['path']
    assert blocks[0]['inserted']['image']['virtual-size']==16*1024**3
    assert all(d['class_info']['class']>>8!=2 for bus in observations['query-pci'] for d in bus['devices'])
    pid=int(run('main-pid',['/usr/bin/systemctl','show',unit,'--property=MainPID','--value']).strip())
    proc=Path('/proc')/str(pid)
    status=proc.joinpath('status').read_text()
    cgroupPath='/sys/fs/cgroup'+proc.joinpath('cgroup').read_text().strip().split('::')[1]
    cgroup=Path(cgroupPath)
    resources={name:(cgroup/name).read_text() for name in ['memory.max','memory.swap.max','cpu.max','pids.max','cgroup.procs']}
    save('resource-observation.json',{'pid':pid,'status':status,'cgroupPath':cgroupPath,'resources':resources,'processes':{value:Path('/proc',value,'cmdline').read_bytes().replace(b'\0',b' ').decode() if Path('/proc',value,'cmdline').exists() else None for value in resources['cgroup.procs'].split()}})
    assert resources['memory.max'].strip()=='4294967296' and resources['memory.swap.max'].strip()=='0'
    assert resources['cpu.max'].strip()=='200000 100000' and resources['pids.max'].strip()=='64'
    # KVM creates an init-PID-namespace recovery kthread and attaches it to this
    # cgroup. In this WSL PID namespace the kernel prints its PID as zero.
    # Retain that observation; bound the whole cgroup and require its removal.
    assert os.uname().release=='6.6.87.2-microsoft-standard-WSL2'
    assert sorted(resources['cgroup.procs'].split())==sorted([str(pid),'0'])
    save('namespace-observation.json',{'readerPidNamespace':os.readlink('/proc/self/ns/pid'),'qemuPidNamespace':os.readlink(str(proc/'ns/pid')),'cgroupMembers':resources['cgroup.procs'].split(),'zeroMemberIdentity':'not directly observable in reader PID namespace; inferred KVM recovery kthread from matching kernel source','cleanupRequiresWholeCgroupAbsent':True})
    for field,value in [('Uid','65534\t65534\t65534\t65534'),('CapEff','0000000000000000'),('NoNewPrivs','1'),('Seccomp','2')]:
        assert re.search('^'+field+r':\s*(.*)$',status,re.M)[1]==value,(field,status)
    limits=proc.joinpath('limits').read_text()
    assert re.search(r'^Max file size\s+18253611008\s+18253611008\s+bytes',limits,re.M)
    hidden={p:(proc/'root'/p.lstrip('/')).exists() for p in ['/mnt/c','/home/duncan/.ssh','/root/.ssh']}
    mounts=proc.joinpath('mountinfo').read_text()
    maskedSocket=proc/'root/run/docker.sock'
    socketMode=stat.S_IMODE(maskedSocket.stat().st_mode)
    save('mount-observation.json',{'hiddenPaths':hidden,'dockerSocketMode':socketMode,'mounts':mounts,'mountNamespace':os.readlink(str(proc/'ns/mnt')),'readerMountNamespace':os.readlink('/proc/self/ns/mnt')})
    assert not any(hidden.values())
    # InaccessiblePaths replaces a socket with a mode-000 inaccessible socket;
    # existence from the privileged observer does not mean daemon exposure.
    assert socketMode==0 and ' /systemd/inaccessible/sock /run/docker.sock ro,' in mounts
    assert re.search(r'^Groups:\s+993 65534\s*$',status,re.M)
    invocation=run('unit-properties',['/usr/bin/systemctl','show',unit,'--property=InvocationID,MainPID,ControlGroup,User,Group,SupplementaryGroups,MemoryMax,MemorySwapMax,CPUQuotaPerSecUSec,TasksMax,RuntimeMaxUSec,LimitFSIZE,PrivateNetwork,ProtectHome,ProtectSystem,NoNewPrivileges,CapabilityBoundingSet,DevicePolicy,DeviceAllow'])
    report['hostBefore']={'pid':pid,'startStat':proc.joinpath('stat').read_text(),'status':status,'limits':limits,'resources':resources,'cgroupPath':cgroupPath,'mounts':proc.joinpath('mountinfo').read_text(),'hiddenPaths':hidden,'unitProperties':invocation.decode(),'qmp':observations}
    save('host-before.json',report['hostBefore'])
    job=connect(directory/'job.sock');job.setblocking(False)
    qmpCommand('cont')
    buffer=b'';complete=False;failed=False;sequence=0;archiveExpected=None
    live=[];lastLive=0
    while not complete:
        assert time.monotonic()-start<1800,'Host lifecycle deadline exceeded'
        assert process.poll() is None,'QEMU unit exited during guest job'
        assert (output/'serial.log').stat().st_size<8*1024**2 and (output/'launcher.stderr').stat().st_size<8*1024**2
        if time.monotonic()-lastLive>=15:
            live.append({'atMs':round((time.monotonic()-start)*1000),'resources':{name:(cgroup/name).read_text() for name in ['memory.current','memory.events','cpu.stat','pids.current','pids.events','io.stat']},'overlayBytes':(directory/'overlay.qcow2').stat().st_size})
            assert len(live)<=121
            save('host-live.json',live);lastLive=time.monotonic()
        ready,_,_=select.select([job],[],[],.5)
        if not ready:continue
        chunk=job.recv(262144)
        assert chunk,'Guest channel closed before completion'
        buffer+=chunk
        assert len(buffer)<524288,'Guest frame bound exceeded'
        while b'\n' in buffer:
            line,buffer=buffer.split(b'\n',1)
            value=json.loads(line)
            assert value['runId']==binding['runId'] and value['nonce']==binding['nonce']
            kind=value['kind']
            if kind=='archive-chunk':
                assert archive is not None and value['sequence']==sequence
                data=base64.b64decode(value['data'],validate=True)
                assert len(data)<=32768
                archive.write(data);sequence+=1
                assert archive.tell()<=archiveExpected['bytes']
                continue
            events.append({'direction':'received','value':value,'atMs':round((time.monotonic()-start)*1000)})
            save('events.json',events)
            print(json.dumps({'kind':kind,'phase':value.get('phase'),'error':value.get('error')}),flush=True)
            if kind=='host-ready':
                observed=value['observation']
                assert observed['platform']=='linux' and observed['networkInterfaces']==['lo']
                assert observed['nodeVersion']=='v24.18.0' and observed['pnpmVersion']=='11.15.1'
                assert observed['dockerVersion']['Server']['Version']=='29.1.3'
                assert len(observed['image'])==1 and observed['image'][0]['Id']==binding['imageDigest']
                assert observed['source']=={'commit':binding['sourceCommit'],'tree':binding['sourceTree'],'status':'','privateRefs':''}
                assert not any(observed['forbiddenPaths'].values())
                assert {'cpu','memory','pids'}.issubset(observed['cgroupControllers'])
                report['guestReady']=observed
                # Host admission for this trusted provider probe; no product controller dispatch.
                send('admit-oci-probe')
            elif kind=='archive-start':
                assert archive is None and 0<value['bytes']<64*1024**2
                archiveExpected=value;archive=(output/'guest-evidence.tar.gz').open('xb')
            elif kind=='archive-end':
                assert archive is not None and archive.tell()==archiveExpected['bytes']
                archive.close();archive=None
                assert value['sha256']==archiveExpected['sha256']==digest(output/'guest-evidence.tar.gz')
                report['archive']={'file':'guest-evidence.tar.gz','bytes':archiveExpected['bytes'],'sha256':value['sha256']}
                if failed:complete=True
            elif kind=='failure':failed=True;report['guestFailure']=value['error']
            elif kind=='export-failure':
                failed=True;complete=True;report['guestExportFailure']=value['error']
            elif kind=='complete':
                assert not failed and 'archive' in report
                complete=True;send('shutdown');report['status']='OBSERVED_OCI_REQUIRES_INDEPENDENT_AUDIT'
    assert not failed,report.get('guestFailure')
except Exception:
    report['failure']=traceback.format_exc()
    (output/'failure.txt').write_text(report['failure'])
    print(report['failure'],file=sys.stderr,flush=True)
finally:
    if archive:archive.close()
    if qmp:
        try:qmpCommand('quit')
        except Exception as error:report['qmpQuitError']=str(error)
        qmp.close()
    if job:job.close()
    if process:
        try:process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            p=subprocess.run(['/usr/bin/systemctl','stop',unit],capture_output=True,timeout=15)
            save('forced-unit-stop.json',{'exitCode':p.returncode,'stdout':p.stdout.decode(),'stderr':p.stderr.decode()})
            process.wait(timeout=10)
        report['unitLauncherExit']=process.returncode
        serial.close();stderr.close()
    try:
        state=subprocess.run(['/usr/bin/systemctl','show',unit,'--property=LoadState,ActiveState,SubState,MainPID'],capture_output=True,timeout=10)
        report['unitAfter']={'exitCode':state.returncode,'stdout':state.stdout.decode(),'stderr':state.stderr.decode()}
        report['pidAbsent']=pid is None or not Path('/proc/'+str(pid)).exists()
        assert report['pidAbsent'],'Owned QEMU process remains'
        assert b'MainPID=0' in state.stdout
        report['cgroupAbsent']=not Path('/sys/fs/cgroup/system.slice',unit).exists()
        assert report['cgroupAbsent'],'Owned cgroup still exists'
        if ownerBytes is not None:
            assert directory.resolve()==directory and (directory/'owner.json').read_bytes()==ownerBytes
            allowed={'owner.json','overlay.qcow2','seed.iso','user-data','meta-data','network-config','qmp.sock','job.sock'}
            entries=list(directory.iterdir())
            assert {p.name for p in entries}.issubset(allowed),'Foreign guest directory entry'
            for p in entries:
                mode=p.lstat().st_mode
                assert stat.S_ISREG(mode) or stat.S_ISSOCK(mode),'Unsafe cleanup entry'
            for p in entries:p.unlink()
            directory.rmdir()
        report['directoryAbsent']=not directory.exists()
        report['inputHashesAfter']={p['path']:digest(p['path']) for p in [expected['base'],expected['input'],*expected['launchers']]}
        assert report['inputHashesBefore']==report['inputHashesAfter']
        report['packageStatusAfter']=digest('/var/lib/dpkg/status')
        assert report['packageStatusBefore']==report['packageStatusAfter']
        assert (output/'outside-sentinel').read_text()==binding['nonce']
        report['cleanupVerified']=True
    except Exception:report['cleanupFailure']=traceback.format_exc();report['status']='ERROR'
    report['durationMs']=round((time.monotonic()-start)*1000)
    save('host.json',report)
    print(json.dumps({'output':str(output),'status':report['status'],'cleanupVerified':report.get('cleanupVerified',False),'durationMs':report['durationMs']}),flush=True)
sys.exit(0 if report['status']=='OBSERVED_OCI_REQUIRES_INDEPENDENT_AUDIT' and report.get('cleanupVerified') else 1)
