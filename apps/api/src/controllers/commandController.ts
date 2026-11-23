import { Request, Response, NextFunction } from 'express';
import Groq from 'groq-sdk';
import { config } from '../config';
import { commandSchema, CommandInterpretation } from '@inhabit/contracts';

const groqClient = new Groq({ apiKey: config.groqApiKey });

export const interpretCommand = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { transcript } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: 'Transcript is required' });
    }

    if (!config.groqApiKey) {
      return res.status(500).json({ error: 'Groq API key is not configured' });
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Command interpretation timed out after 10 seconds')), 10000);
    });

    const fetchPromise = groqClient.chat.completions.create({
      model: config.groqModel,
      messages: [
        {
          role: 'system',
          content: `You are an expert AI command interpreter for an interior design application controlled via voice commands.

Your job is to convert natural language transcripts into a structured JSON command that can be executed in a 3D interior design environment.

Supported actions:
- move_object: moving objects (parameters can include direction, distance, unit, target_object)
- rotate_object: rotating objects (parameters can include angle, unit, axis)
- scale_object: scaling objects (parameters can include scale_factor, axis)
- change_color: changing color (parameters can include color_name, hex)
- change_material: changing material (parameters can include material_name)
- delete_object: deleting objects
- select_object: selecting objects

Rules:
1. Return ONLY valid JSON matching the requested schema. No markdown wrapping, no explanatory text.
2. Status must be one of: "ready", "clarification_required", "unsupported".
3. If the command is ambiguous or missing key info (e.g. "move it"), set status to "clarification_required" and provide a helpful question in "clarification".
4. If the command asks for something outside the supported actions or impossible, set status to "unsupported".
5. Never fabricate object IDs if not provided in scene context. Set object.id to null if unknown.
6. Extract numerical values and units into parameters.
7. Preserve the user's original transcript.
8. Preserve the units spoken by the user.
9. If the request is unsupported, return "unsupported".
10. Do not execute any Unreal Engine actions.
11. Do not invent parameters the user did not specify.`
        },
        {
          role: 'user',
          content: `Transcript: "${req.body.transcript}"`
        }
      ],
      temperature: 0.3,
      max_tokens: 1000
    });

    const result = await Promise.race([fetchPromise, timeoutPromise]);

    if (!result.choices || result.choices.length === 0) {
      throw new Error('No response from Groq API');
    }

    const textContent = result.choices[0].message.content;
    if (!textContent) {
      throw new Error('No text returned from Groq API');
    }

    let rawJson = textContent.trim();
    if (rawJson.startsWith('```json')) {
      rawJson = rawJson.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (rawJson.startsWith('```')) {
      rawJson = rawJson.replace(/^```/, '').replace(/```$/, '').trim();
    }

    const parsedJson = JSON.parse(rawJson);
    const validated = commandSchema.parse(parsedJson);

    res.json(validated);
  } catch (error: any) {
    next(error);
  }
};