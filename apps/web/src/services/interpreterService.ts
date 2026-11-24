import type { CommandInterpretation } from '@inhabit/contracts';

const DEFAULT_TIMEOUT = 15000;

function getApiBase(): string {
  // On a phone, localhost means the phone itself. Use the host serving the web app.
  const hostname = window.location.hostname || 'localhost';
  return `http://${hostname}:3001`;
}

export class InterpreterService {
  static async interpret(transcript: string, sceneContext?: any): Promise<CommandInterpretation> {
    if (!transcript || transcript.trim().length === 0) {
      throw new Error('Transcript is empty');
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    try {
      const response = await fetch(`${getApiBase()}/api/interpret-command`, {
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
