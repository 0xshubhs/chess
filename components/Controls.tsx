"use client";

import React from "react";
import { Chess } from "chess.js";

type Props = {
  fen: string;
  setFen: (fen: string) => void;
  statusMsg: string;
  elo: number;
  setElo: (elo: number) => void;
};

export default function Controls({ fen, setFen, statusMsg, elo, setElo }: Props) {
  const game = new Chess(fen);

  function reset() {
    const g = new Chess();
    setFen(g.fen());
  }

  function undo() {
    const g = new Chess(fen);
    g.undo();
    g.undo(); // undo both AI and player move
    setFen(g.fen());
  }

  const turnText = game.turn() === "w" ? "White" : "Black";

  return (
    <div className="flex flex-col gap-4">
      <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
        <div className="mb-2 text-lg font-semibold text-amber-800 dark:text-amber-200">
          Game Status
        </div>
        <div className="mb-2">
          <span className="text-gray-600 dark:text-gray-400">Status:</span>{" "}
          <span className={`font-medium ${statusMsg === "Check" || statusMsg === "Checkmate" ? "text-red-600" : "text-green-600"}`}>
            {statusMsg || "Playing"}
          </span>
        </div>
        <div className="mb-2">
          <span className="text-gray-600 dark:text-gray-400">Turn:</span>{" "}
          <span className="font-medium">{turnText}</span>
        </div>
      </div>

      <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
        <label className="block mb-2 text-lg font-semibold text-amber-800 dark:text-amber-200">
          AI Difficulty
        </label>
        <div className="mb-2 text-center text-2xl font-bold text-amber-600">
          {elo} ELO
        </div>
        <input
          type="range"
          min={600}
          max={2400}
          step={100}
          value={elo}
          onChange={(e) => setElo(Number(e.target.value))}
          className="w-full h-2 bg-amber-200 rounded-lg appearance-none cursor-pointer accent-amber-600"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>Beginner</span>
          <span>Master</span>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={reset}
          className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg transition-colors"
        >
          New Game
        </button>
        <button
          onClick={undo}
          className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors"
        >
          Undo
        </button>
      </div>

      <div className="p-3 text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-900 rounded-lg">
        <p className="mb-2">
          <strong>How it works:</strong> After each player move, the server calls Ollama to select one legal move.
        </p>
        <p>
          The ELO slider changes the AI move-selection temperature — lower ELO = more random moves, higher ELO = stronger play.
        </p>
      </div>
    </div>
  );
}
