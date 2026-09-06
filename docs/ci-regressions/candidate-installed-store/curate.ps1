$ErrorActionPreference='Stop'
$taskRoot=(Get-Location).Path
$taskSource=Join-Path $taskRoot 'artifacts/runtime-store-regression'
$taskEvidence=Join-Path $taskRoot 'docs/ci-regressions/candidate-installed-store/evidence'
if(Test-Path -LiteralPath $taskEvidence){throw 'Curation output must be absent'}
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
$taskImplementationPaths=@('tools/milestone-orchestrator/src/candidate-package-runtime.test.ts','docs/ci-regressions/candidate-installed-store/audit.ts','docs/ci-regressions/candidate-installed-store/curate.ps1')
$taskPrior=Get-Content -LiteralPath 'docs/source-authority/ORCH-AUTH-01-C6d/evidence/manifest.json' -Raw | ConvertFrom-Json
$taskActivePaths=@($taskPrior.activeGeneration.path)+@('.github/workflows/exact-runtime-ci.yml','pnpm-lock.yaml','pnpm-workspace.yaml','tools/milestone-orchestrator/config/test-ownership.json','tools/milestone-orchestrator/src/test-ownership.test.ts','tools/source-release-policy.json','scripts/verify.mjs')
$taskActive=@($taskActivePaths | Sort-Object -Unique | ForEach-Object {Get-TaskPin $taskRoot $_})
New-Item -ItemType Directory -Path $taskEvidence | Out-Null
$taskZip=Join-Path $taskEvidence 'retained-evidence.zip'
[IO.Compression.ZipFile]::CreateFromDirectory($taskSource,$taskZip,[IO.Compression.CompressionLevel]::Optimal,$false)
$taskManifest=[ordered]@{schemaVersion='candidate-installed-store-retention.v1';sourceBase='96abed900ba141afb4ae644a691e7d5bb0569ca0';completionEligible=$false;files=$taskFiles;implementation=@($taskImplementationPaths|ForEach-Object {Get-TaskPin $taskRoot $_});preserved=$taskActive;archive=(Get-TaskPin $taskEvidence 'retained-evidence.zip')}
$taskManifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $taskEvidence 'manifest.json')
[ordered]@{files=$taskFiles.Count;bytes=$taskTotal;archive=$taskManifest.archive}|ConvertTo-Json -Depth 4
