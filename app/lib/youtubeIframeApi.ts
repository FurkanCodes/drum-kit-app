export type YouTubePlayerState =
  | -1 // unstarted
  | 0 // ended
  | 1 // playing
  | 2 // paused
  | 3 // buffering
  | 5; // video cued

export interface YouTubePlayer {
  cueVideoById: (opts: { videoId: string; startSeconds?: number }) => void;
  loadVideoById: (opts: { videoId: string; startSeconds?: number }) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  setVolume: (volume: number) => void;
  getVolume: () => number;
  isMuted: () => boolean;
  mute: () => void;
  unMute: () => void;
  getPlayerState: () => YouTubePlayerState;
  destroy: () => void;
}

export interface YouTubePlayerCtor {
  new (
    containerId: string | HTMLElement,
    options: {
      height?: string | number;
      width?: string | number;
      videoId?: string;
      host?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: { target: YouTubePlayer }) => void;
        onStateChange?: (event: { data: YouTubePlayerState; target: YouTubePlayer }) => void;
        onError?: (event: { data: number; target: YouTubePlayer }) => void;
      };
    }
  ): YouTubePlayer;
}

declare global {
  interface Window {
    YT?: {
      Player: YouTubePlayerCtor;
      PlayerState?: Record<string, number>;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let loadPromise: Promise<void> | null = null;

export function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('YT API can only load in browser'));
  if (window.YT?.Player) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-youtube-iframe-api="true"],script[src*="youtube.com/iframe_api"]'
    );
    if (existing) {
      // Another instance is loading it. Poll a bit.
      const start = performance.now();
      const poll = () => {
        if (window.YT?.Player) {
          resolve();
          return;
        }
        if (performance.now() - start > 10_000) {
          reject(new Error('Timed out loading YT IFrame API'));
          return;
        }
        setTimeout(poll, 50);
      };
      poll();
      return;
    }

    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      try {
        prev?.();
      } finally {
        resolve();
      }
    };

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.dataset.youtubeIframeApi = 'true';
    script.onerror = () => reject(new Error('Failed to load YT IFrame API'));
    document.head.appendChild(script);
  });

  return loadPromise;
}
