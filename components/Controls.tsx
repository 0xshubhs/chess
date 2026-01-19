"use client";

import React, { useState } from "react";
import { Chess } from "chess.js";

type Props = {
  fen: string;
  setFen: (fen: string) => void;
  statusMsg: string;
  elo: number;
  setElo: (elo: number) => void;
  onNewGame?: () => void;
  isGameOver?: boolean;
};

export default function Controls({
  fen,
  setFen,
  statusMsg,
  elo,
  setElo,
  onNewGame,
  isGameOver = false,
}: Props) {
  const [showTooltip, setShowTooltip] = useState(false);

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
              ? "bg-red-900/50 text-red-300 border border-red-700/50"
              : statusMsg === "Check"
              ? "bg-yellow-900/50 text-yellow-300 border border-yellow-700/50"
              : statusMsg === "Stalemate" || statusMsg === "Draw"
              ? "bg-blue-900/50 text-blue-300 border border-blue-700/50"
              : "bg-gray-700 text-gray-300"
          }`}
        >
          {statusMsg === "Checkmate" && "⚔️ "}
          {statusMsg === "Check" && "⚠️ "}
          {statusMsg === "Stalemate" && "🤝 "}
          {statusMsg === "Draw" && "🤝 "}
          {statusMsg}
          {statusMsg === "Checkmate" && "!"}
        </div>
      )}

      {/* ELO Slider */}
      <div className="bg-[#262626] rounded-lg p-3 relative">
        <div className="flex justify-between items-center mb-2">
          <div 
            className="flex items-center gap-1.5 cursor-help"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
              Engine Strength
            </span>
            <span className="text-gray-600 text-xs">ⓘ</span>
          </div>
          <span className="text-xs text-gray-400 font-medium">{getDifficultyLabel(elo)}</span>
        </div>
        
        {/* Tooltip */}
        {showTooltip && (
          <div className="absolute left-0 right-0 top-full mt-1 z-10 bg-gray-900 text-gray-300 text-xs p-2 rounded-lg shadow-lg border border-gray-700">
            ELO-style strength rating. Affects move selection randomness — lower values play weaker, higher values play stronger.
          </div>
        )}
        
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
          <span className="text-white font-bold text-sm w-12 text-right tabular-nums">{elo}</span>
        </div>
        
        {/* Strength bar visualization */}
        <div className="mt-2 h-1 bg-gray-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-green-600 via-yellow-500 to-red-500 transition-all duration-200"
            style={{ width: `${((elo - 600) / 1800) * 100}%` }}
          />
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
          disabled={isGameOver}
          className={`flex-1 px-4 py-2.5 font-semibold text-sm rounded-lg transition-colors border
            ${isGameOver 
              ? "border-gray-600 text-gray-500 cursor-not-allowed" 
              : "border-gray-500 text-gray-300 hover:bg-gray-700 hover:border-gray-400"
            }`}
        >
          Undo
        </button>
      </div>
    </div>
  );
}
