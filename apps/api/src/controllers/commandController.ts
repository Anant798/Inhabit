import type { Request, Response, NextFunction } from 'express';
import Groq from 'groq-sdk';
import { config } from '../config/index.js';
import { commandSchema } from '@inhabit/contracts';

const groqClient = new Groq({ apiKey: config.groqApiKey });

export const interpretCommand = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const transcript = typeof req.body?.transcript === 'string' ? req.body.transcript.trim() : '';

    if (!transcript) {
      return res.status(400).json({ error: 'Transcript is required' });
    }

    if (!config.groqApiKey) {
      return res.status(503).json({ error: 'Groq API key is not configured' });
    }

    const completion = await groqClient.chat.completions.create({
      model: config.groqModel,
      messages: [
        {
          role: 'system',
          content: `You interpret natural-language voice commands for an interior-design application.
Return only one valid JSON object with these fields:
{
  "status": "ready" | "clarification_required" | "unsupported",
  "action": "move_object" | "rotate_object" | "scale_object" | "change_color" | "change_material" | "delete_object" | "select_object" | null,
  "object": { "name": string | null, "id": string | null },
  "parameters": {},
  "clarification": string | null,
  "original_transcript": string
}
Only use the supported actions listed. If the target or essential details are ambiguous, use clarification_required and ask one clear question. For unsupported requests, use unsupported. Never invent object IDs, coordinates, or parameters the user did not state. Preserve the original transcript and the user's units. Do not execute commands.`
        },
        { role: 'user', content: `Transcript: ${JSON.stringify(transcript)}` }
      ],
      temperature: 0.2,
      max_tokens: 1000
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Groq returned an empty response');
    }

    const rawJson = content.trim().replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/, '');
    const parsed = JSON.parse(rawJson);
    const validated = commandSchema.parse({
      ...parsed,
      original_transcript: transcript
    });

    return res.json(validated);
  } catch (error) {
    return next(error);
  }
};
