import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import commandRoutes from './routes/commandRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api', commandRoutes);

// WebSocket server for browser client connections (phone or laptop)
const wss = new (import('ws').WebSocketServer)({ noServer: true, perMessageDeflate: false });

// Track connected browser clients
const browserClients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  console.log('Browser client connected via WebSocket');
  browserClients.add(ws);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      // Handle display_command messages - broadcast to all other browser clients
      if (message.type === 'display_command') {
        // Broadcast to all connected browser clients except sender
        for (const client of browserClients) {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
          }
        }
      }
    } catch (e) {
      console.error('Failed to parse browser message:', e);
    }
  });

  ws.on('close', () => {
    console.log('Browser client disconnected via WebSocket');
    browserClients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error with browser client:', error);
    browserClients.delete(ws);
  });
};

// Attach WebSocket server to HTTP server
let httpServer: any;
try {
  httpServer = app.listen(config.port, '0.0.0.0', () => {
    console.log(`Backend API running on port ${config.port}`);
  });
} catch (e) {
  httpServer = app.listen(config.port, () => {
    console.log(`Backend API running on port ${config.port}`);
  });
}

// @ts-expect-error - WebSocket attach pattern
app.ws = (req, socket, head) => {
  wss.handleConnection(req, socket, head);
};

// Make shared state available to routes
app.set('browserClients', browserClients);

app.get('/health', (req: express.Request, res: express.Response) => {
  res.json({ status: 'ok', groqModel: config.groqModel, browserConnected: browserClients.size > 0 });
});

// Function to broadcast display_command to all connected browser clients
function broadcastDisplayCommand(message: { type: string; command_id: string; transcript: string; action: string; object: { name: string | null; id: string | null; }; parameters: any; timestamp: number }) {
  const messageStr = JSON.stringify(message);
  let sent = false;
  for (const client of browserClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
      sent = true;
    }
  }
  return sent;
}

export default app;