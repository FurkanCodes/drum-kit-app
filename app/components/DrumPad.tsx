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
      className={`absolute transition-all duration-75 select-none touch-manipulation group ${isDesignMode ? 'cursor-move ring-2 ring-white/10 hover:ring-orange-500/50' : ''}`}
      style={{
        width: pad.type === 'kick' ? '120px' : '90px',
        height: pad.type === 'kick' ? '120px' : '90px',
        left: pad.x !== undefined ? `${pad.x}%` : 'auto',
        top: pad.y !== undefined ? `${pad.y}%` : 'auto',
        transform: isDragging ? 'scale(1.1) rotate(2deg)' : 'none',
        zIndex: isDragging ? 100 : 1,
        perspective: '1000px',
        transformStyle: 'preserve-3d',
      }}
    >
      <button
        ref={buttonRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`w-full h-full relative flex flex-col items-center justify-center transition-all duration-75 select-none transition-transform active:scale-95`}
        style={{
          transformStyle: 'preserve-3d',
        }}
      >
        {/* Realistic Image Layer */}
        {pad.image ? (
          <img
            src={pad.image}
            alt={pad.name}
            className="w-full h-full object-contain filter drop-shadow-2xl brightness-90 group-hover:brightness-110 transition-all pointer-events-none"
          />
        ) : (
          <div className="w-full h-full rounded-full border-4 border-zinc-800 bg-zinc-900 group-hover:bg-zinc-800 transition-colors" />
        )}

        {/* Glow Overlay */}
        <div
          className="inner-glow absolute inset-0 opacity-0 transition-all duration-150 pointer-events-none rounded-full"
          style={{
            background: `radial-gradient(circle at center, ${pad.color}40 0%, transparent 70%)`,
          }}
        />

        {/* Label & Key */}
        <div className="absolute -bottom-6 flex flex-col items-center pointer-events-none opacity-60 group-hover:opacity-100 transition-opacity">
          <span className="text-white font-black text-[8px] uppercase tracking-widest">{pad.name}</span>
          <div
            className="mt-0.5 px-1.5 py-0.5 rounded-sm bg-black/60 border border-white/5 text-[9px] font-mono font-bold"
            style={{ color: pad.color }}
          >
            {pad.key.toUpperCase()}
          </div>
        </div>
      </button>

      {/* Design Mode Overlays - Separate from button to avoid event conflicts */}
      {isDesignMode && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setIsAssigningKey(true);
            }}
            role="button"
            tabIndex={0}
            className="pointer-events-auto z-50 bg-orange-500 text-white text-[8px] font-bold px-2 py-1 rounded shadow-lg transform hover:scale-110 active:scale-95 transition-transform uppercase tracking-tighter cursor-pointer"
          >
            {isAssigningKey ? 'PRESS KEY' : 'REBIND'}
          </div>
        </div>
      )}
    </div>
  );
});

DrumPad.displayName = 'DrumPad';

export default DrumPad;
