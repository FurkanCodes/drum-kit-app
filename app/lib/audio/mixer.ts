// Ableton Live-style mixer engine
// Complete audio routing and processing for drum kit

import type { 
  MixerTrack, 
  ReturnTrack, 
  MasterBus, 
  MixerState, 
  VUMeterData,
  EffectParams 
} from '../types/mixer';
import { DEFAULT_RETURNS, DEFAULT_MASTER_BUS } from '../types/mixer';
import { DRUM_PADS } from '../types/drum';

// Re-export types for consumers
export type { MixerState, VUMeterData };

interface AudioTrackNodes {
  inputGain: GainNode;
  panner: StereoPannerNode;
  volume: GainNode;
  analyser: AnalyserNode;
  sendGains: Map<string, GainNode>; // Return ID -> GainNode
  outputConnected: boolean;
}

interface ReturnTrackNodes {
  input: GainNode;
  effectNodes: AudioNode[];
  volume: GainNode;
  analyser: AnalyserNode;
}

interface MasterBusNodes {
  input: GainNode;
  // EQ
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  // Compressor
  compressor: DynamicsCompressorNode;
  // Limiter (using waveshaper for soft limiting)
  limiter: WaveShaperNode;
  // Volume and analysis
  volume: GainNode;
  analyser: AnalyserNode;
}

interface MixerEngine {
  ctx: AudioContext | null;
  destination: AudioNode | null;
  tracks: Map<string, AudioTrackNodes>;
  returns: Map<string, ReturnTrackNodes>;
  master: MasterBusNodes | null;
  state: MixerState;
  isInitialized: boolean;
  animationFrame: number | null;
}

// Global singleton
let mixerEngine: MixerEngine = {
  ctx: null,
  destination: null,
  tracks: new Map(),
  returns: new Map(),
  master: null,
  state: {
    tracks: new Map(),
    returns: new Map(),
    master: { ...DEFAULT_MASTER_BUS },
    soloActive: false,
  },
  isInitialized: false,
  animationFrame: null,
};

// Initialize mixer engine
export async function initMixerEngine(
  ctx: AudioContext, 
  destination: AudioNode
): Promise<boolean> {
  if (mixerEngine.isInitialized) {
    return true;
  }

  try {
    mixerEngine.ctx = ctx;
    mixerEngine.destination = destination;

    // Initialize master bus
    initMasterBus();

    // Initialize return tracks
    initReturnTracks();

    // Initialize track nodes for each drum pad
    initTrackNodes();

    // Start VU meter updates
    startVUMeterUpdates();

    mixerEngine.isInitialized = true;
    console.log('Mixer engine initialized successfully');
    console.log(`- Master bus: ${mixerEngine.master ? 'OK' : 'MISSING'}`);
    console.log(`- Return tracks: ${mixerEngine.returns.size}`);
    console.log(`- Drum tracks: ${mixerEngine.tracks.size}`);
    return true;
  } catch (error) {
    console.error('Failed to initialize mixer engine:', error);
    return false;
  }
}

// Initialize master bus with EQ, compressor, and limiter
function initMasterBus() {
  if (!mixerEngine.ctx || !mixerEngine.destination) return;

  const ctx = mixerEngine.ctx;
  const dest = mixerEngine.destination;

  // Input gain
  const input = ctx.createGain();
  input.gain.value = 1.0;

  // 3-band EQ
  const eqLow = ctx.createBiquadFilter();
  eqLow.type = 'lowshelf';
  eqLow.frequency.value = 320;
  eqLow.gain.value = 0;

  const eqMid = ctx.createBiquadFilter();
  eqMid.type = 'peaking';
  eqMid.frequency.value = 1000;
  eqMid.Q.value = 1;
  eqMid.gain.value = 0;

  const eqHigh = ctx.createBiquadFilter();
  eqHigh.type = 'highshelf';
  eqHigh.frequency.value = 3200;
  eqHigh.gain.value = 0;

  // Compressor
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 3;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.005;
  compressor.release.value = 0.1;

  // Soft limiter using waveshaper
  const limiter = ctx.createWaveShaper();
  (limiter as any).curve = createSoftLimiterCurve();
  limiter.oversample = '4x';

  // Volume
  const volume = ctx.createGain();
  volume.gain.value = 0.85;

  // Analyser for VU meter
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.8;

  // Chain: Input -> EQ (Low -> Mid -> High) -> Compressor -> Limiter -> Volume -> Analyser -> Destination
  input.connect(eqLow);
  eqLow.connect(eqMid);
  eqMid.connect(eqHigh);
  eqHigh.connect(compressor);
  compressor.connect(limiter);
  limiter.connect(volume);
  volume.connect(analyser);
  analyser.connect(dest);

  mixerEngine.master = {
    input,
    eqLow,
    eqMid,
    eqHigh,
    compressor,
    limiter,
    volume,
    analyser,
  };
}

