// Ultra-low latency audio engine using pre-loaded samples
// Manages AudioContext, sample playback, voice allocation, and mixer

import { SampleLoader, getSampleLoader, resetSampleLoader } from './sample-loader';
import { initMixerEngine, getTrackInputNode, cleanupMixerEngine } from './mixer';
import { DRUM_PADS } from '../types/drum';
import type { AudioConfig, LatencyMetrics } from '../types/drum';

interface DrumEngine {
  ctx: AudioContext | null;
  sampleLoader: SampleLoader | null;
  config: AudioConfig;
  latencyMetrics: LatencyMetrics[];
  activeVoices: ActiveVoice[];
  jamOutputGain: GainNode | null;
  jamOutputGainValue: number;
  isInitialized: boolean;
}

interface ActiveVoice {
  id: number;
  drumId: string;
  chokeGroup: 'hihat' | null;
  source: AudioBufferSourceNode;
  gain: GainNode;
  startTime: number;
  endTime: number;
  ended: boolean;
  stopped: boolean;
}

let nextVoiceId = 1;

// Global singleton instance
let engine: DrumEngine = {
  ctx: null,
  sampleLoader: null,
  config: {
    bufferSize: 256,
    maxVoices: 32,
    sampleRate: 48000,
    latencyHint: 'interactive',
    preTriggerOffset: 0,
    volume: 0.8,
  },
  latencyMetrics: [],
  activeVoices: [],
  jamOutputGain: null,
  jamOutputGainValue: 1.0,
  isInitialized: false,
};

export function setJamOutputGain(multiplier: number): void {
  const next = Math.max(0, Math.min(2, multiplier));
  engine.jamOutputGainValue = next;

  if (!engine.jamOutputGain || !engine.ctx) return;
  engine.jamOutputGain.gain.setTargetAtTime(next, engine.ctx.currentTime, 0.02);
}

export function getJamOutputGain(): number {
  return engine.jamOutputGainValue;
}

// Initialize the audio engine
export async function initAudioEngine(config?: Partial<AudioConfig>): Promise<boolean> {
  if (engine.isInitialized && engine.ctx?.state === 'running') {
    return true;
  }

  try {
    // Update config if provided
    if (config) {
      engine.config = { ...engine.config, ...config };
    }

    // Reset voice tracking for a clean slate
    engine.activeVoices = [];
    nextVoiceId = 1;
    engine.jamOutputGain = null;

    // Create AudioContext with lowest latency settings
    engine.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({
      latencyHint: engine.config.latencyHint,
      sampleRate: engine.config.sampleRate,
    });

    // Resume context (browser requires user gesture)
    if (engine.ctx.state === 'suspended') {
      await engine.ctx.resume();
    }

    // Initialize sample loader and load all drum samples
    engine.sampleLoader = getSampleLoader(engine.ctx);
    await loadAllSamples();

    // Create Jam output gain stage (lets drums sit above YouTube audio without touching the master fader)
    engine.jamOutputGain = engine.ctx.createGain();
    engine.jamOutputGain.gain.value = engine.jamOutputGainValue;
    engine.jamOutputGain.connect(engine.ctx.destination);

    // Initialize mixer engine (replaces simple master gain/compressor)
    const mixerInitialized = await initMixerEngine(engine.ctx, engine.jamOutputGain);
    if (!mixerInitialized) {
      throw new Error('Failed to initialize mixer');
    }

    engine.isInitialized = true;
    console.log('Audio engine initialized with samples and mixer');
    return true;
  } catch (error) {
    console.error('Failed to initialize audio engine:', error);
    return false;
  }
}

