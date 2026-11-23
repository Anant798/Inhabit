import { Router } from 'express';
import { interpretCommand } from '../controllers/commandController.js';

const router = Router();

router.post('/interpret-command', interpretCommand);

router.get('/health', (req, res) => {
  const browserClients = req.app.get('browserClients') as Set<any> | undefined;
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    browserConnected: Boolean(browserClients?.size)
  });
});

router.post('/broadcast-command', (req, res) => {
  const browserClients = req.app.get('browserClients') as Set<any> | undefined;
  const { command_id, transcript, action, object, parameters } = req.body ?? {};

  if (!command_id || !transcript) {
    return res.status(400).json({ success: false, error: 'command_id and transcript are required' });
  }

  const message = JSON.stringify({
    type: 'display_command',
    command_id,
    transcript,
    action,
    object,
    parameters,
    timestamp: new Date().toISOString()
  });

  let sent = 0;
  for (const client of browserClients ?? []) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
      sent += 1;
    }
  }

  if (sent > 0) {
    return res.json({ success: true, sentTo: sent });
  }

  return res.status(503).json({ success: false, error: 'No browser clients connected' });
});

export default router;