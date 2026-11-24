import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import { config } from './config/index.js';
import commandRoutes from './routes/commandRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Register API routes under /api and at the root for simple local diagnostics.
app.use('/api', commandRoutes);
app.use(commandRoutes);

// Keep the HTTP API and browser WebSocket connections on the same port.
const httpServer = createServer(app);
const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
const browserClients = new Set<WebSocket>();

app.set('browserClients', browserClients);

wss.on('connection', (ws: WebSocket) => {
  console.log('Browser client connected via WebSocket');
  browserClients.add(ws);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString()) as { type?: string };
      if (message.type === 'display_command') {
        const serialized = JSON.stringify(message);
        for (const client of browserClients) {
          if (client !== ws && client.readyState === WebSocket.OPEN) client.send(serialized);
        }
      }
    } catch (error) {
      console.error('Failed to parse browser WebSocket message:', error);
    }
  });

  ws.on('close', () => {
    browserClients.delete(ws);
    console.log('Browser client disconnected');
  });

  ws.on('error', (error) => {
    browserClients.delete(ws);
    console.error('Browser WebSocket error:', error);
  });
});

httpServer.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (pathname !== '/ws') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
});

const health = (_req: express.Request, res: express.Response) => {
  res.json({
    status: 'ok',
    groqConfigured: Boolean(config.groqApiKey),
    groqModel: config.groqModel,
    browserConnected: browserClients.size > 0,
    browserClients: browserClients.size
  });
};
app.get('/health', health);
app.get('/api/health', health);

// Must be registered after routes so async controller errors become JSON responses.
app.use(errorHandler);

httpServer.listen(Number(config.port), '0.0.0.0', () => {
  console.log(`Backend API running on http://0.0.0.0:${config.port}`);
  console.log(`Groq key configured: ${Boolean(config.groqApiKey)}; model: ${config.groqModel}`);
  console.log('Command endpoint: POST /api/interpret-command (also /interpret-command)');
  console.log('Browser WebSocket endpoint: /ws');
});

httpServer.on('error', (error) => {
  console.error('Backend HTTP server error:', error);
});

export default app;