// Create soft limiter curve
function createSoftLimiterCurve(): Float32Array {
  const samples = 44100;
  const curve = new Float32Array(samples);
  const threshold = 0.95; // -0.45dB
  
  for (let i = 0; i < samples; i++) {
    const x = (i / samples) * 2 - 1; // -1 to 1
    
    if (Math.abs(x) < threshold) {
      curve[i] = x;
    } else {
      // Soft knee compression above threshold
      const sign = x < 0 ? -1 : 1;
      const excess = Math.abs(x) - threshold;
      curve[i] = sign * (threshold + excess / (1 + excess * 2));
    }
  }
  
  // Cast to expected type for WaveShaperNode
  return curve as Float32Array;
}

// Initialize return tracks (reverb, delay, etc.)
function initReturnTracks() {
  if (!mixerEngine.ctx || !mixerEngine.master) return;

  const ctx = mixerEngine.ctx;
  const masterInput = mixerEngine.master.input;

  DEFAULT_RETURNS.forEach((returnConfig, index) => {
    const id = `return-${index}`;
    
    // Input gain for return
    const input = ctx.createGain();
    input.gain.value = 1.0;

    // Create effect based on type
    const effectNodes = createEffectNodes(ctx, returnConfig.type, returnConfig.params);

    // Volume
    const volume = ctx.createGain();
    volume.gain.value = returnConfig.volume;

    // Analyser
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.8;

    // Chain: Input -> Effects -> Volume -> Analyser -> Master
    let lastNode: AudioNode = input;
    
    effectNodes.forEach(node => {
      lastNode.connect(node);
      lastNode = node;
    });
    
    lastNode.connect(volume);
    volume.connect(analyser);
    analyser.connect(masterInput);

    mixerEngine.returns.set(id, {
      input,
      effectNodes,
      volume,
      analyser,
    });

    // Add to state
    mixerEngine.state.returns.set(id, {
      ...returnConfig,
      id,
    });
  });
}

// Create effect nodes based on type
function createEffectNodes(
  ctx: AudioContext, 
  type: ReturnTrack['type'], 
  params: EffectParams
): AudioNode[] {
  const nodes: AudioNode[] = [];

  switch (type) {
    case 'reverb': {
      // Simple reverb using convolver would be better, but we'll use delay-based approach
      // Create a series of delays for reverb-like effect
      const delay1 = ctx.createDelay(5.0);
      delay1.delayTime.value = (params.preDelay || 20) / 1000;
      
      const feedback1 = ctx.createGain();
      feedback1.gain.value = Math.min(0.7, 1 - 1 / (params.decay || 2));
      
      const delay2 = ctx.createDelay(5.0);
      delay2.delayTime.value = ((params.preDelay || 20) + 50) / 1000;
      
      const feedback2 = ctx.createGain();
      feedback2.gain.value = Math.min(0.6, 1 - 1 / (params.decay || 2));

      nodes.push(delay1, feedback1, delay2, feedback2);
      break;
    }
    
    case 'delay': {
      const delay = ctx.createDelay(2.0);
      delay.delayTime.value = (params.time || 250) / 1000;
      
      const feedback = ctx.createGain();
      feedback.gain.value = params.feedback || 0.3;
      
      const wetMix = ctx.createGain();
      wetMix.gain.value = params.mix || 0.4;

      // Feedback loop: Delay -> Feedback -> Delay
      delay.connect(feedback);
      feedback.connect(delay);
      
      nodes.push(delay, wetMix);
      break;
    }
    
    case 'chorus': {
      // Simple chorus using LFO-modulated delay
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = params.rate || 1.5;
      
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = (params.depth || 0.5) * 0.01; // 0-10ms modulation
      
      const delay = ctx.createDelay(0.1);
      delay.delayTime.value = 0.02; // 20ms base delay
      
      lfo.connect(lfoGain);
      lfoGain.connect(delay.delayTime);
      lfo.start();
      
      nodes.push(delay);
      break;
    }
    
    case 'distortion': {
      const waveshaper = ctx.createWaveShaper();
      (waveshaper as any).curve = createDistortionCurve(params.drive || 0.3);
      waveshaper.oversample = '4x';
      
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 200 + (params.tone || 0.5) * 8000; // 200Hz to 8.2kHz
      
      const makeupGain = ctx.createGain();
      makeupGain.gain.value = 1 / (1 + (params.drive || 0.3));
      
      nodes.push(waveshaper, tone, makeupGain);
      break;
    }
  }

  return nodes;
}

