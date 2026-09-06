"""Reuse C3's exact finite host policy for the real unit check of fixture repair.

Prior inputs and host/guest programs are hash-checked before reuse. All copies,
new ISO/programs and observations belong to one fresh root; no shared install,
clock/service change, authority activation or controller state operation occurs.
"""
import difflib
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import uuid

repo = Path("/mnt/c/Dev/loop-extraction/milestone-loop-template")
receiver = Path(sys.argv[1]).resolve(strict=True)
assert receiver.name == "vm-2" and os.getuid() == 1000
prior = Path("/home/duncan/oc3-b13lp2vx")
source = repo / "artifacts/wp6e-authority-fixture-repair-20260906/vm-1/input"
c3 = repo / "docs/runtime-qualification/ORCH-AUTH-01-C3"


def sha(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def pin(path):
    assert path.is_file() and not path.is_symlink()
    return {"path": str(path), "bytes": path.stat().st_size, "sha256": sha(path)}


assert sha(c3 / "run-host.py") == "e3e8fd910030f5fe0e7d831960ce4c6ac6cfa51908405b4a8a2702f29ac29c9c"
assert sha(c3 / "guest-job.py") == "66e437873208c86d938503b63dad989b280108bdc12e951b768805dac05a25ca"
assert sha(prior / "input/input-manifest.json") == "f7379ee6eaf49f4373390f4464855021cf4b269ac560a3b6deb54770ab86d555"
old_expected = json.loads((repo / "artifacts/wp6e-continuation-20260906/postcommit-extracted/raw/host/expected.json").read_bytes())
assert old_expected == json.loads((prior / "expected-b5ae0551-b3eb-4a88-83c8-e5254332259c.json").read_bytes())
metadata = json.loads((source / "projection.json").read_bytes())
assert metadata["sourceBase"] == "6ae4efb808652e24d565cf5562c0611aac5ed25a"
assert metadata["projectedTree"] == "c94eb34007a13d2d342f331fb1422b8325cc0141"
root = Path(tempfile.mkdtemp(prefix="oc3-fixture-", dir="/home/duncan"))
payload = root / "input"
payload.mkdir()
(receiver / "prepared-root.txt").write_text(str(root) + "\n")
(receiver / "executed-preparer.py").write_bytes(Path(__file__).read_bytes())
old_manifest = json.loads((prior / "input/input-manifest.json").read_bytes())
reused = []
for item in old_manifest["files"]:
    if item["path"] in ("source.bundle", "guest-job.py"):
        continue
    path = prior / "input" / item["path"]
    assert pin(path) == {**item, "path": str(path)}
    target = payload / item["path"]
    target.parent.mkdir(exist_ok=True, parents=True)
    shutil.copyfile(path, target)
    assert sha(target) == item["sha256"]
    reused.append(item)
for name in ("source.bundle", "source.patch"):
    assert sha(source / name) == metadata["inputs"][name]["sha256"]
    shutil.copyfile(source / name, payload / name)
shutil.copyfile(source / "projection.json", payload / "projection.json")

# The original OCI probe and all host admission/resource/cleanup checks remain.
# Only append this explicit, fixed development command after successful OCI.
addition = '''    projection=json.loads(Path('/opt/input/projection.json').read_bytes())
    assert head==projection['sourceBase'] and tree==projection['sourceBaseTree']
    run('fixture-apply-projection',['/usr/bin/git','apply','--index','/opt/input/source.patch'],'/work/source',True)
    projected=run('fixture-projected-tree',['/usr/bin/git','write-tree'],'/work/source',True).strip()
    assert projected==projection['projectedTree']
    # Preserve a direct observation before correcting this owned guest's
    # pnpm runtime configuration. This is an expected negative, not a PASS.
    omissionEnv={**environment,'LOOP_VERIFY_STAGE_ID':'wp6-shadow-omission-mutation','LOOP_VERIFY_COMMAND_ID':'test:partitions:shadow:omission-mutation','LOOP_VERIFY_COMMAND_ARTIFACT_DIR':'/work/source/artifacts/fixture-omission-before','LOOP_VERIFY_RUN_ID':'wp6-omission-integration','MILESTONE_LOOP_TEST_OMISSION_MUTATION':'1'}
    omissionArgv=['/opt/bin/node','node_modules/tsx/dist/cli.mjs','tools/milestone-orchestrator/src/test-partition-cli.ts','omission-mutation']
    def omissionIdentity():
        os.setgroups([grp.getgrnam('docker').gr_gid]);os.setgid(1000);os.setuid(1000)
    beforeStart=time.monotonic()
    before=subprocess.run(omissionArgv,cwd='/work/source',env=omissionEnv,capture_output=True,timeout=60,preexec_fn=omissionIdentity)
    (raw/'fixture-omission-before.stdout').write_bytes(before.stdout)
    (raw/'fixture-omission-before.stderr').write_bytes(before.stderr)
    (raw/'fixture-omission-before.json').write_text(json.dumps({'argv':omissionArgv,'cwd':'/work/source','uid':1000,'exitCode':before.returncode,'durationMs':round((time.monotonic()-beforeStart)*1000),'completionEligible':False})+'\\n')
    assert before.returncode==1
    assert not Path('/work/source/artifacts/fixture-omission-before/result.json').exists()
    # pnpm 11 defaults depend on CI, which production intentionally removes
    # from child environments. Explicit guest-only config removes ambiguity.
    config=Path(user.pw_dir)/'.config/pnpm/config.yaml'
    assert config.is_relative_to(Path('/home/qualifier')) and not config.exists()
    config.parent.mkdir(parents=True,exist_ok=True)
    config.write_text('enableGlobalVirtualStore: false\\n')
    os.chown(config,1000,1000)
    (raw/'fixture-pnpm-config.yaml').write_bytes(config.read_bytes())
    (raw/'fixture-pnpm-config.json').write_text(json.dumps({'path':str(config),'sha256':digest(config),'scope':'disposable-guest-account-only','sourceFilesChanged':False})+'\\n')
    environment['LOOP_VERIFY_COMMAND_ARTIFACT_DIR']='/work/source/artifacts/fixture-unit'
    clockStop=threading.Event()
    def observeClock():
        with (raw/'fixture-clock-samples.jsonl').open('x') as output:
            while True:
                before=time.monotonic_ns();epoch=time.time_ns();after=time.monotonic_ns()
                output.write(json.dumps({'epochNanoseconds':str(epoch),'monotonicBefore':str(before),'monotonicAfter':str(after)})+'\\n');output.flush()
                if clockStop.wait(.25):break
    clockThread=threading.Thread(target=observeClock)
    clockThread.start()
    try:
        run('fixture-unit',['/opt/bin/pnpm','test:unit'],'/work/source',True,timeout=1500)
    finally:
        clockStop.set();clockThread.join(timeout=5)
        assert not clockThread.is_alive()
    assert run('fixture-private-refs-after',['/usr/bin/git','for-each-ref','--format=%(refname)','refs/milestone-loop/'],'/work/source',True).strip()==''
    assert not Path('/work/source/artifacts/orchestrator/state/state.json').exists()
    send('unit-completed',projectedTree=projected,claimScope='Linux-development-only',completionEligible=False)
'''
original = (c3 / "guest-job.py").read_text()
assert original.count("import traceback\n") == 1
assert original.count("    send('oci-completed',containers=containers,volumes=volumes)\n") == 1
guest = original.replace("import traceback\n", "import traceback\nimport threading\n").replace("    send('oci-completed',containers=containers,volumes=volumes)\n", "    send('oci-completed',containers=containers,volumes=volumes)\n" + addition)
compile(guest, "guest-job.py", "exec")
(payload / "guest-job.py").write_text(guest)
(receiver / "guest-program.diff").write_text("".join(difflib.unified_diff(original.splitlines(True), guest.splitlines(True), fromfile="C3/guest-job.py", tofile="fixture-repair/guest-job.py")))
shutil.copyfile(payload / "guest-job.py", receiver / "guest-job.py")
shutil.copyfile(c3 / "run-host.py", root / "run-host.py")
files = [{**pin(path), "path": path.relative_to(payload).as_posix()} for path in sorted(payload.rglob("*")) if path.is_file()]
manifest = {"schemaVersion": "orch-c3-input.v1", "source": {"commit": metadata["sourceBase"], "tree": "c2f80892da42ecf1ac7ffc917747f110875060b5"}, "files": files}
(payload / "input-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
run_id = str(uuid.uuid4())
iso = root / ("input-" + run_id + ".iso")
for item in [old_expected["base"], *old_expected["launchers"]]:
    assert sha(Path(item["path"])) == item["sha256"]
argv = [old_expected["launchers"][2]["path"], "-quiet", "-iso-level", "3", "-rock", "-joliet", "-output", str(iso), str(payload)]
result = subprocess.run(argv, capture_output=True, timeout=300, env={"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C", "LD_LIBRARY_PATH": "/home/duncan/oc2-1_hj5pul/provider/usr/lib/x86_64-linux-gnu"})
(receiver / "iso.stdout.log").write_bytes(result.stdout)
(receiver / "iso.stderr.log").write_bytes(result.stderr)
(receiver / "iso.json").write_text(json.dumps({"argv": argv, "exitCode": result.returncode}) + "\n")
assert result.returncode == 0
iso.chmod(0o444)
expected = {**old_expected, "binding": {**old_expected["binding"], "runId": run_id, "nonce": os.urandom(32).hex(), "sourceCommit": metadata["sourceBase"], "sourceTree": manifest["source"]["tree"], "inputManifestSha256": sha(payload / "input-manifest.json")}, "input": pin(iso), "guestProgramSha256": sha(payload / "guest-job.py")}
expected_path = root / ("expected-" + run_id + ".json")
expected_path.write_text(json.dumps(expected, indent=2) + "\n")
shutil.copyfile(expected_path, receiver / "expected.json")
shutil.copyfile(payload / "input-manifest.json", receiver / "input-manifest.json")
(receiver / "preparation.json").write_text(json.dumps({"root": str(root), "expectedPath": str(expected_path), "hostProgram": pin(root / "run-host.py"), "guestProgram": pin(payload / "guest-job.py"), "reusedPins": reused, "projection": metadata, "claimScope": "C3-host-reuse-plus-Linux-development-tests", "completionEligible": False}, indent=2) + "\n")
print(json.dumps({"expected": str(expected_path), "hostProgram": str(root / "run-host.py"), "inputBytes": iso.stat().st_size}), flush=True)
