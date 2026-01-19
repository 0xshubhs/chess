"use client";

import { useRef, useEffect, useCallback } from "react";

// Sound types for chess moves
const SOUND_TYPES = ["move", "capture", "check", "castle", "promote", "gameEnd"] as const;

type SoundType = (typeof SOUND_TYPES)[number];

// Fallback: Generate sounds using Web Audio API
function createSoundEffect(type: SoundType): () => void {
  return () => {
    if (typeof window === "undefined") return;
    
    try {
      const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      switch (type) {
        case "move":
          oscillator.frequency.value = 220;
          oscillator.type = "sine";
          gainNode.gain.setValueAtTime(0.08, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.08);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.08);
          break;
          
        case "capture":
          oscillator.frequency.value = 180;
          oscillator.type = "triangle";
          gainNode.gain.setValueAtTime(0.12, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.12);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.12);
          break;
          
        case "check":
          oscillator.frequency.value = 440;
          oscillator.type = "sine";
          gainNode.gain.setValueAtTime(0.06, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.15);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.15);
          break;
          
        case "castle":
          oscillator.frequency.value = 200;
          oscillator.type = "sine";
          gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.15);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.15);
          break;
          
        case "gameEnd":
          oscillator.frequency.value = 330;
          oscillator.type = "sine";
          gainNode.gain.setValueAtTime(0.08, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.3);
          break;
          
        default:
          oscillator.frequency.value = 220;
          oscillator.type = "sine";
          gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.1);
      }
    } catch {
      // Audio not supported, fail silently
    }
  };
}

export function useSoundEffects(enabled: boolean = true, volume: number = 0.3) {
  const fallbackSounds = useRef<Map<SoundType, () => void>>(new Map());

  // Initialize sound generators
  useEffect(() => {
    if (typeof window === "undefined" || !enabled) return;

    // Create Web Audio API sounds
    SOUND_TYPES.forEach((type) => {
      fallbackSounds.current.set(type, createSoundEffect(type));
    });
  }, [enabled]);

  const playSound = useCallback(
    (type: SoundType) => {
      if (!enabled) return;

      // Use Web Audio API sounds
      const sound = fallbackSounds.current.get(type);
      if (sound) sound();
    },
    [enabled]
  );

  return { playSound };
}

export type { SoundType };
