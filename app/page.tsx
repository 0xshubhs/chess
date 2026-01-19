"use client";

import React, { useState, useMemo, useCallback } from "react";
import Board from "../components/Board";
import Controls from "../components/Controls";
import PlayerPanel from "../components/PlayerPanel";
import MoveList from "../components/MoveList";
import { Chess } from "chess.js";

export default function Page() {
  const [fen, setFen] = useState<string>(new Chess().fen());
  const [turn, setTurn] = useState<string>("w");
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [elo, setElo] = useState<number>(1200);
  const [moves, setMoves] = useState<string[]>([]);
  const [isAiThinking, setIsAiThinking] = useState(false);

  const game = useMemo(() => new Chess(fen), [fen]);

  // Calculate captured pieces
  const { whiteCaptured, blackCaptured, whiteAdvantage, blackAdvantage } = useMemo(() => {
    const pieceValues: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
    const pieceGlyphs: Record<string, string> = {
      p: "♟", n: "♞", b: "♝", r: "♜", q: "♛",
      P: "♙", N: "♘", B: "♗", R: "♖", Q: "♕",
    };

    const initial = { p: 8, n: 2, b: 2, r: 2, q: 1 };
    const current = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };

    const board = game.board();
    for (const row of board) {
      for (const piece of row) {
        if (piece && piece.type !== "k") {
          current[piece.color][piece.type]++;
        }
      }
    }

    const whiteCaptured: string[] = [];
    const blackCaptured: string[] = [];
    let whiteMaterial = 0;
    let blackMaterial = 0;

    for (const type of ["q", "r", "b", "n", "p"] as const) {
      const capturedByWhite = initial[type] - current.b[type];
      const capturedByBlack = initial[type] - current.w[type];

      for (let i = 0; i < capturedByWhite; i++) {
        whiteCaptured.push(pieceGlyphs[type]);
        whiteMaterial += pieceValues[type];
      }
      for (let i = 0; i < capturedByBlack; i++) {
        blackCaptured.push(pieceGlyphs[type.toUpperCase()]);
        blackMaterial += pieceValues[type];
      }
    }

    return {
      whiteCaptured,
      blackCaptured,
      whiteAdvantage: Math.max(0, whiteMaterial - blackMaterial),
      blackAdvantage: Math.max(0, blackMaterial - whiteMaterial),
    };
  }, [fen, game]);

  const handleMove = useCallback((move: { from: string; to: string; san: string }) => {
    setMoves((prev) => [...prev, move.san]);
  }, []);

  const handleNewGame = useCallback(() => {
    setMoves([]);
  }, []);

  // Watch for AI thinking state
  const handleSetFen = useCallback((newFen: string) => {
    setFen(newFen);
  }, []);

  // Determine if game is over
  const isGameOver = game.isGameOver();

  return (
    <div className="game-container flex flex-col lg:flex-row items-start justify-center gap-4 lg:gap-6 p-2 lg:p-4">
      {/* Left side panel (shows on top on mobile) */}
      <div className="side-panel w-full lg:w-64 order-2 lg:order-1 flex flex-col gap-3">
        <PlayerPanel
          name="Ollama AI"
          isAI
          isActive={turn === "b" && !isGameOver}
          isThinking={isAiThinking}
          capturedPieces={blackCaptured}
          materialAdvantage={blackAdvantage}
        />

        <div className="hidden lg:block">
          <MoveList moves={moves} statusMsg={statusMsg} />
        </div>

        <PlayerPanel
          name="You"
          isActive={turn === "w" && !isGameOver}
          capturedPieces={whiteCaptured}
          materialAdvantage={whiteAdvantage}
        />
      </div>

      {/* Board */}
      <div className="board-wrapper order-1 lg:order-2 pl-4">
        <Board
          fen={fen}
          setFen={handleSetFen}
          setStatusMsg={setStatusMsg}
          elo={elo}
          setTurn={setTurn}
          onMove={handleMove}
        />
      </div>

      {/* Right side panel */}
      <div className="side-panel w-full lg:w-64 order-3 flex flex-col gap-3">
        <Controls
          fen={fen}
          setFen={handleSetFen}
          statusMsg={statusMsg}
          elo={elo}
          setElo={setElo}
          onNewGame={handleNewGame}
          isGameOver={isGameOver}
        />

        {/* Mobile move list */}
        <div className="lg:hidden">
          <MoveList moves={moves} statusMsg={statusMsg} />
        </div>
      </div>
    </div>
  );
}
