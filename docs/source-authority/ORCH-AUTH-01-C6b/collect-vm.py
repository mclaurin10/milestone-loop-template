"""Copy only bounded regular observations from the completed owned C3 reuse."""
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys

receiver = Path(sys.argv[1]).resolve(strict=True)
assert receiver.name in ("vm-2", "vm-3")
expected = json.loads((receiver / "expected.json").read_bytes())
root = Path((receiver / "prepared-root.txt").read_text().strip())
assert re.fullmatch(r"/home/duncan/oc3-c6b-[A-Za-z0-9_-]+", str(root))
assert root.resolve(strict=True) == root
source = root / ("observation-" + expected["binding"]["runId"])
host = json.loads((source / "host.json").read_bytes())
assert host["binding"] == expected["binding"]
assert host["cleanupVerified"] and host["directoryAbsent"] and host["pidAbsent"] and host["cgroupAbsent"]
assert not Path(host["directory"]).exists()
assert not Path(host["hostBefore"]["cgroupPath"]).exists()
target = receiver / "host"
assert not target.exists()
total = 0
for path in source.rglob("*"):
    assert not path.is_symlink()
    assert path.is_file() or path.is_dir()
    if path.is_file():
        total += path.stat().st_size
        assert path.stat().st_size < 20_000_000 and total < 64_000_000
shutil.copytree(source, target)
archive = target / "guest-evidence.tar.gz"
assert hashlib.sha256(archive.read_bytes()).hexdigest() == host["archive"]["sha256"]
extractor = Path("/mnt/c/Dev/loop-extraction/milestone-loop-template/docs/runtime-qualification/ORCH-AUTH-01-C3/extract-evidence.py")
argv = [sys.executable, str(extractor), str(archive), str(receiver / "guest")]
result = subprocess.run(argv, capture_output=True, timeout=60)
(receiver / "extraction.stdout.log").write_bytes(result.stdout)
(receiver / "extraction.stderr.log").write_bytes(result.stderr)
(receiver / "collection.json").write_text(json.dumps({"argv": argv, "exitCode": result.returncode, "hostStatus": host["status"], "cleanupVerified": True, "copiedHostBytes": total, "claimScope": "supporting-observation-copy"}, indent=2) + "\n")
assert result.returncode == 0, result.stderr
print(result.stdout.decode())
