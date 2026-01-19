"use client";

import React, { useRef, useEffect } from "react";

type MoveEntry = {
  moveNumber: number;
  white?: string;
  black?: string;
};

type Props = {
  moves: string[];
  statusMsg?: string;
};

export default function MoveList({ moves, statusMsg }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Group moves into pairs (white, black)
  const movePairs: MoveEntry[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({
      moveNumber: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1],
    });
  }

  const lastMoveIndex = moves.length - 1;
  const isWhiteLastMove = lastMoveIndex % 2 === 0;

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [moves]);

  if (moves.length === 0) {
    return (
      <div className="move-list bg-[#262626] rounded-lg p-3">
        <div className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-semibold">
          Moves
        </div>
        <div className="text-sm text-gray-500 italic">No moves yet</div>
      </div>
    );
  }

  // Check if move is a check or checkmate
  const getMoveStyle = (move: string | undefined, isLast: boolean) => {
    if (!move) return "";
    const isCheck = move.includes("+");
    const isMate = move.includes("#");
    
    let style = "";
    if (isLast) {
      style = "font-bold ";
      if (isMate) style += "text-red-400";
      else if (isCheck) style += "text-yellow-400";
      else style += "text-green-400";
    }
    return style;
  };

  return (
    <div className="move-list bg-[#262626] rounded-lg p-3">
      <div className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-semibold">
        Moves
      </div>
      <div
        ref={scrollRef}
        className="max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600"
      >
        {movePairs.map((pair, idx) => {
          const isLastPair = idx === movePairs.length - 1;
          const whiteIsLast = isLastPair && isWhiteLastMove;
          const blackIsLast = isLastPair && !isWhiteLastMove && pair.black;
          
          return (
            <div
              key={pair.moveNumber}
              className={`flex items-center text-sm font-mono py-0.5 px-1 rounded ${
                idx % 2 === 1 ? "bg-[#1e1e1e]" : ""
              }`}
            >
              <span className="w-6 text-gray-500 text-right mr-2 text-xs">
                {pair.moveNumber}.
              </span>
              <span className={`w-16 ${whiteIsLast ? getMoveStyle(pair.white, true) : "text-white"}`}>
                {pair.white || ""}
              </span>
              <span className={`w-16 ${blackIsLast ? getMoveStyle(pair.black, true) : "text-gray-300"}`}>
                {pair.black || ""}
                {blackIsLast && statusMsg === "Checkmate" && (
                  <span className="ml-1 text-xs">←</span>
                )}
              </span>
              {whiteIsLast && !pair.black && statusMsg === "Checkmate" && (
                <span className="text-xs text-red-400 ml-1">←</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
