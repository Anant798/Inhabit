import { Router } from 'express';
import { interpretCommand } from '../controllers/commandController';

const router = Router();
router.post('/interpret-command', interpretCommand);
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
export default router;