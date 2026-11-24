import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';

const certDir = path.resolve(__dirname, 'certs');
const keyPath = path.join(certDir, 'lan-key.pem');
const certPath = path.join(certDir, 'lan-cert.pem');
const hasLocalCertificate = fs.existsSync(keyPath) && fs.existsSync(certPath);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    ...(hasLocalCertificate
      ? { https: { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) } }
      : {}),
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://127.0.0.1:3001',
        ws: true
      }
    }
  }
});
