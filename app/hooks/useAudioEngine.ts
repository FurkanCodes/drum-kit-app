'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  initAudioEngine,
  triggerDrum,
  isAudioEngineReady,
  resumeAudioContext,
  getLatencyStats,
  updateAudioConfig,
  getAudioConfig,
  setMasterVolume,
  getSampleLoaderStatus,
} from '../lib/audio/engine';
import type { AudioConfig } from '../lib/types/drum';

interface UseAudioEngineReturn {
  isReady: boolean;
  isInitializing: boolean;
  latencyMetrics: ReturnType<typeof getLatencyStats>;
  config: AudioConfig;
  sampleStatus: ReturnType<typeof getSampleLoaderStatus>;
  trigger: (drumId: string, velocity?: number) => void;
  init: () => Promise<void>;
  updateConfig: (config: Partial<AudioConfig>) => void;
  setVolume: (volume: number) => void;
}

export function useAudioEngine(): UseAudioEngineReturn {
  const [isReady, setIsReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [latencyMetrics, setLatencyMetrics] = useState(getLatencyStats());
  const [config, setConfig] = useState<AudioConfig>(getAudioConfig());
  const [sampleStatus, setSampleStatus] = useState(getSampleLoaderStatus());
  
  // Use ref to avoid re-renders during rapid triggers
  const metricsRef = useRef(latencyMetrics);
  
  // Check engine status periodically
  useEffect(() => {
    const checkStatus = () => {
      const ready = isAudioEngineReady();
      setIsReady(ready);
      setSampleStatus(getSampleLoaderStatus());
    };
    
    const interval = setInterval(checkStatus, 100);
    checkStatus();
    
    return () => clearInterval(interval);
  }, []);
  
  // Update metrics less frequently to avoid performance impact
  useEffect(() => {
    const interval = setInterval(() => {
      const stats = getLatencyStats();
      metricsRef.current = stats;
      setLatencyMetrics(stats);
    }, 500);
    
    return () => clearInterval(interval);
  }, []);
  
  // Initialize audio engine
  const init = useCallback(async () => {
    setIsInitializing(true);
    await resumeAudioContext();
    const success = await initAudioEngine();
    setIsReady(success);
    setIsInitializing(false);
  }, []);
  
  // Trigger drum with latency tracking
  const trigger = useCallback((drumId: string, velocity: number = 1.0) => {
    if (!isReady) {
      // Try to initialize on first interaction
      init();
      return;
    }
    
    triggerDrum(drumId, velocity, (metrics) => {
      // Update metrics immediately to show per-click latency
      metricsRef.current = getLatencyStats();
      // Update state to reflect the new latency measurement
      setLatencyMetrics(metricsRef.current);
    });
  }, [isReady, init]);
  
  // Update configuration
  const updateConfig = useCallback((newConfig: Partial<AudioConfig>) => {
    updateAudioConfig(newConfig);
    setConfig(getAudioConfig());
  }, []);
  
  // Set master volume
  const setVolume = useCallback((volume: number) => {
    setMasterVolume(volume);
  }, []);
  
  return {
    isReady,
    isInitializing,
    latencyMetrics,
    config,
    sampleStatus,
    trigger,
    init,
    updateConfig,
    setVolume,
  };
}
