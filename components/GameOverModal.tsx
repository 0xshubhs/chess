"use client";

import React from "react";
import { GameResult } from "../hooks/useChessGame";

interface GameOverModalProps {
  result: GameResult;
  onNewGame: () => void;
  onClose: () => void;
}

export default function GameOverModal({ result, onNewGame, onClose }: GameOverModalProps) {
  if (!result.winner) return null;
  
  const getTitle = () => {
    switch (result.reason) {
      case "checkmate":
        return result.winner === "draw" ? "Draw" : `${result.winner === "white" ? "White" : "Black"} wins!`;
      case "timeout":
        return `${result.winner === "white" ? "White" : "Black"} wins on time!`;
      case "resignation":
        return `${result.winner === "white" ? "Black" : "White"} resigned`;
      case "stalemate":
        return "Stalemate!";
      case "agreement":
        return "Draw by agreement";
      case "draw":
        return "Draw";
      default:
        return "Game Over";
    }
  };
  
  const getIcon = () => {
    if (result.winner === "draw") return "🤝";
    if (result.reason === "checkmate") return "♔";
    if (result.reason === "timeout") return "⏱️";
    if (result.reason === "resignation") return "🏳️";
    return "🎮";
  };
  
  const getSubtitle = () => {
    switch (result.reason) {
      case "checkmate":
        return "by checkmate";
      case "timeout":
        return "on time";
      case "resignation":
        return "by resignation";
      case "stalemate":
        return "No legal moves";
      case "agreement":
        return "Players agreed to draw";
      case "draw":
        return "Insufficient material / repetition / 50 move rule";
      default:
        return "";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#312e2b] rounded-xl shadow-2xl p-6 border border-gray-600 min-w-[280px] text-center">
        {/* Icon */}
        <div className="text-5xl mb-3">{getIcon()}</div>
        
        {/* Title */}
        <h2 className="text-xl font-bold text-white mb-1">{getTitle()}</h2>
        
        {/* Subtitle */}
        <p className="text-gray-400 text-sm mb-6">{getSubtitle()}</p>
        
        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-[#333] hover:bg-[#444] text-gray-300 font-semibold text-sm rounded-lg transition-colors"
          >
            Review
          </button>
          <button
            onClick={onNewGame}
            className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white font-semibold text-sm rounded-lg transition-colors"
          >
            New Game
          </button>
        </div>
      </div>
    </div>
  );
}
