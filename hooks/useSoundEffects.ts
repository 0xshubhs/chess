"use client";

import { useRef, useEffect, useCallback } from "react";

// Sound effect URLs (using built-in sounds or base64)
const SOUNDS = {
  move: "/sounds/move.mp3",
  capture: "/sounds/capture.mp3",
  check: "/sounds/check.mp3",
  castle: "/sounds/castle.mp3",
  promote: "/sounds/promote.mp3",
  gameEnd: "/sounds/game-end.mp3",
} as const;

type SoundType = keyof typeof SOUNDS;

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
          gainNode.gain.exponentialDecayTo?.(0.001, audioContext.currentTime + 0.08) ||
            gainNode.gain.setValueAtTime(0.001, audioContext.currentTime + 0.08);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.08);
          break;
          
        case "capture":
          oscillator.frequency.value = 180;
          oscillator.type = "triangle";
          gainNode.gain.setValueAtTime(0.12, audioContext.currentTime);
          gainNode.gain.setValueAtTime(0.001, audioContext.currentTime + 0.12);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.12);
          break;
          
        case "check":
          oscillator.frequency.value = 440;
          oscillator.type = "sine";
          gainNode.gain.setValueAtTime(0.06, audioContext.currentTime);
          gainNode.gain.setValueAtTime(0.001, audioContext.currentTime + 0.15);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.15);
          break;
          
        case "castle":
          oscillator.frequency.value = 200;
          oscillator.type = "sine";
          gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
          gainNode.gain.setValueAtTime(0.001, audioContext.currentTime + 0.15);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.15);
          break;
          
        case "gameEnd":
          oscillator.frequency.value = 330;
          oscillator.type = "sine";
          gainNode.gain.setValueAtTime(0.08, audioContext.currentTime);
          gainNode.gain.setValueAtTime(0.001, audioContext.currentTime + 0.3);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.3);
          break;
          
        default:
          oscillator.frequency.value = 220;
          oscillator.type = "sine";
          gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);
          gainNode.gain.setValueAtTime(0.001, audioContext.currentTime + 0.1);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.1);
      }
    } catch {
      // Audio not supported, fail silently
    }
  };
}

export function useSoundEffects(enabled: boolean = true, volume: number = 0.3) {
  const audioCache = useRef<Map<SoundType, HTMLAudioElement>>(new Map());
  const fallbackSounds = useRef<Map<SoundType, () => void>>(new Map());

  // Preload audio files
  useEffect(() => {
    if (typeof window === "undefined" || !enabled) return;

    // Create fallback sounds
    (Object.keys(SOUNDS) as SoundType[]).forEach((type) => {
      fallbackSounds.current.set(type, createSoundEffect(type));
    });

    // Try to load actual audio files
    (Object.keys(SOUNDS) as SoundType[]).forEach((type) => {
      const audio = new Audio();
      audio.preload = "auto";
      audio.volume = volume;
      audio.src = SOUNDS[type];
      
      audio.addEventListener("canplaythrough", () => {
        audioCache.current.set(type, audio);
      });
      
      // Don't block on load errors - we have fallbacks
      audio.addEventListener("error", () => {
        // Use fallback
      });
    });
  }, [enabled, volume]);

  const playSound = useCallback(
    (type: SoundType) => {
      if (!enabled) return;

      const audio = audioCache.current.get(type);
      if (audio) {
        audio.currentTime = 0;
        audio.volume = volume;
        audio.play().catch(() => {
          // Fallback to Web Audio API
          const fallback = fallbackSounds.current.get(type);
          if (fallback) fallback();
        });
      } else {
        // Use fallback
        const fallback = fallbackSounds.current.get(type);
        if (fallback) fallback();
      }
    },
    [enabled, volume]
  );

  return { playSound };
}

export type { SoundType };
