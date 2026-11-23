import express from 'express';
import cors from 'cors';
import { config } from './config';
import commandRoutes from './routes/commandRoutes';
import { errorHandler } from './middleware/errorHandler';
import WebSocket from 'ws';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api', commandRoutes);

// WebSocket server for Unreal Engine connection
const wss = new WebSocket.Server({ noServer: true });

// Track connected Unreal applications
const unrealClients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  console.log('Unreal Engine connected via WebSocket');
  unrealClients.add(ws);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      // Handle acknowledgements and execution results from Unreal
      if (message.type === 'execution_result') {
        console.log('Execution result from Unreal:', message.status, message.message);
        // Forward execution result to website
        forwardExecutionResultToWebsite(message.command_id, message);
      }
    } catch (e) {
      console.error('Failed to parse Unreal message:', e);
    }
  });

  ws.on('close', () => {
    console.log('Unreal Engine disconnected via WebSocket');
    unrealClients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error with Unreal:', error);
    unrealClients.delete(ws);
  });
});

// Attach WebSocket server to HTTP server
let httpServer: any = app.listen(config.port, () => {
  console.log(`Backend API running on port ${config.port}`);
});

// @ts-expect-error - WebSocket attach pattern
app.ws = (req, socket, head) => {
  wss.handleConnection(req, socket, head);
};

// Make shared state available to routes
app.set('unrealClients', unrealClients);
app.set('wss', wss);
app.set('forwardExecutionResultToWebsite', forwardExecutionResultToWebsite);

app.get('/health', (req: express.Request, res: express.Response) => {
  const clients = app.get('unrealClients');
  res.json({ status: 'ok', groqModel: config.groqModel, unrealConnected: clients.size > 0 });
});

// Function to forward command to Unreal Engine
app.post('/api/forward-command', (req: express.Request, res: express.Response) => {
  const clients = app.get('unrealClients');
  const { command_id, payload } = req.body;
  const message = JSON.stringify({ type: 'execute_command', command_id, payload });

  let sent = false;
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
      sent = true;
    }
  }

  if (sent) {
    res.json({ success: true, forwardedTo: clients.size });
  } else {
    res.status(503).json({ success: false, error: 'No Unreal Engine client connected' });
  }
});

// Function to forward execution results to website
function forwardExecutionResultToWebsite(commandId: string, result: any) {
  console.log(`Execution result for ${commandId}:`, result);
  // Website frontend would poll or receive via its own WebSocket connection
  // The backend logs the result; the frontend can check command status
}

export default app;