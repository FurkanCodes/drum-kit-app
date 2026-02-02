// Ableton Live-style mixer types
// Complete mixer architecture for drum kit

export interface MixerTrack {
  id: string;
  name: string;
  // Core controls
  volume: number; // 0.0 to 1.0 (maps to -inf to +6dB)
  pan: number; // -1.0 (left) to 1.0 (right), 0.0 = center
  muted: boolean;
  soloed: boolean;
  inputGain: number; // 0.0 to 2.0 (pre-fader gain staging)
  // Sends (return track IDs mapped to send level 0-1)
  sends: Map<string, number>;
  // VU meter data
  vuMeter: VUMeterData;
}

export interface VUMeterData {
  peak: number; // 0.0 to 1.0
  rms: number; // 0.0 to 1.0
  peakHold: number; // Peak hold value
  clipping: boolean;
}

export interface ReturnTrack {
  id: string;
  name: string;
  type: 'reverb' | 'delay' | 'chorus' | 'distortion' | 'custom';
  volume: number;
  muted: boolean;
  // Effect parameters
  params: EffectParams;
  vuMeter: VUMeterData;
}

export interface EffectParams {
  // Reverb
  decay?: number; // 0.1 to 10 seconds
  preDelay?: number; // 0 to 100ms
  mix?: number; // 0 to 1
  // Delay
  time?: number; // 1ms to 2000ms
  feedback?: number; // 0 to 0.95
  // Chorus
  rate?: number; // 0.1 to 10 Hz
  depth?: number; // 0 to 1
  // Distortion
  drive?: number; // 0 to 1
  tone?: number; // 0 to 1 (low to high)
}

export interface MasterBus {
  volume: number; // 0.0 to 1.0
  // 3-band EQ
  eq: {
    lowGain: number; // -15dB to +15dB
    midGain: number; // -15dB to +15dB
    highGain: number; // -15dB to +15dB
    midFreq: number; // 200Hz to 5000Hz
  };
  // Compressor
  compressor: {
    threshold: number; // -60dB to 0dB
    ratio: number; // 1:1 to 20:1
    attack: number; // 0.1ms to 100ms
    release: number; // 10ms to 1000ms
    makeupGain: number; // 0dB to 20dB
    enabled: boolean;
  };
  // Limiter
  limiter: {
    threshold: number; // -20dB to 0dB
    ceiling: number; // -6dB to 0dB
    enabled: boolean;
  };
  vuMeter: VUMeterData;
}

export interface MixerState {
  tracks: Map<string, MixerTrack>;
  returns: Map<string, ReturnTrack>;
  master: MasterBus;
  soloActive: boolean; // True if any track is soloed
}

// Gain staging constants
export const GAIN_CONSTANTS = {
  MIN_VOLUME_DB: -60, // -60dB = silence
  MAX_VOLUME_DB: 6, // +6dB boost
  UNITY_GAIN_DB: 0,
  // Convert linear 0-1 to dB
  linearToDb: (linear: number): number => {
    if (linear <= 0) return -Infinity;
    return 20 * Math.log10(linear);
  },
  // Convert dB to linear 0-1
  dbToLinear: (db: number): number => {
    if (db <= -60) return 0;
    return Math.pow(10, db / 20);
  },
} as const;

// Default return track configurations
export const DEFAULT_RETURNS: Omit<ReturnTrack, 'id'>[] = [
  {
    name: 'Reverb',
    type: 'reverb',
    volume: 0.7,
    muted: false,
    params: { decay: 2.0, preDelay: 20, mix: 0.3 },
    vuMeter: { peak: 0, rms: 0, peakHold: 0, clipping: false },
  },
  {
    name: 'Delay',
    type: 'delay',
    volume: 0.5,
    muted: false,
    params: { time: 250, feedback: 0.3, mix: 0.4 },
    vuMeter: { peak: 0, rms: 0, peakHold: 0, clipping: false },
  },
  {
    name: 'Chorus',
    type: 'chorus',
    volume: 0.4,
    muted: false,
    params: { rate: 1.5, depth: 0.5, mix: 0.5 },
    vuMeter: { peak: 0, rms: 0, peakHold: 0, clipping: false },
  },
  {
    name: 'Distortion',
    type: 'distortion',
    volume: 0.3,
    muted: false,
    params: { drive: 0.3, tone: 0.5 },
    vuMeter: { peak: 0, rms: 0, peakHold: 0, clipping: false },
  },
  {
    name: 'Reverb 2',
    type: 'reverb',
    volume: 0.6,
    muted: false,
    params: { decay: 4.0, preDelay: 40, mix: 0.25 },
    vuMeter: { peak: 0, rms: 0, peakHold: 0, clipping: false },
  },
  {
    name: 'Delay 2',
    type: 'delay',
    volume: 0.4,
    muted: false,
    params: { time: 500, feedback: 0.5, mix: 0.3 },
    vuMeter: { peak: 0, rms: 0, peakHold: 0, clipping: false },
  },
];

// Default master bus configuration
export const DEFAULT_MASTER_BUS: MasterBus = {
  volume: 0.85,
  eq: {
    lowGain: 0,
    midGain: 0,
    highGain: 0,
    midFreq: 1000,
  },
  compressor: {
    threshold: -18,
    ratio: 4,
    attack: 5,
    release: 100,
    makeupGain: 0,
    enabled: true,
  },
  limiter: {
    threshold: -1,
    ceiling: -0.1,
    enabled: true,
  },
  vuMeter: { peak: 0, rms: 0, peakHold: 0, clipping: false },
};