// Load all drum samples
async function loadAllSamples(): Promise<void> {
  if (!engine.sampleLoader) return;

  // Get unique sample paths to avoid loading duplicates
  const uniqueSamples = new Map<string, string>();
  
  DRUM_PADS.forEach(pad => {
    if (!uniqueSamples.has(pad.samplePath)) {
      uniqueSamples.set(pad.samplePath, pad.samplePath);
    }
  });

  // Create array of sample loads
  const sampleLoads = Array.from(uniqueSamples.entries()).map(([path]) => ({
    id: path,
    url: path,
  }));

  console.log('Loading samples:', sampleLoads);
  
  await engine.sampleLoader.loadSamples(sampleLoads);
  
  const loadedCount = engine.sampleLoader.getLoadedSampleIds().length;
  console.log(`Loaded ${loadedCount} samples`);
}

// Trigger a drum sound with ultra-low latency
export function triggerDrum(
  drumId: string,
  velocity: number = 1.0,
  callback?: (metrics: LatencyMetrics) => void
): boolean {
  if (!engine.isInitialized || !engine.ctx || !engine.sampleLoader) {
    return false;
  }

  const triggerTime = performance.now();
  const ctx = engine.ctx;
  const FADE_OUT_SEC = 0.015;
  
  // Find the drum pad to get the sample path
  const pad = DRUM_PADS.find(p => p.id === drumId);
  if (!pad) {
    console.warn(`Unknown drum id: ${drumId}`);
    return false;
  }

  // Get the sample buffer
  const sampleBuffer = engine.sampleLoader.getSample(pad.samplePath);
  if (!sampleBuffer) {
    console.warn(`Sample not loaded: ${pad.samplePath}`);
    return false;
  }

  const pruneVoices = () => {
    const now = ctx.currentTime;
    engine.activeVoices = engine.activeVoices.filter(v => !v.ended && v.endTime > now);
  };

  const stopVoice = (voice: ActiveVoice) => {
    if (voice.stopped) return;
    voice.stopped = true;

    const baseTime = Math.max(ctx.currentTime, voice.startTime);
    const fadeStart = baseTime;
    const stopAt = baseTime + FADE_OUT_SEC + 0.001;

    try {
      const gainParam = voice.gain.gain;
      const currentValue = gainParam.value;

      gainParam.cancelScheduledValues(fadeStart);
      gainParam.setValueAtTime(currentValue, fadeStart);
      gainParam.linearRampToValueAtTime(0, fadeStart + FADE_OUT_SEC);
    } catch {
      // Ignore automation errors
    }

    try {
      voice.source.stop(stopAt);
    } catch {
      // Source may already be stopped/ended
    }
  };

  // 1) Prune finished voices before applying choke/polyphony logic
  pruneVoices();

  // 2) Hi-hat choke group: new hat hit cuts previous hats
  const chokeGroup: ActiveVoice['chokeGroup'] = pad.type === 'hihat' ? 'hihat' : null;
  if (chokeGroup === 'hihat') {
    const remaining: ActiveVoice[] = [];
    for (const voice of engine.activeVoices) {
      if (voice.chokeGroup === 'hihat') {
        stopVoice(voice);
      } else {
        remaining.push(voice);
      }
    }
    engine.activeVoices = remaining;
  }

  // 3) Enforce polyphony limit (FIFO)
  const maxVoices = Math.max(1, Math.floor(engine.config.maxVoices));
  while (engine.activeVoices.length >= maxVoices) {
    const oldest = engine.activeVoices.shift();
    if (oldest) stopVoice(oldest);
  }

  // Apply pre-trigger offset
  const offset = engine.config.preTriggerOffset / 1000;
  const audioTime = ctx.currentTime + Math.max(0, offset);

  // Get track input node from mixer (this is where the sample connects)
  const trackInput = getTrackInputNode(drumId);
  if (!trackInput) {
    console.warn(`Mixer track not found: ${drumId}`);
    return false;
  }

  // Create audio source
  const source = ctx.createBufferSource();
  source.buffer = sampleBuffer;

  // Create gain node for velocity control
  const gainNode = ctx.createGain();
  const initialGain = Math.max(0, Math.min(1.5, velocity));
  gainNode.gain.value = initialGain;
  gainNode.gain.setValueAtTime(initialGain, audioTime);

  // Connect: Source -> Gain -> Track Input (which goes through mixer)
  source.connect(gainNode);
  gainNode.connect(trackInput);

  const voice: ActiveVoice = {
    id: nextVoiceId++,
    drumId,
    chokeGroup,
    source,
    gain: gainNode,
    startTime: audioTime,
    endTime: audioTime + sampleBuffer.duration,
    ended: false,
    stopped: false,
  };

  // Schedule playback
  source.start(audioTime);

  // Clean up when done
  source.onended = () => {
    voice.ended = true;
    try {
      source.disconnect();
      gainNode.disconnect();
    } catch {
      // Already disconnected
    }
  };

  // 4) Register active voice
  engine.activeVoices.push(voice);

  // Record end time after audio scheduling is complete
  const processingCompleteTime = performance.now();
  
  // Calculate latency: time from trigger to audio scheduling
  const latency = processingCompleteTime - triggerTime;
  
  // Measure latency
  if (callback) {
    const metrics: LatencyMetrics = {
      triggerTime,
      audioTime: processingCompleteTime,
      latency,
    };

    engine.latencyMetrics.push(metrics);
    
    // Keep only last 100 measurements
    if (engine.latencyMetrics.length > 100) {
      engine.latencyMetrics.shift();
    }

    callback(metrics);
  }

  return true;
}

