/**
 * AI Move Hook V2 - PRODUCTION VERSION
 * 
 * Uses Server-Sent Events for real-time streaming.
 * Proper abort handling, retry logic, and error recovery.
 * 
 * Why SSE over WebSocket:
 * - Simpler with Next.js (no separate WS server needed)
 * - Automatic reconnection
 * - Works through proxies/CDNs
 * - HTTP/2 multiplexing
 * 
 * For million-user scale, consider:
 * - Moving to dedicated WebSocket server (Socket.io, ws)
 * - Using Redis pub/sub for horizontal scaling
 * - Edge workers for latency reduction
 */

import { useRef, useCallback, useEffect } from 'react';
import { useGameStore } from '../lib/store';

interface AiMoveResult {
  move: string;
  fen: string;
  from: string;
  to: string;
  evaluation?: number;
}

interface AiMoveCallbacks {
  onThinkingStart?: () => void;
  onThinkingStatus?: (status: string) => void;
  onMove?: (result: AiMoveResult) => void;
  onError?: (error: string, retryable: boolean) => void;
  onComplete?: () => void;
}

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 30000;

export function useAiMoveV2() {
  const abortControllerRef = useRef<AbortController | null>(null);
  const retryCountRef = useRef(0);
  const isRequestingRef = useRef(false);

  const setAiThinking = useGameStore((s) => s.setAiThinking);
  const updateEvaluation = useGameStore((s) => s.updateEvaluation);

  /**
   * Cancel any pending request
   */
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isRequestingRef.current = false;
    retryCountRef.current = 0;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancel();
    };
  }, [cancel]);

  /**
   * Request an AI move via SSE streaming with retry logic
   */
  const requestMove = useCallback(
    async (
      fen: string,
      elo: number,
      callbacks?: AiMoveCallbacks
    ): Promise<AiMoveResult | null> => {
      // Prevent concurrent requests
      if (isRequestingRef.current) {
        cancel();
      }

      isRequestingRef.current = true;
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Set timeout
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, REQUEST_TIMEOUT_MS);

      setAiThinking(true);
      callbacks?.onThinkingStart?.();

      try {
        const response = await fetch('/api/ai-move-v2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fen, elo, stream: true }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('Retry-After') || '5', 10);
          callbacks?.onError?.(`Rate limited. Retry in ${retryAfter}s`, true);
          
          // Auto-retry after delay
          if (retryCountRef.current < MAX_RETRIES) {
            retryCountRef.current++;
            await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
            return requestMove(fen, elo, callbacks);
          }
          return null;
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let result: AiMoveResult | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;

            const eventMatch = line.match(/^event: (\w+)/);
            const dataMatch = line.match(/^data: (.+)$/m);

            if (eventMatch && dataMatch) {
              const event = eventMatch[1];
              
              try {
                const data = JSON.parse(dataMatch[1]);

                switch (event) {
                  case 'thinking':
                    callbacks?.onThinkingStatus?.(data.status);
                    break;
                    
                  case 'move':
                    result = {
                      move: data.move,
                      fen: data.fen,
                      from: data.from,
                      to: data.to,
                      evaluation: data.evaluation,
                    };
                    
                    if (data.evaluation !== undefined) {
                      updateEvaluation(data.evaluation);
                    }
                    
                    callbacks?.onMove?.(result);
                    break;
                    
                  case 'error':
                    callbacks?.onError?.(data.error, false);
                    break;
                }
              } catch (parseError) {
                console.warn('Failed to parse SSE data:', parseError);
              }
            }
          }
        }

        callbacks?.onComplete?.();
        retryCountRef.current = 0;
        return result;

      } catch (err) {
        clearTimeout(timeoutId);
        
        if (err instanceof Error) {
          if (err.name === 'AbortError') {
            // Request was cancelled, not an error
            return null;
          }

          // Retry on network errors
          if (retryCountRef.current < MAX_RETRIES) {
            retryCountRef.current++;
            callbacks?.onError?.(`Network error, retrying (${retryCountRef.current}/${MAX_RETRIES})...`, true);
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
            return requestMove(fen, elo, callbacks);
          }

          callbacks?.onError?.(err.message, false);
        }
        
        return null;
      } finally {
        setAiThinking(false);
        isRequestingRef.current = false;
        abortControllerRef.current = null;
      }
    },
    [setAiThinking, updateEvaluation, cancel]
  );

  /**
   * Fallback to non-streaming request (for older browsers or failed SSE)
   */
  const requestMoveFallback = useCallback(
    async (
      fen: string,
      elo: number,
      callbacks?: AiMoveCallbacks
    ): Promise<AiMoveResult | null> => {
      cancel();

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      setAiThinking(true);
      callbacks?.onThinkingStart?.();

      try {
        const response = await fetch('/api/ai-move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fen, elo }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.move && data.fen) {
          const result: AiMoveResult = {
            move: data.move,
            fen: data.fen,
            from: data.from || '',
            to: data.to || '',
            evaluation: data.evaluation,
          };

          if (data.evaluation !== undefined) {
            updateEvaluation(data.evaluation);
          }

          callbacks?.onMove?.(result);
          callbacks?.onComplete?.();
          return result;
        }

        throw new Error('Invalid response');
      } catch (err) {
        clearTimeout(timeoutId);
        
        if (err instanceof Error && err.name !== 'AbortError') {
          callbacks?.onError?.(err.message, false);
        }
        
        return null;
      } finally {
        setAiThinking(false);
        abortControllerRef.current = null;
      }
    },
    [setAiThinking, updateEvaluation, cancel]
  );

  return {
    requestMove,
    requestMoveFallback,
    cancel,
    isRequesting: () => isRequestingRef.current,
  };
}

// Export the result type for consumers
export type { AiMoveResult, AiMoveCallbacks };
