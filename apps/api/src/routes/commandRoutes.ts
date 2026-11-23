import { Router } from 'express';
import WebSocket from 'ws';
import { interpretCommand } from '../controllers/commandController.js';

const router = Router();

router.post('/interpret-command', interpretCommand);

router.get('/health', (req, res) => {
  const clients = req.app.get('unrealClients') as Set<WebSocket> | undefined;
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    unrealConnected: Boolean(clients?.size)
  });
});

router.post('/forward-command', (req, res) => {
  const clients = req.app.get('unrealClients') as Set<WebSocket> | undefined;
  const { command_id, payload } = req.body ?? {};

  if (!command_id || !payload) {
    return res.status(400).json({ success: false, error: 'command_id and payload are required' });
  }

  const message = JSON.stringify({ type: 'execute_command', command_id, payload });
  let forwardedTo = 0;

  for (const client of clients ?? []) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
      forwardedTo += 1;
    }
  }

  if (forwardedTo > 0) {
    return res.json({ success: true, forwardedTo });
  }

  return res.status(503).json({ success: false, error: 'No Unreal Engine client connected' });
});

export default router;
