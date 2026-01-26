"use client";

import React from "react";

type Props = {
  piece: string;
  className?: string;
};

// Chess.com Neo piece set URLs - using 300px for higher quality
const PIECE_BASE_URL = "https://images.chesscomfiles.com/chess-themes/pieces/neo/300";

const pieceUrls: Record<string, string> = {
  // White pieces
  K: `${PIECE_BASE_URL}/wk.png`,
  Q: `${PIECE_BASE_URL}/wq.png`,
  R: `${PIECE_BASE_URL}/wr.png`,
  B: `${PIECE_BASE_URL}/wb.png`,
  N: `${PIECE_BASE_URL}/wn.png`,
  P: `${PIECE_BASE_URL}/wp.png`,
  // Black pieces
  k: `${PIECE_BASE_URL}/bk.png`,
  q: `${PIECE_BASE_URL}/bq.png`,
  r: `${PIECE_BASE_URL}/br.png`,
  b: `${PIECE_BASE_URL}/bb.png`,
  n: `${PIECE_BASE_URL}/bn.png`,
  p: `${PIECE_BASE_URL}/bp.png`,
};

export default function Piece({ piece, className = "" }: Props) {
  const imageUrl = pieceUrls[piece];
  if (!imageUrl) return null;

  return (
    <div 
      className={`piece-container ${className}`}
      style={{ 
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <img 
        src={imageUrl} 
        alt={piece}
        draggable={false}
        style={{
          width: "97%",
          height: "97%",
          objectFit: "contain",
          filter: "drop-shadow(2px 4px 2px rgba(0,0,0,0.35))",
          imageRendering: "auto",
        }}
      />
    </div>
  );
}
