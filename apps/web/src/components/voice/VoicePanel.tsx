import React from 'react';
import { Mic, Loader2 } from 'lucide-react';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { InterpreterService } from '../../services/interpreterService';
import type { CommandInterpretation } from '../../types/commands';

const VoicePanel = () => {
  const { isListening, transcript, error, start, stop, clear: clearTranscript, canStart } = useSpeechRecognition();

  const [isInterpreting, setIsInterpreting] = React.useState(false);
  const [command, setCommand] = React.useState<CommandInterpretation | null>(null);

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
    try {
      const result = await InterpreterService.interpret(finalTranscript);
      setCommand(result);
    } catch (err: any) {
      console.error('Interpretation error:', err);
      // Set command to show error state
      setCommand({
        status: 'unsupported',
        action: null,
        object: { name: null, id: null },
        parameters: {},
        clarification: err.message,
        original_transcript: finalTranscript
      });
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

  const buttonClasses = isListening
    ? 'w-full flex items-center justify-center gap-3 py-4 rounded-lg text-white font-medium transition ease-in-out duration-200 transform hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 animate-pulse'
    : canStart
      ? 'w-full flex items-center justify-center gap-3 py-4 rounded-lg text-white font-medium transition ease-in-out duration-200 transform hover:bg-charcoal focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2'
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