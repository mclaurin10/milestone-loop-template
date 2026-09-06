param([Parameter(Mandatory=$true)][string]$SourceEvidence)
$ErrorActionPreference='Stop'
$taskRoot=(Get-Location).Path
$taskBundle=Join-Path $taskRoot 'artifacts/discovery-repair-bundle'
$taskEvidence=Join-Path $taskRoot 'docs/ci-regressions/host-discovery-path/evidence'
if ((Test-Path -LiteralPath $taskBundle) -or (Test-Path -LiteralPath $taskEvidence)) { throw 'Curation output must be absent' }
New-Item -ItemType Directory -Path $taskBundle | Out-Null
foreach($taskName in @('discovery-alias-baseline','discovery-alias-tooling-fixed','discovery-repair-typecheck','discovery-repair-lint','discovery-repair-format','discovery-repair-invariants')) {
  Copy-Item -LiteralPath (Join-Path $taskRoot ('artifacts/'+$taskName)) -Destination (Join-Path $taskBundle $taskName) -Recurse
}
foreach($taskName in @('baseline-launch-setup.json','discovery-alias-baseline.stdout.log','discovery-alias-baseline.stderr.log','discovery-alias-tooling-fixed.stdout.log','discovery-alias-tooling-fixed.stderr.log')) {
  Copy-Item -LiteralPath (Join-Path $taskRoot ('artifacts/'+$taskName)) -Destination (Join-Path $taskBundle $taskName)
}
New-Item -ItemType Directory -Path (Join-Path $taskBundle 'hosted') | Out-Null
foreach($taskName in @('hosted-repair-jobs-progress-5.json','hosted-repair-artifacts-final.json','hosted-repair-windows-unit-report.json','hosted-repair-windows.log','hosted-repair-9983663052.zip','hosted-repair-9982889309.zip','hosted-repair-9982776674.zip','hosted-repair-9982770691.zip','hosted-repair-9982768646.zip')) {
  Copy-Item -LiteralPath (Join-Path $SourceEvidence $taskName) -Destination (Join-Path $taskBundle ('hosted/'+$taskName))
}
git diff --binary --output=artifacts/discovery-repair-bundle/test-fix.patch HEAD -- tools/qualification-host-discovery.test.mjs
if($LASTEXITCODE -ne 0) { throw 'Patch capture failed' }
function Get-TaskPin([string]$Base,[string]$Relative) {
  $taskFile=Get-Item -LiteralPath (Join-Path $Base $Relative)
  if($taskFile.LinkType -or $taskFile.PSIsContainer -or $taskFile.Length -gt 20000000) { throw 'Input is not a bounded regular file' }
  [ordered]@{path=$Relative;bytes=$taskFile.Length;sha256=(Get-FileHash -LiteralPath $taskFile.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
}
$taskFiles=@(Get-ChildItem -LiteralPath $taskBundle -Recurse -File | Sort-Object FullName | ForEach-Object { Get-TaskPin $taskBundle ($_.FullName.Substring($taskBundle.Length+1).Replace('\','/')) })
if(($taskFiles | Measure-Object bytes -Sum).Sum -gt 64000000) { throw 'Evidence exceeds its bound' }
$taskImplementation=@('tools/qualification-host-discovery.test.mjs','tools/qualification-host-discovery.mjs','docs/ci-regressions/host-discovery-path/audit.ts','docs/ci-regressions/host-discovery-path/run-focused.ts','docs/ci-regressions/host-discovery-path/curate.ps1') | ForEach-Object {Get-TaskPin $taskRoot $_}
New-Item -ItemType Directory -Path $taskEvidence | Out-Null
$taskArchive=Join-Path $taskEvidence 'retained-evidence.zip'
[IO.Compression.ZipFile]::CreateFromDirectory($taskBundle,$taskArchive,[IO.Compression.CompressionLevel]::Optimal,$false)
$taskManifest=[ordered]@{schemaVersion='host-discovery-path-evidence.v1';sourceBase='91cbd3eb75ec771cfa1f315fe2641488e361c9e0';authorityGeneration='legacy-source.v1';completionEligible=$false;files=$taskFiles;receiptCount=@($taskFiles|Where-Object {$_.path.EndsWith('/result.json')}).Count;implementation=@($taskImplementation);archive=(Get-TaskPin $taskEvidence 'retained-evidence.zip')}
$taskManifest | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $taskEvidence 'manifest.json')
[ordered]@{files=$taskFiles.Count;receipts=$taskManifest.receiptCount;archive=$taskManifest.archive}|ConvertTo-Json -Depth 4
