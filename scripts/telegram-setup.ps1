<#
.SYNOPSIS
  Wire up the Telegram review bot: secrets, webhook, verification.

.DESCRIPTION
  One script for the whole BotFather dance, because the parts have to agree with
  each other: Telegram must be told a webhook URL and a secret token, the Pages
  project must hold the same secret plus the bot token and the admin chat id, and
  a mismatch in any one of them fails silently (the route would just answer 401
  and the bot would appear to do nothing).

  Steps:
    1. Find the admin chat id by asking the bot for pending updates. Send the bot
       a message first, or pass -ChatId.
    2. Store TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_CHAT_ID and TELEGRAM_WEBHOOK_SECRET
       as Cloudflare Pages secrets.
    3. Register https://<site>/telegram as the webhook, restricted to
       callback_query so Telegram never hands us full message text.
    4. Verify both ends and print what to do next.

  Run it again any time to re-point the webhook or rotate the secret.

.EXAMPLE
  .\telegram-setup.ps1 -Token 123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  .\telegram-setup.ps1 -Token $env:TELEGRAM_BOT_TOKEN -ChatId 987654321
  .\telegram-setup.ps1 -Token $env:TELEGRAM_BOT_TOKEN -SkipSecrets
#>
param(
  # From @BotFather. Falls back to $env:TELEGRAM_BOT_TOKEN.
  [string]$Token = $env:TELEGRAM_BOT_TOKEN,

  # Your Telegram user id. Discovered from pending updates when omitted.
  [string]$ChatId,

  # Webhook secret. Generated when omitted; re-run with -Secret to rotate.
  [string]$Secret,

  [string]$Site   = "https://swapiki.com",
  [string]$Project = "swapiki",

  # Set the Cloudflare secrets yourself (e.g. from the dashboard) and only
  # register the webhook.
  [switch]$SkipSecrets
)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Resolve-Native {
  param([Parameter(Mandatory = $true)][string]$Name)
  $cmdShim = Get-Command "$Name.cmd" -ErrorAction SilentlyContinue
  if ($cmdShim) { return $cmdShim.Source }
  $plain = Get-Command $Name -ErrorAction SilentlyContinue
  if ($plain) { return $plain.Source }
  return $null
}

# Runs a native tool and throws on a non-zero exit code. Values are written to the
# tool's stdin as one line, which is how `wrangler secret put` reads a value
# without an interactive prompt (and without ever putting the secret on a
# command line, where it would land in shell history).
function Invoke-Tool {
  param(
    [Parameter(Mandatory = $true)][string]$Exe,
    [string]$StdinValue,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$ToolArgs
  )
  if ($ToolArgs.Count -eq 1 -and $ToolArgs[0] -is [array]) { $ToolArgs = $ToolArgs[0] }
  Write-Host "   > $Exe $($ToolArgs -join ' ')" -ForegroundColor DarkGray

  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    if ($PSBoundParameters.ContainsKey("StdinValue")) {
      $StdinValue | & $Exe @ToolArgs 2>&1 | ForEach-Object {
        if ($_ -is [System.Management.Automation.ErrorRecord]) { Write-Host $_.Exception.Message }
        else { Write-Host $_ }
      }
    } else {
      & $Exe @ToolArgs 2>&1 | ForEach-Object {
        if ($_ -is [System.Management.Automation.ErrorRecord]) { Write-Host $_.Exception.Message }
        else { Write-Host $_ }
      }
    }
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
  if ($null -ne $code -and $code -ne 0) {
    throw "$Exe $($ToolArgs -join ' ') failed with exit code $code."
  }
}

function Invoke-Telegram {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [hashtable]$Body
  )
  if ($null -eq $Body) { $Body = @{} }
  $json = $Body | ConvertTo-Json -Depth 6 -Compress
  try {
    $reply = Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$Token/$Method" `
      -ContentType "application/json" -Body $json -ErrorAction Stop
  } catch {
    throw "Telegram $Method failed: $($_.Exception.Message)"
  }
  if (-not $reply.ok) { throw "Telegram $Method refused: $($reply.description)" }
  return $reply.result
}

# ---------------------------------------------------------------------------
# 0. Validate what we were given
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "== Telegram review bot setup ==" -ForegroundColor Cyan

if (-not $Token) {
  throw "No bot token. Get one from @BotFather (/newbot) and pass -Token, or set `$env:TELEGRAM_BOT_TOKEN."
}
if ($Token -notmatch '^\d+:[A-Za-z0-9_-]{20,}$') {
  throw "That does not look like a bot token (expected digits, a colon, then 35+ characters). Check for a copy/paste stray."
}
$Token = $Token.Trim()

$me = Invoke-Telegram -Method "getMe"
Write-Host "-> Bot: @$($me.username) ($($me.first_name))" -ForegroundColor Green

# ---------------------------------------------------------------------------
# 1. Find the admin chat id
# ---------------------------------------------------------------------------

