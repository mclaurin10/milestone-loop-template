$ErrorActionPreference='Stop'
$taskRoot=(Get-Location).Path
$taskSource=Join-Path $taskRoot 'artifacts/wp6e-source-readers-20260906'
$taskHosted=Join-Path $taskRoot 'artifacts/wp6e-continuation-20260906/hosted-discovery-repair-artifacts'
$taskBundle=Join-Path $taskRoot 'artifacts/wp6e-c6a-retained-bundle'
$taskEvidence=Join-Path $taskRoot 'docs/source-authority/ORCH-AUTH-01-C6a/evidence'
if((Test-Path -LiteralPath $taskBundle) -or (Test-Path -LiteralPath $taskEvidence)){throw 'Curation outputs must be absent'}
function Copy-TaskRegular([string]$Source,[string]$Target){
  $taskInfo=Get-Item -LiteralPath $Source -Force
  if($taskInfo.LinkType){throw "Linked evidence input: $Source"}
  if($taskInfo.PSIsContainer){
    New-Item -ItemType Directory -Path $Target | Out-Null
    foreach($taskChild in Get-ChildItem -LiteralPath $Source -Force){Copy-TaskRegular $taskChild.FullName (Join-Path $Target $taskChild.Name)}
  }else{
    if($taskInfo.Length -gt 20000000){throw 'Evidence file exceeds bound'}
    [IO.File]::Copy($Source,$Target,$false)
  }
}
New-Item -ItemType Directory -Path $taskBundle | Out-Null
foreach($taskName in @('focused-1','focused-2','final-boundaries','affected-1','affected-final','doctor-state-final','typecheck-1','typecheck-2','typecheck-3','typecheck-4','lint-1','lint-2','lint-3','format-1','format-2','architecture-1','invariants-1','c5-postcommit-audits','hosted-receipts')){
  Copy-TaskRegular (Join-Path $taskSource $taskName) (Join-Path $taskBundle $taskName)
}
Copy-TaskRegular (Join-Path $taskSource 'native-git-runtime-inspection.json') (Join-Path $taskBundle 'native-git-runtime-inspection.json')
Copy-TaskRegular (Join-Path $taskSource 'git-launch-diagnostic-summary.json') (Join-Path $taskBundle 'git-launch-diagnostic-summary.json')
foreach($taskName in @('linux','linux-2','linux-3')){
  New-Item -ItemType Directory -Path (Join-Path $taskBundle $taskName) | Out-Null
  foreach($taskFile in Get-ChildItem -LiteralPath (Join-Path $taskSource $taskName) -File){Copy-TaskRegular $taskFile.FullName (Join-Path $taskBundle "$taskName/$($taskFile.Name)")}
  New-Item -ItemType Directory -Path (Join-Path $taskBundle "$taskName/input") | Out-Null
  foreach($taskFile in @('projection.json','source.patch')){Copy-TaskRegular (Join-Path $taskSource "$taskName/input/$taskFile") (Join-Path $taskBundle "$taskName/input/$taskFile")}
  if(Test-Path -LiteralPath (Join-Path $taskSource "$taskName/affected-complete")){Copy-TaskRegular (Join-Path $taskSource "$taskName/affected-complete") (Join-Path $taskBundle "$taskName/affected-complete")}
}
Copy-TaskRegular (Join-Path $taskSource 'vm-1') (Join-Path $taskBundle 'vm-1')
$taskBaseline=Join-Path $taskRoot '.tools/wp6e-c6a-reader-baseline/artifacts'
New-Item -ItemType Directory -Path (Join-Path $taskBundle 'baseline') | Out-Null
foreach($taskName in @('c6a-amendment-baseline','c6a-amendment-no-checkout','c6a-amendment-git-diagnostic','c6a-amendment-git-events','c6a-amendment-direct-git')){
  Copy-TaskRegular (Join-Path $taskBaseline $taskName) (Join-Path $taskBundle "baseline/$taskName")
}
Copy-TaskRegular (Join-Path $taskBaseline 'c6a-direct-git-launch.json') (Join-Path $taskBundle 'baseline/c6a-direct-git-launch.json')
New-Item -ItemType Directory -Path (Join-Path $taskBundle 'hosted') | Out-Null
Copy-TaskRegular (Join-Path $taskRoot 'artifacts/wp6e-continuation-20260906/hosted-discovery-repair-jobs-progress-7.json') (Join-Path $taskBundle 'hosted/jobs.json')
Copy-TaskRegular (Join-Path $taskHosted 'metadata-final.json') (Join-Path $taskBundle 'hosted/artifacts.json')
foreach($taskId in @(9984793761,9984014520,9983894644,9983887592,9983885309)){
  Copy-TaskRegular (Join-Path $taskHosted "$taskId.zip") (Join-Path $taskBundle "hosted/$taskId.zip")
  Copy-TaskRegular (Join-Path $taskHosted "extracted-$taskId") (Join-Path $taskBundle "hosted/extracted-$taskId")
}
function Get-TaskPin([string]$Base,[string]$Relative){
  $taskFile=Get-Item -LiteralPath (Join-Path $Base $Relative)
  if($taskFile.LinkType -or $taskFile.PSIsContainer -or $taskFile.Length -gt 20000000){throw 'Input is not a bounded regular file'}
  [ordered]@{path=$Relative;bytes=$taskFile.Length;sha256=(Get-FileHash -LiteralPath $taskFile.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
}
$taskFiles=@(Get-ChildItem -LiteralPath $taskBundle -Force -Recurse -File | Sort-Object FullName | ForEach-Object {Get-TaskPin $taskBundle ($_.FullName.Substring($taskBundle.Length+1).Replace('\','/'))})
if(($taskFiles|Measure-Object bytes -Sum).Sum -gt 64000000){throw 'Evidence exceeds total bound'}
$taskChanged=@(git diff --name-only HEAD -- scripts tools)
if($LASTEXITCODE -ne 0){throw 'Changed implementation inventory failed'}
$taskNew=@(git ls-files --others --exclude-standard -- tools/milestone-orchestrator/src docs/source-authority/ORCH-AUTH-01-C6a)
if($LASTEXITCODE -ne 0){throw 'New implementation inventory failed'}
$taskImplementation=@(@($taskChanged)+@($taskNew) | Where-Object {$_ -notmatch '/README.md$'} | Sort-Object -Unique | ForEach-Object {Get-TaskPin $taskRoot $_})
$taskActive=@('PROJECT_GOAL.md','AGENTS.md','CONTRACT.md','evals/ACCEPTANCE.md','evals/HIDDEN_VALIDATION_PROTOCOL.md','evals/acceptance-manifest.json','evals/immutable-contract-lock.json','.agent/readiness-profile-activated.json','.agent/verification-manifest.json','.agent/completed/verification-manifest-amendments.json','tools/milestone-orchestrator/config/source-commissioning-input.json','tools/milestone-orchestrator/config/verification-scope-policy.json','evals/authority-revisions/ORCH-AUTH-01/approval.json','package.json') | ForEach-Object {Get-TaskPin $taskRoot $_}
New-Item -ItemType Directory -Path $taskEvidence | Out-Null
$taskArchive=Join-Path $taskEvidence 'retained-evidence.zip'
[IO.Compression.ZipFile]::CreateFromDirectory($taskBundle,$taskArchive,[IO.Compression.CompressionLevel]::Optimal,$false)
$taskManifest=[ordered]@{schemaVersion='c6a-reader-evidence.v1';sourceBase='dba20a6f3669f4fbfe04161c01524e2059f8277b';authorityGeneration='legacy-source.v1';claimScope='supporting-publication-fence-and-anchor-inspection';completionEligible=$false;activationAuthorized=$false;files=$taskFiles;implementation=$taskImplementation;activeGeneration=@($taskActive);archive=(Get-TaskPin $taskEvidence 'retained-evidence.zip')}
$taskManifest | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $taskEvidence 'manifest.json')
[ordered]@{files=$taskFiles.Count;archive=$taskManifest.archive}|ConvertTo-Json -Depth 4
