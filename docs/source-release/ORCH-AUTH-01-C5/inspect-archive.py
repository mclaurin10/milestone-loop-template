"""Inspect a retained source archive with Python's independent standard tar reader.

This does not extract or execute the payload, and cannot qualify a build/platform.
"""
import hashlib
import json
import pathlib
import platform
import re
import sys
import tarfile


def encoded(value):
    return (json.dumps(value, indent=2, sort_keys=True) + "\n").encode()


def digest(value):
    return hashlib.sha256(value).hexdigest()


archive_path, manifest_path, output_path = map(pathlib.Path, sys.argv[1:])
assert archive_path.is_file() and not archive_path.is_symlink()
assert manifest_path.is_file() and not manifest_path.is_symlink()
assert not output_path.exists()
manifest = json.loads(manifest_path.read_bytes())
archive = archive_path.read_bytes()
assert manifest["schemaVersion"] == "source-release-manifest.v1"
assert manifest["completionEligible"] is False
assert manifest["archive"] == {
    "path": "release.tar.gz", "bytes": len(archive), "sha256": digest(archive)
}
assert len(archive) <= 20_000_000
inventory = []
seen = set()
total = 0
with tarfile.open(archive_path, "r:gz") as reader:
    for member in reader:
        name = member.name
        parts = name.split("/")
        assert len(name) < 256 and re.fullmatch(r"[\x20-\x7e]+", name)
        assert all(part and part not in (".", "..", ".git", ".tools", "node_modules", "artifacts") for part in parts)
        assert not any(part.endswith((".", " ")) for part in parts)
        assert not re.search(r"[\\:]", name)
        assert name.lower() not in seen
        seen.add(name.lower())
        assert member.isfile() and not member.linkname and not member.pax_headers
        assert member.mode == 0o644 and member.uid == member.gid == member.mtime == 0
        assert 0 <= member.size <= 20_000_000
        total += member.size
        assert total <= 20_000_000 and len(inventory) < 400
        contents = reader.extractfile(member).read(member.size + 1)
        assert len(contents) == member.size
        inventory.append({"path": name, "bytes": len(contents), "sha256": digest(contents)})
        if name == "SOURCE.json":
            assert json.loads(contents) == {
                "schemaVersion": "source-release-provenance.v1",
                "source": manifest["source"],
                "claimScope": "distribution-provenance",
                "grantsAdopterAuthority": False,
            }
assert inventory == sorted(inventory, key=lambda item: item["path"])
assert inventory == manifest["payload"]["files"]
assert len(inventory) == manifest["payload"]["fileCount"]
assert total == manifest["payload"]["totalBytes"]
assert {"source.json", "notice.md", "release.md", "package.json", "pnpm-lock.yaml"} <= seen
report = {
    "schemaVersion": "independent-source-archive-inspection.v1",
    "status": "PASS", "completionEligible": False,
    "claimScope": "retained-archive-inspection", "freshBuild": False,
    "source": manifest["source"], "archive": manifest["archive"],
    "reader": "Python standard-library tarfile",
    "pythonVersion": platform.python_version(), "observerPlatform": platform.system(),
    "argv": sys.argv, "implementationSha256": digest(pathlib.Path(__file__).read_bytes()),
    "files": inventory, "fileCount": len(inventory), "totalBytes": total,
}
output_path.mkdir(parents=True, exist_ok=False)
report_bytes = encoded(report)
(output_path / "inspection.json").write_bytes(report_bytes)
receipt = {
    "schemaVersion": "1.0.0", "stageId": "orch-auth-01-c5",
    "commandId": "independent-tar-inspection", "status": "PASS",
    "checks": [{"id": "standard-tar-reader", "status": "PASS", "summary": "Python tarfile independently read every regular archive entry and matched the exact source inventory and provenance."}],
    "artifacts": [{"path": "inspection.json", "kind": "independent-source-archive-inspection", "bytes": len(report_bytes), "sha256": digest(report_bytes)}],
}
(output_path / "result.json").write_bytes(encoded(receipt))
print(json.dumps({"status": "PASS", "fileCount": len(inventory), "completionEligible": False, "archiveSha256": digest(archive)}))
