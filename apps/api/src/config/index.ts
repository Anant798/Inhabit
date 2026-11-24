import dotenv from 'dotenv';
import path from 'node:path';

// Support both repository-root .env and apps/api/.env regardless of npm workspace cwd.
const cwd = process.cwd();
dotenv.config({ path: path.resolve(cwd, '.env') });
dotenv.config({ path: path.resolve(cwd, 'apps/api/.env'), override: false });
dotenv.config({ path: path.resolve(cwd, '../../.env'), override: false });

const configuredModel = process.env.GROQ_MODEL?.trim();
const deprecatedModelIds = new Set([
  'meta-llama/llama-3.1-8b-instruct',
  'llama-3.1-8b-instruct',
  'llama-3.1-8b-instant',
  'meta-llama/llama-3.1-8b-instant'
]);

// Groq retired Llama 3.1 8B for developer/free accounts. Keep old local .env
// values from breaking startup by migrating them to Groq's recommended model.
const groqModel = !configuredModel || deprecatedModelIds.has(configuredModel)
  ? 'openai/gpt-oss-20b'
  : configuredModel;

export const config = {
  port: process.env.PORT || 3001,
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel,
};
