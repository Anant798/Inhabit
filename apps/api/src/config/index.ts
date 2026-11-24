import dotenv from 'dotenv';
import path from 'node:path';

// Support both repository-root .env and apps/api/.env regardless of npm workspace cwd.
const cwd = process.cwd();
dotenv.config({ path: path.resolve(cwd, '.env') });
dotenv.config({ path: path.resolve(cwd, 'apps/api/.env'), override: false });
dotenv.config({ path: path.resolve(cwd, '../../.env'), override: false });

export const config = {
  port: process.env.PORT || 3001,
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'meta-llama/llama-3.1-8b-instruct',
};