if (-not $ChatId) {
  Write-Host "-> Looking for your chat id in pending updates..." -ForegroundColor Yellow
  $updates = @(Invoke-Telegram -Method "getUpdates" -Body @{ limit = 20 })
  $candidates = @($updates | ForEach-Object { $_.message } | Where-Object { $_.from -and $_.chat } |
    Sort-Object { $_.date } -Descending)
  if ($candidates.Count -eq 0) {
    throw "The bot has no messages yet. Open Telegram, start a chat with your bot (tap Start), send it any message, then run this again."
  }
  $ChatId = "$($candidates[0].chat.id)"
  Write-Host "   using chat $($candidates[0].chat.username) ($($candidates[0].chat.type)) = $ChatId" -ForegroundColor Green
  if ($candidates[0].chat.type -ne "private") {
    throw "That chat is a '$($candidates[0].chat.type)'. Use a private chat with the bot - this bot only accepts presses from TELEGRAM_ADMIN_CHAT_ID, which is a user id, not a group id."
  }
}
if ($ChatId -notmatch '^-?\d+$') {
  throw "The chat id must be numeric, got '$ChatId'."
}
Write-Host "-> Admin chat id: $ChatId" -ForegroundColor Green

# ---------------------------------------------------------------------------
# 2. Webhook secret
# ---------------------------------------------------------------------------

if (-not $Secret) {
  # Telegram requires the secret to start with a letter, so a raw hex string is
  # rejected often enough to matter - it is prefixed rather than retried.
  $bytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $Secret = "swk_" + (-join ($bytes | ForEach-Object { $_.ToString("x2") }))
  Write-Host "-> Generated a new webhook secret." -ForegroundColor Green
} else {
  Write-Host "-> Using the webhook secret you supplied." -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# 3. Cloudflare Pages secrets
# ---------------------------------------------------------------------------

$wrangler = if (Test-Path "node_modules\.bin\wrangler.cmd") { "node_modules\.bin\wrangler.cmd" } else { Resolve-Native "wrangler" }

if ($SkipSecrets) {
  Write-Host "-> -SkipSecrets: leaving Cloudflare secrets alone. They must already contain TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_CHAT_ID and TELEGRAM_WEBHOOK_SECRET." -ForegroundColor Yellow
} else {
  if (-not $wrangler) {
    throw "wrangler not found locally or globally. Install it with 'npm i -D wrangler', or re-run with -SkipSecrets after setting the three variables in the Cloudflare dashboard."
  }
  Write-Host "-> Storing Pages secrets on project '$Project'..." -ForegroundColor Yellow
  Invoke-Tool $wrangler -StdinValue $Token        "pages" "secret" "put" "TELEGRAM_BOT_TOKEN"      "--project-name" $Project
  Invoke-Tool $wrangler -StdinValue $ChatId       "pages" "secret" "put" "TELEGRAM_ADMIN_CHAT_ID" "--project-name" $Project
  Invoke-Tool $wrangler -StdinValue $Secret       "pages" "secret" "put" "TELEGRAM_WEBHOOK_SECRET" "--project-name" $Project
  Write-Host "-> Secrets stored. Wrangler redeploys Pages after a secret change, so /telegram is live with them." -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# 4. Register the webhook
# ---------------------------------------------------------------------------

$webhookUrl = "$Site/telegram"
Write-Host "-> Registering $webhookUrl ..." -ForegroundColor Yellow
$set = Invoke-Telegram -Method "setWebhook" -Body @{
  url             = $webhookUrl
  secret_token    = $Secret
  allowed_updates = @("message", "callback_query", "chat_member")
}
if ($set -ne $true) { throw "setWebhook did not confirm: $set" }

$info = Invoke-Telegram -Method "getWebhookInfo"
Write-Host "-> Telegram sees:" -ForegroundColor Green
Write-Host "     url            $($info.url)"
Write-Host "     pending        $($info.pending_update_count)"
Write-Host "     last_error     $(if ($info.last_error_message) { $info.last_error_message } else { 'none' })"

if ($info.url -ne $webhookUrl) { throw "Telegram is still pointed at '$($info.url)'." }

# ---------------------------------------------------------------------------
# 5. Verify our end
# ---------------------------------------------------------------------------

$probe = Invoke-RestMethod -Method Get -Uri "$webhookUrl" -ErrorAction SilentlyContinue
if ($null -eq $probe) {
  Write-Host ""
  Write-Host "The webhook is registered, but $webhookUrl did not answer." -ForegroundColor Yellow
  Write-Host "Deploy the functions first: .\deploy.ps1 -Environment prod" -ForegroundColor Yellow
} else {
  Write-Host ""
  Write-Host "Route check: ok=$($probe.ok) configured=$($probe.configured) webhookSecretSet=$($probe.webhookSecretSet)" -ForegroundColor Green
  if (-not $probe.configured) {
    Write-Host "  TELEGRAM_BOT_TOKEN / TELEGRAM_ADMIN_CHAT_ID are missing from the Pages environment." -ForegroundColor Yellow
  }
  if (-not $probe.webhookSecretSet) {
    Write-Host "  TELEGRAM_WEBHOOK_SECRET is missing - every button press will be rejected with 401." -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "Remaining steps:" -ForegroundColor Green
Write-Host "  1. Run supabase/jobs_review_migration.sql and supabase/candidates_telegram_migration.sql in the Supabase SQL editor." -ForegroundColor Green
Write-Host "  2. Deploy: .\deploy.ps1 -Environment prod" -ForegroundColor Green
Write-Host "  3. Set TELEGRAM_CHANNEL_ID, TELEGRAM_CHANNEL_URL, TELEGRAM_BOT_USERNAME in Cloudflare Pages env." -ForegroundColor Green
Write-Host "  4. Make the bot a channel admin of that channel." -ForegroundColor Green
Write-Host ""