// Get current latency statistics
export function getLatencyStats() {
  if (engine.latencyMetrics.length === 0) {
    return { avg: 0, min: 0, max: 0, count: 0 };
  }

  const latencies = engine.latencyMetrics.map(m => m.latency);
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const min = Math.min(...latencies);
  const max = Math.max(...latencies);

  return { avg, min, max, count: latencies.length };
}

// Update audio configuration
export function updateAudioConfig(newConfig: Partial<AudioConfig>) {
  engine.config = { ...engine.config, ...newConfig };
  
  // If critical settings change, reinitialize
  if (newConfig.sampleRate || newConfig.latencyHint) {
    engine.isInitialized = false;
    initAudioEngine(engine.config);
  }
}

// Get current configuration
export function getAudioConfig(): AudioConfig {
  return { ...engine.config };
}

// Check if engine is ready
export function isAudioEngineReady(): boolean {
  return engine.isInitialized && engine.ctx?.state === 'running';
}

// Resume audio context (call on user interaction)
export async function resumeAudioContext(): Promise<void> {
  if (engine.ctx?.state === 'suspended') {
    await engine.ctx.resume();
  }
}

// Set master volume (now handled by mixer)
export function setMasterVolume(volume: number): void {
  // Mixer handles this - you can call setMasterVolume from mixer module directly
  // This is kept for backwards compatibility
  console.log('Master volume is now controlled by the mixer');
}

// Get AudioContext state
export function getAudioContextState(): string {
  return engine.ctx?.state || 'closed';
}

// Get sample loader status
export function getSampleLoaderStatus(): { loaded: number; total: number } {
  if (!engine.sampleLoader) {
    return { loaded: 0, total: 0 };
  }
  
  return {
    loaded: engine.sampleLoader.getLoadedSampleIds().length,
    total: new Set(DRUM_PADS.map(p => p.samplePath)).size,
  };
}

// Get AudioContext for mixer
export function getAudioContext(): AudioContext | null {
  return engine.ctx;
}

// Get destination node for mixer
export function getAudioDestination(): AudioNode | null {
  return engine.jamOutputGain || engine.ctx?.destination || null;
}

// Clean up
export function cleanupAudioEngine(): void {
  cleanupMixerEngine();
  resetSampleLoader();
  engine.activeVoices = [];
  nextVoiceId = 1;
  engine.jamOutputGain = null;
  
  if (engine.ctx) {
    engine.ctx.close();
  }
  
  engine = {
    ctx: null,
    sampleLoader: null,
    config: engine.config,
    latencyMetrics: [],
    activeVoices: [],
    jamOutputGain: null,
    jamOutputGainValue: engine.jamOutputGainValue,
    isInitialized: false,
  };
}
