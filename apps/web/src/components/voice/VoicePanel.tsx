import React from 'react';
import { Mic, Loader2 } from 'lucide-react';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { InterpreterService } from '../../services/interpreterService';
import { unrealService } from '../../services/unrealService';
import type { CommandInterpretation } from '@inhabit/contracts';

type ExecutionStatus = 'pending' | 'sent' | 'success' | 'failure' | 'disconnected';

const VoicePanel = () => {
  const { isListening, transcript, error, start, stop, clear: clearTranscript, canStart } = useSpeechRecognition();
  const [isInterpreting, setIsInterpreting] = React.useState(false);
  const [command, setCommand] = React.useState<CommandInterpretation | null>(null);
  const [executionStatus, setExecutionStatus] = React.useState<ExecutionStatus>('disconnected');
  const [lastCommandId, setLastCommandId] = React.useState<string | null>(null);
  const lastTranscriptHash = React.useRef('');

  // Get API/WebSocket hostname from current location (laptop/phone IP on Wi-Fi)
  const hostname = window.location.hostname || 'localhost';
  const apiBase = `http://${hostname}:3001`;
  const wsUrl = `ws://${hostname}:3001/ws?client=web`;

  React.useEffect(() => {
    // Initialize WebSocket connection to backend
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('Website connected to backend WebSocket via', wsUrl);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data.toString());
        // Handle display_command messages broadcast from backend
        if (message.type === 'display_command' && unrealService.onDisplayCommandCallback) {
          const command: CommandInterpretation = {
            status: 'ready',
            action: message.action || null,
            object: {
              name: message.object?.name ?? null,
              id: message.object?.id ?? null
            },
            parameters: message.parameters || {},
            clarification: message.clarification ?? null,
            original_transcript: message.transcript || ''
          };
          unrealService.onDisplayCommandCallback(message.command_id, command);
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket connection closed');
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    // Store callback reference and register for display commands
    const handleDisplayCommand = (commandId: string, command: CommandInterpretation) => {
      if (lastCommandId && lastCommandId === commandId) {
        setCommand(command);
        setExecutionStatus('sent');
      }
    };

    unrealService.setOnDisplayCommand(handleDisplayCommand);

    // Cleanup on unmount
    return () => {
      unrealService.setOnDisplayCommand(undefined);
      ws.close();
    };
  }, []);

  const interpretCommand = async (finalTranscript: string) => {
    const cleanTranscript = finalTranscript.trim();
    const transcriptHash = cleanTranscript.toLowerCase();
    if (!cleanTranscript || lastTranscriptHash.current === transcriptHash) return;

    lastTranscriptHash.current = transcriptHash;
    setIsInterpreting(true);
    setCommand(null);
    setExecutionStatus('pending');

    try {
      const result = await InterpreterService.interpret(cleanTranscript);
      setCommand(result);

      if (result.status === 'ready') {
        const commandId = unrealService.queueCommand(result);
        setLastCommandId(commandId);
        setExecutionStatus(unrealService.isConnected() ? 'sent' : 'disconnected');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Command interpretation failed';
      setCommand({
        status: 'unsupported',
        action: null,
        object: { name: null, id: null },
        parameters: {},
        clarification: message,
        original_transcript: cleanTranscript
      });
      setExecutionStatus('pending');
    } finally {
      setIsInterpreting(false);
      window.setTimeout(() => {
        lastTranscriptHash.current = '';
      }, 1500);
    }
  };

  const handleMicClick = () => {
    if (isListening) {
      const finalTranscript = transcript;
      stop();
      if (finalTranscript.trim()) void interpretCommand(finalTranscript);
      clearTranscript();
    } else if (!isInterpreting && canStart) {
      start();
    }
  };

  const buttonLabel = isListening ? 'Listening...' : isInterpreting ? 'Understanding...' : 'Start Voice';

  return (
    <aside className="w-80 bg-white border-l border-gray-200 p-6 flex flex-col gap-6">
      <h3 className="font-semibold text-lg">Voice Commands</h3>
      <button
        onClick={handleMicClick}
        className={`w-full flex items-center justify-center gap-3 py-4 rounded-lg text-white font-medium transition-colors ${isListening ? 'bg-red-600 animate-pulse' : 'bg-charcoal hover:bg-gray-700'}`}
        disabled={isInterpreting || (!canStart && !isListening)}
        aria-label={isListening ? 'Stop listening' : 'Start voice'}
      >
        {isInterpreting ? <Loader2 size={20} className="animate-spin" /> : <Mic size={28} />}
        <span>{buttonLabel}</span>
      </button>

      <section className="bg-gray-50 p-4 rounded-lg border border-gray-100 min-h-[100px]">
        <p className="text-sm text-gray-500 mb-2">Transcript:</p>
        <p className="text-sm break-words">{transcript || command?.original_transcript || 'Speak a command to begin...'}</p>

        {error && (
          <div className="mt-3 p-3 bg-red-50 rounded border border-red-200 text-xs text-red-700">
            <p className="font-semibold">Microphone error</p>
            <p>{error}</p>
          </div>
        )}

        {command && (
          <div className={`mt-3 p-3 rounded border text-xs ${command.status === 'ready' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
            <p className="font-semibold">{command.status === 'ready' ? 'Generated command' : command.status === 'clarification_required' ? 'Clarification needed' : 'Unsupported command'}</p>
            {command.action && <p className="mt-1">Action: {command.action}</p>}
            {command.object?.name && <p>Object: {command.object.name}</p>}
            <p className="mt-1 break-words">Parameters: {JSON.stringify(command.parameters)}</p>
            {command.clarification && <p className="mt-2">{command.clarification}</p>}
          </div>
        )}

        <div className="mt-3 p-3 rounded-lg border border-gray-200 bg-white">
          <p className="text-xs font-medium text-gray-500">Transmission status</p>
          <p className="text-sm font-semibold capitalize">{executionStatus.replace('_', ' ')}</p>
        </div>
      </section>
    </aside>
  );
};

export default VoicePanel;