'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import DrumPad, { DrumPadRef } from './components/DrumPad';
import JamAlong, { type JamAlongRef } from './components/JamAlong';
import LatencyMonitor from './components/LatencyMonitor';
import { useAudioEngine } from './hooks/useAudioEngine';
import { useMixer } from './hooks/useMixer';
import { DRUM_PADS, DrumPad as DrumPadType } from './lib/types/drum';
import type { AudioConfig } from './lib/types/drum';

const SponsoredRack = dynamic(() => import('./components/SponsoredRack'), {
  ssr: false,
  loading: () => (
    <div className="rack-panel p-4 flex flex-col gap-3 min-h-[150px]">
      <div className="flex items-center justify-between border-b border-white/5 pb-2">
        <div className="flex flex-col">
          <span className="text-[7px] text-zinc-600 font-black tracking-[0.4em] uppercase">Featured</span>
          <h3 className="text-zinc-400 text-[9px] font-black tracking-widest uppercase">GEAR_MODULE_AD</h3>
        </div>
        <div className="flex gap-1">
          <div className="w-1 h-1 rounded-full bg-amber-500/50" />
          <div className="w-1 h-1 rounded-full bg-zinc-800" />
        </div>
      </div>

      <div className="flex-grow flex items-center justify-center bg-zinc-950/40 border border-white/5 rounded-sm relative overflow-hidden group">
        <div className="text-[7px] text-zinc-700 font-mono tracking-widest">LOADING AD...</div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-amber-500/[0.01] to-transparent pointer-events-none group-hover:via-amber-500/[0.03] transition-all" />
      </div>

      <div className="flex justify-between items-center px-1">
        <span className="text-[6px] text-zinc-700 font-mono">ID: GEAR_M1_PRO</span>
        <div className="flex gap-0.5">
          <div className="w-2 h-0.5 bg-zinc-800" />
          <div className="w-2 h-0.5 bg-zinc-800" />
        </div>
      </div>
    </div>
  ),
});

