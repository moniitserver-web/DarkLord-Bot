[CmdletBinding()]
param(
  [switch]$Once
)

$ErrorActionPreference = "Stop"

$BaseUrl = if ($env:STARBOX_URL) { $env:STARBOX_URL.TrimEnd('/') } else { "http://127.0.0.1:3001" }
$PollMs = 1000
if ($env:AUTOMATION_POLL_MS) { [int]::TryParse($env:AUTOMATION_POLL_MS, [ref]$PollMs) | Out-Null }
$PollMs = [Math]::Max(300, $PollMs)
$OutputDir = if ($env:SCREENSHOT_OUTPUT_DIR) { $env:SCREENSHOT_OUTPUT_DIR } else { Join-Path (Get-Location) ".screenshots-windows" }
$NativeAdapter = if ($env:AUTOMATION_NATIVE_ADAPTER) { $env:AUTOMATION_NATIVE_ADAPTER.Trim() } else { "" }
$DryRun = $true
if ($env:AUTOMATION_DRY_RUN -and $env:AUTOMATION_DRY_RUN -match "^(0|false|no)$") { $DryRun = $false }
$PreviousHashes = @{}
$Stopped = $false

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

function Invoke-JsonApi {
  param(
    [Parameter(Mandatory = $true)][string]$Uri,
    [ValidateSet("GET", "POST")][string]$Method = "GET",
    [object]$Body
  )
  if ($Method -eq "GET") { return Invoke-RestMethod -Uri $Uri -Method Get -UseBasicParsing }
  $json = if ($null -eq $Body) { "{}" } else { $Body | ConvertTo-Json -Depth 12 -Compress }
  return Invoke-RestMethod -Uri $Uri -Method Post -UseBasicParsing -ContentType "application/json" -Body $json
}

function Get-FileHashHex {
  param([Parameter(Mandatory = $true)][string]$Path)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.IO.File]::ReadAllBytes($Path)
    return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant()
  } finally { $sha.Dispose() }
}

function Capture-Desktop {
  param([Parameter(Mandatory = $true)][string]$Path)
  Add-Type -AssemblyName System.Drawing
  Add-Type -AssemblyName System.Windows.Forms
  $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $bitmap = New-Object System.Drawing.Bitmap -ArgumentList @($bounds.Width, $bounds.Height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bitmap.Size)
    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

function Send-Screenshot {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Page
  )
  $client = New-Object System.Net.Http.HttpClient
  $multipart = New-Object System.Net.Http.MultipartFormDataContent
  $imageContent = New-Object System.Net.Http.ByteArrayContent -ArgumentList (,([System.IO.File]::ReadAllBytes($Path)))
  $imageContent.Headers.ContentType = New-Object -TypeName System.Net.Http.Headers.MediaTypeHeaderValue -ArgumentList "image/png"
  $multipart.Add($imageContent, "image", [System.IO.Path]::GetFileName($Path))
  $multipart.Add((New-Object -TypeName System.Net.Http.StringContent -ArgumentList "screen"), "source")
  $multipart.Add((New-Object -TypeName System.Net.Http.StringContent -ArgumentList $Page), "page")
  $multipart.Add((New-Object -TypeName System.Net.Http.StringContent -ArgumentList ([DateTime]::UtcNow.ToString("o"))), "capturedAt")
  try {
    $response = $client.PostAsync("$BaseUrl/api/bot/screenshot", $multipart).GetAwaiter().GetResult()
    $text = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if (-not $response.IsSuccessStatusCode) { throw "截圖 API 回應 $($response.StatusCode)：$text" }
    return $text | ConvertFrom-Json
  } finally {
    $multipart.Dispose()
    $client.Dispose()
  }
}

function Invoke-NativeAdapter {
  param(
    [Parameter(Mandatory = $true)]$Task,
    [Parameter(Mandatory = $true)]$Action
  )
  if ($DryRun -or [string]::IsNullOrWhiteSpace($NativeAdapter)) {
    Write-Host "  [dry-run] $($Task.name)：$($Action.reason)"
    return
  }
  if (-not (Test-Path -LiteralPath $NativeAdapter -PathType Leaf)) { throw "找不到 native adapter：$NativeAdapter" }
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  if ([System.IO.Path]::GetExtension($NativeAdapter).ToLowerInvariant() -eq ".ps1") {
    $psi.FileName = if ($env:POWERSHELL_EXE) { $env:POWERSHELL_EXE } else { "powershell.exe" }
    $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$NativeAdapter`""
  } else {
    $psi.FileName = $NativeAdapter
  }
  $psi.UseShellExecute = $false
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $psi
  try {
    [void]$process.Start()
    $payload = @{ event = "automation_action"; task = $Task; action = $Action } | ConvertTo-Json -Depth 12 -Compress
    $process.StandardInput.Write($payload)
    $process.StandardInput.Close()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw "native adapter 結束碼 $($process.ExitCode)：$($process.StandardError.ReadToEnd())" }
  } finally { $process.Dispose() }
}

function Invoke-CaptureAction {
  param([Parameter(Mandatory = $true)][string]$Page)
  $safePage = ($Page -replace '[^\p{L}\p{Nd}_-]', '_')
  $path = Join-Path $OutputDir ("frame-{0}-{1}.png" -f $safePage, [DateTime]::UtcNow.ToString("yyyyMMdd-HHmmss-fff"))
  try {
    Capture-Desktop -Path $path
    $hash = Get-FileHashHex -Path $path
    if ($PreviousHashes.ContainsKey($Page) -and $PreviousHashes[$Page] -eq $hash) {
      Remove-Item -LiteralPath $path -Force
      return
    }
    $PreviousHashes[$Page] = $hash
    $result = Send-Screenshot -Path $path -Page $Page
    Write-Host "  畫面已送出：$Page$(if ($result.forwarded) { '（已轉送 bot）' } else { '（API 已接收）' })"
  } catch {
    Write-Warning "畫面擷取或傳送失敗：$($_.Exception.Message)"
    if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue }
  }
}

function Invoke-TaskTick {
  param([Parameter(Mandatory = $true)]$Task)
  $result = Invoke-JsonApi -Uri "$BaseUrl/api/automation/$([uri]::EscapeDataString($Task.id))" -Method POST -Body @{ action = "tick" }
  if (-not $result.actions -or $result.actions.Count -eq 0) { return }
  Write-Host "[$([DateTime]::Now.ToString('s'))] $($Task.name) step $($result.task.steps)"
  foreach ($action in $result.actions) {
    if ($action.type -eq "capture_screen") { Invoke-CaptureAction -Page $action.page }
    elseif ($action.type -eq "native_adapter_required") { Invoke-NativeAdapter -Task $result.task -Action $action }
  }
}

Write-Host "BlackLord Windows runner：$BaseUrl，每 $PollMs ms 輪詢$(if ($DryRun) { '，dry-run 模式' } else { "，adapter $NativeAdapter" })"
try {
  do {
    try {
      $snapshot = Invoke-JsonApi -Uri "$BaseUrl/api/automation" -Method GET
      foreach ($task in $snapshot.tasks) { if ($task.status -eq "running") { Invoke-TaskTick -Task $task } }
    } catch { Write-Warning "runner 失敗：$($_.Exception.Message)" }
    if (-not $Once -and -not $Stopped) { Start-Sleep -Milliseconds $PollMs }
  } while (-not $Once -and -not $Stopped)
} finally { Write-Host "已停止 BlackLord Windows runner。" }
