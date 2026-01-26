/**
 * AI Move Hook
 * 
 * Encapsulates all AI communication logic.
 * Supports both SSE streaming and fallback HTTP.
 */

import { useRef, useCallback } from 'react';
import { useGameStore } from '../lib/store';

interface AiMoveCallbacks {
  onThinkingStart?: () => void;
  onThinkingStatus?: (status: string) => void;
  onMove?: (move: string, fen: string, evaluation?: number) => void;
  onError?: (error: string) => void;
  onComplete?: () => void;
}

export function useAiMove() {
  const abortControllerRef = useRef<AbortController | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const { setAiThinking, updateEvaluation, setFen, makeMove } = useGameStore();

  /**
   * Request an AI move via SSE streaming
   */
  const requestMoveStreaming = useCallback(
    async (fen: string, elo: number, callbacks?: AiMoveCallbacks) => {
      // Abort any existing request
      cancel();

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setAiThinking(true);
      callbacks?.onThinkingStart?.();

      try {
        const response = await fetch('/api/ai-move-v2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fen, elo, stream: true }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let buffer = '';

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
              const data = JSON.parse(dataMatch[1]);

              switch (event) {
                case 'thinking':
                  callbacks?.onThinkingStatus?.(data.status);
                  break;
                case 'move':
                  callbacks?.onMove?.(data.move, data.fen, data.evaluation);
                  if (data.evaluation !== undefined) {
                    updateEvaluation(data.evaluation);
                  }
                  break;
                case 'error':
                  callbacks?.onError?.(data.error);
                  break;
              }
            }
          }
        }

        callbacks?.onComplete?.();
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('AI move error:', err);
          callbacks?.onError?.(err.message);
        }
      } finally {
        setAiThinking(false);
        abortControllerRef.current = null;
      }
    },
    [setAiThinking, updateEvaluation]
  );

  /**
   * Request an AI move via regular HTTP (fallback)
   */
  const requestMove = useCallback(
    async (fen: string, elo: number, callbacks?: AiMoveCallbacks) => {
      // Abort any existing request
      cancel();

      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Set timeout
      const timeoutId = setTimeout(() => controller.abort(), 30000);

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
          callbacks?.onMove?.(data.move, data.fen, data.evaluation);
          if (data.evaluation !== undefined) {
            updateEvaluation(data.evaluation);
          }
        } else {
          throw new Error('Invalid response');
        }

        callbacks?.onComplete?.();
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('AI move error:', err);
          callbacks?.onError?.(err.message);
        }
      } finally {
        setAiThinking(false);
        abortControllerRef.current = null;
      }
    },
    [setAiThinking, updateEvaluation]
  );

  /**
   * Cancel any pending AI request
   */
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setAiThinking(false);
  }, [setAiThinking]);

  return {
    requestMove,
    requestMoveStreaming,
    cancel,
    isRequesting: () => abortControllerRef.current !== null,
  };
}
