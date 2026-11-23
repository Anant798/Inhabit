import Groq from 'groq-sdk';
import { config } from '../config/index.js';
import { commandSchema, type CommandInterpretation } from '@inhabit/contracts';

const groqClient = new Groq({ apiKey: config.groqApiKey || 'missing-api-key' });

const SYSTEM_PROMPT = `You interpret natural-language voice commands for an interior-design application.
Return only valid JSON with fields status, action, object, parameters, clarification, original_transcript.
status must be ready, clarification_required, or unsupported.
Supported actions: move_object, rotate_object, scale_object, change_color, change_material, delete_object, select_object.
Ask for clarification when essential details are ambiguous. Never invent object IDs, coordinates, or parameters. Preserve the user's transcript and units. Do not execute commands.`;

export const interpretCommand = async (transcript: string, _sceneContext?: unknown): Promise<CommandInterpretation> => {
  if (!config.groqApiKey) throw new Error('Groq API key is not configured');

  const completion = await groqClient.chat.completions.create({
    model: config.groqModel,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Transcript: ${JSON.stringify(transcript)}` }
    ],
    temperature: 0.2,
    max_tokens: 1000
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('Groq returned an empty response');

  const rawJson = content.trim().replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/, '');
  const parsed = JSON.parse(rawJson);
  return commandSchema.parse({ ...parsed, original_transcript: transcript });
};
