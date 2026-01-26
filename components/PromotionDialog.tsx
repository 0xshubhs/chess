"use client";

import React from "react";

type PromotionPiece = "q" | "r" | "b" | "n";

type Props = {
  color: "w" | "b";
  onSelect: (piece: PromotionPiece) => void;
  onCancel: () => void;
};

// Chess.com Neo piece set URLs - using 300px for higher quality
const PIECE_BASE_URL = "https://images.chesscomfiles.com/chess-themes/pieces/neo/300";

const promotionPieceUrls: Record<string, Record<PromotionPiece, string>> = {
  w: {
    q: `${PIECE_BASE_URL}/wq.png`,
    r: `${PIECE_BASE_URL}/wr.png`,
    b: `${PIECE_BASE_URL}/wb.png`,
    n: `${PIECE_BASE_URL}/wn.png`,
  },
  b: {
    q: `${PIECE_BASE_URL}/bq.png`,
    r: `${PIECE_BASE_URL}/br.png`,
    b: `${PIECE_BASE_URL}/bb.png`,
    n: `${PIECE_BASE_URL}/bn.png`,
  },
};

const pieceLabels: Record<PromotionPiece, string> = {
  q: "Queen",
  r: "Rook", 
  b: "Bishop",
  n: "Knight",
};

export default function PromotionDialog({ color, onSelect, onCancel }: Props) {
  const pieces: PromotionPiece[] = ["q", "r", "b", "n"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#312e2b] rounded-xl shadow-2xl p-4 border border-gray-600">
        <h3 className="text-white text-center text-lg font-semibold mb-3">
          Choose Promotion
        </h3>
        <div className="flex gap-2">
          {pieces.map((piece) => (
            <button
              key={piece}
              onClick={() => onSelect(piece)}
              className="w-16 h-16 sm:w-20 sm:h-20 bg-[#769656] hover:bg-[#8aad62] rounded-lg transition-all hover:scale-105 flex items-center justify-center p-2"
              title={pieceLabels[piece]}
            >
              <img 
                src={promotionPieceUrls[color][piece]} 
                alt={pieceLabels[piece]}
                className="w-full h-full object-contain"
                draggable={false}
              />
            </button>
          ))}
        </div>
        <button
          onClick={onCancel}
          className="w-full mt-3 px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
