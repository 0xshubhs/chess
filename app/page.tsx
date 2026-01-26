"use client";

/**
 * Main Chess Page - PRODUCTION VERSION
 * 
 * Uses Zustand store for ALL state management.
 * No useState calls. No redundant Chess instances.
 * Proper separation of concerns.
 */

import React, { useEffect, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import Board from "../components/Board-v2";
import PlayerPanel from "../components/PlayerPanel";
import MoveList from "../components/MoveList";
import EvalBar from "../components/EvalBar";
import TimeControlSelector from "../components/TimeControlSelector";
import GameActions from "../components/GameActions";
import GameOverModal from "../components/GameOverModal";
import {
  useGameStore,
  selectGameStatus,
  selectTimeState,
  selectGameSettings,
} from "../lib/store";
import { useClockAnimation, formatTime } from "../lib/animations";

export default function Page() {
  // ============================================================================
  // Zustand selectors - surgical state subscriptions for minimal re-renders
  // useShallow prevents infinite loops by doing shallow equality comparison
  // ============================================================================
  
  const { isGameOver, gameResult, statusMsg } = useGameStore(useShallow(selectGameStatus));
  const { whiteTime, blackTime, turn, isUnlimited } = useGameStore(useShallow(selectTimeState));
  const { gameMode, timeControl, elo } = useGameStore(useShallow(selectGameSettings));
  
  // Individual state pieces that change frequently
  const moves = useGameStore((s) => s.moves);
  const isFlipped = useGameStore((s) => s.isFlipped);
  const isAiThinking = useGameStore((s) => s.isAiThinking);
  const evaluation = useGameStore((s) => s.evaluation);
  const evalDepth = useGameStore((s) => s.evalDepth);
  const moveDrawerOpen = useGameStore((s) => s.moveDrawerOpen);
  const showGameOverModal = useGameStore((s) => s.showGameOverModal);
  const fen = useGameStore((s) => s.fen);

  // Actions (stable references, no re-renders)
  const newGame = useGameStore((s) => s.newGame);
  const undoMove = useGameStore((s) => s.undoMove);
  const flipBoard = useGameStore((s) => s.flipBoard);
  const resign = useGameStore((s) => s.resign);
  const offerDraw = useGameStore((s) => s.offerDraw);
  const setGameMode = useGameStore((s) => s.setGameMode);
  const setTimeControl = useGameStore((s) => s.setTimeControl);
  const setElo = useGameStore((s) => s.setElo);
  const setMoveDrawerOpen = useGameStore((s) => s.setMoveDrawerOpen);
  const setShowGameOverModal = useGameStore((s) => s.setShowGameOverModal);
  const tickClock = useGameStore((s) => s.tickClock);

  // ============================================================================
  // Clock animation using requestAnimationFrame
  // ============================================================================
  
  const clockAnimation = useClockAnimation();
  
  useEffect(() => {
    if (isGameOver || isAiThinking || moves.length === 0 || isUnlimited) {
      clockAnimation.stop();
      return;
    }
    
    clockAnimation.start((deltaMs) => {
      tickClock(deltaMs);
    });
    
    return () => clockAnimation.stop();
  }, [isGameOver, isAiThinking, moves.length, isUnlimited, clockAnimation, tickClock]);

  // ============================================================================
  // Computed values
  // ============================================================================
  
  // Format times
  const whiteTimeFormatted = formatTime(whiteTime);
  const blackTimeFormatted = formatTime(blackTime);
  const isWhiteLow = whiteTime > 0 && whiteTime <= 30;
  const isBlackLow = blackTime > 0 && blackTime <= 30;
  const isWhiteCritical = whiteTime > 0 && whiteTime <= 10;
  const isBlackCritical = blackTime > 0 && blackTime <= 10;

  // Calculate captured pieces from FEN (memoized calculation)
  const { whiteCaptured, blackCaptured, whiteAdvantage, blackAdvantage } = React.useMemo(() => {
    const pieceValues: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
    const pieceGlyphs: Record<string, string> = {
      p: "♟", n: "♞", b: "♝", r: "♜", q: "♛",
      P: "♙", N: "♘", B: "♗", R: "♖", Q: "♕",
    };

    const initial = { p: 8, n: 2, b: 2, r: 2, q: 1 };
    const current = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };

    // Parse FEN to count pieces
    const boardPart = fen.split(' ')[0];
    for (const char of boardPart) {
      if (char === '/') continue;
      if (/\d/.test(char)) continue;
      
      const isWhite = char === char.toUpperCase();
      const type = char.toLowerCase() as 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
      if (type !== 'k') {
        current[isWhite ? 'w' : 'b'][type]++;
      }
    }

    const whiteCaptured: string[] = [];
    const blackCaptured: string[] = [];
    let whiteMaterial = 0;
    let blackMaterial = 0;

    for (const type of ["q", "r", "b", "n", "p"] as const) {
      const capturedByWhite = initial[type] - current.b[type];
      const capturedByBlack = initial[type] - current.w[type];

      for (let i = 0; i < capturedByWhite; i++) {
        whiteCaptured.push(pieceGlyphs[type]);
        whiteMaterial += pieceValues[type];
      }
      for (let i = 0; i < capturedByBlack; i++) {
        blackCaptured.push(pieceGlyphs[type.toUpperCase()]);
        blackMaterial += pieceValues[type];
      }
    }

    return {
      whiteCaptured,
      blackCaptured,
      whiteAdvantage: Math.max(0, whiteMaterial - blackMaterial),
      blackAdvantage: Math.max(0, blackMaterial - whiteMaterial),
    };
  }, [fen]);

  // ============================================================================
  // Event handlers
  // ============================================================================
  
  const handleNewGame = useCallback(() => {
    newGame();
  }, [newGame]);

  const handleUndo = useCallback(() => {
    undoMove();
  }, [undoMove]);

  const handleFlip = useCallback(() => {
    flipBoard();
  }, [flipBoard]);

  const handleResign = useCallback(() => {
    if (!window.confirm("Are you sure you want to resign?")) return;
    resign(gameMode === "ai" ? "w" : turn);
  }, [resign, gameMode, turn]);

  const handleDraw = useCallback(() => {
    if (gameMode === "pvp") {
      if (!window.confirm("Offer a draw?")) return;
      offerDraw();
    }
  }, [offerDraw, gameMode]);

  const handleGameModeChange = useCallback((mode: "ai" | "pvp") => {
    if (moves.length > 0) {
      if (!window.confirm("Start a new game? Current progress will be lost.")) {
        return;
      }
    }
    setGameMode(mode);
  }, [setGameMode, moves.length]);

  const handleTimeControlChange = useCallback((tc: string) => {
    if (moves.length > 0) {
      if (!window.confirm("Start a new game? Current progress will be lost.")) {
        return;
      }
    }
    setTimeControl(tc);
    newGame();
  }, [setTimeControl, newGame, moves.length]);

  const handleEloChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setElo(Number(e.target.value));
  }, [setElo]);

  // ============================================================================
  // Player panel configuration
  // ============================================================================
  
  const topPlayer = isFlipped ? {
    name: gameMode === "ai" ? "You" : "Player 1 (White)",
    isAI: false,
    isActive: turn === "w" && !isGameOver,
    isThinking: false,
    capturedPieces: whiteCaptured,
    materialAdvantage: whiteAdvantage,
    time: whiteTimeFormatted,
    isTimeLow: isWhiteLow,
    isTimeCritical: isWhiteCritical,
    color: "white" as const,
  } : {
    name: gameMode === "ai" ? "Ollama AI" : "Player 2 (Black)",
    isAI: gameMode === "ai",
    isActive: turn === "b" && !isGameOver,
    isThinking: isAiThinking,
    capturedPieces: blackCaptured,
    materialAdvantage: blackAdvantage,
    time: blackTimeFormatted,
    isTimeLow: isBlackLow,
    isTimeCritical: isBlackCritical,
    color: "black" as const,
  };

  const bottomPlayer = isFlipped ? {
    name: gameMode === "ai" ? "Ollama AI" : "Player 2 (Black)",
    isAI: gameMode === "ai",
    isActive: turn === "b" && !isGameOver,
    isThinking: isAiThinking,
    capturedPieces: blackCaptured,
    materialAdvantage: blackAdvantage,
    time: blackTimeFormatted,
    isTimeLow: isBlackLow,
    isTimeCritical: isBlackCritical,
    color: "black" as const,
  } : {
    name: gameMode === "ai" ? "You" : "Player 1 (White)",
    isAI: false,
    isActive: turn === "w" && !isGameOver,
    isThinking: false,
    capturedPieces: whiteCaptured,
    materialAdvantage: whiteAdvantage,
    time: whiteTimeFormatted,
    isTimeLow: isWhiteLow,
    isTimeCritical: isWhiteCritical,
    color: "white" as const,
  };

  // ============================================================================
  // Render
  // ============================================================================
  
  return (
    <div className="game-container flex flex-col lg:flex-row items-start justify-start gap-4 lg:gap-6 p-2 lg:p-4 lg:pl-8 min-h-screen">
      {/* Board with Eval Bar - First on desktop for left alignment */}
      <div className="board-wrapper order-1 flex items-start gap-2 flex-shrink-0">
        {gameMode === "ai" && (
          <div className="hidden sm:block">
            <EvalBar evaluation={evaluation} depth={evalDepth ?? undefined} />
          </div>
        )}
        
        <Board />
      </div>

      {/* Side panels container */}
      <div className="side-panels flex flex-col lg:flex-row gap-4 lg:gap-6 order-2 w-full lg:w-auto lg:flex-1">
        {/* Left side panel - player info */}
        <div className="side-panel w-full lg:w-64 flex flex-col gap-3">
          <PlayerPanel {...topPlayer} isUnlimitedTime={isUnlimited} />

        {/* Desktop move list */}
        <div className="hidden lg:block">
          <MoveList moves={moves} statusMsg={statusMsg} />
        </div>

        <PlayerPanel {...bottomPlayer} isUnlimitedTime={isUnlimited} />
        </div>

        {/* Right side panel - controls */}
        <div className="side-panel w-full lg:w-64 flex flex-col gap-3">
        {/* Time Control Selector */}
        <TimeControlSelector
          gameMode={gameMode}
          selectedTime={timeControl}
          onGameModeChange={handleGameModeChange}
          onSelect={handleTimeControlChange}
        />

        {/* ELO Slider (AI mode only) */}
        {gameMode === "ai" && (
          <div className="bg-[#262626] rounded-lg p-3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
                Engine Strength
              </span>
              <span className="text-xs text-gray-400 font-medium">
                {elo < 800 ? "Beginner" : elo < 1200 ? "Casual" : elo < 1600 ? "Intermediate" : elo < 2000 ? "Advanced" : "Master"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={600}
                max={2400}
                step={100}
                value={elo}
                onChange={handleEloChange}
                className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500"
              />
              <span className="text-white font-bold text-sm w-12 text-right tabular-nums">{elo}</span>
            </div>
          </div>
        )}

        {/* Game Actions */}
        <GameActions
          onNewGame={handleNewGame}
          onUndo={handleUndo}
          onFlip={handleFlip}
          onResign={handleResign}
          onOfferDraw={handleDraw}
          turn={turn}
          isGameOver={isGameOver}
          canUndo={moves.length > 0 && !isGameOver}
          gameMode={gameMode}
        />

        <div className="lg:hidden">
          <button
            onClick={() => setMoveDrawerOpen(!moveDrawerOpen)}
            className="w-full px-4 py-2.5 bg-[#262626] hover:bg-[#333] text-gray-300 font-medium text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <span>Moves</span>
            <span className="text-xs">{moveDrawerOpen ? "▲" : "▼"}</span>
            {moves.length > 0 && (
              <span className="bg-gray-600 px-1.5 py-0.5 rounded text-xs">{moves.length}</span>
            )}
          </button>
        </div>
        </div>
      </div>

      {/* Mobile Move Drawer */}
      <div 
        className={`move-drawer lg:hidden bg-[#1e1f23] border-t border-gray-700 shadow-2xl ${
          moveDrawerOpen ? "open" : ""
        }`}
      >
        <div className="move-drawer-handle" onClick={() => setMoveDrawerOpen(false)} />
        <div className="px-4 pb-6 max-h-[55vh] overflow-hidden">
          <MoveList moves={moves} statusMsg={statusMsg} />
        </div>
      </div>

      {/* Backdrop for drawer */}
      {moveDrawerOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 move-drawer-backdrop"
          onClick={() => setMoveDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Game Over Modal */}
      {showGameOverModal && (
        <GameOverModal
          result={gameResult}
          onNewGame={handleNewGame}
          onClose={() => setShowGameOverModal(false)}
        />
      )}
    </div>
  );
}
