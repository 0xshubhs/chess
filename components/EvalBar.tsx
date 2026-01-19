"use client";

import React, { useState } from "react";

type Props = {
  /** Evaluation in centipawns (100 = 1 pawn advantage for white) */
  evaluation: number;
  /** Mate in N moves (positive = white winning, negative = black winning) */
  mateIn?: number | null;
  /** Current search depth */
  depth?: number;
  /** Nodes per second */
  nps?: number;
};

export default function EvalBar({ evaluation, mateIn, depth, nps }: Props) {
  const [showValue, setShowValue] = useState(false);

  // Convert centipawns to display value
  const getDisplayValue = () => {
    if (mateIn !== null && mateIn !== undefined) {
      return mateIn > 0 ? `M${mateIn}` : `M${Math.abs(mateIn)}`;
    }
    const val = evaluation / 100;
    return val >= 0 ? `+${val.toFixed(1)}` : val.toFixed(1);
  };

  // Calculate bar percentage (0-100, where 50 is equal)
  const getBarPercentage = () => {
    if (mateIn !== null && mateIn !== undefined) {
      return mateIn > 0 ? 98 : 2;
    }
    // Sigmoid-like scaling for eval bar
    // At +3.0, white section should be ~85%
    // At -3.0, white section should be ~15%
    const sigmoid = (x: number) => 1 / (1 + Math.exp(-x * 0.8));
    const evalPawns = evaluation / 100;
    return sigmoid(evalPawns) * 100;
  };

  const whitePercentage = getBarPercentage();
  const isWhiteWinning = evaluation > 0 || (mateIn !== null && mateIn !== undefined && mateIn > 0);

  return (
    <div 
      className="eval-bar-container relative flex flex-col items-center"
      onMouseEnter={() => setShowValue(true)}
      onMouseLeave={() => setShowValue(false)}
      onTouchStart={() => setShowValue(true)}
      onTouchEnd={() => setShowValue(false)}
    >
      {/* Eval bar */}
      <div
        className="w-2 rounded-sm overflow-hidden cursor-pointer transition-all duration-300 hover:w-3"
        style={{
          height: "min(70vh, 560px)",
          backgroundColor: "#1a1a1a",
        }}
      >
        {/* White's portion (from bottom) */}
        <div
          className="absolute bottom-0 left-0 right-0 transition-all ease-out"
          style={{
            height: `${whitePercentage}%`,
            backgroundColor: "#f5f5f5",
            transitionDuration: "400ms",
          }}
        />
        {/* Black's portion (from top) */}
        <div
          className="absolute top-0 left-0 right-0 transition-all ease-out"
          style={{
            height: `${100 - whitePercentage}%`,
            backgroundColor: "#2d2d2d",
            transitionDuration: "400ms",
          }}
        />
      </div>

      {/* Eval value tooltip */}
      {showValue && (
        <div
          className={`absolute left-4 px-2 py-1 rounded text-xs font-bold z-20 whitespace-nowrap shadow-lg ${
            isWhiteWinning 
              ? "bg-white text-black" 
              : "bg-gray-800 text-white border border-gray-700"
          }`}
          style={{
            top: `${Math.max(10, Math.min(90, 100 - whitePercentage))}%`,
            transform: "translateY(-50%)",
          }}
        >
          {getDisplayValue()}
        </div>
      )}

      {/* Depth/NPS info (shown below bar) */}
      {(depth || nps) && (
        <div className="mt-2 text-[10px] text-gray-500 font-mono text-center">
          {depth && <div>d{depth}</div>}
          {nps && <div>{Math.round(nps / 1000)}k</div>}
        </div>
      )}
    </div>
  );
}
