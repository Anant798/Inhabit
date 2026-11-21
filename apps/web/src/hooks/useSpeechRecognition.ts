import { useState, useEffect, useRef, useCallback } from 'react';

interface SpeechRecognitionOptions {
  continuous?: boolean;
  interimResults?: boolean;
}

export interface SpeechRecognitionState {
  isListening: boolean;
  transcript: string;
  error: string | null;
  lastErrorType: 'not-allowed' | 'audio-capture' | 'no-speech' | 'network' | 'aborted' | 'other' | null;
}

export const useSpeechRecognition = (options: SpeechRecognitionOptions = { continuous: true, interimResults: true }) => {
  const [state, setState] = useState<SpeechRecognitionState>({
    isListening: false,
    transcript: '',
    error: null,
    lastErrorType: null
  });

  const recognitionRef = useRef<any>(null);
  const startAttemptsRef = useRef(0);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setState(prev => ({ ...prev, error: 'Browser does not support Speech Recognition', lastErrorType: 'other' }));
      return;
    }

    // Cleanup previous recognition if exists
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = options.continuous;
    recognition.interimResults = options.interimResults;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setState({ isListening: true, transcript: '', error: null, lastErrorType: null });
    };

    recognition.onend = () => {
      // Only reset if not currently processing an AI interpretation
      // Natural end of recognition should not force state
      if (!recognitionRef.current?.continuous) {
        setState(prev => ({ ...prev, isListening: false }));
      }
    };

    recognition.onerror = (event: any) => {
      const errorType = event.error;
      let message = 'Recognition error';
      let type: 'not-allowed' | 'audio-capture' | 'no-speech' | 'network' | 'aborted' | 'other' = 'other';

      switch (errorType) {
        case 'not-allowed':
        case 'denied':
          message = 'Microphone permission denied. Please allow microphone access in your browser settings.';
          type = 'not-allowed';
          break;
        case 'audio-capture':
          message = 'No microphone detected. Please check your audio settings.';
          type = 'audio-capture';
          break;
        case 'no-speech':
          message = 'No speech was detected. Please try speaking again.';
          type = 'no-speech';
          break;
        case 'network':
          message = 'Network error. Please check your internet connection.';
          type = 'network';
          break;
        case 'aborted':
          message = 'Recognition was aborted.';
          type = 'aborted';
          break;
        default:
          message = `Recognition error: ${event.error}`;
          type = 'other';
      }

      setState({
        isListening: false,
        transcript: state.transcript,
        error: message,
        lastErrorType: type
      });
    };

    recognition.onresult = (event: any) => {
      let currentTranscript = '';
      for (let i = 0; i < event.results.length; i++) {
        currentTranscript += event.results[i][0].transcript;
      }
      setState(prev => ({ ...prev, transcript: currentTranscript }));
    };

    recognitionRef.current = recognition;
  }, [options.continuous, options.interimResults]);

  const start = useCallback(() => {
    // Prevent duplicate starts
    if (state.isListening) return;

    setState(prev => ({ ...prev, error: null, lastErrorType: null }));
    recognitionRef.current?.start();
    startAttemptsRef.current = (startAttemptsRef.current || 0) + 1;
  }, [state.isListening]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    // Don't automatically restart; let user decide
    setState(prev => ({ ...prev, isListening: false, transcript: '' }));
  }, []);

  const clearTranscript = useCallback(() => {
    setState(prev => ({ ...prev, transcript: '' }));
  }, []);

  return {
    ...state,
    start,
    stop,
    clear: clearTranscript,
    canStart: !state.isListening && state.lastErrorType !== 'not-allowed'
  };
};