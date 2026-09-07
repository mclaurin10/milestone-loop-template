$ErrorActionPreference='Stop'
$taskRoot=(Get-Location).Path
$taskSource=Join-Path $taskRoot 'artifacts/wp6e-source-publication-20260906'
$taskDocs=Join-Path $taskRoot 'docs/source-authority/ORCH-AUTH-01-C6e'
$taskEvidence=Join-Path $taskDocs 'evidence'
$taskStage=Join-Path $taskRoot 'artifacts/wp6e-c6e-retention-input'
$taskOperationalPaths=@('.agent/current-exec-plan.md','docs/autonomy-log.md','docs/decision-log.md')
if((Test-Path -LiteralPath $taskEvidence) -or (Test-Path -LiteralPath $taskStage)){throw 'Curation requires fresh evidence and staging outputs'}
foreach($taskRequired in @('recovery-publication-focused-1/result.json','recovery-integration-audit-1/result.json','dependency-repair-focused-audit-1/result.json','unborn-publication-focused-1/child-execution.json','unborn-publication-focused-1/vitest-report.json','unborn-publication-focused-2/child-execution.json','unborn-publication-focused-2/termination/scope-observation.json','invalid-native-retry-audit-1/result.json','unborn-publication-focused-3/result.json','unborn-publication-focused-3/input-before.json','unborn-publication-focused-3/input-after.json','retention-tools-static-10/result.json','precommit/observation.json')){
  if(-not (Test-Path -LiteralPath (Join-Path $taskSource $taskRequired))){throw ('Missing actual prerequisite: '+$taskRequired)}
}
function Get-TaskPin([string]$Base,[string]$Relative){
  $taskInfo=Get-Item -LiteralPath (Join-Path $Base $Relative) -Force
  if($taskInfo.LinkType -or $taskInfo.PSIsContainer -or $taskInfo.Length -gt 20000000){throw ('Unsafe or oversized evidence input: '+$Relative)}
  [ordered]@{path=$Relative;bytes=$taskInfo.Length;sha256=(Get-FileHash -LiteralPath $taskInfo.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
}
$taskExcluded=@('retention-draft','precommit-vm-1','precommit-vm-2','precommit-vm-3','precommit-vm-4','precommit-oci-vm-1','precommit-oci-vm-2','precommit-linux-4','precommit-revised-source-input-1','precommit-unborn-source-input-1','revised-input-audit-1','revised-input-audit-2')
$taskSelected=@(Get-ChildItem -LiteralPath $taskSource -Force | Where-Object {$_.Name -notin $taskExcluded})
foreach($taskItem in $taskSelected){
  if($taskItem.LinkType){throw 'Linked curation root'}
  if($taskItem.PSIsContainer){foreach($taskChild in Get-ChildItem -LiteralPath $taskItem.FullName -Recurse -Force){if($taskChild.LinkType){throw 'Linked curation descendant'}}}
}
New-Item -ItemType Directory -Path $taskStage | Out-Null
foreach($taskItem in $taskSelected){Copy-Item -LiteralPath $taskItem.FullName -Destination (Join-Path $taskStage $taskItem.Name) -Recurse}
foreach($taskRevisedAuditName in @('revised-input-audit-1','revised-input-audit-2')){
$taskRevisedAuditSource=Join-Path $taskSource $taskRevisedAuditName
$taskRevisedAuditTarget=Join-Path $taskStage $taskRevisedAuditName
New-Item -ItemType Directory -Path $taskRevisedAuditTarget | Out-Null
foreach($taskItem in Get-ChildItem -LiteralPath $taskRevisedAuditSource -Force | Where-Object {$_.Name -ne 'reconstruction'}){
  if($taskItem.LinkType -or $taskItem.PSIsContainer){throw 'Unexpected revised-input audit artifact'}
  Copy-Item -LiteralPath $taskItem.FullName -Destination (Join-Path $taskRevisedAuditTarget $taskItem.Name)
}
}
foreach($taskRevisionName in @('precommit-revised-source-input-1','precommit-unborn-source-input-1')){
  $taskRevisionSource=Join-Path $taskSource $taskRevisionName
  $taskRevisionTarget=Join-Path $taskStage $taskRevisionName
  New-Item -ItemType Directory -Path $taskRevisionTarget | Out-Null
  foreach($taskItem in Get-ChildItem -LiteralPath $taskRevisionSource -Force | Where-Object {$_.Name -ne 'source.bundle'}){
    if($taskItem.LinkType -or $taskItem.PSIsContainer -or $taskItem.Length -gt 20000000){throw 'Unexpected source input artifact'}
    Copy-Item -LiteralPath $taskItem.FullName -Destination (Join-Path $taskRevisionTarget $taskItem.Name)
  }
}
foreach($taskFailureName in @('precommit-vm-1','precommit-vm-2','precommit-vm-3','precommit-vm-4','precommit-oci-vm-1')){
$taskFailureSource=Join-Path $taskSource $taskFailureName
$taskFailureTarget=Join-Path $taskStage $taskFailureName
New-Item -ItemType Directory -Path $taskFailureTarget | Out-Null
foreach($taskItem in Get-ChildItem -LiteralPath $taskFailureSource -Force | Where-Object {$_.Name -ne 'input'}){
  if($taskItem.LinkType){throw 'Linked failed VM evidence'}
  if($taskItem.PSIsContainer){foreach($taskChild in Get-ChildItem -LiteralPath $taskItem.FullName -Recurse -Force){if($taskChild.LinkType){throw 'Linked failed VM descendant'}}}
  Copy-Item -LiteralPath $taskItem.FullName -Destination (Join-Path $taskFailureTarget $taskItem.Name) -Recurse
}
New-Item -ItemType Directory -Path (Join-Path $taskFailureTarget 'input') | Out-Null
Copy-Item -LiteralPath (Join-Path $taskFailureSource 'input/source.json') -Destination (Join-Path $taskFailureTarget 'input/source.json')
if($taskFailureName -eq 'precommit-vm-1'){
  Copy-Item -LiteralPath (Join-Path $taskFailureSource 'input/precommit.bundle') -Destination (Join-Path $taskFailureTarget 'input/precommit.bundle')
}
}
$taskOperationalRecords=@(foreach($taskPath in $taskOperationalPaths){
  $taskRelative='operational-records/'+$taskPath
  $taskTarget=Join-Path $taskStage $taskRelative
  if(Test-Path -LiteralPath $taskTarget){throw 'Operational snapshot output already exists'}
  New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($taskTarget)) -Force | Out-Null
  $taskBefore=Get-TaskPin $taskRoot $taskPath
  Copy-Item -LiteralPath (Join-Path $taskRoot $taskPath) -Destination $taskTarget
  $taskCopy=Get-TaskPin $taskStage $taskRelative
  if($taskBefore.bytes -ne $taskCopy.bytes -or $taskBefore.sha256 -ne $taskCopy.sha256){throw 'Operational snapshot changed while copying'}
  [ordered]@{sourcePath=$taskPath;retained=$taskCopy}
})
$taskFiles=@(Get-ChildItem -LiteralPath $taskStage -Recurse -File -Force | Sort-Object FullName | ForEach-Object {Get-TaskPin $taskStage ($_.FullName.Substring($taskStage.Length+1).Replace('\','/'))})
$taskTotal=0L
foreach($taskPin in $taskFiles){$taskTotal += [long]$taskPin.bytes}
if($taskTotal -gt 64000000){throw 'Total retained evidence exceeds the existing 64 MB audit bound'}
$taskChanged=@(git --no-optional-locks diff --name-only HEAD --)
if($LASTEXITCODE -ne 0){throw 'Changed-file inventory failed'}
$taskNew=@(git --no-optional-locks ls-files --others --exclude-standard)
if($LASTEXITCODE -ne 0){throw 'New-file inventory failed'}
$taskImplementationPaths=@(@($taskChanged)+@($taskNew) | Where-Object {$_ -ne 'Implementation-ready improvement plan 8-5-26.txt' -and $_ -notin $taskOperationalPaths -and $_ -notmatch '^docs/source-authority/ORCH-AUTH-01-C6e/evidence/'} | Sort-Object -Unique)
if($taskImplementationPaths.Count -lt 40){throw 'Implementation inventory is incomplete'}
$taskPrior=Get-Content -LiteralPath 'docs/source-authority/ORCH-AUTH-01-C6d/evidence/manifest.json' -Raw | ConvertFrom-Json
$taskActivePaths=@($taskPrior.activeGeneration.path | Where-Object {$_ -notin $taskImplementationPaths} | Sort-Object -Unique)
$taskActive=@($taskActivePaths | ForEach-Object {Get-TaskPin $taskRoot $_})
New-Item -ItemType Directory -Path $taskEvidence | Out-Null
$taskZip=Join-Path $taskEvidence 'retained-evidence.zip'
[IO.Compression.ZipFile]::CreateFromDirectory($taskStage,$taskZip,[IO.Compression.CompressionLevel]::Optimal,$false)
$taskManifest=[ordered]@{
  schemaVersion='source-publication-retention.v1'
  sourceBase='fc2419d8bdfc3658fe76edf2b543b38051b359f1'
  completionEligible=$false
  files=$taskFiles
  implementation=@($taskImplementationPaths | ForEach-Object {Get-TaskPin $taskRoot $_})
  operationalRecords=$taskOperationalRecords
  activeGeneration=$taskActive
  archive=(Get-TaskPin $taskEvidence 'retained-evidence.zip')
  selection=[ordered]@{source='artifacts/wp6e-source-publication-20260906';excluded=$taskExcluded;reason='Draft copies are represented by executed procedures and final implementation pins. Large VM payloads and disposable reconstruction object caches remain outside the seal. All four failed VMs, the earlier separate OCI success, both failed namespace setups and the failed full Linux controller command retain their original source identities and raw results. Every native regression failure and the unchanged cache diagnostic remain direct. The latest successful Linux source checks and separate unchanged C3 OCI lifecycle are independently bound to the same clean input and copied into precommit. All three source identities are reconstructible through the original bundle and two separately pinned four-file repair deltas; complete full source bundles remain outside Git.'}
}
$taskManifest | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath (Join-Path $taskEvidence 'manifest.json')
[ordered]@{files=$taskFiles.Count;bytes=$taskTotal;archive=$taskManifest.archive}|ConvertTo-Json -Depth 4
