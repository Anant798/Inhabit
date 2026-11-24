# Local HTTPS for Inhabit (phone microphone access)

Inhabit stays on your laptop and is reachable only to devices that can reach the laptop on the same local network. HTTPS is needed because mobile browsers restrict microphone APIs on plain HTTP LAN addresses.

## 1. Install mkcert on Windows

Install mkcert using the official Windows package manager instructions, then open PowerShell:

```powershell
mkcert -install
New-Item -ItemType Directory -Force apps/web/certs
```

## 2. Generate a certificate for the laptop's current LAN IP

Find the laptop's active Wi-Fi IPv4 address with `ipconfig`. Replace the example address below with that address:

```powershell
mkcert -key-file apps/web/certs/lan-key.pem -cert-file apps/web/certs/lan-cert.pem 10.31.34.247 localhost 127.0.0.1 ::1
```

The certificate is local-development-only. Do not commit the key or certificate files.

## 3. Trust the local CA on Android

Find the mkcert CA directory:

```powershell
mkcert -CAROOT
```

Copy `rootCA.pem` from that directory to the phone using USB or another trusted local transfer method. On Android, install it as a CA certificate (Settings wording varies; typically Security / Encryption & credentials / Install a certificate / CA certificate). Android may show a warning because this is a user-installed development CA.

Keep `rootCA-key.pem` private. Never copy it to the phone or share it.

## 4. Start Inhabit

From the repository root:

```powershell
npm run dev
```

Vite automatically enables HTTPS when both files exist in `apps/web/certs`. The API remains on the laptop at port 3001; Vite proxies `/api` and `/ws` to it, so the phone uses one HTTPS origin.

Open the exact HTTPS address printed by Vite, for example:

`https://10.31.34.247:5173`

Accept no certificate warning as a workaround: install and trust the mkcert root CA first. If the laptop's LAN IP changes, regenerate the certificate with the new IP and reinstall/trust the CA only if the CA itself changed.

## Offline behavior

The audio recorder uses the phone's microphone and MediaRecorder to create an audio file locally; it does not upload audio. Once Inhabit is loaded and microphone permission is granted, recording itself does not need internet. Groq interpretation still requires internet access. Browser speech recognition is browser/device-dependent and is not guaranteed to work offline.
