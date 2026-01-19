"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Chess, Move, Square as ChessSquare } from "chess.js";
import Square from "./Square";

type Props = {
  fen: string;
  setFen: (fen: string) => void;
  setStatusMsg: (s: string) => void;
  elo: number;
  setTurn?: (t: string) => void;
  onMove?: (move: { from: string; to: string; san: string }) => void;
};

type LastMove = {
  from: ChessSquare;
  to: ChessSquare;
};

function useChess(fen: string) {
  const game = useMemo(() => new Chess(fen), [fen]);
  return game;
}

export default function Board({ fen, setFen, setStatusMsg, elo, setTurn, onMove }: Props) {
  const [selected, setSelected] = useState<ChessSquare | null>(null);
  const [legalSquares, setLegalSquares] = useState<ChessSquare[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [lastMove, setLastMove] = useState<LastMove | null>(null);
  const [animatingPiece, setAnimatingPiece] = useState<{
    piece: string;
    from: ChessSquare;
    to: ChessSquare;
  } | null>(null);

  const game = useChess(fen);

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
    if (game.isCheckmate()) setStatusMsg("Checkmate");
    else if (game.isStalemate()) setStatusMsg("Stalemate");
    else if (game.isDraw()) setStatusMsg("Draw");
    else if (game.inCheck()) setStatusMsg("Check");
    else setStatusMsg("");
  }, [fen, game, setTurn, setStatusMsg]);

  const animateMove = useCallback(
    (from: ChessSquare, to: ChessSquare, piece: string, callback: () => void) => {
      setAnimatingPiece({ piece, from, to });
      setTimeout(() => {
        setAnimatingPiece(null);
        callback();
      }, 180);
    },
    []
  );

  function onSquareClick(square: ChessSquare) {
    if (isThinking || animatingPiece) return;

    const piece = game.get(square);

    if (selected) {
      const moveAttempt = { from: selected, to: square, promotion: "q" as const };
      const legalMoves = game.moves({ verbose: true });
      const isLegal = legalMoves.some(
        (m) => m.from === selected && m.to === square
      );

      if (isLegal) {
        const movingPiece = game.get(selected);
        const pieceStr = movingPiece
          ? movingPiece.color === "w"
            ? movingPiece.type.toUpperCase()
            : movingPiece.type
          : "";

        animateMove(selected, square, pieceStr, () => {
          const move = game.move(moveAttempt);
          if (move) {
            setLastMove({ from: selected, to: square });
            setSelected(null);
            setLegalSquares([]);
            setFen(game.fen());
            if (onMove) onMove({ from: selected, to: square, san: move.san });
            triggerAiMove(game.fen());
          }
        });
      } else {
        if (piece && piece.color === game.turn()) {
          setSelected(square);
          const moves = game.moves({ square, verbose: true }) as Move[];
          setLegalSquares(moves.map((m) => m.to));
        } else {
          setSelected(null);
          setLegalSquares([]);
        }
      }
    } else {
      if (piece && piece.color === game.turn()) {
        setSelected(square);
        const moves = game.moves({ square, verbose: true }) as Move[];
        setLegalSquares(moves.map((m) => m.to));
      }
    }
  }

  async function triggerAiMove(currentFen: string) {
    const currentGame = new Chess(currentFen);
    if (currentGame.isGameOver()) return;
    setIsThinking(true);
    try {
      const r = await fetch("/api/ai-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: currentFen, elo }),
      });
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

          animateMove(aiMove.from, aiMove.to, aiPiece, () => {
            setLastMove({ from: aiMove.from, to: aiMove.to });
            setFen(data.fen);
            if (onMove)
              onMove({ from: aiMove.from, to: aiMove.to, san: data.move });
          });
        } else {
          setFen(data.fen);
        }
      } else {
        console.error("AI response malformed", data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsThinking(false);
    }
  }

  const board = useMemo(() => {
    const rows = game.board();
    return rows.flat().map((p, idx) => ({
      piece: p ? p.type : null,
      color: p ? p.color : null,
      square: (() => {
        const file = idx % 8;
        const rank = 8 - Math.floor(idx / 8);
        return ("abcdefgh".charAt(file) + rank) as ChessSquare;
      })(),
    }));
  }, [game]);

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

  return (
    <div className="board-container relative">
      <div
        className="board grid grid-cols-8 gap-0 overflow-hidden"
        style={{
          width: "min(70vh, 560px)",
          height: "min(70vh, 560px)",
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
          if (isAnimatingTo) {
            displayPiece = animatingPiece.piece;
          }

          return (
            <div key={s.square} className="aspect-square relative">
              <Square
                square={s.square}
                piece={displayPiece}
                isSelected={selected === s.square}
                isLegalTarget={legalSquares.includes(s.square)}
                isLastMove={
                  lastMove !== null &&
                  (lastMove.from === s.square || lastMove.to === s.square)
                }
                isCheck={kingInCheck === s.square}
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
      <div className="flex justify-around mt-1 px-1" style={{ width: "min(70vh, 560px)" }}>
        {["a", "b", "c", "d", "e", "f", "g", "h"].map((f) => (
          <span key={f} className="text-xs font-medium text-gray-400 uppercase">
            {f}
          </span>
        ))}
      </div>

      {/* Rank labels */}
      <div
        className="absolute left-0 top-0 flex flex-col justify-around h-full py-1 -ml-4"
        style={{ height: "min(70vh, 560px)" }}
      >
        {[8, 7, 6, 5, 4, 3, 2, 1].map((r) => (
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
    </div>
  );
}
