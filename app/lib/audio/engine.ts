// Ultra-low latency audio engine using pre-loaded samples
// Manages AudioContext, sample playback, voice allocation, and mixer

import { SampleLoader, getSampleLoader, resetSampleLoader } from './sample-loader';
import { initMixerEngine, getTrackInputNode, cleanupMixerEngine, isMixerInitialized } from './mixer';
import { DRUM_PADS } from '../types/drum';
import type { AudioConfig, LatencyMetrics } from '../types/drum';

interface DrumEngine {
  ctx: AudioContext | null;
  sampleLoader: SampleLoader | null;
  config: AudioConfig;
  latencyMetrics: LatencyMetrics[];
  isInitialized: boolean;
}

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
  isInitialized: false,
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

    // Initialize sample loader and load all drum samples
    engine.sampleLoader = getSampleLoader(engine.ctx);
    await loadAllSamples();

    // Initialize mixer engine (replaces simple master gain/compressor)
    const mixerInitialized = await initMixerEngine(engine.ctx, engine.ctx.destination);
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

  // Get track input node from mixer (this is where the sample connects)
  const trackInput = getTrackInputNode(drumId);
  if (!trackInput) {
    console.warn(`Mixer track not found: ${drumId}`);
    return false;
  }

  // Create audio source
  const source = engine.ctx.createBufferSource();
  source.buffer = sampleBuffer;

  // Create gain node for velocity control
  const gainNode = engine.ctx.createGain();
  gainNode.gain.setValueAtTime(velocity, audioTime);

  // Connect: Source -> Gain -> Track Input (which goes through mixer)
  source.connect(gainNode);
  gainNode.connect(trackInput);

  // Schedule playback
  source.start(audioTime);

  // Clean up when done
  source.onended = () => {
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
  return engine.ctx?.destination || null;
}

// Clean up
export function cleanupAudioEngine(): void {
  cleanupMixerEngine();
  resetSampleLoader();
  
  if (engine.ctx) {
    engine.ctx.close();
  }
  
  engine = {
    ctx: null,
    sampleLoader: null,
    config: engine.config,
    latencyMetrics: [],
    isInitialized: false,
  };
}
