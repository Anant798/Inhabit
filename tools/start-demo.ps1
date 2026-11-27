# Starts the whole demo on this PC: control server, Pixel Streaming signalling server, Unreal
# rendering offscreen into the stream, an HTTPS tunnel so a phone can use the tablet page with
# its microphone, and the room display (intro video, then the live room) full-screen in Edge.
# Stop it all with tools\stop-demo.ps1.
#   powershell -ExecutionPolicy Bypass -File tools\start-demo.ps1 [-NoTv]
# Room (TV): http://localhost:8787/tv   Tablet on this PC: http://localhost:8787   Phone: the printed https link.
# Needs: tools\setup.ps1 run once, control-server built (npm run build), the level built (unreal\README.md).
param([switch]$NoTv)  # -NoTv: don't open the full-screen room display on this PC
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot
$bin = Join-Path $PSScriptRoot 'bin'
$ue = if ($env:UE_ROOT) { $env:UE_ROOT } else { 'C:\Program Files\Epic Games\UE_5.7' }
$web = Join-Path $bin 'ps-web\SignallingWebServer'
foreach ($need in @("$root\control-server\dist\server.js", "$web\dist\index.js", "$root\unreal\Content\Maps\Bathroom.umap", "$bin\cloudflared.exe")) {
    if (-not (Test-Path $need)) { throw "missing $need (see README.md, Run it)" }
}

Start-Process node -ArgumentList 'dist/server.js' -WorkingDirectory "$root\control-server" -WindowStyle Minimized
Start-Process node -ArgumentList 'dist/index.js --serve --http_root www --player_port 8080 --streamer_port 8888' `
    -WorkingDirectory $web -WindowStyle Minimized
$started = Get-Date
Start-Process "$ue\Engine\Binaries\Win64\UnrealEditor.exe" -ArgumentList @(
    "`"$root\unreal\Inhabit.uproject`"", '-game', '-RenderOffscreen', '-ResX=1920', '-ResY=1080',
    '-PixelStreamingConnectionURL=ws://localhost:8888', '-nosplash', '-unattended')

# Quick tunnel: no account, a new random https://*.trycloudflare.com link each start. Anyone with the link
# can use the tablet page while this runs. cloudflared prints the link to stderr.
$log = Join-Path $bin 'cloudflared.log'
Remove-Item $log -ErrorAction SilentlyContinue
Start-Process "$bin\cloudflared.exe" -ArgumentList 'tunnel', '--no-autoupdate', '--url', 'http://localhost:8787' `
    -RedirectStandardError $log -WindowStyle Hidden
$url = $null
for ($i = 0; $i -lt 40 -and -not $url; $i++) {
    Start-Sleep 1
    if (Test-Path $log) { $url = (Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1).Matches.Value }
}

Write-Host ''
Write-Host 'Starting (Unreal takes ~30 s).'
Write-Host '  Room (TV):        http://localhost:8787/tv  (intro, then the room; raw stream: http://localhost:8080)'
Write-Host '  Tablet, this PC:  http://localhost:8787'
if ($url) {
    Set-Clipboard $url
    Write-Host "  Phone (with mic): $url   (copied to clipboard)"
} else {
    Write-Warning "No tunnel link yet; check $log"
}

# Room display: once Unreal is streaming, open /tv full-screen in Edge with its own profile, where
# sound may autoplay (normal browsers need a click first). F11 or Alt+F4 leaves it.
if (-not $NoTv) {
    $ueLog = "$root\unreal\Saved\Logs\Inhabit.log"
    for ($i = 0; $i -lt 90; $i++) {
        Start-Sleep 1
        $f = Get-Item $ueLog -ErrorAction SilentlyContinue
        if ($f -and $f.CreationTime -gt $started -and (Select-String -Path $ueLog -Pattern 'Local participant joined' -Quiet)) { break }
    }
    $edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
    if (Test-Path $edge) {
        Start-Process $edge -ArgumentList @('--app=http://localhost:8787/tv', '--start-fullscreen', '--autoplay-policy=no-user-gesture-required',
            "--user-data-dir=$bin\tv-browser", '--no-first-run', '--no-default-browser-check')
        Write-Host '  Room display opened full-screen (F11 or Alt+F4 to leave).'
    } else {
        Write-Warning 'Edge not found: open http://localhost:8787/tv yourself (sound needs one click there).'
    }
}
