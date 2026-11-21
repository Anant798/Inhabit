import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import { commandSchema } from '../src/types/commands';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const apiKey = process.env.ANTHROPIC_API_KEY;
const anthropic = new Anthropic({ apiKey: apiKey || 'dummy-key' });

const SYSTEM_PROMPT = `You are an expert AI command interpreter for an interior design application controlled via voice commands.
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
`;

app.post('/api/interpret-command', async (req, res) => {
  try {
    const { transcript, sceneContext } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: 'Transcript is required' });
    }

    if (!apiKey) {
      // Fallback mock interpretation if API key is missing so the app remains fully testable offline
      const mockResult = {
        status: 'ready',
        action: 'move_object',
        object: { name: transcript.toLowerCase().includes('sofa') ? 'sofa' : 'object', id: null },
        parameters: { direction: 'left', distance: 50, unit: 'cm' },
        clarification: null,
        original_transcript: transcript
      };
      const parsed = commandSchema.parse(mockResult);
      return res.json(parsed);
    }

    const userPrompt = `Scene Context: ${JSON.stringify(sceneContext || { objects: [] })}
Transcript: "${transcript}"

Return the JSON command.`;

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || !('text' in textContent)) {
      throw new Error('No text returned from LLM');
    }

    // Clean up markdown block if present
    let rawJson = textContent.text.trim();
    if (rawJson.startsWith('```json')) {
      rawJson = rawJson.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (rawJson.startsWith('```')) {
      rawJson = rawJson.replace(/^```/, '').replace(/```$/, '').trim();
    }

    const parsedJson = JSON.parse(rawJson);
    const validated = commandSchema.parse(parsedJson);

    res.json(validated);
  } catch (error: any) {
    console.error('Command interpretation error:', error);
    res.status(500).json({ error: error.message || 'Failed to interpret command' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend API running on port ${PORT}`);
});
