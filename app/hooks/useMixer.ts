'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  initMixerEngine,
  setTrackVolume,
  setTrackPan,
  setTrackInputGain,
  toggleTrackMute,
  toggleTrackSolo,
  setSendLevel,
  setReturnVolume,
  toggleReturnMute,
  setMasterVolume,
  setMasterEQ,
  setMasterCompressor,
  getMixerState,
  getTrackVUMeter,
  getReturnVUMeter,
  getMasterVUMeter,
  type MixerState,
  type VUMeterData,
} from '../lib/audio/mixer';
import type { MixerTrack, ReturnTrack, MasterBus } from '../lib/types/mixer';

interface UseMixerReturn {
  // State
  isReady: boolean;
  mixerState: MixerState | null;
  
  // Track controls
  setTrackVolume: (trackId: string, volume: number) => void;
  setTrackPan: (trackId: string, pan: number) => void;
  setTrackInputGain: (trackId: string, gain: number) => void;
  toggleTrackMute: (trackId: string) => boolean;
  toggleTrackSolo: (trackId: string) => boolean;
  setSendLevel: (trackId: string, returnId: string, level: number) => void;
  
  // Return track controls
  setReturnVolume: (returnId: string, volume: number) => void;
  toggleReturnMute: (returnId: string) => boolean;
  
  // Master controls
  setMasterVolume: (volume: number) => void;
  setMasterEQ: (low: number, mid: number, high: number, midFreq?: number) => void;
  setMasterCompressor: (
    threshold: number,
    ratio: number,
    attack: number,
    release: number,
    enabled: boolean
  ) => void;
  
  // VU meters
  getTrackMeter: (trackId: string) => VUMeterData | null;
  getReturnMeter: (returnId: string) => VUMeterData | null;
  getMasterMeter: () => VUMeterData | null;
}

