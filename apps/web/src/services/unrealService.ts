import type { CommandInterpretation } from '@inhabit/contracts';

const WS_URL = 'ws://localhost:3001/ws';

export class UnrealService {
  private ws: WebSocket | null = null;
  private commandQueue: Array<{command: CommandInterpretation, id: string}> = [];
  private isConnected = false;
  private onExecutionResult?: (commandId: string, result: any) => void;

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      console.log('Connected to WebSocket server');
      this.isConnected = true;
      // Process queued commands
      this.processQueue();
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data.toString());
        this.handleMessage(message);
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket connection closed');
      this.isConnected = false;
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  private handleMessage(message: any) {
    switch (message.type) {
      case 'execution_result':
        if (this.onExecutionResult) {
          this.onExecutionResult(message.command_id, message);
        }
        console.log('Execution result from Unreal:', message.status, message.message);
        break;
      case 'acknowledgement':
        console.log('Acknowledgement from Unreal:', message.status);
        break;
      default:
        console.log('Unknown message type from Unreal:', message.type);
    }
  }

  private processQueue() {
    while (this.commandQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const {command, id} = this.commandQueue.shift()!;
      if (command && this.ws?.readyState === WebSocket.OPEN) {
        const message = JSON.stringify({
          type: 'execute_command',
          command_id: id,
          payload: this.commandToPayload(command)
        });
        this.ws.send(message);
        console.log('Forwarded command to Unreal Engine:', command.action);
      }
    }
  }

  private commandToPayload(command: CommandInterpretation) {
    return {
      status: command.status,
      action: command.action,
      object: {
        name: command.object?.name ?? null,
        id: command.object?.id ?? null
      },
      parameters: command.parameters,
      clarification: command.clarification,
      original_transcript: command.original_transcript
    };
  }

  queueCommand(command: CommandInterpretation) {
    const id = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    this.commandQueue.push({command, id});
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.processQueue();
    }
  }

  setOnExecutionResult(callback: (commandId: string, result: any) => void) {
    this.onExecutionResult = callback;
  }

  isConnectedToUnreal(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.commandQueue = [];
  }
}

export const unrealService = new UnrealService();