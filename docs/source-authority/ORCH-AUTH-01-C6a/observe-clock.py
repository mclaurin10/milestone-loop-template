"""Observe actual clocks alongside one unchanged Linux development command.

This reads clocks only. It neither substitutes timestamps nor changes system
clock configuration, test deadlines, the production probe, or child status.
"""
import hashlib
import json
import pathlib
import subprocess
import sys
import time

receiver = pathlib.Path(sys.argv[1]).resolve(strict=True)
runner = receiver / "runner.py"
assert receiver.name == "linux-3" and runner.is_file()
argv = [sys.executable, str(runner), "run", str(receiver)]
(receiver / "clock-observer.py").write_bytes(pathlib.Path(__file__).read_bytes())
with (receiver / "clock-samples.jsonl").open("x") as output:
    child = subprocess.Popen(argv)
    while True:
        before = time.monotonic_ns()
        epoch = time.time_ns()
        after = time.monotonic_ns()
        output.write(json.dumps({"epochNanoseconds": str(epoch), "monotonicBefore": str(before), "monotonicAfter": str(after)}) + "\n")
        output.flush()
        status = child.poll()
        if status is not None:
            break
        time.sleep(0.25)
result = {"schemaVersion": "c6a-independent-clock-observation.v1", "argv": argv, "exitCode": status, "runnerSha256": hashlib.sha256(runner.read_bytes()).hexdigest(), "claimScope": "Linux-development-only", "completionEligible": False}
(receiver / "clock-observation.json").write_text(json.dumps(result, indent=2) + "\n")
sys.exit(status)
