"use client";

import React from "react";
import { Chess } from "chess.js";

type Props = {
  fen: string;
  setFen: (fen: string) => void;
  statusMsg: string;
  elo: number;
  setElo: (elo: number) => void;
  onNewGame?: () => void;
};

export default function Controls({
  fen,
  setFen,
  statusMsg,
  elo,
  setElo,
  onNewGame,
}: Props) {
  function reset() {
    const g = new Chess();
    setFen(g.fen());
    if (onNewGame) onNewGame();
  }

  function undo() {
    const g = new Chess(fen);
    g.undo();
    g.undo(); // undo both AI and player move
    setFen(g.fen());
  }

  // Difficulty label based on ELO
  const getDifficultyLabel = (elo: number) => {
    if (elo < 800) return "Beginner";
    if (elo < 1200) return "Casual";
    if (elo < 1600) return "Intermediate";
    if (elo < 2000) return "Advanced";
    return "Master";
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Status badge - only show when relevant */}
      {statusMsg && statusMsg !== "Playing" && (
        <div
          className={`px-3 py-2 rounded-lg text-center font-semibold text-sm ${
            statusMsg === "Checkmate"
              ? "bg-red-900/50 text-red-300"
              : statusMsg === "Check"
              ? "bg-yellow-900/50 text-yellow-300"
              : "bg-gray-700 text-gray-300"
          }`}
        >
          {statusMsg === "Checkmate" && "⚔️ "}
          {statusMsg === "Check" && "⚠️ "}
          {statusMsg}
          {statusMsg === "Checkmate" && "!"}
        </div>
      )}

      {/* ELO Slider */}
      <div className="bg-[#262626] rounded-lg p-3">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
            AI Strength
          </span>
          <span className="text-xs text-gray-400">{getDifficultyLabel(elo)}</span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={600}
            max={2400}
            step={100}
            value={elo}
            onChange={(e) => setElo(Number(e.target.value))}
            className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500"
          />
          <span className="text-white font-bold text-sm w-12 text-right">{elo}</span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={reset}
          className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white font-semibold text-sm rounded-lg transition-colors"
        >
          New Game
        </button>
        <button
          onClick={undo}
          className="flex-1 px-4 py-2.5 bg-[#3d3d3d] hover:bg-[#4d4d4d] text-white font-semibold text-sm rounded-lg transition-colors"
        >
          Undo
        </button>
      </div>
    </div>
  );
}
