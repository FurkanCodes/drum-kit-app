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
    if (avg < 8) return 'text-green-500 shadow-[0_0_10px_rgba(34,197,94,0.4)]';
    if (avg < 15) return 'text-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.4)]';
    return 'text-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]';
  };

  const getStatusText = () => {
    if (avg < 8) return 'PRO_LINK';
    if (avg < 15) return 'NOMINAL';
    if (avg < 25) return 'DELAYED';
    return 'CRITICAL';
  };

  const lastMeasurement = historyRef.current[historyRef.current.length - 1] || avg;

  return (
    <div className="bg-zinc-950/80 rounded-lg p-3">
      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-col">
          <span className="text-[8px] text-zinc-500 font-bold tracking-widest uppercase opacity-70">Monitor</span>
          <h3 className="text-white text-xs font-black italic tracking-tighter">SIG_OSC_V1</h3>
        </div>
        <div className={`px-1.5 py-0.5 rounded border border-current text-[8px] font-mono font-bold tracking-tighter ${getStatusColor()}`}>
          {getStatusText()}
        </div>
      </div>

      <div className="flex gap-4 mb-4">
        <div className="flex-1 glass-card p-2 border-white/5 bg-white/[0.01]">
          <div className="text-[8px] text-zinc-500 uppercase font-bold tracking-widest mb-0.5">Input</div>
          <div className={`text-sm font-mono font-black tracking-tighter ${getStatusColor()}`}>
            {lastMeasurement.toFixed(3)}<span className="text-[10px] ml-0.5 opacity-50">ms</span>
          </div>
        </div>
        <div className="flex-1 glass-card p-2 border-white/5 bg-white/[0.01]">
          <div className="text-[8px] text-zinc-500 uppercase font-bold tracking-widest mb-0.5">Avg</div>
          <div className="text-sm font-mono font-black tracking-tighter text-white">
            {avg.toFixed(3)}<span className="text-[10px] ml-0.5 opacity-50">ms</span>
          </div>
        </div>
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          className="w-full h-16 bg-black/40 rounded border border-white/[0.03]"
          style={{ width: '100%', height: '64px' }}
        />
        {/* Decorative corner markers */}
        <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-white/20" />
        <div className="absolute top-0 right-0 w-1.5 h-1.5 border-t border-r border-white/20" />
        <div className="absolute bottom-0 left-0 w-1.5 h-1.5 border-b border-l border-white/20" />
        <div className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r border-white/20" />
      </div>

      <div className="flex justify-between items-center mt-3">
        <div className="flex items-center gap-1">
          <span className="w-1 h-1 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-[8px] text-zinc-600 font-mono tracking-widest uppercase">Live</span>
        </div>
        <div className="text-[8px] text-zinc-700 font-mono">
          {count} SMPLS
        </div>
      </div>
    </div>
  );
}
