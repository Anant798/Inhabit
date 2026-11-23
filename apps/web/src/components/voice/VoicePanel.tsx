import React from 'react';
import { Mic, Loader2, Loader3, AlertCircle, CheckCircle, Disconnect } from 'lucide-react';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { InterpreterService } from '../../services/interpreterService';
import { unrealService, type CommandInterpretation } from '../../services/unrealService';
import type { CommandInterpretation as CommandInterpretationType } from '@inhabit/contracts';

const VoicePanel = () => {
  const { isListening, transcript, error, start, stop, clear: clearTranscript, canStart } = useSpeechRecognition();
  const [isInterpreting, setIsInterpreting] = React.useState(false);
  const [command, setCommand] = React.useState<CommandInterpretationType | null>(null);
  const [executionStatus, setExecutionStatus] = React.useState<'pending' | 'executing' | 'success' | 'failure' | 'disconnected'>('pending');
  const [lastCommandId, setLastCommandId] = React.useState<string | null>(null);

  // Prevent duplicate interpretation submissions
  const lastTranscriptHash = React.useRef<string>('');

  const interpretCommand = async (finalTranscript: string) => {
    // Prevent duplicate submissions
    const transcriptHash = finalTranscript.trim().toLowerCase();
    if (lastTranscriptHash.current === transcriptHash) {
      console.log('Duplicate transcript ignored');
      return;
    }
    lastTranscriptHash.current = transcriptHash;

    setIsInterpreting(true);
    setExecutionStatus('pending');
    try {
      const result = await InterpreterService.interpret(finalTranscript);
      setCommand(result);

      if (result.status === 'ready') {
        // Generate a unique command ID for tracking
        const commandId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        // Queue command for Unreal Engine transmission
        unrealService.queueCommand(result);
        // Store the ID for matching execution results
        setLastCommandId(commandId);
        setExecutionStatus('executing');
      } else if (result.status === 'clarification_required') {
        setExecutionStatus('pending');
        // Don't send to Unreal
      } else if (result.status === 'unsupported') {
        setExecutionStatus('pending');
        // Don't send to Unreal
      }
    } catch (err: any) {
      console.error('Interpretation error:', err);
      setCommand({
        status: 'unsupported',
        action: null,
        object: { name: null, id: null },
        parameters: {},
        clarification: err.message,
        original_transcript: finalTranscript
      });
      setExecutionStatus('pending');
    } finally {
      setIsInterpreting(false);
      // Clear the duplicate hash after a brief delay to allow new commands
      setTimeout(() => {
        lastTranscriptHash.current = '';
      }, 3000);
    }
  };

  const handleMicClick = () => {
    if (isListening) {
      // User wants to stop listening - interpret the transcript first
      stop();
      if (transcript.trim()) {
        interpretCommand(transcript);
      }
      clearTranscript();
    } else if (isInterpreting) {
      // Cancel during AI interpretation
      setIsInterpreting(false);
      setTimeout(() => {
        lastTranscriptHash.current = '';
      }, 0);
    } else {
      // Start voice recognition
      start();
    }
  };

  // Handle Unreal execution result updates
  React.useEffect(() => {
    unrealService.setOnExecutionResult((commandId, result) => {
      if (lastCommandId && lastCommandId === String(commandId)) {
        if (result.status === 'success') {
          setExecutionStatus('success');
        } else {
          setExecutionStatus('failure');
        }
      }
    });

    // Also listen to unrealService connection state
    const updateConnectionStatus = () => {
      if (unrealService.isConnectedToUnreal()) {
        setExecutionStatus(prev => prev === 'disconnected' ? 'pending' : prev);
      } else {
        setExecutionStatus('disconnected');
      }
    };

    updateConnectionStatus();

    // Poll for status updates, or we could use a more sophisticated approach
    const interval = setInterval(updateConnectionStatus, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [lastCommandId]);

  const buttonClasses = isListening
    ? 'w-full flex items-center justify-center gap-3 py-4 rounded-lg text-white font-medium transition ease-in-out duration-200 transform:hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 animate-pulse'
    : isInterpreting
      ? 'w-full flex items-center justify-center gap-3 py-4 rounded-lg text-white font-medium transition ease-in-out duration-200 transform hover:bg-charcoal focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2'
      : canStart
        ? 'w-full flex items-center justify-center gap-3 py-4 rounded-lg text-white font-medium transition ease-in-out duration-200 transform:hover:bg-charcoal focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2'
        : 'w-full flex items-center justify-center gap-3 py-4 rounded-lg text-gray-400 cursor-not-allowed';

  const buttonLabel = isListening
    ? 'Listening...'
    : isInterpreting
      ? 'Understanding...'
      : 'Start Voice';

  const buttonIcon = isListening
    ? <Mic size={28} className="animate-pulse" />
    : isInterpreting
      ? <Loader2 size={20} className="mr-2 animate-spin" />
      : <Mic size={28} />;

  const statusClasses = {
    pending: 'text-gray-500 text-sm mb-1',
    executing: 'text-orange-600 text-sm mb-1',
    success: 'text-green-600 text-sm mb-1',
    failure: 'text-red-600 text-sm mb-1',
    disconnected: 'text-red-500 text-sm mb-1',
  };

  return (
    <div className="w-80 bg-white border-l border-gray-200 p-6 flex flex-col gap-6">
      <h3 className="font-semibold text-lg">Voice Commands</h3>

      <button
        onClick={handleMicClick}
        className={buttonClasses}
        disabled={isInterpreting}
        aria-label={isListening ? 'Stop Listening' : 'Start Voice'}
      >
        {buttonIcon}
        <span>{buttonLabel}</span>
      </button>

      <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 min-h-[100px]">
        <p className="text-sm text-gray-500 mb-2">Transcript:</p>
        <p className="text-sm break-all">{transcript || '...'}</p>

        {error && (
          <div className="mt-3 p-3 bg-red-50 rounded border border-red-200 text-xs text-red-700 mb-3">
            <p>Error:</p>
            <p>{error}</p>
          </div>
        )}

        {command && command.status === 'unsupported' && (
          <div className="mt-3 p-3 bg-red-50 rounded border border-red-200 text-xs text-red-700">
            <p>Unsupported:</p>
            <p>{command.clarification || 'This command cannot be processed'}</p>
          </div>
        )}

        {command && command.status === 'clarification_required' && (
          <div className="mt-3 p-3 bg-amber-50 rounded border border-amber-200 text-xs text-amber-700">
            <p>Clarification:</p>
            <p>{command.clarification || 'Please provide more details'}</p>
          </div>
        )}

        {command && command.status === 'ready' && (
          <div className="mt-3 p-3 bg-green-50 rounded border border-green-200 text-xs text-green-700">
            <p>Command Ready:</p>
            <p>
              {command.action}: {command.object?.name || 'object'} -
              {JSON.stringify(command.parameters)}
            </p>
            <p className="text-xs text-gray-400 mt-1">Status: {executionStatus}</p>
          </div>
        )}

        {/* Unreal Engine execution status */}
        {executionStatus && (
          <div className="mt-3 p-3 rounded-lg border" style={executionStatus === 'success' ? { borderColor: 'green-200', backgroundColor: 'green-50' } : executionStatus === 'failure' ? { borderColor: 'red-200', backgroundColor: 'red-50' } : executionStatus === 'executing' ? { borderColor: 'orange-200', backgroundColor: 'orange-50' } : { borderColor: 'gray-200', backgroundColor: 'gray-50' }}>
            <p className="text-xs font-medium {executionStatus === 'success' ? 'text-green-600' : executionStatus === 'failure' ? 'text-red-600' : executionStatus === 'executing' ? 'text-orange-500' : 'text-gray-500'}">
              {executionStatus}
            </p>
          </div>
        )}

        {command && (command.status === 'unsupported' || command.status === 'clarification_required') && (
          <button
            onClick={() => setCommand(null)}
            className="mt-3 text-xs text-blue-600 hover:underline"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
};

export default VoicePanel;