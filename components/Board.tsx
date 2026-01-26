"use client";

import React, { useEffect, useMemo, useState, useCallback, useRef, MutableRefObject } from "react";
import { Chess, Move, Square as ChessSquare, Color } from "chess.js";
import Square from "./Square";
import PromotionDialog from "./PromotionDialog";
import { useSoundEffects } from "../hooks/useSoundEffects";

export type GameMode = "ai" | "pvp";

type PromotionPiece = "q" | "r" | "b" | "n";

type Props = {
  fen: string;
  setFen: (fen: string) => void;
  setStatusMsg: (s: string) => void;
  elo: number;
  setTurn?: (t: Color) => void;
  onMove?: (move: { from: string; to: string; san: string }) => void;
  soundEnabled?: boolean;
  onEvalUpdate?: (evaluation: number, depth?: number) => void;
  gameMode?: GameMode;
  onGameOver?: (isOver: boolean) => void;
  onThinkingChange?: (isThinking: boolean) => void;
  abortControllerRef?: MutableRefObject<AbortController | null>;
  isFlipped?: boolean;
};

type LastMove = {
  from: ChessSquare;
  to: ChessSquare;
};

type AnimatingPiece = {
  piece: string;
  from: ChessSquare;
  to: ChessSquare;
  isCapture?: boolean;
};

type PendingPromotion = {
  from: ChessSquare;
  to: ChessSquare;
  color: "w" | "b";
};