// Create distortion curve
function createDistortionCurve(amount: number): Float32Array {
  const samples = 44100;
  const curve = new Float32Array(samples);
  const deg = Math.PI / 180;
  
  for (let i = 0; i < samples; i++) {
    const x = (i / samples) * 2 - 1;
    curve[i] = (3 + amount) * x * 20 * deg / (Math.PI + amount * Math.abs(x));
  }
  
  // Cast to expected type for WaveShaperNode
  return curve as Float32Array;
}

// Initialize track nodes for drum pads
function initTrackNodes() {
  if (!mixerEngine.ctx || !mixerEngine.master) return;

  const ctx = mixerEngine.ctx;

  DRUM_PADS.forEach(pad => {
    const id = pad.id;

    // Input gain (pre-fader)
    const inputGain = ctx.createGain();
    inputGain.gain.value = 1.0;

    // Panner
    const panner = ctx.createStereoPanner();
    panner.pan.value = 0;

    // Volume (fader)
    const volume = ctx.createGain();
    volume.gain.value = 0.8;

    // Analyser for VU meter
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.8;

    // Send gains for each return track
    const sendGains = new Map<string, GainNode>();
    mixerEngine.returns.forEach((_, returnId) => {
      const sendGain = ctx.createGain();
      sendGain.gain.value = 0.0; // Start with no send
      
      const returnTrack = mixerEngine.returns.get(returnId);
      if (returnTrack) {
        sendGain.connect(returnTrack.input);
      }
      
      sendGains.set(returnId, sendGain);
    });

    // Chain: InputGain -> Panner -> Volume -> Analyser -> Master
    inputGain.connect(panner);
    panner.connect(volume);
    volume.connect(analyser);
    
    // Connect track output to master input
    let connectedToMaster = false;
    if (mixerEngine.master) {
      analyser.connect(mixerEngine.master.input);
      connectedToMaster = true;
    }
    
    // Connect sends (post-fader)
    sendGains.forEach(sendGain => {
      volume.connect(sendGain);
    });

    // Store nodes
    mixerEngine.tracks.set(id, {
      inputGain,
      panner,
      volume,
      analyser,
      sendGains,
      outputConnected: connectedToMaster,
    });
    
    console.log(`Track ${id} connected to master: ${connectedToMaster}`);

    // Initialize state
    mixerEngine.state.tracks.set(id, {
      id,
      name: pad.name,
      volume: 0.8,
      pan: 0,
      muted: false,
      soloed: false,
      inputGain: 1.0,
      sends: new Map(),
      vuMeter: { peak: 0, rms: 0, peakHold: 0, clipping: false },
    });
  });
}

// Get input node for a track (for connecting drum samples)
export function getTrackInputNode(trackId: string): GainNode | null {
  const track = mixerEngine.tracks.get(trackId);
  return track?.inputGain || null;
}

// Update track volume
export function setTrackVolume(trackId: string, volume: number): void {
  const track = mixerEngine.tracks.get(trackId);
  const state = mixerEngine.state.tracks.get(trackId);
  
  if (!track || !state || !mixerEngine.ctx) return;

  // Apply mute/solo logic
  const effectiveVolume = calculateEffectiveVolume(trackId, volume);
  
  // Smooth transition
  const now = mixerEngine.ctx.currentTime;
  track.volume.gain.setTargetAtTime(effectiveVolume, now, 0.01);
  
  state.volume = volume;
}

// Calculate effective volume considering mute and solo
function calculateEffectiveVolume(trackId: string, baseVolume: number): number {
  const state = mixerEngine.state.tracks.get(trackId);
  if (!state) return 0;

  // If track is muted, output 0
  if (state.muted) return 0;

  // If solo is active globally
  if (mixerEngine.state.soloActive) {
    // Only soloed tracks play
    return state.soloed ? baseVolume : 0;
  }

  return baseVolume;
}

// Update track pan
export function setTrackPan(trackId: string, pan: number): void {
  const track = mixerEngine.tracks.get(trackId);
  const state = mixerEngine.state.tracks.get(trackId);
  
  if (!track || !state || !mixerEngine.ctx) return;

  track.panner.pan.setTargetAtTime(pan, mixerEngine.ctx.currentTime, 0.01);
  state.pan = pan;
}

