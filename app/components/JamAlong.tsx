'use client';

import Script from 'next/script';
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { parseYouTubeLink, type ParsedYouTubeLink } from '../lib/youtube';
import { loadYouTubeIframeApi, type YouTubePlayer } from '../lib/youtubeIframeApi';
import { setJamOutputGain } from '../lib/audio/engine';

const STORAGE_LINK = 'drum_studio_jam_youtube';
const STORAGE_MIX = 'drum_studio_jam_mix';

type JamMix = {
  youtubeVolume: number; // 0..100
  drumsBoostPercent: number; // 80..160 (UI clamp)
  duckEnabled: boolean;
  duckMode: 'kick_snare';
};

const DEFAULT_MIX: JamMix = {
  youtubeVolume: 70,
  drumsBoostPercent: 100,
  duckEnabled: true,
  duckMode: 'kick_snare',
};

const clampInt = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(n)));

export interface JamAlongRef {
  isReady: () => boolean;
  play: () => void;
  pause: () => void;
  setVolume: (volume: number) => void;
  duck: () => void;
}

function loadSavedLink(): ParsedYouTubeLink | null {
  try {
    const raw = localStorage.getItem(STORAGE_LINK);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ParsedYouTubeLink>;
    if (!parsed.videoId || typeof parsed.videoId !== 'string') return null;
    if (typeof parsed.startSeconds !== 'number') return { videoId: parsed.videoId, startSeconds: 0 };
    return { videoId: parsed.videoId, startSeconds: parsed.startSeconds };
  } catch {
    return null;
  }
}

function saveLink(link: ParsedYouTubeLink | null) {
  try {
    if (!link) {
      localStorage.removeItem(STORAGE_LINK);
      return;
    }
    localStorage.setItem(STORAGE_LINK, JSON.stringify(link));
  } catch {
    // ignore
  }
}

function loadSavedMix(): JamMix | null {
  try {
    const raw = localStorage.getItem(STORAGE_MIX);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<JamMix>;
    if (typeof parsed.youtubeVolume !== 'number') return null;
    return {
      youtubeVolume: clampInt(parsed.youtubeVolume, 0, 100),
      drumsBoostPercent: clampInt(parsed.drumsBoostPercent ?? DEFAULT_MIX.drumsBoostPercent, 80, 160),
      duckEnabled: Boolean(parsed.duckEnabled ?? DEFAULT_MIX.duckEnabled),
      duckMode: 'kick_snare',
    };
  } catch {
    return null;
  }
}

function saveMix(mix: JamMix) {
  try {
    localStorage.setItem(STORAGE_MIX, JSON.stringify(mix));
  } catch {
    // ignore
  }
}

