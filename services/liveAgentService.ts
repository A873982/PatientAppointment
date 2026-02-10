
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import { createPcmBlob, base64ToUint8Array, decodeAudioData } from '../utils/audioUtils';

export interface LiveAgentConfig {
  apiKey: string;
  onTranscript: (text: string, role: 'user' | 'model', isFinal: boolean) => void;
  onToolCall: (name: string, args: any) => Promise<any>;
  onConnect: () => void;
  onDisconnect: () => void;
  onError: (error: Error) => void;
}

export class LiveAgentService {
  private sessionPromise: Promise<any> | null = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private nextStartTime = 0;
  private config: LiveAgentConfig;
  private activeSources: Set<AudioBufferSourceNode> = new Set();
  
  private currentInputTranscription = '';
  private currentOutputTranscription = '';

  constructor(config: LiveAgentConfig) {
    this.config = config;
  }

  /**
   * Cleans text but preserves common symbols, punctuation, and accented characters
   * that the STT engine might produce for English speech.
   */
  private cleanTranscriptionText(text: string): string {
    // Allows standard alphanumeric, common punctuation, and Latin-1 Supplement (accents)
    return text.replace(/[^\x20-\x7E\xA0-\xFF]/g, '').trim();
  }

  public async connect(systemInstruction: string, tools: FunctionDeclaration[]) {
    try {
      const ai = new GoogleGenAI({ apiKey: this.config.apiKey });
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      this.sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: systemInstruction + " Keep responses very brief and professional. Do not repeat patient details unless confirming.",
          tools: [{ functionDeclarations: tools }],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            this.handleOpen(stream);
            this.sessionPromise?.then(s => s.sendRealtimeInput({
              text: "Patient connected. Briefly greet them."
            }));
          },
          onmessage: (msg) => this.handleMessage(msg),
          onerror: (e) => this.config.onError(new Error("Voice service connection error")),
          onclose: () => {
            this.flushTranscriptions(true);
            this.config.onDisconnect();
          },
        },
      });
    } catch (error) {
      this.config.onError(error as Error);
    }
  }

  private flushTranscriptions(isFinal: boolean) {
    const userText = this.cleanTranscriptionText(this.currentInputTranscription);
    const modelText = this.cleanTranscriptionText(this.currentOutputTranscription);

    // If it's final, we MUST notify the UI even if text is empty to finalize the turn
    if (userText.length > 0 || isFinal) {
      this.config.onTranscript(userText, 'user', isFinal);
      if (isFinal) this.currentInputTranscription = '';
    }
    
    if (modelText.length > 0 || isFinal) {
      this.config.onTranscript(modelText, 'model', isFinal);
      if (isFinal) this.currentOutputTranscription = '';
    }
  }

  private handleOpen(stream: MediaStream) {
    this.config.onConnect();
    if (!this.inputAudioContext) return;
    this.inputSource = this.inputAudioContext.createMediaStreamSource(stream);
    this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (e) => {
      const pcmBlob = createPcmBlob(e.inputBuffer.getChannelData(0));
      this.sessionPromise?.then(s => s.sendRealtimeInput({ media: pcmBlob }));
    };
    this.inputSource.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
  }

  private async handleMessage(message: LiveServerMessage) {
    // Process input (User) transcription chunks
    if (message.serverContent?.inputTranscription?.text) {
      this.currentInputTranscription += message.serverContent.inputTranscription.text;
      this.flushTranscriptions(false);
    }
    
    // Process output (Model) transcription chunks
    if (message.serverContent?.outputTranscription?.text) {
      this.currentOutputTranscription += message.serverContent.outputTranscription.text;
      this.flushTranscriptions(false);
    }

    // Process audio output from model
    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (base64Audio && this.outputAudioContext) {
      const audioData = base64ToUint8Array(base64Audio);
      this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
      const audioBuffer = await decodeAudioData(audioData, this.outputAudioContext);
      const source = this.outputAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputAudioContext.destination);
      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
      this.activeSources.add(source);
    }

    // Finalize the current turn (flush with isFinal: true)
    if (message.serverContent?.turnComplete) {
      this.flushTranscriptions(true);
    }

    if (message.toolCall) {
      for (const fc of message.toolCall.functionCalls) {
        const result = await this.config.onToolCall(fc.name, fc.args);
        this.sessionPromise?.then(s => s.sendToolResponse({
          functionResponses: { id: fc.id, name: fc.name, response: { result } }
        }));
      }
    }

    if (message.serverContent?.interrupted) {
      this.activeSources.forEach(s => { try { s.stop(); } catch {} });
      this.activeSources.clear();
      this.nextStartTime = 0;
      this.currentOutputTranscription = '';
      this.flushTranscriptions(true); // Ensure UI knows it ended
    }
  }

  public async disconnect() {
    this.flushTranscriptions(true);
    this.inputSource?.disconnect();
    this.processor?.disconnect();
    this.activeSources.forEach(s => { try { s.stop(); } catch {} });
    if (this.inputAudioContext?.state !== 'closed') {
      await this.inputAudioContext?.close();
    }
    if (this.outputAudioContext?.state !== 'closed') {
      await this.outputAudioContext?.close();
    }
    this.config.onDisconnect();
  }
}
