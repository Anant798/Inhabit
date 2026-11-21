import { Request, Response, NextFunction } from 'express';
import { interpretCommand } from '../services/interpreterService';

export const handleInterpretCommand = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { transcript, sceneContext } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: 'Transcript is required' });
    }

    const result = await interpretCommand(transcript, sceneContext);
    res.json(result);
  } catch (error: any) {
    next(error);
  }
};
