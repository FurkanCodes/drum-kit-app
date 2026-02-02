// Ultra-low latency drum synthesis engine
// Generates drum sounds using Web Audio API oscillators and noise buffers

export interface DrumSynth {
  trigger(time: number, velocity?: number, open?: boolean): void;
  setOutput(destination: AudioNode): void;
}

export class KickSynth implements DrumSynth {
  private ctx: AudioContext;
  private output: AudioNode | null = null;
  
  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }
  
  setOutput(destination: AudioNode) {
    this.output = destination;
  }
  
  trigger(time: number, velocity: number = 1.0) {
    if (!this.output) return;
    
    const t = time || this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.5);
    
    gain.gain.setValueAtTime(velocity, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
    
    osc.connect(gain);
    gain.connect(this.output);
    
    osc.start(t);
    osc.stop(t + 0.5);
    
    // Auto-cleanup
    setTimeout(() => {
      osc.disconnect();
      gain.disconnect();
    }, 600);
  }
}

export class SnareSynth implements DrumSynth {
  private ctx: AudioContext;
  private output: AudioNode | null = null;
  private noiseBuffer: AudioBuffer;
  
  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.noiseBuffer = this.createNoiseBuffer();
  }
  
  private createNoiseBuffer(): AudioBuffer {
    const bufferSize = this.ctx.sampleRate * 2; // 2 seconds of noise
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    return buffer;
  }
  
  setOutput(destination: AudioNode) {
    this.output = destination;
  }
  
  trigger(time: number, velocity: number = 1.0) {
    if (!this.output) return;
    
    const t = time || this.ctx.currentTime;
    
    // Tone (oscillator)
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(250, t);
    
    oscGain.gain.setValueAtTime(velocity * 0.5, t);
    oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
    
    osc.connect(oscGain);
    oscGain.connect(this.output);
    
    // Noise
    const noise = this.ctx.createBufferSource();
    const noiseFilter = this.ctx.createBiquadFilter();
    const noiseGain = this.ctx.createGain();
    
    noise.buffer = this.noiseBuffer;
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.setValueAtTime(1000, t);
    
    noiseGain.gain.setValueAtTime(velocity, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
    
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.output);
    
    osc.start(t);
    noise.start(t);
    
    osc.stop(t + 0.2);
    noise.stop(t + 0.2);
    
    setTimeout(() => {
      osc.disconnect();
      oscGain.disconnect();
      noise.disconnect();
      noiseFilter.disconnect();
      noiseGain.disconnect();
    }, 300);
  }
}

export class HiHatSynth implements DrumSynth {
  private ctx: AudioContext;
  private output: AudioNode | null = null;
  private noiseBuffer: AudioBuffer;
  
  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.noiseBuffer = this.createNoiseBuffer();
  }
  
  private createNoiseBuffer(): AudioBuffer {
    const bufferSize = this.ctx.sampleRate * 1;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    return buffer;
  }
  
  setOutput(destination: AudioNode) {
    this.output = destination;
  }
  
  trigger(time: number, velocity: number = 1.0, open: boolean = false) {
    if (!this.output) return;
    
    const t = time || this.ctx.currentTime;
    const duration = open ? 0.4 : 0.05;
    
    const noise = this.ctx.createBufferSource();
    const bandpass = this.ctx.createBiquadFilter();
    const highpass = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    
    noise.buffer = this.noiseBuffer;
    
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(10000, t);
    bandpass.Q.setValueAtTime(1, t);
    
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(7000, t);
    
    gain.gain.setValueAtTime(velocity * 0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + duration);
    
    noise.connect(bandpass);
    bandpass.connect(highpass);
    highpass.connect(gain);
    gain.connect(this.output);
    
    noise.start(t);
    noise.stop(t + duration + 0.1);
    
    setTimeout(() => {
      noise.disconnect();
      bandpass.disconnect();
      highpass.disconnect();
      gain.disconnect();
    }, (duration + 0.2) * 1000);
  }
}

export class TomSynth implements DrumSynth {
  private ctx: AudioContext;
  private output: AudioNode | null = null;
  private frequency: number;
  
  constructor(ctx: AudioContext, frequency: number) {
    this.ctx = ctx;
    this.frequency = frequency;
  }
  
  setOutput(destination: AudioNode) {
    this.output = destination;
  }
  
  trigger(time: number, velocity: number = 1.0) {
    if (!this.output) return;
    
    const t = time || this.ctx.currentTime;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.frequency.setValueAtTime(this.frequency, t);
    osc.frequency.exponentialRampToValueAtTime(this.frequency * 0.5, t + 0.3);
    
    gain.gain.setValueAtTime(velocity, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
    
    osc.connect(gain);
    gain.connect(this.output);
    
    osc.start(t);
    osc.stop(t + 0.4);
    
    setTimeout(() => {
      osc.disconnect();
      gain.disconnect();
    }, 500);
  }
}

export class CrashSynth implements DrumSynth {
  private ctx: AudioContext;
  private output: AudioNode | null = null;
  private noiseBuffer: AudioBuffer;
  
  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.noiseBuffer = this.createNoiseBuffer();
  }
  