export default function Board({ 
  fen, 
  setFen, 
  setStatusMsg, 
  elo, 
  setTurn, 
  onMove,
  soundEnabled = true,
  onEvalUpdate,
  gameMode = "ai",
  onGameOver,
  onThinkingChange,
  abortControllerRef,
  isFlipped = false
}: Props) {
  const [selected, setSelected] = useState<ChessSquare | null>(null);
  const [legalSquaresArray, setLegalSquaresArray] = useState<ChessSquare[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  
  // Use Set for O(1) lookup instead of O(n) array.includes
  const legalSquares = useMemo(() => new Set(legalSquaresArray), [legalSquaresArray]);
  const [lastMove, setLastMove] = useState<LastMove | null>(null);
  const [animatingPiece, setAnimatingPiece] = useState<AnimatingPiece | null>(null);
  const [capturingSquare, setCapturingSquare] = useState<ChessSquare | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  
  // Keep a stable ref to the current FEN for async operations
  const fenRef = useRef(fen);
  fenRef.current = fen;
  
  // Track previous FEN to detect new game reset
  const prevFenRef = useRef(fen);

  const { playSound } = useSoundEffects(soundEnabled);
  
  // Create game instance - memoized on fen
  const game = useMemo(() => new Chess(fen), [fen]);
  
  // Reset board state when a new game starts (FEN changes to initial position)
  useEffect(() => {
    const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const isNewGame = fen === INITIAL_FEN && prevFenRef.current !== INITIAL_FEN;
    
    if (isNewGame) {
      // Clear all board visual state
      setLastMove(null);
      setSelected(null);
      setLegalSquaresArray([]);
      setAnimatingPiece(null);
      setCapturingSquare(null);
      setPendingPromotion(null);
    }
    
    prevFenRef.current = fen;
  }, [fen]);

  // Find king square if in check
  const kingInCheck = useMemo(() => {
    if (!game.inCheck()) return null;
    const turn = game.turn();
    const board = game.board();
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = board[r][f];
        if (p && p.type === "k" && p.color === turn) {
          return ("abcdefgh".charAt(f) + (8 - r)) as ChessSquare;
        }
      }
    }
    return null;
  }, [game]);

  useEffect(() => {
    if (setTurn) setTurn(game.turn());
    
    const isOver = game.isGameOver();
    if (onGameOver) onGameOver(isOver);
    
    if (game.isCheckmate()) {
      setStatusMsg("Checkmate");
      playSound("gameEnd");
    }
    else if (game.isStalemate()) {
      setStatusMsg("Stalemate");
      playSound("gameEnd");
    }
    else if (game.isDraw()) {
      setStatusMsg("Draw");
      playSound("gameEnd");
    }
    else if (game.inCheck()) {
      setStatusMsg("Check");
    }
    else setStatusMsg("");
  }, [fen, game, setTurn, setStatusMsg, playSound, onGameOver]);

  const animateMove = useCallback(
    (from: ChessSquare, to: ChessSquare, piece: string, isCapture: boolean, callback: () => void) => {
      setAnimatingPiece({ piece, from, to, isCapture });
      
      // If capture, delay the captured piece fade
      if (isCapture) {
        setCapturingSquare(to);
        // Remove captured piece after delay
        setTimeout(() => {
          setCapturingSquare(null);
        }, 80); // --capture-delay
      }
      
      setTimeout(() => {
        setAnimatingPiece(null);
        callback();
      }, 180); // --move-duration
    },
    []
  );

  function onSquareClick(square: ChessSquare) {
    // Disable clicks when thinking, animating, game is over, or promotion dialog is open
    if (isThinking || animatingPiece || game.isGameOver() || pendingPromotion) return;

    const piece = game.get(square);

    if (selected) {
      const legalMoves = game.moves({ verbose: true });
      const isLegal = legalMoves.some(
        (m) => m.from === selected && m.to === square
      );

      if (isLegal) {
        const movingPiece = game.get(selected);
        
        // Check if this is a pawn promotion move
        const isPromotion = movingPiece?.type === "p" && 
          ((movingPiece.color === "w" && square[1] === "8") ||
           (movingPiece.color === "b" && square[1] === "1"));

        if (isPromotion) {
          // Show promotion dialog
          setPendingPromotion({
            from: selected,
            to: square,
            color: movingPiece!.color,
          });
          return;
        }

        // Execute the move
        executeMove(selected, square);
      } else {
        if (piece && piece.color === game.turn()) {
          setSelected(square);
          const moves = game.moves({ square, verbose: true }) as Move[];
          setLegalSquaresArray(moves.map((m) => m.to));
        } else {
          setSelected(null);
          setLegalSquaresArray([]);
        }
      }
    } else {
      if (piece && piece.color === game.turn()) {
        setSelected(square);
        const moves = game.moves({ square, verbose: true }) as Move[];
        setLegalSquaresArray(moves.map((m) => m.to));
      }
    }
  }

  function executeMove(from: ChessSquare, to: ChessSquare, promotion?: PromotionPiece) {
    // Create fresh game instance for the move to avoid stale closure issues
    const freshGame = new Chess(fenRef.current);
    const movingPiece = freshGame.get(from);
    const targetPiece = freshGame.get(to);
    const pieceStr = movingPiece
      ? movingPiece.color === "w"
        ? movingPiece.type.toUpperCase()
        : movingPiece.type
      : "";
    
    // Check if it's a capture
    const isCapture = !!targetPiece;
    
    // Check for castling
    const isCastling = movingPiece?.type === "k" && 
      Math.abs(from.charCodeAt(0) - to.charCodeAt(0)) === 2;

    animateMove(from, to, pieceStr, isCapture, () => {
      const move = freshGame.move({ from, to, promotion: promotion || "q" });
      if (move) {
        const newFen = freshGame.fen();
        setLastMove({ from, to });
        setSelected(null);
        setLegalSquaresArray([]);
        setFen(newFen);
        if (onMove) onMove({ from, to, san: move.san });
        
        // Play appropriate sound
        if (freshGame.inCheck()) {
          playSound("check");
        } else if (isCastling) {
          playSound("castle");
        } else if (isCapture) {
          playSound("capture");
        } else {
          playSound("move");
        }
        
        // Only trigger AI if in AI mode and it's black's turn
        if (gameMode === "ai" && !freshGame.isGameOver()) {
          triggerAiMove(newFen);
        }
      }
    });
  }

  function handlePromotionSelect(piece: PromotionPiece) {
    if (!pendingPromotion) return;
    
    executeMove(pendingPromotion.from, pendingPromotion.to, piece);
    setPendingPromotion(null);
  }

  function handlePromotionCancel() {
    setPendingPromotion(null);
    setSelected(null);
    setLegalSquaresArray([]);
  }

  async function triggerAiMove(currentFen: string) {
    const currentGame = new Chess(currentFen);
    if (currentGame.isGameOver()) return;
    
    // Create abort controller for this request
    const controller = new AbortController();
    if (abortControllerRef) {
      // Abort any previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = controller;
    }
    
    // Set timeout for the request (30 seconds)
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    setIsThinking(true);
    if (onThinkingChange) onThinkingChange(true);
    try {
      const r = await fetch("/api/ai-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: currentFen, elo }),
        signal: controller.signal,
      });
      
      // Check if request was aborted or component unmounted
      if (controller.signal.aborted) return;
      
      const data = await r.json();
      if (data?.move && data?.fen) {
        // Parse the AI move to animate it
        const aiGame = new Chess(currentFen);
        const aiMoves = aiGame.moves({ verbose: true });
        const aiMove = aiMoves.find((m) => m.san === data.move);

        if (aiMove) {
          const aiPiece =
            aiMove.color === "w"
              ? aiMove.piece.toUpperCase()
              : aiMove.piece;
          
          const isCapture = !!aiMove.captured;
          const isCastling = aiMove.piece === "k" && 
            Math.abs(aiMove.from.charCodeAt(0) - aiMove.to.charCodeAt(0)) === 2;

          animateMove(aiMove.from, aiMove.to, aiPiece, isCapture, () => {
            setLastMove({ from: aiMove.from, to: aiMove.to });
            setFen(data.fen);
            if (onMove)
              onMove({ from: aiMove.from, to: aiMove.to, san: data.move });
            
            // Play appropriate sound for AI move
            const checkGame = new Chess(data.fen);
            if (checkGame.inCheck()) {
              playSound("check");
            } else if (isCastling) {
              playSound("castle");
            } else if (isCapture) {
              playSound("capture");
            } else {
              playSound("move");
            }
            
            // Update evaluation if callback provided
            if (onEvalUpdate && data.evaluation !== undefined) {
              onEvalUpdate(data.evaluation, data.depth);
            }
          });
        } else {
          setFen(data.fen);
        }
      } else {
        console.error("AI response malformed", data);
      }
    } catch (err) {
      // Only log error if not aborted
      if (err instanceof Error && err.name !== "AbortError") {
        console.error("AI move error:", err);
      }
    } finally {
      clearTimeout(timeoutId);
      // Only update state if this controller is still the active one
      if (!abortControllerRef || abortControllerRef.current === controller) {
        setIsThinking(false);
        if (onThinkingChange) onThinkingChange(false);
      }
    }
  }

  // Pre-compute file/rank to square mapping for better performance
  const SQUARES: ChessSquare[] = useMemo(() => {
    const squares: ChessSquare[] = [];
    if (isFlipped) {
      // When flipped, iterate from white's perspective reversed
      for (let rank = 1; rank <= 8; rank++) {
        for (let file = 7; file >= 0; file--) {
          squares.push(("abcdefgh".charAt(file) + rank) as ChessSquare);
        }
      }
    } else {
      // Normal orientation
      for (let rank = 8; rank >= 1; rank--) {
        for (let file = 0; file < 8; file++) {
          squares.push(("abcdefgh".charAt(file) + rank) as ChessSquare);
        }
      }
    }
    return squares;
  }, [isFlipped]);

  const board = useMemo(() => {
    const rows = game.board();
    return SQUARES.map((square, idx) => {
      const rank = 8 - Math.floor(idx / 8);
      const file = idx % 8;
      const p = rows[8 - rank][file];
      return {
        piece: p ? p.type : null,
        color: p ? p.color : null,
        square,
      };
    });
  }, [game, SQUARES]);

  // Calculate animation offset
  const getAnimationStyle = (square: ChessSquare) => {
    if (!animatingPiece || animatingPiece.to !== square) return {};

    const fromFile = animatingPiece.from.charCodeAt(0) - 97;
    const fromRank = parseInt(animatingPiece.from[1], 10);
    const toFile = square.charCodeAt(0) - 97;
    const toRank = parseInt(square[1], 10);

    const deltaX = (fromFile - toFile) * 100;
    const deltaY = (toRank - fromRank) * 100;

    return {
      transform: `translate(${deltaX}%, ${deltaY}%)`,
      transition: "none",
    };
  };

  // Check if game is over
  const isGameOver = game.isGameOver();

  return (
    <div className="board-container relative">
      <div
        className={`board grid grid-cols-8 gap-0 overflow-hidden transition-opacity duration-300 ${
          isGameOver ? "opacity-75" : ""
        } ${isThinking ? "cursor-wait" : ""}`}
        style={{
          width: "min(calc(100vw - 2rem), 70vh, 560px)",
          height: "min(calc(100vw - 2rem), 70vh, 560px)",
          border: "6px solid #4b3621",
          borderRadius: "4px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}
      >
        {board.map((s) => {
          const isAnimatingFrom =
            animatingPiece && animatingPiece.from === s.square;
          const isAnimatingTo =
            animatingPiece && animatingPiece.to === s.square;
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
                isSelected={selected === s.square}
                isLegalTarget={legalSquares.has(s.square)}
                isLastMove={
                  lastMove !== null &&
                  (lastMove.from === s.square || lastMove.to === s.square)
                }
                isCheck={kingInCheck === s.square}
                isBeingCaptured={isBeingCaptured}
                onClick={() => onSquareClick(s.square)}
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
      {isThinking && (
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
