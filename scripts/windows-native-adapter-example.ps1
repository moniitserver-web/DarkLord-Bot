[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
$allowedTasks = @("auto-fishing", "auto-gathering", "auto-dungeon", "auto-hunt", "auto-performance", "assist-combat")
$allowedActions = @("native_adapter_required")

if ($allowedTasks -notcontains [string]$payload.task.id) { throw "拒絕未知任務。" }
if ($allowedActions -notcontains [string]$payload.action.type) { throw "拒絕未知動作。" }

Write-Output (@{ ok = $true; dryRun = $true; task = $payload.task.id; message = "安全範例 adapter 已驗證動作，但沒有送出鍵鼠輸入。" } | ConvertTo-Json -Compress)
exit 0
