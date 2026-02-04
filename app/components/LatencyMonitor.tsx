'use client';

import { useRef, useEffect } from 'react';

interface LatencyMonitorProps {
  avg: number;
  min: number;
  max: number;
  count: number;
}

export default function LatencyMonitor({ avg, min, max, count }: LatencyMonitorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<number[]>([]);
  const lastCountRef = useRef(count);

  // Keep last 100 individual measurements for graph
  useEffect(() => {
    if (count > lastCountRef.current && count > 0) {
      const currentLatency = avg;
      historyRef.current.push(currentLatency);
      if (historyRef.current.length > 100) {
        historyRef.current.shift();
      }
      lastCountRef.current = count;
    }
  }, [avg, count]);

  // Draw latency graph
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, rect.width, rect.height);

    const history = historyRef.current;

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;

    const gridCount = 20;
    for (let i = 0; i <= gridCount; i++) {
      const x = (rect.width / gridCount) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rect.height);
      ctx.stroke();
    }

    const yGridCount = 4;
    for (let i = 0; i <= yGridCount; i++) {
      const y = (rect.height / yGridCount) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(rect.width, y);
      ctx.stroke();
    }

    if (history.length < 2) return;

    // Calculate Y scale based on visible history
    const maxLatency = Math.max(15, ...history, 30);
    const minLatency = 0;
    const latencyRange = maxLatency - minLatency || 1;
    const xStep = rect.width / (history.length > 100 ? 100 : history.length);

    // Create gradient for the line
    const color = avg < 10 ? '#22c55e' : avg < 20 ? '#eab308' : '#ef4444';

    // Draw area under line
    ctx.fillStyle = `${color}10`;
    ctx.beginPath();
    ctx.moveTo(0, rect.height);
    history.forEach((latency, index) => {
      const x = index * xStep;
      const normalizedLatency = (latency - minLatency) / latencyRange;
      const y = rect.height - (normalizedLatency * rect.height);
      ctx.lineTo(x, y);
    });
    ctx.lineTo((history.length - 1) * xStep, rect.height);
    ctx.fill();

    // Draw latency line
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 8;
    ctx.shadowColor = color;
    ctx.beginPath();

    history.forEach((latency, index) => {
      const x = index * xStep;
      const normalizedLatency = (latency - minLatency) / latencyRange;
      const y = rect.height - (normalizedLatency * rect.height);

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        // Smooth line
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw current value dot
    const lastLatency = history[history.length - 1];
    const lastNormalized = (lastLatency - minLatency) / latencyRange;
    const lastY = rect.height - (lastNormalized * rect.height);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc((history.length - 1) * xStep, lastY, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc((history.length - 1) * xStep, lastY, 6, 0, Math.PI * 2);
    ctx.stroke();

  }, [avg]);

  const getStatusColor = () => {
    if (avg < 8) return 'text-amber-500 shadow-[0_0_10px_rgba(255,157,0,0.15)]';
    if (avg < 15) return 'text-amber-600/80';
    return 'text-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]';
  };

  const getStatusText = () => {
    if (avg < 8) return 'SIGNAL_STABLE';
    if (avg < 15) return 'LATENCY_NOMINAL';
    if (avg < 25) return 'DELAY_DETECTED';
    return 'CRITICAL_BUFFER';
  };

  const lastMeasurement = avg;

  return (
    <div className="bg-zinc-950/40 rounded p-4 font-sans">
      <div className="flex items-center justify-between mb-5">
        <div className="flex flex-col">
          <span className="text-[7px] text-zinc-600 font-black tracking-[0.4em] uppercase">Analyzer</span>
          <h3 className="text-zinc-300 text-[10px] font-black tracking-widest uppercase">SIG_ANALYZER_PRO</h3>
        </div>
        <div className={`px-2 py-0.5 rounded-sm border border-current text-[7px] font-black tracking-widest ${getStatusColor()} transition-all`}>
          {getStatusText()}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-zinc-950 border border-white/5 p-2 rounded-sm">
          <div className="text-[6px] text-zinc-600 uppercase font-black tracking-widest mb-1.5">Input_Δ</div>
          <div className={`text-md font-mono font-black tracking-tighter ${getStatusColor()}`}>
            {lastMeasurement.toFixed(2)}<span className="text-[9px] ml-0.5 opacity-40">ms</span>
          </div>
        </div>
        <div className="bg-zinc-950 border border-white/5 p-2 rounded-sm">
          <div className="text-[6px] text-zinc-600 uppercase font-black tracking-widest mb-1.5">Mean_Δ</div>
          <div className="text-md font-mono font-black tracking-tighter text-zinc-200">
            {avg.toFixed(2)}<span className="text-[9px] ml-0.5 opacity-40">ms</span>
          </div>
        </div>
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          className="w-full h-14 bg-black/60 rounded-sm border border-white/[0.02]"
          style={{ width: '100%', height: '56px' }}
        />
        {/* Decorative elements */}
        <div className="absolute top-1 left-2 text-[5px] text-zinc-700 font-black tracking-widest pointer-events-none">REALTIME_SIGNAL</div>
        <div className="absolute top-0 left-0 w-1 h-1 border-t border-l border-zinc-700" />
        <div className="absolute top-0 right-0 w-1 h-1 border-t border-r border-zinc-700" />
        <div className="absolute bottom-0 left-0 w-1 h-1 border-b border-l border-zinc-700" />
        <div className="absolute bottom-0 right-0 w-1 h-1 border-b border-r border-zinc-700" />
      </div>

      <div className="flex justify-between items-center mt-4">
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            <span className="w-1 h-2 bg-amber-500 animate-[pulse_1s_infinite]" />
            <span className="w-1 h-2 bg-zinc-800" />
            <span className="w-1 h-2 bg-zinc-800" />
          </div>
          <span className="text-[7px] text-zinc-600 font-black tracking-[0.2em] uppercase">Engine_Link_Active</span>
        </div>
        <div className="text-[7px] text-zinc-700 font-mono font-bold">
          MN: {min.toFixed(1)}ms · PK: {max.toFixed(1)}ms
        </div>
      </div>
    </div>
  );
}
