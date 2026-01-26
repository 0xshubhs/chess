"use client";

import { useEffect, useRef, useCallback } from "react";
import { Color } from "chess.js";

interface UseChessClockProps {
  whiteTime: number;
  blackTime: number;
  setWhiteTime: (fn: (prev: number) => number) => void;
  setBlackTime: (fn: (prev: number) => number) => void;
  turn: Color;
  isGameOver: boolean;
  onTimeout: (color: Color) => void;
  isPaused?: boolean;
  isUnlimited?: boolean;
}

export function useChessClock({
  whiteTime,
  blackTime,
  setWhiteTime,
  setBlackTime,
  turn,
  isGameOver,
  onTimeout,
  isPaused = false,
  isUnlimited = false,
}: UseChessClockProps) {
  const animationFrameRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const timeoutFiredRef = useRef<{ w: boolean; b: boolean }>({ w: false, b: false });
  
  // Reset timeout flags when game resets
  useEffect(() => {
    if (whiteTime > 0) timeoutFiredRef.current.w = false;
    if (blackTime > 0) timeoutFiredRef.current.b = false;
  }, [whiteTime, blackTime]);
  
  // Main clock logic using requestAnimationFrame for precision
  useEffect(() => {
    // Don't run clock if game is over, paused, or unlimited time
    if (isGameOver || isPaused || isUnlimited) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }
    
    lastTickRef.current = performance.now();
    
    const tick = () => {
      const now = performance.now();
      const elapsed = (now - lastTickRef.current) / 1000;
      
      // Cap elapsed time to prevent huge jumps when tab was backgrounded
      // Browser throttles to 1s in background, so cap at 2s max
      const cappedElapsed = Math.min(elapsed, 2);
      lastTickRef.current = now;
      
      if (turn === "w") {
        setWhiteTime((prev: number) => {
          const newTime = Math.max(0, prev - cappedElapsed);
          if (newTime <= 0 && !timeoutFiredRef.current.w) {
            timeoutFiredRef.current.w = true;
            // Use setTimeout to avoid calling setState during render
            setTimeout(() => onTimeout("w"), 0);
          }
          return newTime;
        });
      } else {
        setBlackTime((prev: number) => {
          const newTime = Math.max(0, prev - cappedElapsed);
          if (newTime <= 0 && !timeoutFiredRef.current.b) {
            timeoutFiredRef.current.b = true;
            setTimeout(() => onTimeout("b"), 0);
          }
          return newTime;
        });
      }
      
      animationFrameRef.current = requestAnimationFrame(tick);
    };
    
    animationFrameRef.current = requestAnimationFrame(tick);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [turn, isGameOver, isPaused, isUnlimited, setWhiteTime, setBlackTime, onTimeout]);
  
  // Format time for display
  const formatTime = useCallback((seconds: number): string => {
    if (seconds <= 0) return "0:00";
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const tenths = Math.floor((seconds % 1) * 10);
    
    // Show tenths when under 10 seconds
    if (seconds < 10) {
      return `${secs}.${tenths}`;
    }
    
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, []);
  
  return {
    whiteTimeFormatted: formatTime(whiteTime),
    blackTimeFormatted: formatTime(blackTime),
    isWhiteLow: whiteTime < 30,
    isBlackLow: blackTime < 30,
    isWhiteCritical: whiteTime < 10,
    isBlackCritical: blackTime < 10,
  };
}
