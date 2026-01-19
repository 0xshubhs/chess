"use client";

import React, { useState } from "react";
import Board from "../components/Board";
import Controls from "../components/Controls";
import { Chess } from "chess.js";

export default function Page() {
  const [fen, setFen] = useState<string>(new Chess().fen());
  const [turn, setTurn] = useState<string>("w");
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [elo, setElo] = useState<number>(1200);

  return (
    <div className="flex flex-col items-center gap-6">
      <h1 className="text-3xl font-bold text-amber-900 dark:text-amber-100">
        Chess vs Ollama AI
      </h1>
      <div className="flex flex-col md:flex-row gap-6 items-start">
        <Board
          fen={fen}
          setFen={setFen}
          setStatusMsg={setStatusMsg}
          elo={elo}
          setTurn={setTurn}
        />
        <div className="w-72">
          <Controls
            fen={fen}
            setFen={setFen}
            statusMsg={statusMsg}
            elo={elo}
            setElo={setElo}
          />
        </div>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        You play as White. Click a piece to select, then click a destination.
      </p>
    </div>
  );
}
