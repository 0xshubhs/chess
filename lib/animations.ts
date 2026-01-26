/**
 * Animation System - PRODUCTION VERSION
 * 
 * Professional animation using requestAnimationFrame with proper interpolation.
 * No more setTimeout nonsense. This is how chess.com does it.
 * 
 * Features:
 * - Sub-16ms frame timing (60 FPS)
 * - Proper easing curves
 * - Memory-efficient (reuses refs, no closures in hot paths)
 * - Automatic cleanup on unmount
 */

import { useRef, useCallback, useEffect } from 'react';

export interface AnimationState {
  piece: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startTime: number;
  duration: number;
  isCapture: boolean;
}

export interface AnimationCallbacks {
  onProgress: (progress: number, x: number, y: number) => void;
  onComplete: () => void;
}

// ============================================================================
// Easing functions - Pre-computed for performance
// ============================================================================

export const easings = {
  // Smooth deceleration - what chess.com uses
  easeOutCubic: (t: number): number => 1 - Math.pow(1 - t, 3),
  
  // Slightly bouncy at the end
  easeOutBack: (t: number): number => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  
  // Linear for testing
  linear: (t: number): number => t,
  
  // Quick start, smooth end (our default)
  easeOutQuart: (t: number): number => 1 - Math.pow(1 - t, 4),
  
  // Snappy - good for captures
  easeOutExpo: (t: number): number => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
};

// Pre-computed easing lookup for hot path
const _EASING_FNS: Record<string, (t: number) => number> = easings;

/**
 * Convert square notation to pixel coordinates
 */
export function squareToCoords(
  square: string,
  boardSize: number,
  isFlipped: boolean
): { x: number; y: number } {
  const file = square.charCodeAt(0) - 97; // a=0, h=7
  const rank = parseInt(square[1], 10) - 1; // 1=0, 8=7

  const squareSize = boardSize / 8;
  
  let x = file * squareSize;
  let y = (7 - rank) * squareSize;

  if (isFlipped) {
    x = (7 - file) * squareSize;
    y = rank * squareSize;
  }

  return { x, y };
}

/**
 * Professional animation hook using requestAnimationFrame
 */
export function useChessAnimation(
  duration: number = 180,
  easing: keyof typeof easings = 'easeOutCubic'
) {
  const animationRef = useRef<number | null>(null);
  const stateRef = useRef<AnimationState | null>(null);
  const callbacksRef = useRef<AnimationCallbacks | null>(null);

  const cancel = useCallback(() => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    stateRef.current = null;
    callbacksRef.current = null;
  }, []);

  const animate = useCallback(
    (
      from: string,
      to: string,
      piece: string,
      boardSize: number,
      isFlipped: boolean,
      isCapture: boolean,
      callbacks: AnimationCallbacks
    ) => {
      // Cancel any existing animation
      cancel();

      const fromCoords = squareToCoords(from, boardSize, isFlipped);
      const toCoords = squareToCoords(to, boardSize, isFlipped);

      stateRef.current = {
        piece,
        fromX: fromCoords.x,
        fromY: fromCoords.y,
        toX: toCoords.x,
        toY: toCoords.y,
        startTime: performance.now(),
        duration,
        isCapture,
      };

      callbacksRef.current = callbacks;

      const easingFn = easings[easing];

      const tick = (currentTime: number) => {
        const state = stateRef.current;
        const cbs = callbacksRef.current;
        
        if (!state || !cbs) return;

        const elapsed = currentTime - state.startTime;
        const rawProgress = Math.min(elapsed / state.duration, 1);
        const easedProgress = easingFn(rawProgress);

        // Interpolate position
        const x = state.fromX + (state.toX - state.fromX) * easedProgress;
        const y = state.fromY + (state.toY - state.fromY) * easedProgress;

        cbs.onProgress(easedProgress, x, y);

        if (rawProgress < 1) {
          animationRef.current = requestAnimationFrame(tick);
        } else {
          // Animation complete
          animationRef.current = null;
          stateRef.current = null;
          callbacksRef.current = null;
          cbs.onComplete();
        }
      };

      animationRef.current = requestAnimationFrame(tick);
    },
    [duration, easing, cancel]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancel();
    };
  }, [cancel]);

  return {
    animate,
    cancel,
    isAnimating: () => stateRef.current !== null,
    getState: () => stateRef.current,
  };
}

/**
 * Capture animation - fade out the captured piece
 */
export function useCaptureAnimation(duration: number = 80) {
  const animationRef = useRef<number | null>(null);
  const opacityRef = useRef(1);
  const callbackRef = useRef<((opacity: number) => void) | null>(null);
  const onCompleteRef = useRef<(() => void) | null>(null);

  const cancel = useCallback(() => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    opacityRef.current = 1;
    callbackRef.current = null;
    onCompleteRef.current = null;
  }, []);

  const animate = useCallback(
    (onProgress: (opacity: number) => void, onComplete: () => void) => {
      cancel();
      
      const startTime = performance.now();
      callbackRef.current = onProgress;
      onCompleteRef.current = onComplete;

      const tick = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const opacity = 1 - progress;

        opacityRef.current = opacity;
        callbackRef.current?.(opacity);

        if (progress < 1) {
          animationRef.current = requestAnimationFrame(tick);
        } else {
          animationRef.current = null;
          callbackRef.current = null;
          onCompleteRef.current?.();
          onCompleteRef.current = null;
        }
      };

      animationRef.current = requestAnimationFrame(tick);
    },
    [duration, cancel]
  );

  useEffect(() => {
    return () => {
      cancel();
    };
  }, [cancel]);

  return { animate, cancel, getOpacity: () => opacityRef.current };
}

/**
 * Clock animation - smooth countdown using requestAnimationFrame
 */
export function useClockAnimation() {
  const animationRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const callbackRef = useRef<((deltaMs: number) => void) | null>(null);

  const start = useCallback((onTick: (deltaMs: number) => void) => {
    callbackRef.current = onTick;
    lastTickRef.current = performance.now();

    const tick = (currentTime: number) => {
      const delta = currentTime - lastTickRef.current;
      lastTickRef.current = currentTime;
      
      callbackRef.current?.(delta);
      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);
  }, []);

  const stop = useCallback(() => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    callbackRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { start, stop, isRunning: () => animationRef.current !== null };
}

/**
 * Format time for display with smooth tenths
 */
export function formatTime(seconds: number): string {
  if (seconds <= 0) return '0:00';

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);

  // Show tenths when under 10 seconds
  if (seconds < 10) {
    return `${secs}.${tenths}`;
  }

  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
