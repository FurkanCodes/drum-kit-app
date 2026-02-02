export interface DrumPad {
  id: string;
  name: string;
  key: string;
  color: string;
  type: 'kick' | 'snare' | 'hihat' | 'tom' | 'crash' | 'clap' | 'rim' | 'cowbell';
  samplePath: string;
  x?: number;
  y?: number;
  image?: string;
}

export interface AudioConfig {
  bufferSize: 128 | 256 | 512 | 1024 | 2048 | 4096;
  maxVoices: number;
  sampleRate: number;
  latencyHint: 'balanced' | 'interactive' | 'playback';
  preTriggerOffset: number;
  volume: number;
}

export interface Voice {
  id: number;
  source: AudioBufferSourceNode | null;
  gain: GainNode | null;
  endTime: number;
  active: boolean;
}

export interface LatencyMetrics {
  triggerTime: number;
  audioTime: number;
  latency: number;
}

export interface DrumHit {
  padId: string;
  velocity: number;
  timestamp: number;
}

export const DEFAULT_AUDIO_CONFIG: AudioConfig = {
  bufferSize: 256,
  maxVoices: 16,
  sampleRate: 48000,
  latencyHint: 'interactive',
  preTriggerOffset: 0,
  volume: 0.8,
};

export const DRUM_PADS: DrumPad[] = [
  { id: 'kick', name: 'Kick', key: 'a', color: '#ef4444', type: 'kick', samplePath: '/samples/Kick.mp3', image: '/images/drums/kick.png', x: 45, y: 60 },
  { id: 'snare', name: 'Snare', key: 's', color: '#f97316', type: 'snare', samplePath: '/samples/Snare.mp3', image: '/images/drums/snare.png', x: 45, y: 35 },
  { id: 'hihat-closed', name: 'Hi-Hat (Closed)', key: 'd', color: '#eab308', type: 'hihat', samplePath: '/samples/Hat.mp3', image: '/images/drums/hihat.png', x: 25, y: 40 },
  { id: 'hihat-open', name: 'Hi-Hat (Open)', key: 'f', color: '#84cc16', type: 'hihat', samplePath: '/samples/Hat.mp3', image: '/images/drums/hihat.png', x: 20, y: 20 },
  { id: 'tom-high', name: 'Tom (High)', key: 'g', color: '#22c55e', type: 'tom', samplePath: '/samples/Tomleft.mp3', image: '/images/drums/tom.png', x: 35, y: 15 },
  { id: 'tom-mid', name: 'Tom (Mid)', key: 'h', color: '#06b6d4', type: 'tom', samplePath: '/samples/Tomleft.mp3', image: '/images/drums/tom.png', x: 55, y: 15 },
  { id: 'tom-low', name: 'Tom (Low)', key: 'j', color: '#3b82f6', type: 'tom', samplePath: '/samples/Tomright.mp3', image: '/images/drums/tom.png', x: 65, y: 35 },
  { id: 'crash', name: 'Crash', key: 'k', color: '#8b5cf6', type: 'crash', samplePath: '/samples/Crash.mp3', image: '/images/drums/crash.png', x: 75, y: 15 },
];
