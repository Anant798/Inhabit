import type { CommandInterpretation } from '@inhabit/contracts';

const DEFAULT_TIMEOUT = 15000;

export class InterpreterService {
  static async interpret(transcript: string, sceneContext?: any): Promise<CommandInterpretation> {
    if (!transcript || transcript.trim().length === 0) {
      throw new Error('Transcript is empty');
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    try {
      // Same-origin request: Vite proxies /api to the local laptop API.
      const response = await fetch('/api/interpret-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, sceneContext }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Backend returned ${response.status}`);
      }

      return await response.json() as CommandInterpretation;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Command interpretation timed out after 15 seconds');
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }
}
