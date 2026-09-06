"""Exercise real kernel resource refusals in six owned transient service units.

Small fault limits test enforcement mechanisms without exhausting the workstation.
The separate QEMU observations own the actual host's larger configured limits.
"""
import errno
import hashlib
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time
import uuid


def digest(path):
    with open(path, 'rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def worker(mode, root):
    assert os.getuid() == 65534
    cgroup = Path('/sys/fs/cgroup' + Path('/proc/self/cgroup').read_text().strip().split('::')[1])
    result = {'mode': mode, 'uid': os.getuid(), 'pid': os.getpid(), 'cgroup': str(cgroup)}
    if mode == 'memory':
        child = os.fork()
        if child == 0:
            Path('/proc/self/oom_score_adj').write_text('1000')
            allocation = bytearray(128 * 1024**2)
            os._exit(0 if allocation else 1)
        _, status = os.waitpid(child, 0)
        result.update(childStatus=status, events=(cgroup/'memory.events').read_text())
        assert os.WIFSIGNALED(status) and os.WTERMSIG(status) == signal.SIGKILL
        assert int(dict(line.split() for line in result['events'].splitlines())['oom_kill']) >= 1
    elif mode == 'pids':
        children = []
        refused = None
        try:
            for _ in range(32):
                try:
                    child = os.fork()
                except OSError as error:
                    refused = error.errno
                    break
                if child == 0:
                    time.sleep(20)
                    os._exit(0)
                children.append(child)
            result.update(children=children, errno=refused, events=(cgroup/'pids.events').read_text())
            assert refused == errno.EAGAIN and len(children) < 16
            assert int(dict(line.split() for line in result['events'].splitlines())['max']) >= 1
        finally:
            for child in children:
                os.kill(child, signal.SIGKILL)
                os.waitpid(child, 0)
    elif mode == 'cpu':
        children = []
        before = (cgroup/'cpu.stat').read_text()
        for _ in range(4):
            child = os.fork()
            if child == 0:
                while True:
                    sum(range(10000))
            children.append(child)
        time.sleep(2)
        for child in children:
            os.kill(child, signal.SIGKILL)
            os.waitpid(child, 0)
        after = (cgroup/'cpu.stat').read_text()
        result.update(before=before, after=after)
        values = dict(line.split() for line in after.splitlines())
        assert int(values['nr_throttled']) > 0 and int(values['throttled_usec']) > 0
    elif mode == 'file':
        signal.signal(signal.SIGXFSZ, signal.SIG_IGN)
        target = root/'writeable/file-bound'
        refused = None
        try:
            with target.open('wb', buffering=0) as stream:
                for _ in range(4):
                    stream.write(b'x' * 524288)
        except OSError as error:
            refused = error.errno
        result.update(errno=refused, bytes=target.stat().st_size, limits=Path('/proc/self/limits').read_text())
        assert refused == errno.EFBIG and result['bytes'] == 1048576
        target.unlink()
    elif mode == 'network-mount':
        assert (root/'readonly').read_text() == 'outside-unchanged\n'
        failures = {}
        try:
            with (root/'readonly').open('r+b'):
                pass
        except OSError as error:
            failures['writeReadonly'] = error.errno
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM):
                pass
        except OSError as error:
            failures['networkFamily'] = error.errno
        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as channel:
                channel.connect('/run/docker.sock')
        except OSError as error:
            failures['maskedDaemon'] = error.errno
        result.update(failures=failures, interfaces=sorted(p.name for p in Path('/sys/class/net').iterdir()), mounts=Path('/proc/self/mountinfo').read_text())
        assert failures['writeReadonly'] == errno.EROFS
        assert failures['networkFamily'] in [errno.EAFNOSUPPORT, errno.EPERM]
        assert failures['maskedDaemon'] == errno.EACCES
        assert result['interfaces'] == ['lo']
    elif mode == 'deadline':
        child = os.fork()
        if child == 0:
            while True:
                time.sleep(1)
        print(json.dumps({**result, 'child': child, 'reached': True}), flush=True)
        while True:
            time.sleep(1)
    else:
        raise ValueError(mode)
    result['status'] = 'OBSERVED_EXPECTED_KERNEL_BOUNDARY'
    print(json.dumps(result), flush=True)


if sys.argv[1:2] == ['--worker']:
    assert len(sys.argv) == 4
    worker(sys.argv[2], Path(sys.argv[3]))
    sys.exit(0)

