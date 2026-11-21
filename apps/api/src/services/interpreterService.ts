import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { commandSchema, CommandInterpretation } from '@inhabit/contracts';

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey || 'dummy-key' });

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

export const interpretCommand = async (transcript: string, sceneContext: any): Promise<CommandInterpretation> => {
  if (!config.anthropicApiKey) {
    const mockResult = {
      status: 'ready',
      action: 'move_object',
      object: { name: transcript.toLowerCase().includes('sofa') ? 'sofa' : 'object', id: null },
      parameters: { direction: 'left', distance: 50, unit: 'cm' },
      clarification: null,
      original_transcript: transcript
    };
    return commandSchema.parse(mockResult);
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

  let rawJson = textContent.text.trim();
  if (rawJson.startsWith('```json')) {
    rawJson = rawJson.replace(/^```json/, '').replace(/```$/, '').trim();
  } else if (rawJson.startsWith('```')) {
    rawJson = rawJson.replace(/^```/, '').replace(/```$/, '').trim();
  }

  const parsedJson = JSON.parse(rawJson);
  return commandSchema.parse(parsedJson);
};