// Update track input gain
export function setTrackInputGain(trackId: string, gain: number): void {
  const track = mixerEngine.tracks.get(trackId);
  const state = mixerEngine.state.tracks.get(trackId);
  
  if (!track || !state || !mixerEngine.ctx) return;

  track.inputGain.gain.setTargetAtTime(gain, mixerEngine.ctx.currentTime, 0.01);
  state.inputGain = gain;
}

// Toggle track mute
export function toggleTrackMute(trackId: string): boolean {
  const state = mixerEngine.state.tracks.get(trackId);
  if (!state) return false;

  state.muted = !state.muted;
  
  // Recalculate volume
  setTrackVolume(trackId, state.volume);
  
  return state.muted;
}

// Toggle track solo (Ableton-style: exclusive solo)
export function toggleTrackSolo(trackId: string): boolean {
  const state = mixerEngine.state.tracks.get(trackId);
  if (!state) return false;

  state.soloed = !state.soloed;
  
  // Update solo active flag
  mixerEngine.state.soloActive = Array.from(mixerEngine.state.tracks.values())
    .some(t => t.soloed);

  // Recalculate all track volumes
  mixerEngine.state.tracks.forEach((t, id) => {
    setTrackVolume(id, t.volume);
  });

  return state.soloed;
}

// Update send level
export function setSendLevel(trackId: string, returnId: string, level: number): void {
  const track = mixerEngine.tracks.get(trackId);
  const state = mixerEngine.state.tracks.get(trackId);
  
  if (!track || !state || !mixerEngine.ctx) return;

  const sendGain = track.sendGains.get(returnId);
  if (sendGain) {
    sendGain.gain.setTargetAtTime(level, mixerEngine.ctx.currentTime, 0.01);
    state.sends.set(returnId, level);
  }
}

// Update return track volume
export function setReturnVolume(returnId: string, volume: number): void {
  const returnTrack = mixerEngine.returns.get(returnId);
  const state = mixerEngine.state.returns.get(returnId);
  
  if (!returnTrack || !state || !mixerEngine.ctx) return;

  returnTrack.volume.gain.setTargetAtTime(volume, mixerEngine.ctx.currentTime, 0.01);
  state.volume = volume;
}

// Toggle return track mute
export function toggleReturnMute(returnId: string): boolean {
  const returnTrack = mixerEngine.returns.get(returnId);
  const state = mixerEngine.state.returns.get(returnId);
  
  if (!returnTrack || !state || !mixerEngine.ctx) return false;

  state.muted = !state.muted;
  returnTrack.volume.gain.setTargetAtTime(
    state.muted ? 0 : state.volume,
    mixerEngine.ctx.currentTime,
    0.01
  );
  
  return state.muted;
}

// Update master volume
export function setMasterVolume(volume: number): void {
  if (!mixerEngine.master || !mixerEngine.ctx) return;

  mixerEngine.master.volume.gain.setTargetAtTime(
    volume,
    mixerEngine.ctx.currentTime,
    0.01
  );
  mixerEngine.state.master.volume = volume;
}

// Update master EQ
export function setMasterEQ(low: number, mid: number, high: number, midFreq?: number): void {
  if (!mixerEngine.master || !mixerEngine.ctx) return;

  const now = mixerEngine.ctx.currentTime;
  
  mixerEngine.master.eqLow.gain.setTargetAtTime(low, now, 0.01);
  mixerEngine.master.eqMid.gain.setTargetAtTime(mid, now, 0.01);
  mixerEngine.master.eqHigh.gain.setTargetAtTime(high, now, 0.01);
  
  if (midFreq !== undefined) {
    mixerEngine.master.eqMid.frequency.setTargetAtTime(midFreq, now, 0.01);
  }

  mixerEngine.state.master.eq.lowGain = low;
  mixerEngine.state.master.eq.midGain = mid;
  mixerEngine.state.master.eq.highGain = high;
  if (midFreq !== undefined) {
    mixerEngine.state.master.eq.midFreq = midFreq;
  }
}

// Update master compressor
export function setMasterCompressor(
  threshold: number,
  ratio: number,
  attack: number,
  release: number,
  enabled: boolean
): void {
  if (!mixerEngine.master || !mixerEngine.ctx) return;

  const now = mixerEngine.ctx.currentTime;
  const comp = mixerEngine.master.compressor;

  if (enabled) {
    comp.threshold.setTargetAtTime(threshold, now, 0.01);
    comp.ratio.setTargetAtTime(ratio, now, 0.01);
    comp.attack.setTargetAtTime(attack / 1000, now, 0.01); // Convert ms to seconds
    comp.release.setTargetAtTime(release / 1000, now, 0.01);
  }

  // Bypass compressor by connecting around it if disabled
  // (simplified - would need more complex routing for true bypass)
  
  mixerEngine.state.master.compressor = {
    ...mixerEngine.state.master.compressor,
    threshold,
    ratio,
    attack,
    release,
    enabled,
  };
}

