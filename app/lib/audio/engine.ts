// Ultra-low latency audio engine using pre-loaded samples
// Manages AudioContext, sample playback, and voice allocation

import { SampleLoader, getSampleLoader, resetSampleLoader } from './sample-loader';
import { DRUM_PADS } from '../types/drum';
import type { AudioConfig, LatencyMetrics } from '../types/drum';

interface DrumEngine {
  ctx: AudioContext | null;
  masterGain: GainNode | null;
  compressor: DynamicsCompressorNode | null;
  sampleLoader: SampleLoader | null;
  config: AudioConfig;
  latencyMetrics: LatencyMetrics[];
  isInitialized: boolean;
  activeVoices: Map<string, AudioBufferSourceNode>;
}

// Global singleton instance
let engine: DrumEngine = {
  ctx: null,
  masterGain: null,
  compressor: null,
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
  isInitialized: false,
  activeVoices: new Map(),
};

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

    // Create AudioContext with lowest latency settings
    engine.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({
      latencyHint: engine.config.latencyHint,
      sampleRate: engine.config.sampleRate,
    });

    // Resume context (browser requires user gesture)
    if (engine.ctx.state === 'suspended') {
      await engine.ctx.resume();
    }

    // Create master compressor for consistent levels
    engine.compressor = engine.ctx.createDynamicsCompressor();
    engine.compressor.threshold.setValueAtTime(-12, engine.ctx.currentTime);
    engine.compressor.knee.setValueAtTime(3, engine.ctx.currentTime);
    engine.compressor.ratio.setValueAtTime(4, engine.ctx.currentTime);
    engine.compressor.attack.setValueAtTime(0.001, engine.ctx.currentTime);
    engine.compressor.release.setValueAtTime(0.1, engine.ctx.currentTime);

    // Master gain
    engine.masterGain = engine.ctx.createGain();
    engine.masterGain.gain.setValueAtTime(0.8, engine.ctx.currentTime);

    // Connect: Master -> Compressor -> Destination
    engine.masterGain.connect(engine.compressor);
    engine.compressor.connect(engine.ctx.destination);

    // Initialize sample loader and load all drum samples
    engine.sampleLoader = getSampleLoader(engine.ctx);
    await loadAllSamples();

    engine.isInitialized = true;
    console.log('Audio engine initialized with samples');
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
  if (!engine.isInitialized || !engine.ctx || !engine.masterGain || !engine.sampleLoader) {
    return false;
  }

  // Record start time before any processing
  const triggerTime = performance.now();
  
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

  // Apply pre-trigger offset
  const offset = engine.config.preTriggerOffset / 1000;
  const audioTime = engine.ctx.currentTime + Math.max(0, offset);

  // Create audio source
  const source = engine.ctx.createBufferSource();
  source.buffer = sampleBuffer;

  // Create gain node for velocity control
  const gainNode = engine.ctx.createGain();
  gainNode.gain.setValueAtTime(velocity, audioTime);

  // Connect: Source -> Gain -> Master
  source.connect(gainNode);
  gainNode.connect(engine.masterGain);

  // Schedule playback
  source.start(audioTime);

  // Track active voice for potential cleanup
  engine.activeVoices.set(drumId, source);
  
  // Clean up when done
  source.onended = () => {
    engine.activeVoices.delete(drumId);
    try {
      source.disconnect();
      gainNode.disconnect();
    } catch {
      // Already disconnected
    }
  };

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

// Set master volume
export function setMasterVolume(volume: number): void {
  if (engine.masterGain && engine.ctx) {
    engine.masterGain.gain.setValueAtTime(volume, engine.ctx.currentTime);
  }
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

// Clean up
export function cleanupAudioEngine(): void {
  if (engine.ctx) {
    engine.ctx.close();
  }
  resetSampleLoader();
  
  engine = {
    ctx: null,
    masterGain: null,
    compressor: null,
    sampleLoader: null,
    config: engine.config,
    latencyMetrics: [],
    isInitialized: false,
    activeVoices: new Map(),
  };
}
