import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import { config } from './config/index.js';
import commandRoutes from './routes/commandRoutes.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use('/api', commandRoutes);

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
        // The sending browser already has the command; relay it to the other screens.
        const serialized = JSON.stringify(message);
        for (const client of browserClients) {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(serialized);
          }
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

// Accept browser WebSocket connections only on /ws.
httpServer.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (pathname !== '/ws') {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    groqModel: config.groqModel,
    browserConnected: browserClients.size > 0,
    browserClients: browserClients.size
  });
});

httpServer.listen(Number(config.port), '0.0.0.0', () => {
  console.log(`Backend API running on http://0.0.0.0:${config.port}`);
  console.log('Browser WebSocket endpoint: /ws');
});

httpServer.on('error', (error) => {
  console.error('Backend HTTP server error:', error);
});

export default app;
