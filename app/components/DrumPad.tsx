'use client';

import React, { useRef, useImperativeHandle, forwardRef, useState, useEffect } from 'react';
import { DrumPad as DrumPadType } from '../lib/types/drum';

interface DrumPadProps {
  pad: DrumPadType;
  onTrigger: (padId: string, velocity: number) => void;
  isDesignMode?: boolean;
  onPositionChange?: (padId: string, x: number, y: number) => void;
  onKeyChange?: (padId: string, key: string) => void;
}

export interface DrumPadRef {
  triggerVisual: (velocity: number) => void;
}

const DrumPad = forwardRef<DrumPadRef, DrumPadProps>(({
  pad,
  onTrigger,
  isDesignMode = false,
  onPositionChange,
  onKeyChange
}, ref) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAssigningKey, setIsAssigningKey] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const padStartPos = useRef({ x: 0, y: 0 });

  useImperativeHandle(ref, () => ({
    triggerVisual: (velocity: number) => {
      const button = buttonRef.current;
      if (!button) return;

      // Reset animation if already playing
      button.classList.remove('animate-hihat', 'animate-wobble', 'animate-thump');
      void button.offsetWidth; // Force reflow

      // Determine animation based on type
      let animClass = 'animate-thump';
      if (pad.type === 'hihat') animClass = 'animate-hihat';
      else if (pad.type === 'crash') animClass = 'animate-wobble';

      // Apply 3D animation
      button.classList.add(animClass);

      // High-intensity visual feedback (glow & filter)
      button.style.filter = `brightness(${1.2 + (velocity * 0.4)}) drop-shadow(0 0 ${15 + velocity * 25}px ${pad.color}90)`;

      const glow = button.querySelector('.inner-glow') as HTMLElement;
      if (glow) {
        glow.style.opacity = '0.9';
        glow.style.transform = 'scale(1.2) translateZ(10px)';
      }

      setTimeout(() => {
        button.style.filter = '';
        if (glow) {
          glow.style.opacity = '0';
          glow.style.transform = 'scale(0.8) translateZ(0)';
        }
      }, 200);
    }
  }));

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isDesignMode) {
      if (e.button === 0) { // Left click for drag
        setIsDragging(true);
        dragStartPos.current = { x: e.clientX, y: e.clientY };
        padStartPos.current = { x: pad.x || 0, y: pad.y || 0 };
        buttonRef.current?.setPointerCapture(e.pointerId);
      }
      return;
    }

    // Trigger audio & visual
    const rect = buttonRef.current?.getBoundingClientRect();
    let velocity = 0.8;
    if (rect) {
      const y = e.clientY - rect.top;
      velocity = Math.max(0.2, Math.min(1.0, 1 - (y / rect.height)));
    }
    onTrigger(pad.id, velocity);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !isDesignMode || !onPositionChange) return;

    const dx = ((e.clientX - dragStartPos.current.x) / window.innerWidth) * 100;
    const dy = ((e.clientY - dragStartPos.current.y) / window.innerHeight) * 100;

    onPositionChange(pad.id, padStartPos.current.x + dx, padStartPos.current.y + dy);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      buttonRef.current?.releasePointerCapture(e.pointerId);
    }
  };

  useEffect(() => {
    if (!isAssigningKey || !onKeyChange) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      onKeyChange(pad.id, e.key.toLowerCase());
      setIsAssigningKey(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAssigningKey, pad.id, onKeyChange]);

  return (
    <div
      className={`absolute transition-all duration-150 select-none touch-manipulation group ${isDesignMode ? 'cursor-move ring-1 ring-amber-500/30 rounded-lg bg-amber-500/5' : ''}`}
      style={{
        width: pad.type === 'kick' ? '130px' : '100px',
        height: pad.type === 'kick' ? '130px' : '100px',
        left: pad.x !== undefined ? `${pad.x}%` : 'auto',
        top: pad.y !== undefined ? `${pad.y}%` : 'auto',
        transform: isDragging ? 'scale(1.05) rotate(1deg)' : 'none',
        zIndex: isDragging ? 100 : 1,
        perspective: '1200px',
        transformStyle: 'preserve-3d',
      }}
    >
      {/* Floor Shadow */}
      <div
        className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-[80%] h-4 bg-black/40 blur-xl rounded-full scale-y-[0.3] opacity-60 pointer-events-none transition-transform duration-100 group-active:scale-x-110"
      />

      <button
        ref={buttonRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`w-full h-full relative flex flex-col items-center justify-center transition-all duration-100 select-none active:scale-[0.98] outline-none`}
        style={{
          transformStyle: 'preserve-3d',
        }}
      >
        {/* Stage Light Projection (Hit Glow) */}
        <div
          className="inner-glow absolute -inset-8 opacity-0 transition-all duration-300 pointer-events-none rounded-full blur-2xl"
          style={{
            background: `radial-gradient(circle at center, ${pad.color}30 0%, transparent 60%)`,
            mixBlendMode: 'screen',
          }}
        />

        {/* Realistic Drum / Cymbal Image */}
        {pad.image ? (
          <div className="relative w-full h-full p-2 flex items-center justify-center">
            <img
              src={pad.image}
              alt={pad.name}
              className="w-full h-full object-contain filter drop-shadow-[0_10px_10px_rgba(0,0,0,0.6)] brightness-[0.85] contrast-[1.1] group-hover:brightness-100 transition-all pointer-events-none"
            />
            {/* Specular Highlight Overlay */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent pointer-events-none mix-blend-overlay rounded-full" />
          </div>
        ) : (
          <div className="w-full h-full rounded-full border-[6px] border-zinc-900 bg-gradient-to-br from-zinc-800 to-zinc-950 shadow-2xl group-hover:from-zinc-700 transition-all" />
        )}

        {/* Professional Label */}
        <div className="absolute -bottom-8 flex flex-col items-center pointer-events-none transition-all duration-200 group-hover:-bottom-9">
          <span className="text-zinc-500 font-black text-[7px] uppercase tracking-[0.3em] mb-1">{pad.name}</span>
          <div
            className="px-2 py-0.5 rounded-sm bg-zinc-950 border border-white/5 text-[10px] font-mono font-black"
            style={{ color: pad.color, boxShadow: `0 0 10px ${pad.color}20` }}
          >
            {pad.key.toUpperCase()}
          </div>
        </div>
      </button>

      {/* Design Mode Overlays */}
      {isDesignMode && (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex items-center justify-center pointer-events-none">
          <div
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setIsAssigningKey(true);
            }}
            role="button"
            tabIndex={0}
            className="pointer-events-auto z-50 bg-amber-500 text-black text-[7px] font-black px-2 py-1 rounded shadow-xl transform hover:scale-105 active:scale-95 transition-all uppercase tracking-widest cursor-pointer border border-amber-400"
          >
            {isAssigningKey ? 'READY_FOR_KEY' : 'CONFIG_MAP'}
          </div>
        </div>
      )}
    </div>
  );
});

DrumPad.displayName = 'DrumPad';

export default DrumPad;
