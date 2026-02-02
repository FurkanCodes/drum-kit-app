// Ultra-low latency AudioWorklet processor
// This runs on a dedicated audio thread for minimal latency

class DrumProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.voices = new Map();
    this.nextVoiceId = 0;
    this.port.onmessage = this.handleMessage.bind(this);
  }

  handleMessage(event) {
    const { type, voiceId, buffer, velocity } = event.data;
    
    if (type === 'trigger') {
      // Store the voice data
      this.voices.set(voiceId, {
        buffer: buffer,
        position: 0,
        velocity: velocity || 1.0,
        active: true,
      });
    } else if (type === 'stop') {
      const voice = this.voices.get(voiceId);
      if (voice) {
        voice.active = false;
        this.voices.delete(voiceId);
      }
    }
  }

  process(inputs, outputs, _parameters) {
    const output = outputs[0];
    const outputChannel = output[0];
    const blockSize = outputChannel.length;
    
    // Clear output buffer
    for (let i = 0; i < blockSize; i++) {
      outputChannel[i] = 0;
    }
    
    // Mix all active voices
    for (const [voiceId, voice] of this.voices) {
      if (!voice.active || !voice.buffer) continue;
      
      const voiceBuffer = voice.buffer;
      const voiceLength = voiceBuffer.length;
      const velocity = voice.velocity;
      
      for (let i = 0; i < blockSize; i++) {
        if (voice.position < voiceLength) {
          outputChannel[i] += voiceBuffer[voice.position] * velocity;
          voice.position++;
        } else {
          voice.active = false;
          this.voices.delete(voiceId);
          break;
        }
      }
    }
    
    return true;
  }
}

registerProcessor('drum-processor', DrumProcessor);
