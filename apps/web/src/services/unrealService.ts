import type { CommandInterpretation } from '@inhabit/contracts';

export class UnrealService {
  private onDisplayCommandCallback?: (command: CommandInterpretation) => void;

  setOnDisplayCommand(callback: (command: CommandInterpretation) => void) {
    this.onDisplayCommandCallback = callback;
  }

  queueCommand(command: CommandInterpretation) {
    const commandId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const message = JSON.stringify({
      type: 'display_command',
      command_id: commandId,
      transcript: command.original_transcript,
      action: command.action,
      object: {
        name: command.object?.name ?? null,
        id: command.object?.id ?? null
      },
      parameters: command.parameters,
      clarification: command.clarification,
      timestamp: new Date().toISOString()
    });

    // Send directly via WebSocket to backend
    const ws = (window as any).inhabitWs;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(message);
      console.log('Sent display_command to backend:', command.action);
    }

    return commandId;
  }

  setWs(ws: WebSocket | null) {
    // Store ws reference for queueCommand to use
    (ws as any)?.removeEventListener('message', this.handleMessage);
  }

  setOnMessage(callback: (message: any) => void) {
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data.toString());
        if (data.type === 'display_command' && this.onDisplayCommandCallback) {
          const command: CommandInterpretation = {
            status: 'ready',
            action: data.action || null,
            object: {
              name: data.object?.name ?? null,
              id: data.object?.id ?? null
            },
            parameters: data.parameters || {},
            clarification: data.clarification ?? null,
            original_transcript: data.transcript || ''
          };
          this.onDisplayCommandCallback(data.command_id, command);
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    if (this.ws) {
      this.ws.removeEventListener('message', handleMessage);
    }
    this.ws = (ws instanceof WebSocket ? ws : null);
    if (this.ws) {
      this.ws.addEventListener('message', handleMessage);
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  disconnect() {
    if (this.ws) {
      this.ws.removeEventListener('message', this.handleMessage);
      this.ws.close();
      this.ws = null;
    }
  }
}

export const unrealService = new UnrealService();