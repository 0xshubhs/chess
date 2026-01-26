"use client";

/**
 * Board Component V2 - PRODUCTION VERSION
 * 
 * Uses the Zustand store and singleton ChessEngine.
 * NO new Chess() instances. NO setTimeout for animations.
 * Proper requestAnimationFrame animations.
 */

import React, { useEffect, useMemo, useCallback, useRef, memo } from "react";
import { useShallow } from "zustand/react/shallow";
import { Square as ChessSquare } from "chess.js";
import Square from "./Square";
import PromotionDialog from "./PromotionDialog";
import { useSoundEffects } from "../hooks/useSoundEffects";
import { useGameStore, selectBoardState } from "../lib/store";
import { useChessAnimation } from "../lib/animations";

type PromotionPiece = "q" | "r" | "b" | "n";

// ============================================================================
// Board Component
// ============================================================================

function Board() {
  // ============================================================================
  // State from store (surgical subscriptions)
  // useShallow prevents infinite loops by doing shallow equality comparison
  // ============================================================================
  
  const {
    fen,
    isFlipped,
    selectedSquare,
    legalMoves,
    lastMove,
    kingInCheck,
    animatingPiece,
    capturingSquare,
  } = useGameStore(useShallow(selectBoardState));
  
  const pendingPromotion = useGameStore((s) => s.pendingPromotion);
  const isAiThinking = useGameStore((s) => s.isAiThinking);
  const isGameOver = useGameStore((s) => s.isGameOver);
  const gameMode = useGameStore((s) => s.gameMode);
  const elo = useGameStore((s) => s.elo);

  // Actions
  const selectSquare = useGameStore((s) => s.selectSquare);
  const clearSelection = useGameStore((s) => s.clearSelection);
  const makeMove = useGameStore((s) => s.makeMove);
  const applyAiMove = useGameStore((s) => s.applyAiMove);
  const startAnimation = useGameStore((s) => s.startAnimation);
  const endAnimation = useGameStore((s) => s.endAnimation);
  const setPendingPromotion = useGameStore((s) => s.setPendingPromotion);
  const setAiThinking = useGameStore((s) => s.setAiThinking);
  const addIncrement = useGameStore((s) => s.addIncrement);
  const getEngine = useGameStore((s) => s.getEngine);

  // ============================================================================
  // Refs and hooks
  // ============================================================================
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const triggerAiMoveRef = useRef<((fen: string) => Promise<void>) | null>(null);
  const { playSound } = useSoundEffects(true);
  const animation = useChessAnimation(180, 'easeOutCubic');

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Legal moves as Set for O(1) lookup
  const legalMovesSet = useMemo(() => new Set(legalMoves), [legalMoves]);

  // ============================================================================
  // Board rendering data
  // ============================================================================
  
  const SQUARES = useMemo(() => {
    const squares: ChessSquare[] = [];
    if (isFlipped) {
      for (let rank = 1; rank <= 8; rank++) {
        for (let file = 7; file >= 0; file--) {
          squares.push(("abcdefgh".charAt(file) + rank) as ChessSquare);
        }
      }
    } else {
      for (let rank = 8; rank >= 1; rank--) {
        for (let file = 0; file < 8; file++) {
          squares.push(("abcdefgh".charAt(file) + rank) as ChessSquare);
        }
      }
    }
    return squares;
  }, [isFlipped]);

  // Parse board from FEN (no Chess instance needed!)
  const boardData = useMemo(() => {
    const engine = getEngine();
    engine.load(fen);
    const board = engine.board();
    
    return SQUARES.map((square) => {
      const file = square.charCodeAt(0) - 97;
      const rank = parseInt(square[1], 10) - 1;
      const piece = board[7 - rank][file];
      
      return {
        square,
        piece: piece ? piece.type : null,
        color: piece ? piece.color : null,
      };
    });
  }, [fen, SQUARES, getEngine]);

  // ============================================================================
  // Move execution with proper animation
  // ============================================================================
  
  const executeMove = useCallback((from: ChessSquare, to: ChessSquare, promotion?: PromotionPiece) => {
    const engine = getEngine();
    engine.load(fen);
    
    const movingPiece = engine.get(from);
    const targetPiece = engine.get(to);
    const isCapture = !!targetPiece;
    const isCastling = movingPiece?.type === "k" && Math.abs(from.charCodeAt(0) - to.charCodeAt(0)) === 2;
    
    const pieceStr = movingPiece
      ? movingPiece.color === "w"
        ? movingPiece.type.toUpperCase()
        : movingPiece.type
      : "";

    // Start animation
    startAnimation(from, to, pieceStr, isCapture);
    
    // Use requestAnimationFrame-based animation
    const boardElement = document.querySelector('.board');
    const boardSize = boardElement?.clientWidth || 560;
    
    animation.animate(
      from,
      to,
      pieceStr,
      boardSize,
      isFlipped,
      isCapture,
      {
        onProgress: () => {
          // Animation progress - CSS handles visual interpolation
        },
        onComplete: () => {
          endAnimation();
          
          // Execute the actual move on the engine
          const move = makeMove(from, to, promotion || "q");
          
          if (move) {
            // Add time increment for the player who just moved
            const movedColor = movingPiece?.color;
            if (movedColor) {
              addIncrement(movedColor);
            }
            
            // Play sound
            const engine = getEngine();
            if (engine.inCheck()) {
              playSound("check");
            } else if (isCastling) {
              playSound("castle");
            } else if (isCapture) {
              playSound("capture");
            } else {
              playSound("move");
            }
            
            // Trigger AI move if needed
            if (gameMode === "ai" && !engine.isGameOver() && engine.turn() === "b") {
              triggerAiMoveRef.current?.(engine.fen());
            }
          }
        },
      }
    );
  }, [fen, isFlipped, gameMode, getEngine, startAnimation, endAnimation, makeMove, addIncrement, animation, playSound]);

  // ============================================================================
  // AI Move via SSE
  // ============================================================================
  
  const triggerAiMove = useCallback(async (currentFen: string) => {
    // Abort any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    setAiThinking(true);
    
    try {
      const response = await fetch("/api/ai-move-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: currentFen, elo, stream: true }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          const eventMatch = line.match(/^event: (\w+)/);
          const dataMatch = line.match(/^data: (.+)$/m);

          if (eventMatch && dataMatch) {
            const event = eventMatch[1];
            const data = JSON.parse(dataMatch[1]);

            if (event === "move" && data.move && data.from && data.to) {
              // Animate and apply AI move
              const engine = getEngine();
              engine.load(currentFen);
              
              const movingPiece = engine.get(data.from as ChessSquare);
              const targetPiece = engine.get(data.to as ChessSquare);
              const isCapture = !!targetPiece;
              const isCastling = movingPiece?.type === "k" && 
                Math.abs(data.from.charCodeAt(0) - data.to.charCodeAt(0)) === 2;
              
              const pieceStr = movingPiece
                ? movingPiece.color === "w"
                  ? movingPiece.type.toUpperCase()
                  : movingPiece.type
                : "";

              startAnimation(data.from, data.to, pieceStr, isCapture);
              
              const boardElement = document.querySelector('.board');
              const boardSize = boardElement?.clientWidth || 560;
              
              animation.animate(
                data.from,
                data.to,
                pieceStr,
                boardSize,
                isFlipped,
                isCapture,
                {
                  onProgress: () => {},
                  onComplete: () => {
                    endAnimation();
                    // Apply AI move through store (records move in move list)
                    const move = applyAiMove(data.from, data.to, data.promotion);
                    addIncrement("b");
                    
                    // Play sound
                    if (move) {
                      const engine = getEngine();
                      if (engine.inCheck()) {
                        playSound("check");
                      } else if (isCastling) {
                        playSound("castle");
                      } else if (isCapture) {
                        playSound("capture");
                      } else {
                        playSound("move");
                      }
                    }
                  },
                }
              );
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        console.error("AI move error:", err);
        // Fallback to non-streaming endpoint
        try {
          const fallbackResponse = await fetch("/api/ai-move", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fen: currentFen, elo }),
            signal: controller.signal,
          });
          
          if (fallbackResponse.ok) {
            const data = await fallbackResponse.json();
            if (data.from && data.to) {
              applyAiMove(data.from, data.to, data.promotion);
              playSound("move");
            }
          }
        } catch {
          // Silent fail on fallback
        }
      }
    } finally {
      clearTimeout(timeoutId);
      setAiThinking(false);
      abortControllerRef.current = null;
    }
  }, [elo, isFlipped, getEngine, startAnimation, endAnimation, applyAiMove, addIncrement, setAiThinking, animation, playSound]);

  // Keep ref in sync
  triggerAiMoveRef.current = triggerAiMove;

  // ============================================================================
  // Square click handler
  // ============================================================================
  
  const handleSquareClick = useCallback((square: ChessSquare) => {
    if (isAiThinking || animatingPiece || isGameOver || pendingPromotion) {
      return;
    }

    const engine = getEngine();
    engine.load(fen);
    const piece = engine.get(square);

    if (selectedSquare) {
      // Check if it's a legal move
      if (legalMovesSet.has(square)) {
        const movingPiece = engine.get(selectedSquare as ChessSquare);
        
        // Check for pawn promotion
        const isPromotion = movingPiece?.type === "p" && 
          ((movingPiece.color === "w" && square[1] === "8") ||
           (movingPiece.color === "b" && square[1] === "1"));

        if (isPromotion) {
          setPendingPromotion({
            from: selectedSquare,
            to: square,
            color: movingPiece!.color,
          });
          return;
        }

        executeMove(selectedSquare as ChessSquare, square);
      } else {
        // Select new piece or deselect
        if (piece && piece.color === engine.turn()) {
          selectSquare(square);
        } else {
          clearSelection();
        }
      }
    } else {
      // Select piece if it belongs to current player
      if (piece && piece.color === engine.turn()) {
        // In AI mode, only allow white to move
        if (gameMode === "ai" && piece.color !== "w") {
          return;
        }
        selectSquare(square);
      }
    }
  }, [fen, selectedSquare, legalMovesSet, isAiThinking, animatingPiece, isGameOver, pendingPromotion, gameMode, getEngine, selectSquare, clearSelection, setPendingPromotion, executeMove]);

  // ============================================================================
  // Promotion handlers
  // ============================================================================
  
  const handlePromotionSelect = useCallback((piece: PromotionPiece) => {
    if (!pendingPromotion) return;
    executeMove(pendingPromotion.from as ChessSquare, pendingPromotion.to as ChessSquare, piece);
    setPendingPromotion(null);
  }, [pendingPromotion, executeMove, setPendingPromotion]);

  const handlePromotionCancel = useCallback(() => {
    setPendingPromotion(null);
    clearSelection();
  }, [setPendingPromotion, clearSelection]);

  // ============================================================================
  // Animation styles
  // ============================================================================
  
  const getAnimationStyle = useCallback((square: ChessSquare) => {
    if (!animatingPiece || animatingPiece.to !== square) return {};

    const fromFile = animatingPiece.from.charCodeAt(0) - 97;
    const fromRank = parseInt(animatingPiece.from[1], 10);
    const toFile = square.charCodeAt(0) - 97;
    const toRank = parseInt(square[1], 10);

    let deltaX = (fromFile - toFile) * 100;
    let deltaY = (toRank - fromRank) * 100;
    
    if (isFlipped) {
      deltaX = -deltaX;
      deltaY = -deltaY;
    }

    return {
      transform: `translate(${deltaX}%, ${deltaY}%)`,
      transition: "none",
    };
  }, [animatingPiece, isFlipped]);

  // ============================================================================
  // Render
  // ============================================================================
  
  return (
    <div className="board-container relative">
      <div
        className={`board grid grid-cols-8 gap-0 overflow-hidden transition-opacity duration-300 ${
          isGameOver ? "opacity-75" : ""
        } ${isAiThinking ? "cursor-wait" : ""}`}
        style={{
          width: "min(calc(100vw - 2rem), calc(100vh - 2rem), 700px)",
          height: "min(calc(100vw - 2rem), calc(100vh - 2rem), 700px)",
          border: "6px solid #4b3621",
          borderRadius: "4px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}
      >
        {boardData.map((s) => {
          const isAnimatingFrom = animatingPiece && animatingPiece.from === s.square;
          const isAnimatingTo = animatingPiece && animatingPiece.to === s.square;
          const isBeingCaptured = capturingSquare === s.square;

          let displayPiece = s.piece
            ? s.color === "w"
              ? s.piece.toUpperCase()
              : s.piece
            : null;

          // Hide piece at origin during animation
          if (isAnimatingFrom) {
            displayPiece = null;
          }

          // Show animating piece at destination with offset
          if (isAnimatingTo && !isBeingCaptured) {
            displayPiece = animatingPiece.piece;
          }

          return (
            <div key={s.square} className="aspect-square relative">
              <Square
                square={s.square}
                piece={displayPiece}
                isSelected={selectedSquare === s.square}
                isLegalTarget={legalMovesSet.has(s.square)}
                isLastMove={lastMove !== null && (lastMove.from === s.square || lastMove.to === s.square)}
                isCheck={kingInCheck === s.square}
                isBeingCaptured={isBeingCaptured}
                onClick={() => handleSquareClick(s.square)}
              />
              {/* Animating piece overlay */}
              {isAnimatingTo && (
                <div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
                  style={{
                    ...getAnimationStyle(s.square),
                    animation: "pieceSlide 180ms cubic-bezier(0.4, 0, 0.2, 1) forwards",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* File labels */}
      <div className="flex justify-around mt-1 px-1" style={{ width: "min(calc(100vw - 2rem), 70vh, 560px)" }}>
        {(isFlipped ? ["h", "g", "f", "e", "d", "c", "b", "a"] : ["a", "b", "c", "d", "e", "f", "g", "h"]).map((f) => (
          <span key={f} className="text-xs font-medium text-gray-400 uppercase">
            {f}
          </span>
        ))}
      </div>

      {/* Rank labels */}
      <div
        className="absolute left-0 top-0 flex flex-col justify-around h-full py-1 -ml-4"
        style={{ height: "min(calc(100vw - 2rem), 70vh, 560px)" }}
      >
        {(isFlipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1]).map((r) => (
          <span key={r} className="text-xs font-medium text-gray-400">
            {r}
          </span>
        ))}
      </div>

      {/* AI Thinking Overlay */}
      {isAiThinking && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{
            background: "rgba(0,0,0,0.15)",
            borderRadius: "4px",
          }}
        >
          <div className="bg-gray-900/90 px-4 py-2 rounded-lg flex items-center gap-2">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
            <span className="text-white text-sm font-medium">AI thinking</span>
          </div>
        </div>
      )}

      {/* Pawn Promotion Dialog */}
      {pendingPromotion && (
        <PromotionDialog
          color={pendingPromotion.color}
          onSelect={handlePromotionSelect}
          onCancel={handlePromotionCancel}
        />
      )}
    </div>
  );
}

export default memo(Board);
