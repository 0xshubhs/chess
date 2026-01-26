"use client";

import React from "react";

interface PlayerPanelProps {
  name: string;
  isAI?: boolean;
  isActive: boolean;
  isThinking?: boolean;
  capturedPieces?: string[];
  materialAdvantage?: number;
  time?: string;
  isTimeLow?: boolean;
  isTimeCritical?: boolean;
  isUnlimitedTime?: boolean;
  color: "white" | "black";
}

export default function PlayerPanel({
  name,
  isAI = false,
  isActive,
  isThinking = false,
  capturedPieces = [],
  materialAdvantage = 0,
  time,
  isTimeLow = false,
  isTimeCritical = false,
  isUnlimitedTime = false,
  color,
}: PlayerPanelProps) {
  return (
    <div
      className={`player-panel flex items-center gap-3 p-3 rounded-lg transition-all duration-200 ${
        isActive
          ? "bg-[#2d2d2d] ring-2 ring-green-500/50"
          : "bg-[#262626]"
      }`}
    >
      {/* Avatar */}
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${
          isAI ? "bg-purple-600" : color === "white" ? "bg-gray-100" : "bg-gray-800"
        }`}
      >
        {isAI ? "🤖" : color === "white" ? "♔" : "♚"}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white text-sm truncate">{name}</span>
          {isThinking && (
            <span className="flex gap-0.5">
              <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
          )}
        </div>

        {/* Captured pieces */}
        <div className="flex items-center gap-0.5 mt-0.5 min-h-5">
          {capturedPieces.map((piece, i) => (
            <span key={i} className="text-xs opacity-80">
              {piece}
            </span>
          ))}
          {materialAdvantage > 0 && (
            <span className="text-xs text-gray-400 ml-1">+{materialAdvantage}</span>
          )}
        </div>
      </div>

      {/* Timer */}
      {!isUnlimitedTime && time && (
        <div
          className={`px-3 py-1.5 rounded-lg font-mono text-lg font-bold min-w-[70px] text-center transition-colors ${
            isTimeCritical
              ? "bg-red-600 text-white animate-pulse"
              : isTimeLow
              ? "bg-yellow-600/80 text-white"
              : isActive
              ? "bg-gray-700 text-white"
              : "bg-[#333] text-gray-400"
          }`}
        >
          {time}
        </div>
      )}

      {/* Active indicator (only if no timer shown) */}
      {(isUnlimitedTime || !time) && isActive && (
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
      )}
    </div>
  );
}
