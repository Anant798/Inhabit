import { Router } from 'express';
import { handleInterpretCommand } from '../controllers/commandController';

const router = Router();
router.post('/interpret-command', handleInterpretCommand);

export default router;
