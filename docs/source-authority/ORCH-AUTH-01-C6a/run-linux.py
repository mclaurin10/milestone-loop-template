"""Run the complete C6a development selection in an owned Linux checkout.

This is ordinary Linux development verification, not provider qualification or
a committed candidate. No shared package, service, account or source state is
changed. Original test files and deadlines are consumed without modification.
"""
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tarfile
import tempfile

receiver = pathlib.Path(sys.argv[2]).resolve(strict=True)
node = pathlib.Path("/home/duncan/oa1-CKn8x9/node-v24.18.0-linux-x64/bin/node")
pnpm = pathlib.Path("/home/duncan/oa1-CKn8x9/pnpm/node_modules/pnpm/bin/pnpm.mjs")
input_root = pathlib.Path("/home/duncan/oc3-b13lp2vx/input")


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(argv, cwd, env, label, timeout):
    result = subprocess.run(argv, cwd=cwd, env=env, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, timeout=timeout, check=False)
    (receiver / (label + ".stdout.log")).write_bytes(result.stdout)
    (receiver / (label + ".stderr.log")).write_bytes(result.stderr)
    (receiver / (label + ".json")).write_text(json.dumps({"argv": argv, "cwd": str(cwd), "exitCode": result.returncode}, indent=2) + "\n")
    assert result.returncode == 0, (label, result.returncode, result.stderr.decode(errors="replace")[-2000:])
    return result.stdout.decode().strip()


if sys.argv[1] == "prepare":
    (receiver / "runner.py").write_bytes(pathlib.Path(__file__).read_bytes())
    assert sha(node) == "41a74efb34cbde5c7632cdac0cf8bd1a14d0b8d73dc1e82755014d9a9ce70f5c"
    assert sha(pnpm) == "ff3224d46b47fbb24a7e9fe15fededef7e00892d07d4e376b6762d4899906bfd"
    assert sha(pathlib.Path("/usr/bin/git")) == "2a8c18fbf43da9f692d75474c72bea9dfd796c260b0f3dfe456376abc3bbd668"
    metadata = json.loads((receiver / "input/projection.json").read_bytes())
    for name in ("source.bundle", "source.patch"):
        assert sha(receiver / "input" / name) == metadata["inputs"][name]["sha256"]
    owned = pathlib.Path(tempfile.mkdtemp(prefix="c6a-", dir="/home/duncan"))
    repo, cache, bin_dir = owned / "repo", owned / "store", owned / "bin"
    cache.mkdir()
    bin_dir.mkdir()
    launcher = bin_dir / "pnpm"
    launcher.write_text(f'#!/bin/sh\nexec "{node}" "{pnpm}" "$@"\n')
    launcher.chmod(0o700)
    env = dict(os.environ, PATH=str(bin_dir) + ":" + str(node.parent) + ":/usr/bin:/bin", CI="true")
    for key in ("NODE_OPTIONS", "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES"):
        env.pop(key, None)
    for name, expected in (("store.tar", "e54dfba9f943eee6415a2d05d4bf8e31a35cad672871aac076810654c77fc9f0"), ("pnpm-cache.tar", "57991dd13d15dd9baef279c84b11c1dc378dc5c8177b8fc530047fa8759adb1b")):
        path = input_root / name
        assert sha(path) == expected
        with tarfile.open(path) as reader:
            entries = reader.getmembers()
            assert len(entries) <= 5000 and sum(x.size for x in entries) < 700_000_000
            for entry in entries:
                relative = pathlib.PurePosixPath(entry.name)
                assert not relative.is_absolute() and ".." not in relative.parts
                assert entry.isdir() or entry.isreg()
                assert entry.mode & 0o7000 == 0
                target = cache.joinpath(*relative.parts)
                assert target.is_relative_to(cache)
                if entry.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    assert not target.exists()
                    with reader.extractfile(entry) as source, target.open("xb") as output:
                        shutil.copyfileobj(source, output)
                    target.chmod(entry.mode & 0o777)
    run(["git", "clone", "--quiet", str(receiver / "input/source.bundle"), str(repo)], owned, env, "clone", 120)
    run(["git", "remote", "remove", "origin"], repo, env, "remove-origin", 30)
    assert run(["git", "rev-parse", "HEAD"], repo, env, "source-head", 30) == metadata["sourceBase"]
    run(["git", "apply", "--index", str(receiver / "input/source.patch")], repo, env, "apply-projection", 30)
    assert run(["git", "write-tree"], repo, env, "projection-tree", 30) == metadata["projectedTree"]
    assert run([str(node), "--version"], repo, env, "node-version", 30) == "v24.18.0"
    assert run([str(node), str(pnpm), "--version"], repo, env, "pnpm-version", 30) == "11.15.1"
    run([str(node), str(pnpm), "install", "--offline", "--frozen-lockfile", "--package-import-method=copy", "--store-dir", str(cache)], repo, env, "install", 300)
    state = {"schemaVersion": "c6a-linux-projection.v1", "status": "PREPARED_DEVELOPMENT_PROJECTION", "claimScope": "Linux-development-only", "completionEligible": False, "sourceBase": metadata["sourceBase"], "projectedTree": metadata["projectedTree"], "ownedRoot": str(owned), "repositoryRoot": str(repo), "uid": os.getuid(), "gid": os.getgid(), "node": {"path": str(node), "sha256": sha(node)}, "pnpm": {"path": str(pnpm), "sha256": sha(pnpm)}, "gitSha256": sha(pathlib.Path("/usr/bin/git")), "launcher": {"path": str(launcher), "sha256": sha(launcher)}, "path": env["PATH"]}
    (receiver / "projection.json").write_text(json.dumps(state, indent=2) + "\n")
    print(json.dumps(state))