  private createNoiseBuffer(): AudioBuffer {
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    return buffer;
  }
  
  setOutput(destination: AudioNode) {
    this.output = destination;
  }
  
  trigger(time: number, velocity: number = 1.0) {
    if (!this.output) return;
    
    const t = time || this.ctx.currentTime;
    
    const noise = this.ctx.createBufferSource();
    const bandpass = this.ctx.createBiquadFilter();
    const highpass = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    
    noise.buffer = this.noiseBuffer;
    
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(8000, t);
    
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(3000, t);
    
    gain.gain.setValueAtTime(velocity, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 1.5);
    
    noise.connect(bandpass);
    bandpass.connect(highpass);
    highpass.connect(gain);
    gain.connect(this.output);
    
    noise.start(t);
    noise.stop(t + 1.6);
    
    setTimeout(() => {
      noise.disconnect();
      bandpass.disconnect();
      highpass.disconnect();
      gain.disconnect();
    }, 1700);
  }
}

export class ClapSynth implements DrumSynth {
  private ctx: AudioContext;
  private output: AudioNode | null = null;
  private noiseBuffer: AudioBuffer;
  
  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.noiseBuffer = this.createNoiseBuffer();
  }
  
  private createNoiseBuffer(): AudioBuffer {
    const bufferSize = this.ctx.sampleRate * 1;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    return buffer;
  }
  
  setOutput(destination: AudioNode) {
    this.output = destination;
  }
  
  trigger(time: number, velocity: number = 1.0) {
    if (!this.output) return;
    
    const t = time || this.ctx.currentTime;
    
    const noise = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    
    noise.buffer = this.noiseBuffer;
    
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, t);
    filter.Q.setValueAtTime(1, t);
    
    // Clap envelope - multiple bursts
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(velocity, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
    gain.gain.setValueAtTime(0, t + 0.03);
    gain.gain.linearRampToValueAtTime(velocity, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.output);
    
    noise.start(t);
    noise.stop(t + 0.2);
    
    setTimeout(() => {
      noise.disconnect();
      filter.disconnect();
      gain.disconnect();
    }, 300);
  }
}

export class RimSynth implements DrumSynth {
  private ctx: AudioContext;
  private output: AudioNode | null = null;
  
  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }
  
  setOutput(destination: AudioNode) {
    this.output = destination;
  }
  
  trigger(time: number, velocity: number = 1.0) {
    if (!this.output) return;
    
    const t = time || this.ctx.currentTime;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, t);
    
    gain.gain.setValueAtTime(velocity * 0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
    
    osc.connect(gain);
    gain.connect(this.output);
    
    osc.start(t);
    osc.stop(t + 0.1);
    
    setTimeout(() => {
      osc.disconnect();
      gain.disconnect();
    }, 200);
  }
}

export class CowbellSynth implements DrumSynth {
  private ctx: AudioContext;
  private output: AudioNode | null = null;
  
  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }
  
  setOutput(destination: AudioNode) {
    this.output = destination;
  }
  
  trigger(time: number, velocity: number = 1.0) {
    if (!this.output) return;
    
    const t = time || this.ctx.currentTime;
    
    // Two oscillators for metallic sound
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc1.type = 'square';
    osc1.frequency.setValueAtTime(800, t);
    
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(1066, t); // Perfect fourth above
    
    gain.gain.setValueAtTime(velocity * 0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
    
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.output);
    
    osc1.start(t);
    osc2.start(t);
    
    osc1.stop(t + 0.15);
    osc2.stop(t + 0.15);
    
    setTimeout(() => {
      osc1.disconnect();
      osc2.disconnect();
      gain.disconnect();
    }, 250);
  }
}

// Factory function to create the appropriate synth
export function createDrumSynth(
  ctx: AudioContext,
  type: string,
  frequency?: number
): DrumSynth {
  switch (type) {
    case 'kick':
      return new KickSynth(ctx);
    case 'snare':
      return new SnareSynth(ctx);
    case 'hihat':
      return new HiHatSynth(ctx);
    case 'tom':
      return new TomSynth(ctx, frequency || 200);
    case 'crash':
      return new CrashSynth(ctx);
    case 'clap':
      return new ClapSynth(ctx);
    case 'rim':
      return new RimSynth(ctx);
    case 'cowbell':
      return new CowbellSynth(ctx);
    default:
      return new KickSynth(ctx);
  }
}
