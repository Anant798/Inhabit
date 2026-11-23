import { Router } from 'express';
import { interpretCommand } from '../controllers/commandController';

const router = Router();
router.post('/interpret-command', interpretCommand);
router.get('/health', (req, res) => {
  const clients = (req.app as any).get('unrealClients');
  res.json({ status: 'ok', timestamp: new Date().toISOString(), unrealConnected: clients?.size > 0 });
});
router.post('/forward-command', (req, res) => {
  const clients = (req.app as any).get('unrealClients');
  const { command_id, payload } = req.body;
  const message = JSON.stringify({ type: 'execute_command', command_id, payload });

  let sent = false;
  for (const client of clients || []) {
    if (client?.readyState === WebSocket.OPEN) {
      client.send(message);
      sent = true;
    }
  }

  if (sent) {
    res.json({ success: true, forwardedTo: clients?.size });
  } else {
    res.status(503).json({ success: false, error: 'No Unreal Engine client connected' });
  }
});
export default router;