elif sys.argv[1] == "run":
    assert pathlib.Path(__file__).read_bytes() == (receiver / "runner.py").read_bytes()
    state = json.loads((receiver / "projection.json").read_bytes())
    repo = pathlib.Path(state["repositoryRoot"]).resolve(strict=True)
    assert repo.parent.name.startswith("c6a-") and repo.parent.parent == pathlib.Path("/home/duncan")
    env = dict(os.environ, PATH=state["path"], CI="true", LOOP_VERIFY_COMMAND_ARTIFACT_DIR=str(repo / "artifacts/c6a-complete"))
    for key in ("NODE_OPTIONS", "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES"):
        env.pop(key, None)
    assert sha(pathlib.Path(state["launcher"]["path"])) == state["launcher"]["sha256"]
    names = ["state-store", "config", "commissioning", "commissioning-amendment", "controller-lease", "verification-tier", "contract-integrity", "aggregate-verify-identity", "adopter-package", "doctor", "source-epoch-snapshot", "authority-publication", "authority-anchor", "source-authority-anchor", "test-ownership"]
    files = ["tools/milestone-orchestrator/src/" + name + ".test.ts" for name in names] + ["tools/source-release.test.mjs"]
    code = 1
    try:
        run([str(node), str(pnpm), "exec", "tsx", "docs/source-authority/ORCH-AUTH-01-C6a/run-focused.ts", *files], repo, env, "focused", 1800)
        code = 0
    finally:
        source, target = repo / "artifacts/c6a-complete", receiver / "affected-complete"
        assert not target.exists()
        if source.exists():
            for path in source.rglob("*"):
                assert not path.is_symlink()
                assert path.is_dir() or (path.is_file() and path.stat().st_size < 20_000_000)
            shutil.copytree(source, target)
        refs = run(["git", "for-each-ref", "--format=%(refname)", "refs/milestone-loop/"], repo, env, "controller-refs-after", 30)
        assert refs == "" and not (repo / "artifacts/orchestrator/state/state.json").exists()
    sys.exit(code)
else:
    raise ValueError("Expected prepare or run")
