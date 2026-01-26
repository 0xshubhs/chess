"use client";

import React from "react";
import { Color } from "chess.js";

interface GameActionsProps {
  onNewGame: () => void;
  onUndo: () => void;
  onFlip: () => void;
  onResign: () => void;
  onOfferDraw: () => void;
  turn: Color;
  isGameOver: boolean;
  canUndo: boolean;
  gameMode: "ai" | "pvp";
}

export default function GameActions({
  onNewGame,
  onUndo,
  onFlip,
  onResign,
  onOfferDraw,
  isGameOver,
  canUndo,
  gameMode,
}: GameActionsProps) {
  return (
    <div className="flex flex-col gap-2">
      {/* Primary actions */}
      <div className="flex gap-2">
        <button
          onClick={onNewGame}
          className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white font-semibold text-sm rounded-lg transition-colors"
        >
          New Game
        </button>
        <button
          onClick={onUndo}
          disabled={!canUndo || isGameOver}
          className={`flex-1 px-4 py-2.5 font-semibold text-sm rounded-lg transition-colors border ${
            !canUndo || isGameOver
              ? "border-gray-600 text-gray-500 cursor-not-allowed"
              : "border-gray-500 text-gray-300 hover:bg-gray-700 hover:border-gray-400"
          }`}
        >
          Undo
        </button>
      </div>
      
      {/* Secondary actions */}
      <div className="flex gap-2">
        <button
          onClick={onFlip}
          className="flex-1 px-3 py-2 bg-[#333] hover:bg-[#3a3a3a] text-gray-300 text-sm rounded-lg transition-colors flex items-center justify-center gap-1.5"
          title="Flip board"
        >
          <span className="text-base">🔄</span>
          <span className="hidden sm:inline">Flip</span>
        </button>
        
        {!isGameOver && (
          <>
            <button
              onClick={onOfferDraw}
              className="flex-1 px-3 py-2 bg-[#333] hover:bg-[#3a3a3a] text-gray-300 text-sm rounded-lg transition-colors flex items-center justify-center gap-1.5"
              title={gameMode === "pvp" ? "Agree to draw" : "Request draw"}
            >
              <span className="text-base">🤝</span>
              <span className="hidden sm:inline">Draw</span>
            </button>
            
            <button
              onClick={onResign}
              className="flex-1 px-3 py-2 bg-red-900/50 hover:bg-red-800/50 text-red-300 text-sm rounded-lg transition-colors flex items-center justify-center gap-1.5"
              title="Resign"
            >
              <span className="text-base">🏳️</span>
              <span className="hidden sm:inline">Resign</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
