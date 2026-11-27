# Stops everything tools\start-demo.ps1 started: whatever listens on the demo's ports (control server
# 8787, signalling 8080/8888), the Unreal game (-game only, an open editor is left alone), the tunnel
# and the room display's Edge window.
#   powershell -ExecutionPolicy Bypass -File tools\stop-demo.ps1
$ids = @(Get-NetTCPConnection -State Listen -LocalPort 8787, 8080, 8888 -ErrorAction SilentlyContinue).OwningProcess
$ids += (Get-CimInstance Win32_Process | Where-Object {
    ($_.Name -eq 'UnrealEditor.exe' -and $_.CommandLine -match ' -game') -or $_.Name -eq 'cloudflared.exe' -or
    ($_.Name -eq 'msedge.exe' -and $_.CommandLine -match 'tv-browser')  # the room display, not your own Edge
}).ProcessId
foreach ($id in $ids | Sort-Object -Unique) {
    $p = Get-Process -Id $id -ErrorAction SilentlyContinue
    if ($p) { Stop-Process -Id $id -Force; Write-Host "stopped $($p.Name) ($id)" }
}
