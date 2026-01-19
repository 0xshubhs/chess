"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Chess, Move, Square as ChessSquare } from "chess.js";
import Square from "./Square";

type Props = {
  fen: string;
  setFen: (fen: string) => void;
  setStatusMsg: (s: string) => void;
  elo: number;
  setTurn?: (t: string) => void;
};

function useChess(fen: string) {
  // local chess instance per render; keep sync by fen
  const game = useMemo(() => new Chess(fen), [fen]);
  return game;
}

export default function Board({ fen, setFen, setStatusMsg, elo, setTurn }: Props) {
  const [selected, setSelected] = useState<ChessSquare | null>(null);
  const [legalSquares, setLegalSquares] = useState<ChessSquare[]>([]);
  const [isThinking, setIsThinking] = useState(false);

  const game = useChess(fen);

  useEffect(() => {
    if (setTurn) setTurn(game.turn());
    // game status
    if (game.isCheckmate()) setStatusMsg("Checkmate");
    else if (game.isStalemate()) setStatusMsg("Stalemate");
    else if (game.isDraw()) setStatusMsg("Draw");
    else if (game.inCheck()) setStatusMsg("Check");
    else setStatusMsg("");
  }, [fen, game, setTurn, setStatusMsg]);

  function onSquareClick(square: ChessSquare) {
    if (isThinking) return;

    const piece = game.get(square);

    if (selected) {
      // try move
      const move = game.move({ from: selected, to: square, promotion: "q" });
      if (move) {
        setSelected(null);
        setLegalSquares([]);
        setFen(game.fen());
        // after player's move, trigger AI
        triggerAiMove(game.fen());
      } else {
        // if clicked another own piece, change selection
        if (piece && piece.color === game.turn()) {
          setSelected(square);
          const moves = game.moves({ square, verbose: true }) as Move[];
          setLegalSquares(moves.map(m => m.to));
        } else {
          setSelected(null);
          setLegalSquares([]);
        }
      }
    } else {
      // select if piece of the side to move
      if (piece && piece.color === game.turn()) {
        setSelected(square);
        const moves = game.moves({ square, verbose: true }) as Move[];
        setLegalSquares(moves.map(m => m.to));
      }
    }
  }

  async function triggerAiMove(currentFen: string) {
    if (game.isGameOver()) return;
    setIsThinking(true);
    try {
      const r = await fetch("/api/ai-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: currentFen, elo }),
      });
      const data = await r.json();
      if (data?.move && data?.fen) {
        setFen(data.fen);
      } else {
        console.error("AI response malformed", data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsThinking(false);
    }
  }

  // build board matrix from fen
  const board = useMemo(() => {
    const rows = game.board();
    // board returns 8x8 array with piece objects or null
    return rows.flat().map((p, idx) => ({
      piece: p ? p.type : null,
      color: p ? p.color : null,
      square: (() => {
        const file = idx % 8;
        const rank = 8 - Math.floor(idx / 8);
        return ("abcdefgh".charAt(file) + rank) as ChessSquare;
      })(),
    }));
  }, [fen, game]);

  return (
    <div className="relative">
      <div className="board grid grid-cols-8 gap-0 border-4 border-amber-900 rounded-lg overflow-hidden">
        {board.map((s) => (
          <Square
            key={s.square}
            square={s.square}
            piece={s.piece ? (s.color === "w" ? s.piece.toUpperCase() : s.piece) : null}
            isSelected={selected === s.square}
            isLegalTarget={legalSquares.includes(s.square)}
            onClick={() => onSquareClick(s.square)}
          />
        ))}
      </div>
      {isThinking && (
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center rounded-lg">
          <div className="bg-white dark:bg-gray-800 px-4 py-2 rounded-lg shadow-lg">
            <span className="text-amber-700 dark:text-amber-300 font-medium">AI thinking...</span>
          </div>
        </div>
      )}
    </div>
  );
}
