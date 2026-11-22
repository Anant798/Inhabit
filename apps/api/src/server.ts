import express from 'express';
import cors from 'cors';
import { config } from './config';
import commandRoutes from './routes/commandRoutes';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api', commandRoutes);

app.use(errorHandler);

app.get('/health', (req: express.Request, res: express.Response) => {
  res.json({ status: 'ok', groqModel: config.groqModel });
});

app.listen(config.port, () => {
  console.log(`Backend API running on port ${config.port}`);
});

export default app;