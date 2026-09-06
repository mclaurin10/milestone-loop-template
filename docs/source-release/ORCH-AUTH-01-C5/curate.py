"""Seal the explicit C5 observations; refuses existing output or linked inputs."""
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys
import zipfile

repo = pathlib.Path(sys.argv[1]).resolve(strict=True)
bundle = repo / ".tools/wp6e-c5-retained-bundle"
evidence = repo / "docs/source-release/ORCH-AUTH-01-C5/evidence"
assert not bundle.exists() and not evidence.exists()
bundle.mkdir()
source = repo / "artifacts/wp6e-source-build-20260906"


def copy(source, target):
    assert not source.is_symlink()
    if source.is_dir():
        target.mkdir(parents=True, exist_ok=True)
        for child in sorted(source.iterdir()):
            copy(child, target / child.name)
    else:
        assert source.is_file() and source.stat().st_size <= 20_000_000
        target.parent.mkdir(parents=True, exist_ok=True)
        assert not target.exists()
        shutil.copyfile(source, target)


for name in ["architecture-1", "architecture-2", "architecture-3", "architecture-4", "entry-build", "focused-1", "focused-2", "focused-3", "format-1", "format-2", "invariants-1", "invariants-2", "lint-1", "lint-2", "typecheck-1", "typecheck-2"]:
    copy(source / name, bundle / "development" / name)
for child in sorted(source.iterdir()):
    if child.is_file() and (child.name.startswith(("supporting-", "entry-", "build-", "dependencies-", "architecture-clean-", "focused-clean-", "tar-inspection-", "tar-inspector-"))):
        copy(child, bundle / "execution" / child.name)
for number in (1, 2):
    candidate = repo / f".tools/wp6e-source-release-c5-{number}/artifacts"
    copy(candidate / f"c5-build-{number}", bundle / f"candidate-{number}/build")
    copy(candidate / f"c5-dependencies-{number}", bundle / f"candidate-{number}/dependencies")
    copy(source / f"tar-inspection-{number + 1}", bundle / f"candidate-{number}/tar-inspection")
copy(repo / ".tools/wp6e-source-release-c5-1/artifacts/c5-architecture-clean-1", bundle / "candidate-1/architecture")
copy(repo / ".tools/wp6e-source-release-c5-2/artifacts/c5-focused-clean-1", bundle / "candidate-2/focused")


def pin(path, root):
    data = (root / path).read_bytes()
    return {"path": path, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


files = [pin(path.relative_to(bundle).as_posix(), bundle) for path in sorted(bundle.rglob("*")) if path.is_file()]
assert sum(file["bytes"] for file in files) <= 64_000_000
implementation_paths = subprocess.check_output(["git", "-C", str(repo), "diff", "--cached", "--name-only"], text=True).splitlines()
implementation_paths = sorted(set(path for path in implementation_paths if path != ".agent/current-exec-plan.md") | {
    "docs/source-release/ORCH-AUTH-01-C5/audit.ts", "docs/source-release/ORCH-AUTH-01-C5/curate.py"
})
active_paths = ["PROJECT_GOAL.md", "AGENTS.md", "CONTRACT.md", "evals/ACCEPTANCE.md", "evals/HIDDEN_VALIDATION_PROTOCOL.md", "evals/acceptance-manifest.json", "evals/immutable-contract-lock.json", ".agent/readiness-profile-activated.json", ".agent/verification-manifest.json", ".agent/completed/verification-manifest-amendments.json", "tools/milestone-orchestrator/config/source-commissioning-input.json", "tools/milestone-orchestrator/config/verification-scope-policy.json", "evals/authority-revisions/ORCH-AUTH-01/approval.json"]
receipt_count = sum(file["path"].endswith("/result.json") for file in files)
evidence.mkdir(parents=True)
archive = evidence / "retained-evidence.zip"
with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as writer:
    for file in files:
        info = zipfile.ZipInfo(file["path"], (1980, 1, 1, 0, 0, 0))
        info.create_system = 3
        info.external_attr = 0o100644 << 16
        writer.writestr(info, (bundle / file["path"]).read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
manifest = {
    "schemaVersion": "c5-evidence-inventory.v1", "claimScope": "retained-supporting-source-builds",
    "completionEligible": False, "authorityGeneration": "legacy-source.v1",
    "sourceBase": "91cbd3eb75ec771cfa1f315fe2641488e361c9e0",
    "supportingCandidates": [json.loads((source / f"supporting-candidate-{number}.json").read_bytes()) for number in (1, 2)],
    "implementation": [pin(path, repo) for path in implementation_paths],
    "activeGeneration": [pin(path, repo) for path in active_paths],
    "files": files, "receiptCount": receipt_count,
    "archive": pin("retained-evidence.zip", evidence),
}
(evidence / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf8")
print(json.dumps({"files": len(files), "receipts": receipt_count, "archive": manifest["archive"]}))
