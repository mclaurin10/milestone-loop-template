param(
  [Parameter(Mandatory=$true)][string]$Archive,
  [Parameter(Mandatory=$true)][string]$ExpectedSha256,
  [Parameter(Mandatory=$true)][string]$Destination
)
$ErrorActionPreference='Stop'
$taskArchivePath=(Resolve-Path -LiteralPath $Archive).Path
if ((Get-FileHash -LiteralPath $taskArchivePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ExpectedSha256.ToLowerInvariant()) { throw 'Archive digest mismatch' }
$taskWorkspace=[IO.Path]::GetFullPath((Get-Location).Path)
$taskDestination=[IO.Path]::GetFullPath($Destination)
if (!$taskDestination.StartsWith($taskWorkspace+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Extraction destination must be inside the current workspace' }
if (Test-Path -LiteralPath $taskDestination) { throw 'Extraction destination must be absent' }
$taskZip=[IO.Compression.ZipFile]::OpenRead($taskArchivePath)
try {
  $taskEntries=@($taskZip.Entries)
  if ($taskEntries.Count -lt 1 -or $taskEntries.Count -gt 10000) { throw 'Archive entry count refused' }
  $taskSeen=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  $taskTotal=0L
  $taskInventory=@()
  foreach ($taskEntry in $taskEntries) {
    $taskName=$taskEntry.FullName
    $taskType=($taskEntry.ExternalAttributes -shr 16 -band 61440)
    if ($taskName -match '(^/|^[A-Za-z]:|\\|(^|/)\.\.?(/|$)|:)' -or !$taskSeen.Add($taskName) -or $taskType -notin @(0,32768,16384)) { throw "Unsafe archive entry: $taskName" }
    $taskTotal+=$taskEntry.Length
    if ($taskEntry.Length -gt 20000000 -or $taskTotal -gt 64000000) { throw 'Archive size limit refused' }
    $taskResolved=[IO.Path]::GetFullPath((Join-Path $taskDestination $taskName))
    if (!$taskResolved.StartsWith($taskDestination+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Archive containment refused' }
    $taskInventory+= [ordered]@{path=$taskName;bytes=$taskEntry.Length;attributes=$taskEntry.ExternalAttributes}
  }
  # Every entry is checked before any archive content is written.
  New-Item -ItemType Directory -Path $taskDestination | Out-Null
  foreach ($taskEntry in $taskEntries) {
    $taskTarget=Join-Path $taskDestination $taskEntry.FullName
    if ($taskEntry.FullName.EndsWith('/')) { New-Item -ItemType Directory -Force -Path $taskTarget | Out-Null; continue }
    New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($taskTarget)) | Out-Null
    $taskInput=$taskEntry.Open()
    $taskOutput=[IO.File]::Open($taskTarget,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try { $taskInput.CopyTo($taskOutput) } finally { $taskOutput.Dispose(); $taskInput.Dispose() }
  }
  $taskInventory | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath ($taskDestination+'.inspection.json')
  [ordered]@{files=$taskEntries.Count;bytes=$taskTotal;archiveSha256=$ExpectedSha256;destination=$taskDestination} | ConvertTo-Json
} finally { $taskZip.Dispose() }
