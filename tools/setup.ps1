# Downloads the offline voice tools the control server uses. Safe to re-run: skips what exists.
#   whisper.cpp (CPU build, speech-to-text)   ~9 MB   github.com/ggml-org/whisper.cpp
#   ggml-base.en.bin (Whisper English model)  ~148 MB huggingface.co/ggerganov/whisper.cpp
#   Piper (text-to-speech)                    ~22 MB  github.com/rhasspy/piper
#   en_US-lessac-medium (Piper voice)         ~63 MB  huggingface.co/rhasspy/piper-voices
# Also needs ffmpeg on PATH (converts browser audio to the 16 kHz WAV Whisper reads).
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File tools\setup.ps1
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'  # Invoke-WebRequest is 10x slower with the progress bar
$root = $PSScriptRoot
$bin = Join-Path $root 'bin'
$models = Join-Path $root 'models'
New-Item -ItemType Directory -Force $bin, $models | Out-Null

function Get-File($url, $dest) {
    if (Test-Path $dest) { Write-Host "have  $dest"; return }
    Write-Host "fetch $url"
    Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile "$dest.part"
    Move-Item "$dest.part" $dest
}

function Get-Zip($url, $dir) {
    if (Test-Path $dir) { Write-Host "have  $dir"; return }
    $zip = "$dir.zip"
    Get-File $url $zip
    Expand-Archive -Path $zip -DestinationPath $dir
    Remove-Item $zip
}

Get-Zip 'https://github.com/ggml-org/whisper.cpp/releases/download/b5907/whisper-bin-x64.zip' (Join-Path $bin 'whisper')
Get-Zip 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip' (Join-Path $bin 'piper')
Get-File 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin' (Join-Path $models 'ggml-base.en.bin')
$voice = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx'
Get-File $voice (Join-Path $models 'en_US-lessac-medium.onnx')
Get-File "$voice.json" (Join-Path $models 'en_US-lessac-medium.onnx.json')

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { Write-Warning 'ffmpeg not on PATH: install it (winget install Gyan.FFmpeg).' }
Write-Host 'Voice tools ready.'

# Pixel Streaming signalling server + player page, copied from the engine and built with the system Node
# (the engine's own start.bat downloads a private Node and looks up the public IP online; we need neither).
$ue = if ($env:UE_ROOT) { $env:UE_ROOT } else { 'C:\Program Files\Epic Games\UE_5.7' }
$ps = Join-Path $bin 'ps-web'
if (Test-Path (Join-Path $ps 'SignallingWebServer\dist\index.js')) { Write-Host "have  $ps" } else {
    Copy-Item -Recurse -Force (Join-Path $ue 'Engine\Plugins\Media\PixelStreaming2\Resources\WebServers') $ps
    $env:WEBPACK_OUTPUT_PATH = Join-Path $ps 'SignallingWebServer\www'
    npm --prefix $ps install --no-audit --no-fund; if ($LASTEXITCODE) { throw 'npm install failed' }
    foreach ($step in @('Common:build:cjs', 'Common:build:esm', 'Signalling:build:cjs', 'SignallingWebServer:build',
                        'Frontend\library:build:esm', 'Frontend\ui-library:build:esm', 'Frontend\implementations\typescript:build:dev')) {
        $dir, $script = $step -split ':', 2
        npm --prefix (Join-Path $ps $dir) run $script; if ($LASTEXITCODE) { throw "build failed: $step" }
    }
}
Write-Host 'Pixel Streaming web server ready.'

# Cloudflare quick tunnel (~65 MB, no account): gives the tablet page an https:// link, which phones need for the mic.
Get-File 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' (Join-Path $bin 'cloudflared.exe')
Write-Host 'Tunnel ready.'