export function useMixer(audioContext: AudioContext | null, destination: AudioNode | null): UseMixerReturn {
  const [isReady, setIsReady] = useState(false);
  const [mixerState, setMixerState] = useState<MixerState | null>(null);
  const stateRef = useRef<MixerState | null>(null);

  // Initialize mixer when audio context is ready
  useEffect(() => {
    if (!audioContext || !destination) return;

    const init = async () => {
      const success = await initMixerEngine(audioContext, destination);
      if (success) {
        setIsReady(true);
        // Initial state fetch
        const state = getMixerState();
        stateRef.current = state;
        setMixerState(state);
      }
    };

    init();
  }, [audioContext, destination]);

  // Update state reference periodically for VU meters
  useEffect(() => {
    if (!isReady) return;

    const interval = setInterval(() => {
      const state = getMixerState();
      stateRef.current = state;
      // Don't trigger React re-render for VU meters - they're read separately
    }, 50); // 20fps update for internal state

    return () => clearInterval(interval);
  }, [isReady]);

  // Track controls
  const handleSetTrackVolume = useCallback((trackId: string, volume: number) => {
    setTrackVolume(trackId, volume);
    // Update local state immediately for UI responsiveness
    if (stateRef.current) {
      const track = stateRef.current.tracks.get(trackId);
      if (track) {
        track.volume = volume;
        setMixerState({ ...stateRef.current });
      }
    }
  }, []);

  const handleSetTrackPan = useCallback((trackId: string, pan: number) => {
    setTrackPan(trackId, pan);
    if (stateRef.current) {
      const track = stateRef.current.tracks.get(trackId);
      if (track) {
        track.pan = pan;
        setMixerState({ ...stateRef.current });
      }
    }
  }, []);

  const handleSetTrackInputGain = useCallback((trackId: string, gain: number) => {
    setTrackInputGain(trackId, gain);
    if (stateRef.current) {
      const track = stateRef.current.tracks.get(trackId);
      if (track) {
        track.inputGain = gain;
        setMixerState({ ...stateRef.current });
      }
    }
  }, []);

  const handleToggleTrackMute = useCallback((trackId: string): boolean => {
    const muted = toggleTrackMute(trackId);
    if (stateRef.current) {
      const track = stateRef.current.tracks.get(trackId);
      if (track) {
        track.muted = muted;
        setMixerState({ ...stateRef.current });
      }
    }
    return muted;
  }, []);

  const handleToggleTrackSolo = useCallback((trackId: string): boolean => {
    const soloed = toggleTrackSolo(trackId);
    if (stateRef.current) {
      // State is updated internally by toggleTrackSolo
      setMixerState(getMixerState());
    }
    return soloed;
  }, []);

  const handleSetSendLevel = useCallback((trackId: string, returnId: string, level: number) => {
    setSendLevel(trackId, returnId, level);
    if (stateRef.current) {
      const track = stateRef.current.tracks.get(trackId);
      if (track) {
        track.sends.set(returnId, level);
        setMixerState({ ...stateRef.current });
      }
    }
  }, []);

  // Return track controls
  const handleSetReturnVolume = useCallback((returnId: string, volume: number) => {
    setReturnVolume(returnId, volume);
    if (stateRef.current) {
      const returnTrack = stateRef.current.returns.get(returnId);
      if (returnTrack) {
        returnTrack.volume = volume;
        setMixerState({ ...stateRef.current });
      }
    }
  }, []);

  const handleToggleReturnMute = useCallback((returnId: string): boolean => {
    const muted = toggleReturnMute(returnId);
    if (stateRef.current) {
      const returnTrack = stateRef.current.returns.get(returnId);
      if (returnTrack) {
        returnTrack.muted = muted;
        setMixerState({ ...stateRef.current });
      }
    }
    return muted;
  }, []);

  // Master controls
  const handleSetMasterVolume = useCallback((volume: number) => {
    setMasterVolume(volume);
    if (stateRef.current) {
      stateRef.current.master.volume = volume;
      setMixerState({ ...stateRef.current });
    }
  }, []);

  const handleSetMasterEQ = useCallback((low: number, mid: number, high: number, midFreq?: number) => {
    setMasterEQ(low, mid, high, midFreq);
    if (stateRef.current) {
      stateRef.current.master.eq.lowGain = low;
      stateRef.current.master.eq.midGain = mid;
      stateRef.current.master.eq.highGain = high;
      if (midFreq !== undefined) {
        stateRef.current.master.eq.midFreq = midFreq;
      }
      setMixerState({ ...stateRef.current });
    }
  }, []);

  const handleSetMasterCompressor = useCallback((
    threshold: number,
    ratio: number,
    attack: number,
    release: number,
    enabled: boolean
  ) => {
    setMasterCompressor(threshold, ratio, attack, release, enabled);
    if (stateRef.current) {
      stateRef.current.master.compressor.threshold = threshold;
      stateRef.current.master.compressor.ratio = ratio;
      stateRef.current.master.compressor.attack = attack;
      stateRef.current.master.compressor.release = release;
      stateRef.current.master.compressor.enabled = enabled;
      setMixerState({ ...stateRef.current });
    }
  }, []);

  // VU meter getters (read directly from engine for real-time values)
  const getTrackMeter = useCallback((trackId: string): VUMeterData | null => {
    return getTrackVUMeter(trackId);
  }, []);

  const getReturnMeter = useCallback((returnId: string): VUMeterData | null => {
    return getReturnVUMeter(returnId);
  }, []);

  const getMasterMeter = useCallback((): VUMeterData | null => {
    return getMasterVUMeter();
  }, []);

  return {
    isReady,
    mixerState,
    setTrackVolume: handleSetTrackVolume,
    setTrackPan: handleSetTrackPan,
    setTrackInputGain: handleSetTrackInputGain,
    toggleTrackMute: handleToggleTrackMute,
    toggleTrackSolo: handleToggleTrackSolo,
    setSendLevel: handleSetSendLevel,
    setReturnVolume: handleSetReturnVolume,
    toggleReturnMute: handleToggleReturnMute,
    setMasterVolume: handleSetMasterVolume,
    setMasterEQ: handleSetMasterEQ,
    setMasterCompressor: handleSetMasterCompressor,
    getTrackMeter,
    getReturnMeter,
    getMasterMeter,
  };
}
