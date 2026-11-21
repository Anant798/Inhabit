import type { CommandInterpretation } from '@inhabit/contracts';

const DEFAULT_TIMEOUT = 15000; // 15 seconds

export class InterpreterService {
  static async interpret(transcript: string, sceneContext?: any): Promise<CommandInterpretation> {
    if (!transcript || transcript.trim().length === 0) {
      throw new Error('Transcript is empty');
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Command interpretation timed out after 15 seconds')), DEFAULT_TIMEOUT);
    });

    const fetchPromise = fetch('http://localhost:3001/api/interpret-command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, sceneContext })
    });

    const result = await Promise.race([fetchPromise, timeoutPromise]);

    if (!result.ok) {
      const errorData = await result.json().catch(() => ({}));
      throw new Error(errorData.error || `Backend returned ${result.status}`);
    }

    return await result.json();
  }
}