const JamAlong = forwardRef<JamAlongRef>(function JamAlong(_props, ref) {
  const [collapsed, setCollapsed] = useState(false);
  const [input, setInput] = useState('');
  const [active, setActive] = useState<ParsedYouTubeLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mix, setMix] = useState<JamMix>(DEFAULT_MIX);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const reactId = useId();
  const containerId = useMemo(() => `yt-jam-player-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`, [reactId]);
  const playerRef = useRef<YouTubePlayer | null>(null);

  const baseVolumeRef = useRef<number>(DEFAULT_MIX.youtubeVolume);
  const lastAppliedVolumeRef = useRef<number | null>(null);
  const duckUntilMsRef = useRef<number>(0);
  const duckTimerRef = useRef<number | null>(null);

  const applyVolume = useCallback((volume: number) => {
    const player = playerRef.current;
    if (!player) return;

    const v = clampInt(volume, 0, 100);
    if (lastAppliedVolumeRef.current === v) return;
    lastAppliedVolumeRef.current = v;
    try {
      player.setVolume(v);
    } catch {
      // ignore
    }
  }, []);

  const restoreVolumeIfNeeded = useCallback(() => {
    if (!playerRef.current) return;
    applyVolume(baseVolumeRef.current);
  }, [applyVolume]);

  const duck = useCallback(() => {
    if (!mix.duckEnabled) return;
    if (!playerRef.current || !isPlayerReady) return;

    const duckMultiplier = 0.65;
    const restoreMs = 180;
    const now = performance.now();
    duckUntilMsRef.current = Math.max(duckUntilMsRef.current, now + restoreMs);

    const ducked = clampInt(baseVolumeRef.current * duckMultiplier, 0, 100);
    applyVolume(ducked);

    if (duckTimerRef.current) {
      window.clearTimeout(duckTimerRef.current);
    }

    duckTimerRef.current = window.setTimeout(() => {
      duckTimerRef.current = null;
      const remaining = duckUntilMsRef.current - performance.now();
      if (remaining > 0) {
        duckTimerRef.current = window.setTimeout(() => {
          duckTimerRef.current = null;
          restoreVolumeIfNeeded();
        }, remaining);
        return;
      }
      restoreVolumeIfNeeded();
    }, restoreMs);
  }, [applyVolume, isPlayerReady, mix.duckEnabled, restoreVolumeIfNeeded]);

  const play = useCallback(() => {
    const player = playerRef.current;
    if (!player || !isPlayerReady) return;
    try {
      player.playVideo();
    } catch {
      // ignore
    }
  }, [isPlayerReady]);

  const pause = useCallback(() => {
    const player = playerRef.current;
    if (!player || !isPlayerReady) return;
    try {
      player.pauseVideo();
    } catch {
      // ignore
    }
  }, [isPlayerReady]);

  useImperativeHandle(ref, () => ({
    isReady: () => Boolean(playerRef.current && isPlayerReady),
    play,
    pause,
    setVolume: (volume: number) => applyVolume(volume),
    duck,
  }), [applyVolume, duck, isPlayerReady, pause, play]);

  // Load saved state (client-only)
  useEffect(() => {
    const savedLink = loadSavedLink();
    const savedMix = loadSavedMix();

    if (savedLink) {
      setActive(savedLink);
    }

    if (savedMix) {
      setMix(savedMix);
      baseVolumeRef.current = savedMix.youtubeVolume;
    }
  }, []);

  // Persist mix settings
  useEffect(() => {
    saveMix(mix);
    baseVolumeRef.current = mix.youtubeVolume;
  }, [mix]);

  // Apply drums boost gain
  useEffect(() => {
    const multiplier = clampInt(mix.drumsBoostPercent, 80, 160) / 100;
    setJamOutputGain(multiplier);
  }, [mix.drumsBoostPercent]);

  // Apply volume changes (and respect duck state)
  useEffect(() => {
    if (!isPlayerReady) return;
    const now = performance.now();
    const ducked = now < duckUntilMsRef.current;
    if (!ducked) {
      applyVolume(mix.youtubeVolume);
      return;
    }
    // Keep whatever duck volume we last set; when duck ends, timer restores.
  }, [applyVolume, isPlayerReady, mix.youtubeVolume]);

  // Create YT player once API is available
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        await loadYouTubeIframeApi();
        if (cancelled) return;
        if (!window.YT?.Player) return;
        if (playerRef.current) return;

        const player = new window.YT.Player(containerId, {
          host: 'https://www.youtube-nocookie.com',
          height: 1,
          width: 1,
          playerVars: {
            controls: 0,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (e) => {
              if (cancelled) return;
              playerRef.current = e.target;
              setIsPlayerReady(true);
              applyVolume(baseVolumeRef.current);
              if (active) {
                try {
                  e.target.cueVideoById({ videoId: active.videoId, startSeconds: active.startSeconds });
                } catch {
                  // ignore
                }
              }
            },
            onStateChange: (e) => {
              if (cancelled) return;
              setIsPlaying(e.data === 1);
            },
            onError: () => {
              if (cancelled) return;
              setError('YouTube player error. Try another link.');
            },
          },
        });

        playerRef.current = player;
      } catch {
        if (cancelled) return;
        setError('Failed to load YouTube player.');
      }
    };

    init();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId]);

  // When active link changes, cue video
  useEffect(() => {
    if (!active) return;
    if (!playerRef.current || !isPlayerReady) return;

    try {
      playerRef.current.cueVideoById({ videoId: active.videoId, startSeconds: active.startSeconds });
    } catch {
      // ignore
    }
  }, [active, isPlayerReady]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (duckTimerRef.current) {
        window.clearTimeout(duckTimerRef.current);
        duckTimerRef.current = null;
      }
      try {
        playerRef.current?.destroy();
      } catch {
        // ignore
      }
      playerRef.current = null;
    };
  }, []);

  const handleLoad = useCallback(() => {
    const parsed = parseYouTubeLink(input);
    if (!parsed) {
      setError('Paste a valid YouTube link (or 11-char video id).');
      return;
    }

    setError(null);
    setActive(parsed);
    saveLink(parsed);

    // Default drums boost for jam mode if user hasn’t customized/persisted it.
    const savedMix = loadSavedMix();
    if (!savedMix) {
      setMix((prev) => ({ ...prev, youtubeVolume: 70, drumsBoostPercent: 115, duckEnabled: true }));
    }
  }, [input]);

  const handleClear = useCallback(() => {
    setError(null);
    setActive(null);
    saveLink(null);
    // Back to neutral drums gain when no jam link is active
    setMix((prev) => ({ ...prev, drumsBoostPercent: 100 }));
    setJamOutputGain(1);
  }, []);

  const canLoad = input.trim().length > 0;

  return (
    <div className="rack-panel p-5 space-y-4 relative">
      <Script id="youtube-iframe-api" src="https://www.youtube.com/iframe_api" strategy="afterInteractive" />

      {/* Hidden player mount (must not be display:none) */}
      <div
        id={containerId}
        className="absolute -left-[9999px] top-0 w-[1px] h-[1px] overflow-hidden opacity-0"
        aria-hidden="true"
      />

      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[7px] text-zinc-600 uppercase font-black tracking-[0.4em]">Jam</span>
          <h3 className="text-zinc-300 text-[10px] font-black tracking-widest uppercase">JAM_ALONG_DECK</h3>
        </div>

        <button
          type="button"
          onClick={() => setCollapsed(v => !v)}
          className="text-[7px] font-black uppercase tracking-widest px-2 py-1 rounded border border-white/10 text-zinc-500 hover:text-zinc-300 hover:border-white/20 transition-colors"
        >
          {collapsed ? 'OPEN' : 'HIDE'}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleLoad();
                }}
                placeholder="Paste YouTube link…"
                className="flex-1 bg-zinc-950 border border-white/10 rounded-sm px-3 py-2 text-[10px] text-zinc-200 font-mono focus:outline-none focus:border-amber-500/50 placeholder:text-zinc-700"
                spellCheck={false}
                inputMode="url"
              />

              <button
                type="button"
                onClick={handleLoad}
                disabled={!canLoad}
                className="px-3 py-2 rounded-sm text-[9px] font-black uppercase tracking-widest border transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/15 hover:border-amber-500/30"
              >
                Load
              </button>
            </div>

            {error && (
              <div className="text-[8px] text-red-400 font-bold tracking-widest uppercase">
                {error}
              </div>
            )}

            {active && (
              <div className="flex items-center justify-between">
                <div className="text-[7px] text-zinc-600 font-black tracking-[0.2em] uppercase">
                  VIDEO: <span className="text-amber-500/80">{active.videoId}</span>
                </div>
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-[7px] font-black uppercase tracking-widest px-2 py-1 rounded border border-white/10 text-zinc-500 hover:text-zinc-300 hover:border-white/20 transition-colors"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-zinc-950 border border-white/5 p-3 rounded-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[6px] text-zinc-600 uppercase font-black tracking-widest">YouTube_Vol</span>
                <span className="text-[9px] font-mono text-amber-500">{mix.youtubeVolume}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={mix.youtubeVolume}
                onChange={(e) => setMix((prev) => ({ ...prev, youtubeVolume: clampInt(parseInt(e.target.value) || 0, 0, 100) }))}
                className="w-full h-1.5"
              />
            </div>

            <div className="bg-zinc-950 border border-white/5 p-3 rounded-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[6px] text-zinc-600 uppercase font-black tracking-widest">Drums_Boost</span>
                <span className="text-[9px] font-mono text-amber-500">{mix.drumsBoostPercent}%</span>
              </div>
              <input
                type="range"
                min="80"
                max="160"
                value={mix.drumsBoostPercent}
                onChange={(e) => setMix((prev) => ({ ...prev, drumsBoostPercent: clampInt(parseInt(e.target.value) || 100, 80, 160) }))}
                className="w-full h-1.5"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => (isPlaying ? pause() : play())}
                disabled={!active || !isPlayerReady}
                className="px-3 py-2 rounded-sm text-[9px] font-black uppercase tracking-widest border transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-zinc-950 border-white/10 text-zinc-300 hover:border-white/20"
              >
                {isPlaying ? 'Pause' : 'Play'}
              </button>

              <button
                type="button"
                onClick={() => setMix((prev) => ({ ...prev, duckEnabled: !prev.duckEnabled }))}
                className={`px-3 py-2 rounded-sm text-[9px] font-black uppercase tracking-widest border transition-colors ${
                  mix.duckEnabled
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/15 hover:border-amber-500/30'
                    : 'bg-zinc-950 border-white/10 text-zinc-400 hover:border-white/20'
                }`}
              >
                DUCK {mix.duckEnabled ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="text-[7px] text-zinc-600 font-black tracking-[0.2em] uppercase">
              Auto-duck: kick+snare · {isPlayerReady ? 'YT_READY' : 'LOADING'}
            </div>
          </div>
        </>
      )}
    </div>
  );
});

export default JamAlong;
