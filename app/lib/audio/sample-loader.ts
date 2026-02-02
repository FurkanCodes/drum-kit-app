// Sample loading utility for drum sounds
// Pre-loads and decodes all samples for instant playback

export interface SampleMap {
  [key: string]: AudioBuffer;
}

export class SampleLoader {
  private ctx: AudioContext;
  private samples: SampleMap = {};
  private isLoaded = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  // Load a single sample
  async loadSample(url: string, id: string): Promise<AudioBuffer | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      
      this.samples[id] = audioBuffer;
      return audioBuffer;
    } catch (error) {
      console.error(`Error loading sample ${url}:`, error);
      return null;
    }
  }

  // Load multiple samples at once
  async loadSamples(sampleUrls: { id: string; url: string }[]): Promise<void> {
    const loadPromises = sampleUrls.map(({ url, id }) => 
      this.loadSample(url, id)
    );

    await Promise.all(loadPromises);
    this.isLoaded = true;
  }

  // Get a loaded sample
  getSample(id: string): AudioBuffer | null {
    return this.samples[id] || null;
  }

  // Check if samples are loaded
  isReady(): boolean {
    return this.isLoaded;
  }

  // Get all loaded sample IDs
  getLoadedSampleIds(): string[] {
    return Object.keys(this.samples);
  }

  // Clear all samples
  clear(): void {
    this.samples = {};
    this.isLoaded = false;
  }
}

// Singleton instance for the app
let sampleLoader: SampleLoader | null = null;

export function getSampleLoader(ctx: AudioContext): SampleLoader {
  if (!sampleLoader) {
    sampleLoader = new SampleLoader(ctx);
  }
  return sampleLoader;
}

export function resetSampleLoader(): void {
  sampleLoader = null;
}
