"use client";

import React, { useRef, useEffect } from "react";

type MoveEntry = {
  moveNumber: number;
  white?: string;
  black?: string;
};

type Props = {
  moves: string[];
};

export default function MoveList({ moves }: Props) {
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

  return (
    <div className="move-list bg-[#262626] rounded-lg p-3">
      <div className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-semibold">
        Moves
      </div>
      <div
        ref={scrollRef}
        className="max-h-48 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-gray-600"
      >
        {movePairs.map((pair) => (
          <div
            key={pair.moveNumber}
            className="flex items-center text-sm font-mono"
          >
            <span className="w-6 text-gray-500 text-right mr-2">
              {pair.moveNumber}.
            </span>
            <span className="w-16 text-white">{pair.white || ""}</span>
            <span className="w-16 text-gray-300">{pair.black || ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
