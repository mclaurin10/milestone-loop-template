[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $VerifyArguments
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$verifyScript = Join-Path $PSScriptRoot 'verify.mjs'
$verifyExitCode = 3

Push-Location -LiteralPath $repoRoot
try {
    & node $verifyScript @VerifyArguments
    $verifyExitCode = $LASTEXITCODE
}
finally {
    Pop-Location
}

exit $verifyExitCode
