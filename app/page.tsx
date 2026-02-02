'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import DrumPad, { DrumPadRef } from './components/DrumPad';
import LatencyMonitor from './components/LatencyMonitor';
import { useAudioEngine } from './hooks/useAudioEngine';
import { DRUM_PADS, DrumPad as DrumPadType } from './lib/types/drum';
import type { AudioConfig } from './lib/types/drum';

export default function Home() {
  const {
    isReady,
    isInitializing,
    latencyMetrics,
    config,
    sampleStatus,
    trigger,
    init,
    updateConfig,
    setVolume,
  } = useAudioEngine();

  // Refs to pad components for direct keyboard access
  const padsRef = useRef<Map<string, DrumPadRef>>(new Map());
  const audioInitializedRef = useRef(false);

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

  const handlePreTriggerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const preTriggerOffset = parseInt(e.target.value);
    updateConfig({ preTriggerOffset });
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const volume = parseInt(e.target.value) / 100;
    setVolume(volume);
  };

  const [isDesignMode, setIsDesignMode] = useState(false);
  const [customPads, setCustomPads] = useState<DrumPadType[]>(DRUM_PADS);

  // Persistence for custom layout
  useEffect(() => {
    const saved = localStorage.getItem('drum_studio_layout');
    if (saved) {
      try {
        setCustomPads(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load layout', e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('drum_studio_layout', JSON.stringify(customPads));
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
      {/* Cinematic Background */}
      <div className="mesh-background" />

      <div className="max-w-7xl mx-auto w-full px-4 py-6 md:py-8 lg:py-12 relative z-10 flex-grow">
        {/* Compact Header */}
        <header className="mb-8 flex items-center justify-between border-b border-white/5 pb-4">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-black tracking-tighter bg-gradient-to-b from-white to-zinc-500 bg-clip-text text-transparent">
              DRUM<span className="text-orange-500">_</span>STUDIO
            </h1>
            <div className="h-4 w-[1px] bg-zinc-800" />

            {/* Design Mode Toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsDesignMode(!isDesignMode);
              }}
              className={`flex items-center gap-2 px-3 py-1 rounded-full border transition-all text-[9px] font-bold uppercase tracking-tight ${isDesignMode ? 'bg-orange-500 border-orange-400 text-white' : 'bg-transparent border-white/10 text-zinc-500 hover:border-white/20'}`}
            >
              {isDesignMode ? 'DESIGN_MODE_ON' : 'DESIGN_MODE_OFF'}
            </button>
          </div>

          <div className="hidden md:flex items-center gap-6">
            <div className="flex flex-col items-end">
              <span className="text-[8px] text-zinc-500 uppercase font-bold tracking-widest">Buffer</span>
              <span className="text-xs font-mono text-orange-500">{config.bufferSize}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[8px] text-zinc-500 uppercase font-bold tracking-widest">Rate</span>
              <span className="text-xs font-mono text-blue-500">{config.sampleRate}Hz</span>
            </div>
          </div>
        </header>

        {/* Main Rack Interface */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">

          {/* Main Controls & Monitor Strip */}
          <aside className="lg:col-span-1 space-y-4">
            <div className="glass-panel p-1">
              <LatencyMonitor
                avg={latencyMetrics.avg}
                min={latencyMetrics.min}
                max={latencyMetrics.max}
                count={latencyMetrics.count}
              />
            </div>

            <div className="glass-panel p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Settings</h3>
                <div className="h-[1px] flex-grow ml-3 bg-zinc-800" />
              </div>

              {/* Condensed Controls */}
              <div className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between">
                    <label className="text-[8px] text-zinc-500 uppercase font-bold">Latency</label>
                    <span className="text-[9px] font-mono text-orange-500">{(latencyMetrics.avg || 0).toFixed(1)}ms</span>
                  </div>
                  <select
                    value={config.bufferSize}
                    onChange={handleBufferSizeChange}
                    className="w-full bg-zinc-950/80 border border-white/5 rounded px-2 py-1.5 text-[10px] text-white focus:outline-none focus:border-orange-500/50 appearance-none transition-colors"
                  >
                    <option value={128}>128 (FAST)</option>
                    <option value={256}>256 (STD)</option>
                    <option value={512}>512 (SAFE)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between">
                    <label className="text-[8px] text-zinc-500 uppercase font-bold">Polyphony</label>
                    <span className="text-[9px] font-mono text-zinc-300">{config.maxVoices}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="32"
                    value={config.maxVoices}
                    onChange={handleMaxVoicesChange}
                    className="w-full h-1"
                  />
                </div>

                <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
                  <div className="flex justify-between items-center">
                    <label className="text-[8px] text-zinc-500 uppercase font-bold">Volume</label>
                    <span className="text-[9px] font-mono text-orange-500">{(config.volume ? config.volume * 100 : 80).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    defaultValue="80"
                    onChange={handleVolumeChange}
                    className="w-full h-1"
                  />
                </div>
              </div>
            </div>

            {!isReady && !isInitializing && (
              <button
                className="w-full glass-panel py-3 px-4 border-orange-500/20 hover:border-orange-500/40 transition-colors text-orange-400 text-[10px] font-bold uppercase tracking-widest animate-pulse"
                onClick={handleFirstInteraction}
              >
                Engage Engine
              </button>
            )}

            {isDesignMode && (
              <div className="glass-panel p-4 border-orange-500/20 bg-orange-500/5">
                <p className="text-[9px] text-orange-400 font-bold uppercase tracking-widest mb-2">Editor Info</p>
                <ul className="text-[8px] text-zinc-500 space-y-1">
                  <li>• Drag drums to reposition</li>
                  <li>• Click 'REBIND' to assign keys</li>
                  <li>• Layout persists automatically</li>
                </ul>
              </div>
            )}
          </aside>

          {/* Studio Scene Section */}
          <section className="lg:col-span-3">
            <div className="glass-panel h-[500px] relative overflow-hidden bg-zinc-950/40 border border-white/5 shadow-inner">
              {/* Perspective Grid Background */}
              <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

              {/* The Scene */}
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
            </div>

            {/* User Message */}
            <div className="mt-4 flex justify-between items-center opacity-30 px-2">
              <span className="text-[8px] text-zinc-500 font-mono uppercase tracking-[0.2em]">Live_Studio_Session // v2.1.0_PRO</span>
              {!isReady && (
                <span className="text-[9px] text-orange-400 font-bold uppercase tracking-widest animate-pulse">Click Scene to Engage Engine</span>
              )}
            </div>
          </section>

        </div>
      </div>
    </main>
  );
}
