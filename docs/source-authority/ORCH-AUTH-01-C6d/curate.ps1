$ErrorActionPreference='Stop'
$taskRoot=(Get-Location).Path
$taskSource=Join-Path $taskRoot 'artifacts/wp6e-source-transition-20260906'
$taskEvidence=Join-Path $taskRoot 'docs/source-authority/ORCH-AUTH-01-C6d/evidence'
$taskPost=Join-Path $taskSource 'c6c-postcommit'
if((Test-Path -LiteralPath $taskEvidence) -or (Test-Path -LiteralPath $taskPost)){throw 'Curation outputs must be absent'}
New-Item -ItemType Directory -Path $taskPost | Out-Null
foreach($taskName in @('audit','dependencies','build')){Copy-Item -LiteralPath ('artifacts/wp6e-candidate-runtime-20260906/postcommit-'+$taskName) -Destination (Join-Path $taskPost $taskName) -Recurse}
Copy-Item -LiteralPath 'artifacts/wp6e-candidate-runtime-20260906/postcommit-observation.json' -Destination (Join-Path $taskPost 'observation.json')
function Get-TaskPin([string]$Base,[string]$Relative){
  $taskInfo=Get-Item -LiteralPath (Join-Path $Base $Relative) -Force
  if($taskInfo.LinkType -or $taskInfo.PSIsContainer -or $taskInfo.Length -gt 20000000){throw ('Unsafe input: '+$Relative)}
  [ordered]@{path=$Relative;bytes=$taskInfo.Length;sha256=(Get-FileHash -LiteralPath $taskInfo.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
}
foreach($taskDir in Get-ChildItem -LiteralPath $taskSource -Recurse -Directory -Force){if($taskDir.LinkType){throw 'Linked directory'}}
$taskFiles=@(Get-ChildItem -LiteralPath $taskSource -Recurse -File -Force | Sort-Object FullName | ForEach-Object {Get-TaskPin $taskSource ($_.FullName.Substring($taskSource.Length+1).Replace('\','/'))})
$taskTotal=0L
foreach($taskPin in $taskFiles){$taskTotal += [long]$taskPin.bytes}
if($taskTotal -gt 64000000){throw 'Total input bound exceeded'}
$taskImplementationPaths=@('tools/milestone-orchestrator/src/source-authority-transition.ts','tools/milestone-orchestrator/src/source-authority-transition-cli.ts','tools/milestone-orchestrator/src/source-authority-transition.test.ts','tools/milestone-orchestrator/src/source-schedule.ts','tools/milestone-orchestrator/src/source-schedule.test.ts','tools/milestone-orchestrator/src/adopter-package.test.ts','tools/milestone-orchestrator/src/test-ownership.test.ts','tools/milestone-orchestrator/config/test-ownership.json','tools/source-release-policy.json','docs/source-authority/ORCH-AUTH-01-C6d/audit.ts','docs/source-authority/ORCH-AUTH-01-C6d/curate.ps1')
$taskPrior=Get-Content -LiteralPath 'docs/source-authority/ORCH-AUTH-01-C6b/evidence/manifest.json' -Raw | ConvertFrom-Json
$taskActivePaths=@($taskPrior.activeGeneration.path)+@('tools/milestone-orchestrator/src/command-runner.ts','tools/milestone-orchestrator/src/redaction.ts','tools/milestone-orchestrator/src/test-partitions.ts')
$taskActive=@($taskActivePaths | Where-Object {$_ -notin $taskImplementationPaths} | Sort-Object -Unique | ForEach-Object {Get-TaskPin $taskRoot $_})
New-Item -ItemType Directory -Path $taskEvidence | Out-Null
$taskZip=Join-Path $taskEvidence 'retained-evidence.zip'
[IO.Compression.ZipFile]::CreateFromDirectory($taskSource,$taskZip,[IO.Compression.CompressionLevel]::Optimal,$false)
$taskManifest=[ordered]@{schemaVersion='source-transition-retention.v1';sourceBase='ab19211e3663acc7b14acc847bdc3dde11414d19';completionEligible=$false;files=$taskFiles;implementation=@($taskImplementationPaths|ForEach-Object {Get-TaskPin $taskRoot $_});activeGeneration=$taskActive;archive=(Get-TaskPin $taskEvidence 'retained-evidence.zip')}
$taskManifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $taskEvidence 'manifest.json')
[ordered]@{files=$taskFiles.Count;bytes=$taskTotal;archive=$taskManifest.archive}|ConvertTo-Json -Depth 4
