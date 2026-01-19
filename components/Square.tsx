"use client";

import React from "react";
import Piece from "./Piece";

type Props = {
  square: string;
  piece: string | null;
  isSelected?: boolean;
  isLegalTarget?: boolean;
  isLastMove?: boolean;
  isCheck?: boolean;
  onClick?: () => void;
};

export default function Square({
  square,
  piece,
  isSelected,
  isLegalTarget,
  isLastMove,
  isCheck,
  onClick,
}: Props) {
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1], 10);
  const isLight = (file + rank) % 2 === 0;

  // Chess.com style colors
  const lightSquare = "#f0d9b5";
  const darkSquare = "#b58863";
  const bgColor = isLight ? lightSquare : darkSquare;

  return (
    <div
      onClick={onClick}
      className="square relative flex items-center justify-center select-none cursor-pointer transition-all duration-75"
      style={{
        backgroundColor: bgColor,
        boxShadow: `
          inset 0 1px 0 rgba(255,255,255,0.15),
          inset 0 -1px 0 rgba(0,0,0,0.2)
        `,
      }}
    >
      {/* Last move highlight */}
      {isLastMove && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundColor: "rgba(255, 255, 0, 0.4)" }}
        />
      )}

      {/* Check highlight - red radial gradient */}
      {isCheck && (
        <div
          className="absolute inset-0 pointer-events-none animate-pulse"
          style={{
            background: "radial-gradient(circle, rgba(255,107,107,0.9) 0%, rgba(255,107,107,0.4) 40%, transparent 70%)",
          }}
        />
      )}

      {/* Selected square highlight */}
      {isSelected && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            outline: "3px solid rgba(255, 255, 0, 0.9)",
            outlineOffset: "-3px",
          }}
        />
      )}

      {/* Legal move indicator */}
      {isLegalTarget && !piece && (
        <div
          className="absolute pointer-events-none rounded-full"
          style={{
            width: "28%",
            height: "28%",
            backgroundColor: "rgba(0, 0, 0, 0.18)",
          }}
        />
      )}

      {/* Capture indicator (ring around square with piece) */}
      {isLegalTarget && piece && (
        <div
          className="absolute inset-0 pointer-events-none rounded-full m-[4%]"
          style={{
            border: "5px solid rgba(0, 0, 0, 0.18)",
          }}
        />
      )}

      {/* Piece */}
      {piece && (
        <div className="piece-wrapper flex items-center justify-center w-full h-full transition-transform duration-150 hover:scale-105">
          <Piece piece={piece} />
        </div>
      )}
    </div>
  );
}
