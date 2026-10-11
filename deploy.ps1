<#
.SYNOPSIS
  Deploy Swapiki to Cloudflare Pages - test-first workflow.

.DESCRIPTION
  test  -> builds, runs the test suite, deploys to the "swapiki-test" Pages
           project (preview). Test site URL is swapiki-test.pages.dev and (by
           default) shares the existing Supabase database - see TEST_ENV_SETUP.md.
  prod  -> builds, runs the test suite, deploys the SAME code to the "swapiki"
           Pages project (main), which serves the live site. Never runs a build
           that wasn't tested.

.EXAMPLE
  .\deploy.ps1 -Environment test
  .\deploy.ps1 -Environment prod
#>
param(
  [ValidateSet("test", "prod")]
  [string]$Environment = "test"
)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# ---------------------------------------------------------------------------
# Helpers
#
# PowerShell 5.1 has two traps that used to break this script on a machine
# where nothing was actually wrong:
#
#   1. With $ErrorActionPreference = "Stop", ANY line a native command writes
#      to stderr becomes a terminating NativeCommandError. npm prints a
#      harmless "Browserslist: caniuse-lite is outdated" notice that way, so
#      the build died on a warning. Invoke-Native judges success by the exit
#      code only, which is the only thing that actually means "failed".
#   2. npm resolves to npm.ps1, a PowerShell wrapper, which is what makes that
#      stderr show up as an error at all. We prefer the .cmd shims.
# ---------------------------------------------------------------------------

function Resolve-Native {
  param([Parameter(Mandatory = $true)][string]$Name)
  $cmdShim = Get-Command "$Name.cmd" -ErrorAction SilentlyContinue
  if ($cmdShim) { return $cmdShim.Source }
  $plain = Get-Command $Name -ErrorAction SilentlyContinue
  if ($plain) { return $plain.Source }
  return $null
}

function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)][string]$Exe,
    # Pass the arguments as SEPARATE positional values, never as a single
    # wrapped array: @("pages","deploy") binds as one nested element and the
    # child process then receives "pages deploy" as a single argument.
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$NativeArgs
  )
  # Guard against the nested-array mistake anyway, rather than letting it turn
  # into a confusing failure inside the tool being called.
  if ($NativeArgs.Count -eq 1 -and $NativeArgs[0] -is [array]) {
    $NativeArgs = $NativeArgs[0]
  }
  Write-Host "   > $Exe $($NativeArgs -join ' ')" -ForegroundColor DarkGray

  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    # 2>&1 folds the tool's stderr into the success stream. Without it, Windows
    # PowerShell renders every stderr line as a red NativeCommandError record -
    # which looks like a crash even when the tool exited 0. ErrorRecords are
    # unwrapped to their message so the log stays readable, and each line is
    # written straight through so the output stays in order with our progress.
    & $Exe @NativeArgs 2>&1 | ForEach-Object {
      if ($_ -is [System.Management.Automation.ErrorRecord]) { Write-Host $_.Exception.Message }
      else { Write-Host $_ }
    }
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
  if ($null -ne $code -and $code -ne 0) {
    throw "$Exe $($NativeArgs -join ' ') failed with exit code $code."
  }
}

Write-Host ""
Write-Host "== Swapiki deploy: $Environment ==" -ForegroundColor Cyan

# 0. Refuse to ship anything that fails its tests. The point of this script is
#    that production only ever gets a build that passed.
Write-Host "-> Running tests..." -ForegroundColor Yellow
$node = Resolve-Native "node"
if (-not $node) { throw "node is not on PATH - cannot run the test suite." }
Invoke-Native $node "--test"
Write-Host "-> Tests passed." -ForegroundColor Green

# 1. Rebuild the bundles and CSS so no stale/removed code ships to either env.
Write-Host "-> Building JS bundles and CSS..." -ForegroundColor Yellow
$npm = Resolve-Native "npm"
if (-not $npm) { throw "npm is not on PATH - cannot build." }
Invoke-Native $npm "run" "build"
Write-Host "-> Build finished." -ForegroundColor Green

# 1b. Sanity-check every built JS bundle parses (catches minifier/rename
#     breakage like `Identifier 'A' has already been declared` BEFORE deploy).
$bundles = @(Get-ChildItem "dist\js\*.js")
foreach ($file in $bundles) {
  Invoke-Native $node "--check" $file.FullName
}
Write-Host "-> Syntax-checked $($bundles.Count) JS bundles." -ForegroundColor Green

# 2. Choose the Pages project + branch.
$project = if ($Environment -eq "prod") { "swapiki" } else { "swapiki-test" }
$branch  = if ($Environment -eq "prod") { "main" } else { "preview" }

# 2b. Find wrangler. A local install is the reliable one; a global install
#     works fine; only fall back to npx (which needs the network and can fail
#     with ECONNRESET) when neither exists.
$wrangler = $null
$localWrangler = "node_modules\.bin\wrangler.cmd"
if (Test-Path $localWrangler) {
  $wrangler = $localWrangler
} else {
  $wrangler = Resolve-Native "wrangler"
  if ($wrangler) {
    Write-Host "-> Using the globally installed wrangler (no local copy). 'npm i -D wrangler' makes this independent of the global install." -ForegroundColor Yellow
  }
}

Write-Host "-> Deploying to project '$project' (branch: $branch)." -ForegroundColor Yellow
if ($wrangler) {
  Invoke-Native $wrangler "pages" "deploy" "." "--project-name" $project "--branch" $branch
} else {
  Write-Host "-> wrangler not found locally or globally; falling back to npx (needs network access)." -ForegroundColor Yellow
  $npx = Resolve-Native "npx"
  if (-not $npx) { throw "wrangler and npx are both unavailable - install wrangler with 'npm i -D wrangler'." }
  Invoke-Native $npx "wrangler" "pages" "deploy" "." "--project-name" $project "--branch" $branch
}

if ($Environment -eq "test") {
  Write-Host ""
  Write-Host "TEST environment deployed." -ForegroundColor Green
  Write-Host "  1. Open the preview URL wrangler printed above (https://<hash>.swapiki-test.pages.dev)." -ForegroundColor Green
  Write-Host "  2. F12 -> Network -> click 'config' -> confirm siteEnv is 'test' (shares the prod DB by design)." -ForegroundColor Green
  Write-Host "  3. When happy, promote the same build:" -ForegroundColor Green
  Write-Host "     .\deploy.ps1 -Environment prod" -ForegroundColor Green
} else {
  Write-Host ""
  Write-Host "PRODUCTION deployment complete." -ForegroundColor Green
}
