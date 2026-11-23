import type { CommandInterpretation } from '@inhabit/contracts';

const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:3001/ws?client=web`;

type ServiceMessage = {
  type: string;
  command_id?: string;
  status?: string;
  connected?: boolean;
  message?: string;
  [key: string]: unknown;
};

type PendingCommand = { command: CommandInterpretation; id: string };

export class UnrealService {
  private ws: WebSocket | null = null;
  private commandQueue: PendingCommand[] = [];
  private reconnectTimer: number | null = null;
  private shouldReconnect = true;
  private onMessage?: (message: ServiceMessage) => void;
  private onConnectionChange?: (connected: boolean) => void;

  connect() {
    this.shouldReconnect = true;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      console.log('Website connected to Inhabit backend WebSocket');
      this.onConnectionChange?.(true);
      this.processQueue();
    };

    this.ws.onmessage = (event) => {
      try {
        this.onMessage?.(JSON.parse(String(event.data)) as ServiceMessage);
      } catch (error) {
        console.error('Invalid WebSocket message:', error);
      }
    };

    this.ws.onclose = () => {
      this.onConnectionChange?.(false);
      if (this.shouldReconnect && this.reconnectTimer === null) {
        this.reconnectTimer = window.setTimeout(() => {
          this.reconnectTimer = null;
          this.connect();
        }, 2000);
      }
    };

    this.ws.onerror = (error) => {
      console.error('Inhabit WebSocket error:', error);
    };
  }

  private processQueue() {
    while (this.commandQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const item = this.commandQueue.shift()!;
      this.send(item);
    }
  }

  private send(item: PendingCommand) {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      this.commandQueue.unshift(item);
      return;
    }

    this.ws.send(JSON.stringify({
      type: 'execute_command',
      command_id: item.id,
      payload: item.command
    }));
  }

  queueCommand(command: CommandInterpretation): string {
    const id = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const item = { command, id };
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send(item);
    } else {
      this.commandQueue.push(item);
      this.connect();
    }
    return id;
  }

  setOnMessage(callback: (message: ServiceMessage) => void) {
    this.onMessage = callback;
  }

  setOnConnectionChange(callback: (connected: boolean) => void) {
    this.onConnectionChange = callback;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.commandQueue = [];
  }
}

export const unrealService = new UnrealService();
