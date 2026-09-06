$ErrorActionPreference='Stop'
$taskRoot=(Get-Location).Path
$taskSource=Join-Path $taskRoot 'artifacts/wp6e-authority-fixture-repair-20260906'
$taskHosted=Join-Path $taskRoot 'artifacts/wp6e-source-readers-20260906/hosted-c6a'
$taskBundle=Join-Path $taskRoot 'artifacts/wp6e-authority-fixture-retained-bundle'
$taskEvidence=Join-Path $taskRoot 'docs/ci-regressions/authority-fixture-json/evidence'
if((Test-Path -LiteralPath $taskBundle) -or (Test-Path -LiteralPath $taskEvidence)){throw 'Curation outputs must be absent'}
$taskExcluded=@('vm-1/input/source.bundle','vm-1/input/projection.index','omission-diagnostic-linux-3/input/source.bundle')
foreach($taskRequired in @('affected-native-1/vitest-report.json','affected-native-1/manifest.json','native-baseline-diagnostic-1/vitest-report.json','native-baseline-diagnostic-1/manifest.json','vm-2/host-exit.json','vm-2/host/host.json','vm-2/guest/artifacts/fixture-unit/result.json','vm-2/oci-audit/result.json','vm-2/host-audit/result.json')){
  if(-not(Test-Path -LiteralPath (Join-Path $taskSource $taskRequired) -PathType Leaf)){throw "Evidence is not complete: $taskRequired"}
}
function Copy-TaskRegular([string]$Source,[string]$Target){
  $taskInfo=Get-Item -LiteralPath $Source -Force
  if($taskInfo.LinkType){throw "Linked evidence input: $Source"}
  if($taskInfo.PSIsContainer){
    New-Item -ItemType Directory -Path $Target | Out-Null
    foreach($taskChild in Get-ChildItem -LiteralPath $Source -Force){Copy-TaskRegular $taskChild.FullName (Join-Path $Target $taskChild.Name)}
  }else{
    $taskRelative=if($taskInfo.FullName.StartsWith($taskSource+[IO.Path]::DirectorySeparatorChar)){$taskInfo.FullName.Substring($taskSource.Length+1).Replace('\','/')}else{''}
    if($taskExcluded -contains $taskRelative){return}
    if($taskInfo.Length -gt 20000000){throw 'Evidence file exceeds bound'}
    [IO.File]::Copy($Source,$Target,$false)
  }
}
New-Item -ItemType Directory -Path $taskBundle | Out-Null
foreach($taskName in @('reproduce-native-1','affected-native-1','status-diagnostic-1','native-baseline-diagnostic-1','typecheck-1','lint-1','format-1','invariants-1','hosted-audit-1','hosted-audit-2','omission-diagnostic-native-1','omission-diagnostic-linux-1','omission-diagnostic-linux-2','omission-diagnostic-linux-3','omission-diagnostic-linux-4','omission-diagnostic-linux-5','omission-diagnostic-linux-6','vm-1','vm-2','retained-audit-1','prior-audit-1')){
  Copy-TaskRegular (Join-Path $taskSource $taskName) (Join-Path $taskBundle $taskName)
}
Copy-TaskRegular $taskHosted (Join-Path $taskBundle 'hosted')
function Get-TaskPin([string]$Base,[string]$Relative){
  $taskFile=Get-Item -LiteralPath (Join-Path $Base $Relative)
  if($taskFile.LinkType -or $taskFile.PSIsContainer -or $taskFile.Length -gt 20000000){throw 'Input is not a bounded regular file'}
  [ordered]@{path=$Relative;bytes=$taskFile.Length;sha256=(Get-FileHash -LiteralPath $taskFile.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
}
$taskFiles=@(Get-ChildItem -LiteralPath $taskBundle -Force -Recurse -File | Sort-Object FullName | ForEach-Object {Get-TaskPin $taskBundle ($_.FullName.Substring($taskBundle.Length+1).Replace('\','/'))})
if(($taskFiles|Measure-Object bytes -Sum).Sum -gt 64000000){throw 'Evidence exceeds total bound'}
$taskProjection=Get-Content -Raw -LiteralPath (Join-Path $taskSource 'vm-1/input/projection.json') | ConvertFrom-Json
$taskChanged=@(git diff --name-only HEAD -- scripts tools)
if($LASTEXITCODE -ne 0){throw 'Changed implementation inventory failed'}
if(($taskChanged | Sort-Object | ConvertTo-Json -Compress) -ne ($taskProjection.paths | Sort-Object | ConvertTo-Json -Compress)){throw 'Unexpected production/test change'}
$taskPrograms=@(Get-ChildItem -LiteralPath 'docs/ci-regressions/authority-fixture-json' -File | Where-Object {$_.Extension -in @('.ts','.py','.ps1','.mjs')} | ForEach-Object {'docs/ci-regressions/authority-fixture-json/'+$_.Name})
$taskImplementation=@(@($taskChanged)+@($taskPrograms) | Sort-Object -Unique | ForEach-Object {Get-TaskPin $taskRoot $_})
$taskPriorManifest=Get-Content -Raw -LiteralPath 'docs/source-authority/ORCH-AUTH-01-C6a/evidence/manifest.json' | ConvertFrom-Json
$taskActivePaths=@($taskPriorManifest.activeGeneration.path)+@('tools/milestone-orchestrator/src/authority-publication.mjs','tools/milestone-orchestrator/src/state-store.ts','tools/milestone-orchestrator/src/controller-lease.ts','tools/milestone-orchestrator/src/verifier.ts','scripts/verify.mjs','tools/run-tool-evidence.mjs','tools/evidence.mjs','tools/milestone-orchestrator/config/test-ownership.json','tools/milestone-orchestrator/src/target-integration-recovery.test.ts','tools/milestone-orchestrator/src/workspace-cleanup-recovery.test.ts','tools/qualification-host-discovery.test.mjs')
$taskActive=@($taskActivePaths | Sort-Object -Unique | ForEach-Object {Get-TaskPin $taskRoot $_})
New-Item -ItemType Directory -Path $taskEvidence | Out-Null
$taskArchive=Join-Path $taskEvidence 'retained-evidence.zip'
[IO.Compression.ZipFile]::CreateFromDirectory($taskBundle,$taskArchive,[IO.Compression.CompressionLevel]::Optimal,$false)
$taskManifest=[ordered]@{schemaVersion='authority-fixture-evidence.v1';sourceBase='6ae4efb808652e24d565cf5562c0611aac5ed25a';authorityGeneration='legacy-source.v1';claimScope='supporting-original-test-fixture-repair';completionEligible=$false;activationAuthorized=$false;files=$taskFiles;implementation=$taskImplementation;activeGeneration=$taskActive;archive=(Get-TaskPin $taskEvidence 'retained-evidence.zip')}
$taskManifest | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $taskEvidence 'manifest.json')
[ordered]@{files=$taskFiles.Count;archive=$taskManifest.archive}|ConvertTo-Json -Depth 4