// Get current mixer state
export function getMixerState(): MixerState {
  return {
    tracks: new Map(mixerEngine.state.tracks),
    returns: new Map(mixerEngine.state.returns),
    master: { ...mixerEngine.state.master },
    soloActive: mixerEngine.state.soloActive,
  };
}

// Start VU meter updates
function startVUMeterUpdates() {
  const update = () => {
    updateVUMeters();
    mixerEngine.animationFrame = requestAnimationFrame(update);
  };
  
  mixerEngine.animationFrame = requestAnimationFrame(update);
}

// Update all VU meters
function updateVUMeters() {
  // Update track VU meters
  mixerEngine.tracks.forEach((track, id) => {
    const state = mixerEngine.state.tracks.get(id);
    if (state) {
      state.vuMeter = analyseAudioLevel(track.analyser);
    }
  });

  // Update return VU meters
  mixerEngine.returns.forEach((returnTrack, id) => {
    const state = mixerEngine.state.returns.get(id);
    if (state) {
      state.vuMeter = analyseAudioLevel(returnTrack.analyser);
    }
  });

  // Update master VU meter
  if (mixerEngine.master) {
    mixerEngine.state.master.vuMeter = analyseAudioLevel(mixerEngine.master.analyser);
  }
}

// Analyse audio level from analyser node
function analyseAudioLevel(analyser: AnalyserNode): VUMeterData {
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(dataArray);

  let peak = 0;
  let sum = 0;
  
  for (let i = 0; i < dataArray.length; i++) {
    const value = (dataArray[i] - 128) / 128.0; // Convert to -1 to 1
    const abs = Math.abs(value);
    
    if (abs > peak) peak = abs;
    sum += abs * abs;
  }

  const rms = Math.sqrt(sum / dataArray.length);
  
  return {
    peak,
    rms,
    peakHold: peak, // Could implement peak hold logic
    clipping: peak > 0.95,
  };
}

// Get VU meter data for a specific track
export function getTrackVUMeter(trackId: string): VUMeterData | null {
  return mixerEngine.state.tracks.get(trackId)?.vuMeter || null;
}

// Get VU meter data for a return track
export function getReturnVUMeter(returnId: string): VUMeterData | null {
  return mixerEngine.state.returns.get(returnId)?.vuMeter || null;
}

// Get master VU meter data
export function getMasterVUMeter(): VUMeterData | null {
  return mixerEngine.state.master.vuMeter;
}

// Check if mixer is initialized
export function isMixerInitialized(): boolean {
  return mixerEngine.isInitialized;
}

// Cleanup mixer engine
export function cleanupMixerEngine(): void {
  if (mixerEngine.animationFrame) {
    cancelAnimationFrame(mixerEngine.animationFrame);
  }

  // Disconnect all nodes
  mixerEngine.tracks.forEach(track => {
    track.inputGain.disconnect();
    track.panner.disconnect();
    track.volume.disconnect();
    track.analyser.disconnect();
    track.sendGains.forEach(send => send.disconnect());
  });

  mixerEngine.returns.forEach(returnTrack => {
    returnTrack.input.disconnect();
    returnTrack.effectNodes.forEach(node => {
      if ('disconnect' in node) {
        (node as AudioNode).disconnect();
      }
    });
    returnTrack.volume.disconnect();
    returnTrack.analyser.disconnect();
  });

  if (mixerEngine.master) {
    mixerEngine.master.input.disconnect();
    mixerEngine.master.eqLow.disconnect();
    mixerEngine.master.eqMid.disconnect();
    mixerEngine.master.eqHigh.disconnect();
    mixerEngine.master.compressor.disconnect();
    mixerEngine.master.limiter.disconnect();
    mixerEngine.master.volume.disconnect();
    mixerEngine.master.analyser.disconnect();
  }

  mixerEngine = {
    ctx: null,
    destination: null,
    tracks: new Map(),
    returns: new Map(),
    master: null,
    state: {
      tracks: new Map(),
      returns: new Map(),
      master: { ...DEFAULT_MASTER_BUS },
      soloActive: false,
    },
    isInitialized: false,
    animationFrame: null,
  };
}
