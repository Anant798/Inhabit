import React from 'react';
import { Mic, Loader2, Square, Download, Send, Type } from 'lucide-react';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { InterpreterService } from '../../services/interpreterService';
import { unrealService } from '../../services/unrealService';
import type { CommandInterpretation } from '@inhabit/contracts';

type ExecutionStatus = 'pending' | 'sent' | 'success' | 'failure' | 'disconnected';

const VoicePanel = () => {
  const { isListening, transcript, error, start, stop, clear: clearTranscript, canStart } = useSpeechRecognition();
  const [isInterpreting, setIsInterpreting] = React.useState(false);
  const [textInput, setTextInput] = React.useState('');
  const [command, setCommand] = React.useState<CommandInterpretation | null>(null);
  const [executionStatus, setExecutionStatus] = React.useState<ExecutionStatus>('disconnected');
  const [lastCommandId, setLastCommandId] = React.useState<string | null>(null);
  const [isRecordingAudio, setIsRecordingAudio] = React.useState(false);
  const [audioUrl, setAudioUrl] = React.useState<string | null>(null);
  const [audioError, setAudioError] = React.useState<string | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<BlobPart[]>([]);
  const lastTranscriptHash = React.useRef('');

  const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws?client=web`;

  React.useEffect(() => {
    const ws = new WebSocket(wsUrl);
    (window as any).inhabitWs = ws;
    ws.onopen = () => console.log('Website connected to backend WebSocket via', wsUrl);
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data.toString());
        if (message.type === 'display_command' && unrealService.onDisplayCommandCallback) {
          const received: CommandInterpretation = {
            status: 'ready', action: message.action || null,
            object: { name: message.object?.name ?? null, id: message.object?.id ?? null },
            parameters: message.parameters || {}, clarification: message.clarification ?? null,
            original_transcript: message.transcript || ''
          };
          unrealService.onDisplayCommandCallback(message.command_id, received);
        }
      } catch (e) { console.error('Failed to parse WebSocket message:', e); }
    };
    ws.onclose = () => console.log('WebSocket connection closed');
    ws.onerror = (event) => console.error('WebSocket error:', event);
    const handleDisplayCommand = (commandId: string, received: CommandInterpretation) => {
      setLastCommandId(current => {
        if (current === commandId) { setCommand(received); setExecutionStatus('sent'); }
        return current;
      });
    };
    unrealService.setOnDisplayCommand(handleDisplayCommand);
    return () => {
      unrealService.setOnDisplayCommand(undefined);
      if ((window as any).inhabitWs === ws) delete (window as any).inhabitWs;
      ws.close();
    };
  }, [wsUrl]);

  React.useEffect(() => () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const startOfflineRecording = async () => {
    setAudioError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setAudioError('This browser cannot record audio here. Open Inhabit over trusted HTTPS and allow microphone access.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = event => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setAudioUrl(previous => {
          if (previous) URL.revokeObjectURL(previous);
          return URL.createObjectURL(blob);
        });
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        setIsRecordingAudio(false);
      };
      recorder.start();
      setIsRecordingAudio(true);
    } catch (e) { setAudioError(e instanceof Error ? e.message : 'Could not access the microphone.'); }
  };
  const stopOfflineRecording = () => { if (recorderRef.current?.state === 'recording') recorderRef.current.stop(); };

  const interpretCommand = async (finalTranscript: string) => {
    const cleanTranscript = finalTranscript.trim();
    const transcriptHash = cleanTranscript.toLowerCase();
    if (!cleanTranscript || lastTranscriptHash.current === transcriptHash) return;
    lastTranscriptHash.current = transcriptHash;
    setIsInterpreting(true); setCommand(null); setExecutionStatus('pending');
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
      setCommand({ status: 'unsupported', action: null, object: { name: null, id: null }, parameters: {}, clarification: message, original_transcript: cleanTranscript });
      setExecutionStatus('pending');
    } finally {
      setIsInterpreting(false);
      window.setTimeout(() => { lastTranscriptHash.current = ''; }, 1500);
    }
  };
  const handleMicClick = () => {
    if (isListening) {
      const finalTranscript = transcript; stop();
      if (finalTranscript.trim()) void interpretCommand(finalTranscript);
      clearTranscript();
    } else if (!isInterpreting && canStart) start();
  };

  return (
    <aside className="flex w-full flex-col gap-4 border-b border-gray-200 bg-white p-4 md:h-full md:w-80 md:shrink-0 md:gap-6 md:overflow-y-auto md:border-b-0 md:border-l md:p-6">
      <h3 className="text-lg font-semibold">Voice Commands</h3>
      <button onClick={handleMicClick} className={`flex w-full items-center justify-center gap-3 rounded-lg py-4 font-medium text-white transition-colors ${isListening ? 'animate-pulse bg-red-600' : 'bg-charcoal hover:bg-gray-700'}`} disabled={isInterpreting || (!canStart && !isListening)} aria-label={isListening ? 'Stop listening' : 'Start voice'}>
        {isInterpreting ? <Loader2 size={20} className="animate-spin" /> : <Mic size={28} />}
        <span>{isListening ? 'Listening...' : isInterpreting ? 'Understanding...' : 'Start Voice'}</span>
      </button>
      <section className="rounded-lg border border-indigo-100 bg-indigo-50 p-4">
        <div className="flex items-center gap-2">
          <Type size={18} className="text-indigo-700" />
          <h4 className="text-sm font-semibold text-indigo-950">Text your instructions</h4>
        </div>
        <p className="mt-1 text-xs text-indigo-900">Describe what you want in plain language. You can type a full instruction instead of using the microphone.</p>
        <textarea
          value={textInput}
          onChange={event => setTextInput(event.target.value)}
          placeholder="Example: Move the sofa 50 cm to the left, rotate the coffee table 15 degrees, and change the wall color to warm beige..."
          rows={5}
          className="mt-3 w-full resize-y rounded-lg border border-indigo-200 bg-white p-3 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          disabled={isInterpreting}
        />
        <button
          type="button"
          onClick={() => {
            if (textInput.trim() && !isInterpreting) {
              void interpretCommand(textInput);
            }
          }}
          disabled={!textInput.trim() || isInterpreting}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-700 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isInterpreting ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
          {isInterpreting ? 'Generating command...' : 'Generate command'}
        </button>
      </section>
      <section className="min-h-[100px] rounded-lg border border-gray-100 bg-gray-50 p-4">
        <p className="mb-2 text-sm text-gray-500">Transcript:</p>
        <p className="break-words text-sm">{transcript || command?.original_transcript || 'Speak a command to begin...'}</p>
        {error && <div className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700"><p className="font-semibold">Microphone error</p><p>{error}</p></div>}
        {command && <div className={`mt-3 rounded border p-3 text-xs ${command.status === 'ready' ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
          <p className="font-semibold">{command.status === 'ready' ? 'Generated command' : command.status === 'clarification_required' ? 'Clarification needed' : 'Unsupported command'}</p>
          {command.action && <p className="mt-1">Action: {command.action}</p>}
          {command.object?.name && <p>Object: {command.object.name}</p>}
          <p className="mt-1 break-words">Parameters: {JSON.stringify(command.parameters)}</p>
          {command.clarification && <p className="mt-2">{command.clarification}</p>}
        </div>}
        <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3"><p className="text-xs font-medium text-gray-500">Transmission status</p><p className="text-sm font-semibold capitalize">{executionStatus.replace('_', ' ')}</p></div>
      </section>
      <section className="rounded-lg border border-blue-100 bg-blue-50 p-4">
        <h4 className="text-sm font-semibold text-blue-950">Offline audio recorder</h4>
        <p className="mt-1 text-xs text-blue-900">Records audio on this device without uploading it. Recording and playback work locally after the page has loaded and microphone permission is granted.</p>
        <button type="button" onClick={isRecordingAudio ? stopOfflineRecording : startOfflineRecording} className={`mt-3 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white ${isRecordingAudio ? 'bg-red-600' : 'bg-blue-700'}`}>
          {isRecordingAudio ? <Square size={16} /> : <Mic size={18} />}{isRecordingAudio ? 'Stop recording' : 'Record offline'}
        </button>
        {isRecordingAudio && <p className="mt-2 text-xs font-medium text-red-700">Recording locally…</p>}
        {audioError && <p className="mt-2 text-xs text-red-700">{audioError}</p>}
        {audioUrl && <div className="mt-3 space-y-2"><audio controls src={audioUrl} className="w-full" /><a href={audioUrl} download={`inhabit-recording-${Date.now()}.webm`} className="flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-800"><Download size={16} /> Download recording</a></div>}
      </section>
    </aside>
  );
};
export default VoicePanel;
