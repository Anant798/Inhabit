import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import { config } from './config/index.js';
import commandRoutes from './routes/commandRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ noServer: true });

const unrealClients = new Set<WebSocket>();
const websiteClients = new Set<WebSocket>();

app.use(cors());
app.use(express.json());

app.set('unrealClients', unrealClients);
app.set('websiteClients', websiteClients);
app.set('wss', wss);

app.use('/api', commandRoutes);

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    groqModel: config.groqModel,
    unrealConnected: unrealClients.size > 0,
    websiteClients: websiteClients.size
  });
});

app.use(errorHandler);

function sendToWebsites(message: unknown) {
  const serialized = JSON.stringify(message);
  for (const client of websiteClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(serialized);
    }
  }
}

function sendToUnreal(message: unknown) {
  const serialized = JSON.stringify(message);
  let sent = 0;
  for (const client of unrealClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(serialized);
      sent += 1;
    }
  }
  return sent;
}

wss.on('connection', (ws, request) => {
  const requestUrl = new URL(request.url ?? '/ws', 'http://localhost');
  const clientType = requestUrl.searchParams.get('client') === 'web' ? 'web' : 'unreal';

  if (clientType === 'web') {
    websiteClients.add(ws);
    console.log('Inhabit website connected via WebSocket');
    sendToWebsites({ type: 'unreal_status', connected: unrealClients.size > 0 });
  } else {
    unrealClients.add(ws);
    console.log('Unreal Engine connected via WebSocket');
    sendToWebsites({ type: 'unreal_status', connected: true });
  }

  ws.on('message', (data) => {
    let message: any;
    try {
      message = JSON.parse(data.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON message' }));
      return;
    }

    if (clientType === 'web') {
      if (message.type !== 'execute_command' || !message.command_id || !message.payload) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid command message' }));
        return;
      }

      const forwardedTo = sendToUnreal(message);
      if (forwardedTo === 0) {
        ws.send(JSON.stringify({
          type: 'command_status',
          command_id: message.command_id,
          status: 'disconnected',
          message: 'No Unreal Engine application is connected.'
        }));
      } else {
        ws.send(JSON.stringify({
          type: 'command_status',
          command_id: message.command_id,
          status: 'sent',
          forwardedTo
        }));
      }
      return;
    }

    if (message.type === 'acknowledgement' || message.type === 'execution_result') {
      console.log('Message from Unreal:', message.type, message.command_id, message.status);
      sendToWebsites(message);
    } else {
      console.log('Unrecognized Unreal message:', message.type);
    }
  });

  ws.on('close', () => {
    if (clientType === 'web') {
      websiteClients.delete(ws);
      console.log('Inhabit website disconnected');
    } else {
      unrealClients.delete(ws);
      console.log('Unreal Engine disconnected');
      sendToWebsites({ type: 'unreal_status', connected: unrealClients.size > 0 });
    }
  });

  ws.on('error', (error) => {
    console.error(`WebSocket error (${clientType}):`, error);
    unrealClients.delete(ws);
    websiteClients.delete(ws);
  });
});

httpServer.on('upgrade', (request, socket, head) => {
  const requestUrl = new URL(request.url ?? '/', 'http://localhost');
  if (requestUrl.pathname !== '/ws') {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

httpServer.listen(config.port, () => {
  console.log(`Inhabit API and WebSocket server running on port ${config.port}`);
});

export { app, httpServer, wss };
