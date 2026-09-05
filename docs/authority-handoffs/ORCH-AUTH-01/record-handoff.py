"""One-time handoff transcription from the direct maintainer message; no activation."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import subprocess

root = Path(__file__).resolve().parents[3]
proposal = root / "docs/proposals/ORCH-AUTH-01-r2"
approval_path = root / "evals/authority-revisions/ORCH-AUTH-01/approval.json"
archive_path = root / ".agent/history/wp6e-e590e38.md"
assert not approval_path.exists() and not archive_path.exists(), "Already recorded; do not overwrite"
assert subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip() == "e590e38c32de2b5baa7423f66bbd8a0230b61839"
manifest_bytes = (proposal / "review-manifest.json").read_bytes()
manifest = json.loads(manifest_bytes)
assert manifest["contentDigest"] == "53d38a2c2038cd9c5ffc240275043709d23dd33a81237e3d12018a38a8378108"
assert manifest["packageIntegrityDigest"] == "2db01416302e24f3bda9d1991f44a1ac05b8ef5fad70b09c18bc4f037d267a2c"
approval = {
    "schemaVersion": "human-authority-approval-record.v1",
    "revisionId": "ORCH-AUTH-01",
    "proposalRevision": "r2",
    "status": "APPROVED",
    "recordedAt": datetime.now(timezone.utc).isoformat(),
    "source": {
        "kind": "direct-maintainer-message",
        "threadId": "01a06f9b-0953-73b2-ae67-06e37d884e4e",
        "turnId": "01a07344-cedf-7562-9ca4-8f5af8586c39",
        "quote": "Proposal approved.",
        "targetResolution": "The immediately preceding assistant response linked ORCH-AUTH-01 r2 as the review target; this direct approval applies to that unchanged normative digest.",
        "machineGrantedApproval": False,
        "standaloneRecordAuthenticatesHuman": False
    },
    "approvedContentDigest": manifest["contentDigest"],
    "packageIntegrityDigestAtApproval": manifest["packageIntegrityDigest"],
    "reviewManifestPath": "docs/proposals/ORCH-AUTH-01-r2/review-manifest.json",
    "reviewManifestSha256": hashlib.sha256(manifest_bytes).hexdigest(),
    "baselineCommit": manifest["payload"]["baselineCommit"],
    "baselineTree": manifest["payload"]["baselineTree"],
    "contractId": manifest["payload"]["contractId"],
    "authorityEpoch": manifest["payload"]["authorityEpoch"],
    "normativeFiles": manifest["payload"]["files"],
    "authorization": {
        "stagedImplementationOfApprovedRevision": True,
        "activationRequiresApprovedTransitionSafeguards": True,
        "conformingAdvisoryChangesNeedRenewedAuthorityApproval": False,
        "normativeChangesNeedNewHumanApproval": True,
        "humanProductAcceptanceGranted": False,
        "wp6eCompletionOrWp6fInterpretationGranted": False,
        "stateAdoptionGrantedByThisRecord": False
    },
    "activationStatus": "NOT_APPLIED"
}
approval_path.parent.mkdir(parents=True, exist_ok=True)
approval_path.write_bytes((json.dumps(approval, indent=2) + "\n").encode())
archive_path.parent.mkdir(parents=True, exist_ok=True)
archive_path.write_bytes((root / ".agent/current-exec-plan.md").read_bytes())
print(json.dumps({"approvalPath": str(approval_path), "approvedContentDigest": manifest["contentDigest"], "archivedPlanSha256": hashlib.sha256(archive_path.read_bytes()).hexdigest(), "activeAuthorityChanged": False}))