export default function Home() {
  const {
    isReady,
    isInitializing,
    latencyMetrics,
    config,
    audioContext,
    audioDestination,
    trigger,
    init,
    updateConfig,
  } = useAudioEngine();

  const mixer = useMixer(audioContext, audioDestination);
  const { isReady: isMixerReady, setMasterVolume } = mixer;

  // Refs to pad components for direct keyboard access
  const padsRef = useRef<Map<string, DrumPadRef>>(new Map());
  const audioInitializedRef = useRef(false);
  const jamRef = useRef<JamAlongRef | null>(null);

  // Initialize audio on first user interaction
  const handleFirstInteraction = useCallback(async () => {
    if (!audioInitializedRef.current) {
      audioInitializedRef.current = true;
      await init();
    }
  }, [init]);



  // Set up pad refs
  const setPadRef = useCallback((id: string, ref: DrumPadRef | null) => {
    if (ref) {
      padsRef.current.set(id, ref);
    }
  }, []);

  // Handle config changes
  const handleBufferSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const bufferSize = parseInt(e.target.value) as AudioConfig['bufferSize'];
    updateConfig({ bufferSize });
  };

  const handleMaxVoicesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const maxVoices = parseInt(e.target.value);
    updateConfig({ maxVoices });
  };

  const [globalVolume, setGlobalVolume] = useState(85);

  // Apply master volume when mixer is ready, and keep it in sync
  useEffect(() => {
    if (!isMixerReady) return;
    setMasterVolume(Math.max(0, Math.min(1, globalVolume / 100)));
  }, [globalVolume, isMixerReady, setMasterVolume]);

  const [isDesignMode, setIsDesignMode] = useState(false);
  const [customPads, setCustomPads] = useState<DrumPadType[]>(DRUM_PADS);

  // Persistence for custom layout (client-only)
  useEffect(() => {
    const saved = localStorage.getItem('drum_studio_layout');
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as DrumPadType[];
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCustomPads(parsed);
    } catch (e) {
      console.error('Failed to load layout', e);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('drum_studio_layout', JSON.stringify(customPads));
    } catch {
      // ignore persistence errors (private mode, etc.)
    }
  }, [customPads]);

  const handlePositionChange = (padId: string, x: number, y: number) => {
    setCustomPads((prev: DrumPadType[]) => prev.map((p: DrumPadType) => p.id === padId ? { ...p, x: Math.max(0, Math.min(90, x)), y: Math.max(0, Math.min(85, y)) } : p));
  };

  const handleKeyChange = (padId: string, key: string) => {
    setCustomPads((prev: DrumPadType[]) => {
      // Check if key is already in use by another pad
      const isDuplicate = prev.some(p => p.id !== padId && p.key === key);
      if (isDuplicate) {
        // Optionally swap or alert. For now, let's just ignore to satisfy the user's "should not be able to"
        return prev;
      }
      return prev.map((p: DrumPadType) => p.id === padId ? { ...p, key } : p);
    });
  };

  // Consolidated custom trigger for keyboard and interactions
  const triggerCustom = useCallback((padId: string, velocity: number = 0.8) => {
    // Trigger audio
    trigger(padId, velocity);

    // Auto-duck YouTube on kick/snare (JamAlong decides whether ducking is enabled/ready)
    if (padId === 'kick' || padId === 'snare') {
      jamRef.current?.duck();
    }

    // Trigger visual feedback via ref
    const padRef = padsRef.current.get(padId);
    if (padRef) {
      padRef.triggerVisual(velocity);
    }
  }, [trigger]);

  // Update trigger to use custom keymaps
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isDesignMode || e.repeat) return;
      const pad = customPads.find(p => p.key === e.key.toLowerCase());
      if (pad) {
        e.preventDefault();
        triggerCustom(pad.id, 1.0);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [customPads, triggerCustom, isDesignMode]);

  return (
    <main
      className="min-h-screen text-white selection:bg-orange-500/30 overflow-x-hidden flex flex-col"
      onClick={handleFirstInteraction}
      onTouchStart={handleFirstInteraction}
    >
      {/* Studio Stage Background */}
      <div className="studio-stage" />

      <div className="max-w-7xl mx-auto w-full px-4 py-4 md:py-6 lg:py-8 relative z-10 flex-grow flex flex-col">
        {/* Professional Header */}
        <header className="mb-6 flex items-center justify-between border-b border-white/5 pb-4">
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <h1 className="text-xl font-black tracking-[0.2em] text-white leading-none">
                ACOUSTIC<span className="text-amber-500">_</span>STUDIO
              </h1>
              <span className="text-[7px] text-zinc-500 uppercase tracking-[0.4em] mt-1 font-bold">Professional Virtual Instrument</span>
            </div>

            <div className="h-6 w-[1px] bg-zinc-800" />

            {/* Design Mode Toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsDesignMode(!isDesignMode);
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded border transition-all text-[8px] font-bold uppercase tracking-widest ${isDesignMode ? 'bg-amber-500 border-amber-400 text-black' : 'bg-transparent border-white/10 text-zinc-500 hover:border-white/20'}`}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${isDesignMode ? 'bg-black animate-pulse' : 'bg-zinc-700'}`} />
              {isDesignMode ? 'EDITOR_ACTIVE' : 'EDITOR_OFFLINE'}
            </button>
          </div>

          <div className="hidden md:flex items-center gap-8">
            <div className="flex flex-col items-end">
              <span className="text-[7px] text-zinc-500 uppercase font-bold tracking-widest mb-0.5">Engine Stat</span>
              <span className="text-[10px] font-mono text-amber-500/80">{config.bufferSize} SMPL / {config.sampleRate}Hz</span>
            </div>
          </div>
        </header>

        {/* Main Interface Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch flex-grow">

          {/* Left Rack Sidebar */}
          <aside className="lg:col-span-3 space-y-4 flex flex-col">
            <div className="rack-panel p-2">
              <LatencyMonitor
                avg={latencyMetrics.avg}
                min={latencyMetrics.min}
                max={latencyMetrics.max}
                count={latencyMetrics.count}
              />
            </div>

            <div className="rack-panel p-5 space-y-6 flex-grow">
              <div className="flex items-center justify-between">
                <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400">Master_Console</h3>
                <div className="flex gap-1">
                  <div className="w-1 h-1 rounded-full bg-zinc-800" />
                  <div className="w-1 h-1 rounded-full bg-zinc-800" />
                </div>
              </div>

              {/* Console Groups */}
              <div className="space-y-6">
                <section className="space-y-3">
                  <header className="flex justify-between items-center border-b border-white/5 pb-1">
                    <label className="text-[7px] text-zinc-500 uppercase font-black tracking-widest">Audio_Engine</label>
                  </header>
                  <div className="relative">
                    <select
                      value={config.bufferSize}
                      onChange={handleBufferSizeChange}
                      className="w-full bg-zinc-950 border-x border-b border-white/10 rounded-sm px-2 py-2 text-[10px] text-amber-500/90 font-mono focus:outline-none focus:border-amber-500/50 appearance-none transition-colors"
                    >
                      <option value={128}>BUFFER: 128 (ULTRA-LOW)</option>
                      <option value={256}>BUFFER: 256 (OPTIMAL)</option>
                      <option value={512}>BUFFER: 512 (STABLE)</option>
                    </select>
                  </div>
                </section>

                <section className="space-y-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between">
                      <label className="text-[7px] text-zinc-500 uppercase font-black tracking-widest">Global_Volume</label>
                      <span className="text-[9px] font-mono text-amber-500">{globalVolume.toFixed(0)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={globalVolume}
                      onChange={(e) => setGlobalVolume(parseInt(e.target.value) || 0)}
                      className="w-full h-1.5"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between">
                      <label className="text-[7px] text-zinc-500 uppercase font-black tracking-widest">Polyphony</label>
                      <span className="text-[9px] font-mono text-amber-500">{config.maxVoices} VOX</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="32"
                      value={config.maxVoices}
                      onChange={handleMaxVoicesChange}
                      className="w-full h-1.5"
                    />
                  </div>
                </section>
              </div>

              {isDesignMode && (
                <div className="mt-8 p-3 rounded bg-amber-500/5 border border-amber-500/20">
                  <p className="text-[8px] text-amber-500 font-bold uppercase tracking-widest mb-2">Stage Editor</p>
                  <ul className="text-[7px] text-zinc-500 space-y-1.5 leading-relaxed">
                    <li>• CLICK & DRAG DRUMS TO POS</li>
                    <li>• REBIND KEYS FOR MAPPING</li>
                    <li>• AUTOSAVE TO LOCAL STORAGE</li>
                  </ul>
                </div>
              )}

              {!isReady && !isInitializing && (
                <button
                  className="w-full mt-auto rack-panel py-4 px-4 border-amber-500/20 hover:border-amber-500/40 transition-all text-amber-500 text-[9px] font-black uppercase tracking-[0.2em] animate-pulse group"
                  onClick={handleFirstInteraction}
                >
                  <span className="group-hover:scale-110 transition-transform inline-block">Initialize Engine</span>
                </button>
              )}
            </div>

            <JamAlong ref={jamRef} />

            {/* Sponsored Gear Module */}
            <SponsoredRack />
          </aside>

          {/* The Studio Stage */}
          <section className="lg:col-span-9 relative flex flex-col">
            <div className="rack-panel flex-grow relative overflow-hidden bg-black/40 border border-white/5 shadow-[inset_0_0_100px_rgba(0,0,0,0.8)]">
              {/* Studio Stage Lights */}
              <div className="absolute top-0 left-1/4 w-1/2 h-full bg-gradient-to-b from-amber-500/5 to-transparent pointer-events-none blur-3xl" />

              {/* Perspective Grid (More Subtle) */}
              <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
                style={{ backgroundImage: 'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

              <div className="absolute inset-0 p-8">
                {customPads.map((pad) => (
                  <DrumPad
                    key={pad.id}
                    pad={pad}
                    onTrigger={triggerCustom}
                    isDesignMode={isDesignMode}
                    onPositionChange={handlePositionChange}
                    onKeyChange={handleKeyChange}
                    ref={(ref) => setPadRef(pad.id, ref)}
                  />
                ))}
              </div>

              {/* Status Bar */}
              <div className="absolute bottom-4 right-6 pointer-events-none">
                <span className="text-[7px] text-zinc-600 font-black uppercase tracking-[0.4em]">Live_Acoustic_Stage // Signal_Flow_OK</span>
              </div>
            </div>
          </section>

        </div>
      </div>
    </main>
  );
}
