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
  onMoveClick?: (moveIndex: number) => void;
};

export default function MoveList({ moves, statusMsg, onMoveClick }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMoveRef = useRef<HTMLDivElement>(null);

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

  // Auto-scroll to last move with smooth behavior
  useEffect(() => {
    if (lastMoveRef.current && scrollRef.current) {
      lastMoveRef.current.scrollIntoView({ 
        behavior: "smooth", 
        block: "nearest" 
      });
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

  const handleMoveClick = (moveIdx: number) => {
    if (onMoveClick) {
      onMoveClick(moveIdx);
    }
  };

  return (
    <div className="move-list bg-[#262626] rounded-lg p-3">
      <div className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-semibold">
        Moves
      </div>
      <div
        ref={scrollRef}
        className="move-list-scroll max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600"
      >
        {movePairs.map((pair, idx) => {
          const isLastPair = idx === movePairs.length - 1;
          const whiteIsLast = isLastPair && isWhiteLastMove;
          const blackIsLast = isLastPair && !isWhiteLastMove && pair.black;
          const whiteMoveIdx = idx * 2;
          const blackMoveIdx = idx * 2 + 1;
          
          return (
            <div
              key={pair.moveNumber}
              ref={isLastPair ? lastMoveRef : undefined}
              className={`flex items-center text-sm font-mono py-0.5 px-1 rounded ${
                idx % 2 === 1 ? "bg-[#1e1e1e]" : ""
              }`}
            >
              <span className="w-6 text-gray-500 text-right mr-2 text-xs">
                {pair.moveNumber}.
              </span>
              <span 
                className={`w-16 cursor-pointer hover:bg-white/10 rounded px-0.5 transition-colors ${
                  whiteIsLast ? getMoveStyle(pair.white, true) : "text-white"
                }`}
                onClick={() => handleMoveClick(whiteMoveIdx)}
              >
                {pair.white || ""}
              </span>
              <span 
                className={`w-16 cursor-pointer hover:bg-white/10 rounded px-0.5 transition-colors ${
                  blackIsLast ? getMoveStyle(pair.black, true) : "text-gray-300"
                }`}
                onClick={() => pair.black && handleMoveClick(blackMoveIdx)}
              >
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
