export interface Command {
  transcript: string;
  timestamp: number;
  status: 'pending' | 'success' | 'failure';
}

export interface CommandInterpretation {
  status: 'ready' | 'clarification_required' | 'unsupported';
  action: 'move_object' | 'rotate_object' | 'scale_object' | 'change_color' | 'change_material' | 'delete_object' | 'select_object' | null;
  object: {
    name: string | null;
    id: string | null;
  };
  parameters: Record<string, any>;
  clarification: string | null;
  original_transcript: string;
}