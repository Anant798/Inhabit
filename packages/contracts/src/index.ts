import { z } from 'zod';

export interface Command {
  transcript: string;
  timestamp: number;
  status: 'pending' | 'success' | 'failure';
}

export const commandSchema = z.object({
  status: z.enum(['ready', 'clarification_required', 'unsupported']),
  action: z.enum([
    'move_object',
    'rotate_object',
    'scale_object',
    'change_color',
    'change_material',
    'delete_object',
    'select_object'
  ]).nullable(),
  object: z.object({
    name: z.string().nullable(),
    id: z.string().nullable()
  }),
  parameters: z.record(z.any()),
  clarification: z.string().nullable(),
  original_transcript: z.string()
});

export type CommandInterpretation = z.infer<typeof commandSchema>;