assert len(sys.argv) == 1 and os.getuid() == 0
prefix = Path('/home/duncan/oc3-b13lp2vx')
assert prefix.resolve() == prefix and prefix.stat().st_uid == 1000
root = prefix/('resource-' + str(uuid.uuid4()))
root.mkdir(mode=0o755)
(root/'executed-probes.py').write_bytes(Path(__file__).read_bytes())
(root/'readonly').write_text('outside-unchanged\n')
os.chown(root/'readonly', 65534, 65534)
(root/'writeable').mkdir(mode=0o700)
os.chown(root/'writeable', 65534, 65534)
packageBefore = digest('/var/lib/dpkg/status')
results = []
try:
    for mode in ['memory', 'pids', 'cpu', 'file', 'network-mount', 'deadline']:
        unit = 'orch-c3-probe-' + str(uuid.uuid4()) + '.service'
        properties = ['User=65534', 'Group=65534', 'MemoryMax=64M', 'MemorySwapMax=0', 'CPUQuota=10%', 'TasksMax=16', 'LimitFSIZE=1M', 'RuntimeMaxSec=' + ('2' if mode == 'deadline' else '30'), 'TimeoutStopSec=1', 'KillMode=control-group', 'NoNewPrivileges=yes', 'CapabilityBoundingSet=', 'ProtectSystem=strict', 'ProtectHome=tmpfs', 'PrivateNetwork=yes', 'PrivateTmp=yes', 'RestrictAddressFamilies=AF_UNIX', 'InaccessiblePaths=/mnt /root -/run/docker.sock', 'BindReadOnlyPaths=' + str(root/'executed-probes.py') + ' ' + str(root/'readonly'), 'BindPaths=' + str(root/'writeable'), 'ReadWritePaths=' + str(root/'writeable')]
        argv = ['/usr/bin/systemd-run', '--unit=' + unit, '--collect', '--wait', '--pipe', '--quiet']
        for value in properties:
            argv += ['--property', value]
        if mode == 'memory':
            # Keep the observer alive after the deliberately killed allocator.
            # This affects only this tiny fault-probe unit, never the VM policy.
            argv += ['--property', 'OOMPolicy=continue']
        argv += ['/usr/bin/python3.12', '-I', str(root/'executed-probes.py'), '--worker', mode, str(root)]
        started = time.monotonic()
        p = subprocess.run(argv, capture_output=True, timeout=40, env={'PATH': '/usr/bin:/bin', 'LANG': 'C'})
        (root/(mode+'.stdout')).write_bytes(p.stdout)
        (root/(mode+'.stderr')).write_bytes(p.stderr)
        result = {'mode': mode, 'unit': unit, 'argv': argv, 'exitCode': p.returncode, 'durationMs': round((time.monotonic()-started)*1000)}
        (root/(mode+'.json')).write_text(json.dumps(result, indent=2)+'\n')
        observed = json.loads(p.stdout)
        if mode == 'deadline':
            assert p.returncode != 0 and observed['reached'] is True
            assert 1500 <= result['durationMs'] < 10000
            assert not Path('/proc', str(observed['pid'])).exists()
            assert not Path('/proc', str(observed['child'])).exists()
        else:
            assert p.returncode == 0 and observed['status'] == 'OBSERVED_EXPECTED_KERNEL_BOUNDARY'
        state = subprocess.run(['/usr/bin/systemctl', 'show', unit, '--property=MainPID,LoadState,ActiveState'], capture_output=True, timeout=10)
        (root/(mode+'.unit-after')).write_bytes(state.stdout + state.stderr)
        assert b'MainPID=0' in state.stdout and b'LoadState=not-found' in state.stdout
        assert not Path('/sys/fs/cgroup/system.slice', unit).exists()
        result.update(cgroupAbsent=True, observed=observed)
        results.append(result)
        print(json.dumps({'mode': mode, 'exitCode': p.returncode, 'boundaryObserved': True}), flush=True)
    assert (root/'readonly').read_text() == 'outside-unchanged\n'
    assert list((root/'writeable').iterdir()) == []
    # Remove the verified empty private scratch directory; retained evidence
    # then needs no privilege to inventory independently.
    (root/'writeable').rmdir()
    assert packageBefore == digest('/var/lib/dpkg/status')
    (root/'result.json').write_text(json.dumps({'status': 'OBSERVED_REQUIRES_INDEPENDENT_AUDIT', 'mechanismFaultLimitsOnly': True, 'hostAdmission': False, 'completionEligible': False, 'packageStatusBefore': packageBefore, 'packageStatusAfter': digest('/var/lib/dpkg/status'), 'results': results}, indent=2)+'\n')
finally:
    print(json.dumps({'output': str(root)}), flush=True)
