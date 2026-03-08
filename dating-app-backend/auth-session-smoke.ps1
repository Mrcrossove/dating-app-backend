param(
  [int]$Port = 3902
)

$ErrorActionPreference = 'Stop'

function Wait-ApiReady {
  param(
    [string]$BaseUrl,
    [int]$TimeoutSeconds = 30
  )

  $start = Get-Date
  while (((Get-Date) - $start).TotalSeconds -lt $TimeoutSeconds) {
    try {
      $resp = Invoke-RestMethod -Method Get -Uri "$BaseUrl/auth/ping" -TimeoutSec 2
      if ($resp.success -eq $true) { return $true }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  return $false
}

function Assert-True {
  param(
    [bool]$Condition,
    [string]$Message
  )
  if (-not $Condition) {
    throw "ASSERT FAIL: $Message"
  }
}

$root = $PSScriptRoot
$logFile = Join-Path $root "smoke-server.log"
$errFile = Join-Path $root "smoke-server.err.log"
if (Test-Path $logFile) { Remove-Item $logFile -Force }
if (Test-Path $errFile) { Remove-Item $errFile -Force }

$jwt = "smoke_jwt_secret_1234567890_abcdefghijklmnopqrstuvwxyz"
$startCmd = "set NODE_ENV=development&&set PORT=$Port&&set JWT_SECRET=$jwt&&set DB_DIALECT=sqlite&&set DATABASE_URL=&&set DB_HOST=&&set DB_NAME=&&set DB_USER=&&set DB_PASSWORD=&&node dist/app.js"
$proc = Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", $startCmd) -WorkingDirectory $root -PassThru -RedirectStandardOutput $logFile -RedirectStandardError $errFile

$base = "http://127.0.0.1:$Port/api"

try {
  if (-not (Wait-ApiReady -BaseUrl $base -TimeoutSeconds 40)) {
    throw "API did not start in time. Log: $logFile"
  }

  $suffix = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $username = "smoke_$suffix"
  $password = "abc123456"

  Write-Host "1) register..."
  $registerBody = @{
    username = $username
    password = $password
    nickname = "SmokeUser"
    gender = "female"
  } | ConvertTo-Json

  $register = Invoke-RestMethod -Method Post -Uri "$base/auth/session/password/register" -ContentType "application/json" -Body $registerBody
  Assert-True ($register.success -eq $true) "register success=false"
  Assert-True ([string]::IsNullOrWhiteSpace($register.data.access_token) -eq $false) "register missing access_token"
  Assert-True ([string]::IsNullOrWhiteSpace($register.data.refresh_token) -eq $false) "register missing refresh_token"

  $accessToken = $register.data.access_token
  $refreshToken = $register.data.refresh_token

  Write-Host "2) me..."
  $me = Invoke-RestMethod -Method Get -Uri "$base/auth/session/me" -Headers @{ Authorization = "Bearer $accessToken" }
  Assert-True ($me.success -eq $true) "me success=false"
  Assert-True ($me.data.profile.completed -eq $false) "new user should be profile incomplete"

  Write-Host "3) refresh..."
  $refreshBody = @{ refresh_token = $refreshToken } | ConvertTo-Json
  $refresh = Invoke-RestMethod -Method Post -Uri "$base/auth/session/refresh" -ContentType "application/json" -Body $refreshBody
  Assert-True ($refresh.success -eq $true) "refresh success=false"
  Assert-True ([string]::IsNullOrWhiteSpace($refresh.data.access_token) -eq $false) "refresh missing access_token"
  Assert-True ([string]::IsNullOrWhiteSpace($refresh.data.refresh_token) -eq $false) "refresh missing refresh_token"

  $newRefreshToken = $refresh.data.refresh_token

  Write-Host "4) logout..."
  $logoutBody = @{ refresh_token = $newRefreshToken } | ConvertTo-Json
  $logout = Invoke-RestMethod -Method Post -Uri "$base/auth/session/logout" -ContentType "application/json" -Body $logoutBody
  Assert-True ($logout.success -eq $true) "logout success=false"

  Write-Host "5) refresh after logout (should fail 401)..."
  $failedAsExpected = $false
  try {
    Invoke-RestMethod -Method Post -Uri "$base/auth/session/refresh" -ContentType "application/json" -Body $logoutBody | Out-Null
  } catch {
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 401) {
      $failedAsExpected = $true
    }
  }
  Assert-True $failedAsExpected "refresh should fail after logout"

  Write-Host ""
  Write-Host "SMOKE TEST PASSED"
  Write-Host "username: $username"
  Write-Host "port: $Port"
}
finally {
  if ($proc -and -not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force
  }
}
