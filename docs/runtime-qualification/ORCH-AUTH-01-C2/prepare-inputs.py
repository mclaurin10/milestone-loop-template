"""Prepare C2 inputs in a new directory; never install host packages or run maintainer scripts."""
import gzip
import hashlib
import io
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

root = Path(tempfile.mkdtemp(prefix="oc2-", dir="/home/duncan"))
raw = root / "preparation"
raw.mkdir()
print(str(root), flush=True)
(raw / "root.txt").write_text(str(root) + "\n")

def digest(path):
    with open(path, "rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()

def run(name, args, timeout=60):
    started = time.monotonic()
    result = subprocess.run(args, cwd=root, capture_output=True, timeout=timeout, check=False)
    (raw / (name + ".stdout")).write_bytes(result.stdout)
    (raw / (name + ".stderr")).write_bytes(result.stderr)
    (raw / (name + ".json")).write_text(json.dumps({"argv": args, "exitCode": result.returncode, "durationMs": round((time.monotonic()-started)*1000)}, indent=2)+"\n")
    if result.returncode:
        raise RuntimeError(name + ": " + result.stderr.decode(errors="replace"))
    return result.stdout

def download(url, path, maximum):
    started = time.monotonic()
    with urllib.request.urlopen(url, timeout=30) as response, path.open("xb") as output:
        count = 0
        while chunk := response.read(1024*1024):
            count += len(chunk)
            if count > maximum or time.monotonic()-started > 900:
                raise RuntimeError("Download bound exceeded")
            output.write(chunk)
    return {"url": url, "path": str(path), "bytes": path.stat().st_size, "sha256": digest(path)}

before = digest('/var/lib/dpkg/status')
simulation = run("apt-simulation", ["/usr/bin/apt-get", "--simulate", "--no-install-recommends", "install", "qemu-system-x86", "qemu-utils", "genisoimage"]).decode()
wanted = dict(re.findall(r"^Inst (\S+) \((\S+) ", simulation, re.M))
assert len(wanted) <= 40 and 'qemu-system-x86' in wanted
key = Path('/usr/share/keyrings/ubuntu-archive-keyring.gpg')
shutil.copyfile(key, raw / key.name)
package_records = {}
index_records = []
for suite in ['noble', 'noble-updates']:
    prefix = 'archive.ubuntu.com_ubuntu_dists_' + suite
    release = Path('/var/lib/apt/lists') / (prefix + '_InRelease')
    shutil.copyfile(release, raw / (suite + '-InRelease'))
    run(suite + '-signature', ['/usr/bin/gpgv', '--status-fd', '1', '--keyring', str(key), str(release)])
    signed = release.read_text()
    assert 'Origin: Ubuntu\n' in signed and ('Suite: '+suite+'\n') in signed
    section = signed.split('\nSHA256:\n')[1].split('\nSHA512:')[0]
    checks = {p: (int(size), sha) for sha, size, p in re.findall(r'^ ([0-9a-f]{64})\s+(\d+)\s+(\S+)$', section, re.M)}
    for component in ['main', 'universe']:
        index = Path('/var/lib/apt/lists') / (prefix+'_'+component+'_binary-amd64_Packages')
        data = index.read_bytes()
        expected = checks[component+'/binary-amd64/Packages']
        assert (len(data), hashlib.sha256(data).hexdigest()) == expected
        found = []
        for stanza in data.decode().split('\n\n'):
            fields = dict(re.findall(r'^(\S+): (.*)$', stanza, re.M))
            name = fields.get('Package')
            if name in wanted and fields.get('Version') == wanted[name]:
                package_records[name] = {"index": suite+'-'+component+'-Packages.gz', "fields": fields}
                found.append(name)
        if found:
            retained = raw / (suite+'-'+component+'-Packages.gz')
            retained.write_bytes(gzip.compress(data, mtime=0))
            index_records.append({"file": retained.name, "suite": suite, "component": component, "bytes": len(data), "sha256": expected[1]})
assert set(package_records) == set(wanted), (set(wanted)-set(package_records))
packages = root / 'packages'
packages.mkdir()
prefix = root / 'provider'
prefix.mkdir()
downloads = []
for name, record in package_records.items():
    fields = record['fields']
    filename = fields['Filename']
    assert filename.startswith('pool/') and '..' not in filename.split('/')
    target = packages / Path(filename).name
    observation = download('https://archive.ubuntu.com/ubuntu/'+filename, target, 40*1024*1024)
    assert observation['sha256'] == fields['SHA256'] and observation['bytes'] == int(fields['Size'])
    observation.update({"package": name, "version": fields['Version'], "index": record['index']})
    downloads.append(observation)
    # Read the payload as a tar archive. No control archive or maintainer script executes.
    payload = subprocess.run(['/usr/bin/dpkg-deb', '--fsys-tarfile', str(target)], capture_output=True, timeout=60, check=True).stdout
    with tarfile.open(fileobj=io.BytesIO(payload), mode='r:') as archive:
        for member in archive.getmembers():
            assert not member.name.startswith('/') and '..' not in Path(member.name).parts
            assert member.isdir() or member.isfile() or member.issym() or member.islnk()
        archive.extractall(prefix, filter='data')
    print('verified/extracted '+name, flush=True)
image_base = 'https://cloud-images.ubuntu.com/releases/noble/release-20260826/'
image_name = 'ubuntu-24.04-server-cloudimg-amd64.img'
image_key = Path('/usr/share/keyrings/ubuntu-cloudimage-keyring.gpg')
shutil.copyfile(image_key, raw / image_key.name)
for name in ['SHA256SUMS', 'SHA256SUMS.gpg']:
    download(image_base+name, raw/name, 1024*1024)
run('image-signature', ['/usr/bin/gpgv', '--status-fd', '1', '--keyring', str(image_key), str(raw/'SHA256SUMS.gpg'), str(raw/'SHA256SUMS')])
expected = [line.split()[0] for line in (raw/'SHA256SUMS').read_text().splitlines() if line.split()[-1].lstrip('*') == image_name]
assert len(expected) == 1
print('downloading signed Ubuntu image', flush=True)
image = download(image_base+image_name, root/image_name, 700*1024*1024)
assert image['sha256'] == expected[0]
os.chmod(root/image_name, 0o444)
launchers = []
for name in ['qemu-system-x86_64', 'qemu-img', 'genisoimage']:
    path = prefix/'usr/bin'/name
    data = path.read_bytes()
    assert not path.is_symlink() and data[:4] == b'\x7fELF'
    launchers.append({"path": str(path), "bytes": len(data), "sha256": digest(path), "prefix": data[:64].hex()})
    run(name+'-elf', ['/usr/bin/readelf', '-h', '-l', '-d', str(path)])
assert digest('/var/lib/dpkg/status') == before
result = {"schemaVersion": "orch-auth-c2-preparation.v1", "root": str(root), "uid": os.getuid(), "hostPackagesBefore": before, "hostPackagesAfter": digest('/var/lib/dpkg/status'), "indexes": index_records, "packages": downloads, "image": image, "launchers": launchers, "hostInstallation": False, "controllerDispatched": False, "hostQualification": "NOT_READY", "completionEligible": False}
(raw/'preparation.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps({"root": str(root), "packages": len(downloads), "image": image, "status": "INPUTS_PREPARED_ONLY"}), flush=True)
