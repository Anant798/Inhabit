import dotenv from 'dotenv';
import path from 'node:path';

// Support both repository-root .env and apps/api/.env regardless of npm workspace cwd.
const cwd = process.cwd();
dotenv.config({ path: path.resolve(cwd, '.env') });
dotenv.config({ path: path.resolve(cwd, 'apps/api/.env'), override: false });
dotenv.config({ path: path.resolve(cwd, '../../.env'), override: false });

// llama-3.1-8b-instant was retired by Groq on 2026-08-16.
// Automatically migrate older local .env settings to Groq's recommended replacement.
const configuredModel = process.env.GROQ_MODEL?.trim();
const deprecatedModels = new Set([
  'meta-llama/llama-3.1-8b-instruct',
  'llama-3.1-8b-instant'
]);
const groqModel = configuredModel && !deprecatedModels.has(configuredModel)
  ? configuredModel
  : 'openai/gpt-oss-20b';

export const config = {
  port: process.env.PORT || 3001,
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel,
};
