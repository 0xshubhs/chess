"use client";

import { useRef, useEffect, useCallback } from "react";

// Sound types for chess moves
type SoundType = "move" | "capture" | "check" | "castle" | "promote" | "gameEnd";

// Shared audio context - lazy initialized, never recreated
let sharedAudioContext: AudioContext | null = null;
let contextInitAttempted = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  
  // Only attempt to create once to avoid Safari limits
  if (!sharedAudioContext && !contextInitAttempted) {
    contextInitAttempted = true;
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        sharedAudioContext = new AudioContextClass();
      }
    } catch {
      console.warn("AudioContext not supported");
      return null;
    }
  }
  
  if (!sharedAudioContext) return null;
  
  // Resume if suspended (browser autoplay policy)
  if (sharedAudioContext.state === "suspended") {
    sharedAudioContext.resume().catch(() => {
      // Ignore resume errors - user hasn't interacted yet
    });
  }
  
  return sharedAudioContext;
}

// Sound generator using Web Audio API
function playSoundEffect(type: SoundType): void {
  const audioContext = getAudioContext();
  if (!audioContext) return;
  
  try {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    const now = audioContext.currentTime;
    
    switch (type) {
      case "move":
        oscillator.frequency.value = 220;
        oscillator.type = "sine";
        gainNode.gain.setValueAtTime(0.08, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        oscillator.start(now);
        oscillator.stop(now + 0.08);
        break;
        
      case "capture":
        oscillator.frequency.value = 180;
        oscillator.type = "triangle";
        gainNode.gain.setValueAtTime(0.12, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        oscillator.start(now);
        oscillator.stop(now + 0.12);
        break;
        
      case "check":
        oscillator.frequency.value = 440;
        oscillator.type = "sine";
        gainNode.gain.setValueAtTime(0.06, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        oscillator.start(now);
        oscillator.stop(now + 0.15);
        break;
        
      case "castle":
        oscillator.frequency.value = 200;
        oscillator.type = "sine";
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        oscillator.start(now);
        oscillator.stop(now + 0.15);
        break;
        
      case "gameEnd":
        oscillator.frequency.value = 330;
        oscillator.type = "sine";
        gainNode.gain.setValueAtTime(0.08, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        oscillator.start(now);
        oscillator.stop(now + 0.3);
        break;
        
      default:
        oscillator.frequency.value = 220;
        oscillator.type = "sine";
        gainNode.gain.setValueAtTime(0.05, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        oscillator.start(now);
        oscillator.stop(now + 0.1);
    }
  } catch {
    // Audio not supported, fail silently
  }
}

export function useSoundEffects(enabled = true) {
  // Track if we've initialized audio (for user gesture requirement)
  const initializedRef = useRef(false);

  // Initialize audio context on first user interaction
  useEffect(() => {
    if (typeof window === "undefined" || !enabled) return;
    
    const initAudio = () => {
      if (!initializedRef.current) {
        getAudioContext();
        initializedRef.current = true;
      }
    };
    
    // Initialize on first user interaction
    window.addEventListener("click", initAudio, { once: true });
    window.addEventListener("keydown", initAudio, { once: true });
    
    return () => {
      window.removeEventListener("click", initAudio);
      window.removeEventListener("keydown", initAudio);
    };
  }, [enabled]);

  const playSound = useCallback(
    (type: SoundType) => {
      if (!enabled) return;
      playSoundEffect(type);
    },
    [enabled]
  );

  return { playSound };
}

export type { SoundType };
