$ErrorActionPreference='Stop'
$taskRoot=(Get-Location).Path
$taskSource=Join-Path $taskRoot 'artifacts/wp6e-source-scopes-20260906'
$taskHosted=Join-Path $taskRoot 'artifacts/wp6e-authority-fixture-repair-20260906/hosted-c708945'
$taskBundle=Join-Path $taskRoot 'artifacts/wp6e-c6b-retained-bundle'
$taskEvidence=Join-Path $taskRoot 'docs/source-authority/ORCH-AUTH-01-C6b/evidence'
if((Test-Path -LiteralPath $taskBundle) -or (Test-Path -LiteralPath $taskEvidence)){throw 'Curation outputs must be absent'}
$taskExcluded=@('vm-1/input/source.bundle','vm-1/input/projection.index','vm-2/input/source.bundle','vm-2/input/projection.index','vm-3/input/source.bundle','vm-3/input/projection.index')
function Copy-TaskRegular([string]$Source,[string]$Target,[string]$Relative){
  if($taskExcluded -contains $Relative){return}
  $taskInfo=Get-Item -LiteralPath $Source -Force
  if($taskInfo.LinkType){throw "Linked evidence input: $Relative"}
  if($taskInfo.PSIsContainer){
    New-Item -ItemType Directory -Path $Target | Out-Null
    foreach($taskChild in Get-ChildItem -LiteralPath $Source -Force){Copy-TaskRegular $taskChild.FullName (Join-Path $Target $taskChild.Name) ($Relative+'/'+$taskChild.Name)}
  }else{
    if($taskInfo.Length -gt 20000000){throw 'Evidence file exceeds bound'}
    [IO.File]::Copy($Source,$Target,$false)
  }
}
New-Item -ItemType Directory -Path $taskBundle | Out-Null
foreach($taskFile in Get-ChildItem -LiteralPath $taskSource -Force){
  if($taskFile.Name -eq 'paused-c6b'){continue}
  Copy-TaskRegular $taskFile.FullName (Join-Path $taskBundle $taskFile.Name) $taskFile.Name
}
Copy-TaskRegular $taskHosted (Join-Path $taskBundle 'hosted') 'hosted'
function Get-TaskPin([string]$Base,[string]$Relative){
  $taskFile=Get-Item -LiteralPath (Join-Path $Base $Relative)
  if($taskFile.LinkType -or $taskFile.PSIsContainer -or $taskFile.Length -gt 20000000){throw 'Input is not a bounded regular file'}
  [ordered]@{path=$Relative;bytes=$taskFile.Length;sha256=(Get-FileHash -LiteralPath $taskFile.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
}
$taskFiles=@(Get-ChildItem -LiteralPath $taskBundle -Force -Recurse -File | Sort-Object FullName | ForEach-Object {Get-TaskPin $taskBundle ($_.FullName.Substring($taskBundle.Length+1).Replace('\','/'))})
if(($taskFiles|Measure-Object bytes -Sum).Sum -gt 64000000){throw 'Evidence exceeds total bound'}
$taskProjection=Get-Content -Raw -LiteralPath (Join-Path $taskSource 'vm-3/input/projection.json') | ConvertFrom-Json
$taskChanged=@(git diff --name-only HEAD -- scripts tools)+@(git ls-files --others --exclude-standard -- tools/milestone-orchestrator/src)
if($LASTEXITCODE -ne 0){throw 'Changed implementation inventory failed'}
if(($taskChanged | Sort-Object -Unique | ConvertTo-Json -Compress) -ne ($taskProjection.paths | Sort-Object | ConvertTo-Json -Compress)){throw 'Unexpected production/test change'}
$taskPrograms=@(Get-ChildItem -LiteralPath 'docs/source-authority/ORCH-AUTH-01-C6b' -File | Where-Object {$_.Extension -in @('.ts','.py','.ps1','.mjs')} | ForEach-Object {'docs/source-authority/ORCH-AUTH-01-C6b/'+$_.Name})
$taskImplementation=@(@($taskChanged)+@($taskPrograms) | Sort-Object -Unique | ForEach-Object {Get-TaskPin $taskRoot $_})
$taskPriorManifest=Get-Content -Raw -LiteralPath 'docs/ci-regressions/authority-fixture-json/evidence/manifest.json' | ConvertFrom-Json
$taskActivePaths=@($taskPriorManifest.activeGeneration.path)+@('tools/milestone-orchestrator/src/contract-integrity.ts')
$taskActive=@($taskActivePaths | Where-Object {$_ -notin $taskChanged} | Sort-Object -Unique | ForEach-Object {Get-TaskPin $taskRoot $_})
New-Item -ItemType Directory -Path $taskEvidence | Out-Null
$taskArchive=Join-Path $taskEvidence 'retained-evidence.zip'
[IO.Compression.ZipFile]::CreateFromDirectory($taskBundle,$taskArchive,[IO.Compression.CompressionLevel]::Optimal,$false)
$taskManifest=[ordered]@{schemaVersion='source-scope-evidence.v1';sourceBase='c708945e4ba8e0b75f09bc9e564b4afc5cb47a0a';authorityGeneration='legacy-source.v1';claimScope='supporting-compatible-source-readers';completionEligible=$false;activationAuthorized=$false;files=$taskFiles;implementation=$taskImplementation;activeGeneration=$taskActive;archive=(Get-TaskPin $taskEvidence 'retained-evidence.zip')}
$taskManifest | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $taskEvidence 'manifest.json')
[ordered]@{files=$taskFiles.Count;receipts=($taskFiles|Where-Object path -like '*/result.json').Count;archive=$taskManifest.archive}|ConvertTo-Json -Depth 4
