"use client";

import React, { useState, useMemo, useCallback, useRef } from "react";
import Board from "../components/Board";
import PlayerPanel from "../components/PlayerPanel";
import MoveList from "../components/MoveList";
import EvalBar from "../components/EvalBar";
import TimeControlSelector from "../components/TimeControlSelector";
import GameActions from "../components/GameActions";
import GameOverModal from "../components/GameOverModal";
import { useChessClock } from "../hooks/useChessClock";
import { Chess, Color } from "chess.js";
import { TIME_CONTROLS, GameMode, GameResult } from "../hooks/useChessGame";

const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export default function Page() {
  // Core game state
  const [fen, setFenState] = useState<string>(INITIAL_FEN);
  const [turn, setTurn] = useState<Color>("w");
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [moves, setMoves] = useState<string[]>([]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [evaluation, setEvaluation] = useState(0);
  const [evalDepth, setEvalDepth] = useState<number | undefined>();
  const [gameMode, setGameModeState] = useState<GameMode>("pvp"); // Default to 2-player
  const [elo, setElo] = useState<number>(1200);
  
  // Time control state
  const [timeControl, setTimeControlState] = useState("blitz5");
  const [whiteTime, setWhiteTime] = useState(TIME_CONTROLS.blitz5.initial);
  const [blackTime, setBlackTime] = useState(TIME_CONTROLS.blitz5.initial);
  
  // Game result state
  const [gameResult, setGameResult] = useState<GameResult>({ winner: null, reason: null });
  const [showGameOverModal, setShowGameOverModal] = useState(false);
  
  // UI state
  const [moveDrawerOpen, setMoveDrawerOpen] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  
  // Refs
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Derived state
  const game = useMemo(() => new Chess(fen), [fen]);
  const isGameOver = game.isGameOver() || gameResult.winner !== null;
  const isUnlimited = timeControl === "unlimited";
  
  // Handle timeout callback
  const handleTimeout = useCallback((color: Color) => {
    setGameResult({
      winner: color === "w" ? "black" : "white",
      reason: "timeout",
    });
    setStatusMsg(color === "w" ? "White ran out of time" : "Black ran out of time");
    setShowGameOverModal(true);
  }, []);
  
  // Chess clock hook
  const { whiteTimeFormatted, blackTimeFormatted, isWhiteLow, isBlackLow, isWhiteCritical, isBlackCritical } = useChessClock({
    whiteTime,
    blackTime,
    setWhiteTime,
    setBlackTime,
    turn,
    isGameOver,
    onTimeout: handleTimeout,
    isPaused: isAiThinking || moves.length === 0,
    isUnlimited,
  });
  
  // Calculate captured pieces
  const { whiteCaptured, blackCaptured, whiteAdvantage, blackAdvantage } = useMemo(() => {
    const pieceValues: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
    const pieceGlyphs: Record<string, string> = {
      p: "♟", n: "♞", b: "♝", r: "♜", q: "♛",
      P: "♙", N: "♘", B: "♗", R: "♖", Q: "♕",
    };

    const initial = { p: 8, n: 2, b: 2, r: 2, q: 1 };
    const current = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };

    const board = game.board();
    for (const row of board) {
      for (const sq of row) {
        if (sq && sq.type !== "k") {
          current[sq.color][sq.type]++;
        }
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
  }, [game]);

  // Set FEN - game over detection moved to useEffect to avoid duplicate Chess instances
  const setFen = useCallback((newFen: string) => {
    setFenState(newFen);
  }, []);
  
  // Detect game over state from the memoized game instance (avoids creating duplicate Chess objects)
  React.useEffect(() => {
    if (game.isCheckmate()) {
      setStatusMsg("Checkmate");
      const winner = game.turn() === "w" ? "black" : "white";
      setGameResult({ winner, reason: "checkmate" });
      setShowGameOverModal(true);
    } else if (game.isStalemate()) {
      setStatusMsg("Stalemate");
      setGameResult({ winner: "draw", reason: "stalemate" });
      setShowGameOverModal(true);
    } else if (game.isDraw()) {
      setStatusMsg("Draw");
      setGameResult({ winner: "draw", reason: "draw" });
      setShowGameOverModal(true);
    } else if (game.inCheck()) {
      setStatusMsg("Check");
    } else {
      setStatusMsg("");
    }
  }, [fen, game]);

  // Handle move from board - add increment after move
  // IMPORTANT: By the time this is called, the turn has ALREADY switched in the game
  // So we need to add increment to the OPPOSITE of current turn (the player who just moved)
  const handleMove = useCallback((move: { from: string; to: string; san: string }) => {
    setMoves((prev) => [...prev, move.san]);
    
    // Add increment after move - turn has switched, so opposite color just moved
    const tc = TIME_CONTROLS[timeControl];
    if (tc.increment > 0) {
      // turn is NOW the next player, so the previous player (who just moved) is opposite
      setWhiteTime(prev => turn === "b" ? prev + tc.increment : prev);
      setBlackTime(prev => turn === "w" ? prev + tc.increment : prev);
    }
  }, [timeControl, turn]);

  // New game
  const handleNewGame = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setFenState(INITIAL_FEN);
    setMoves([]);
    setEvaluation(0);
    setEvalDepth(undefined);
    setGameResult({ winner: null, reason: null });
    setStatusMsg("");
    setShowGameOverModal(false);
    
    // Reset timers
    const tc = TIME_CONTROLS[timeControl];
    setWhiteTime(tc.initial);
    setBlackTime(tc.initial);
  }, [timeControl]);

  // Change game mode
  const handleGameModeChange = useCallback((mode: GameMode) => {
    if (moves.length > 0) {
      if (!window.confirm("Start a new game? Current progress will be lost.")) {
        return;
      }
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setGameModeState(mode);
    handleNewGame();
  }, [moves.length, handleNewGame]);

  // Change time control
  const handleTimeControlChange = useCallback((tc: string) => {
    if (moves.length > 0) {
      if (!window.confirm("Start a new game? Current progress will be lost.")) {
        return;
      }
    }
    setTimeControlState(tc);
    const control = TIME_CONTROLS[tc];
    setWhiteTime(control.initial);
    setBlackTime(control.initial);
    handleNewGame();
  }, [moves.length, handleNewGame]);

  // Undo move
  const handleUndo = useCallback(() => {
    const g = new Chess(fen);
    const firstUndo = g.undo();
    if (!firstUndo) return;
    
    // In AI mode, undo both moves
    if (gameMode === "ai") {
      g.undo();
    }
    
    setFen(g.fen());
    setMoves(prev => {
      const newMoves = [...prev];
      newMoves.pop();
      if (gameMode === "ai") newMoves.pop();
      return newMoves;
    });
  }, [fen, gameMode, setFen]);

  // Flip board
  const handleFlip = useCallback(() => {
    setIsFlipped(prev => !prev);
  }, []);

  // Resign
  const handleResign = useCallback(() => {
    if (!window.confirm("Are you sure you want to resign?")) return;
    
    const loser = gameMode === "ai" ? "w" : turn;
    setGameResult({
      winner: loser === "w" ? "black" : "white",
      reason: "resignation",
    });
    setStatusMsg(loser === "w" ? "White resigned" : "Black resigned");
    setShowGameOverModal(true);
  }, [gameMode, turn]);

  // Offer draw
  const handleDraw = useCallback(() => {
    if (gameMode === "pvp") {
      if (!window.confirm("Offer a draw?")) return;
      setGameResult({ winner: "draw", reason: "agreement" });
      setStatusMsg("Draw by agreement");
      setShowGameOverModal(true);
    }
  }, [gameMode]);

  // Handle turn change from Board
  const handleTurnChange = useCallback((newTurn: Color) => {
    setTurn(newTurn);
  }, []);

  // Handle eval updates from engine
  const handleEvalUpdate = useCallback((eval_: number, depth?: number) => {
    setEvaluation(eval_);
    if (depth !== undefined) setEvalDepth(depth);
  }, []);

  // Player panel props based on board orientation
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

  return (
    <div className="game-container flex flex-col lg:flex-row items-start justify-center gap-4 lg:gap-6 p-2 lg:p-4">
      {/* Left side panel */}
      <div className="side-panel w-full lg:w-64 order-2 lg:order-1 flex flex-col gap-3">
        <PlayerPanel {...topPlayer} isUnlimitedTime={isUnlimited} />

        {/* Desktop move list */}
        <div className="hidden lg:block">
          <MoveList moves={moves} statusMsg={statusMsg} />
        </div>

        <PlayerPanel {...bottomPlayer} isUnlimitedTime={isUnlimited} />
      </div>

      {/* Board with Eval Bar */}
      <div className="board-wrapper order-1 lg:order-2 flex items-start gap-2">
        {gameMode === "ai" && (
          <div className="hidden sm:block">
            <EvalBar evaluation={evaluation} depth={evalDepth} />
          </div>
        )}
        
        <Board
          fen={fen}
          setFen={setFen}
          setStatusMsg={setStatusMsg}
          elo={elo}
          setTurn={handleTurnChange}
          onMove={handleMove}
          soundEnabled={true}
          onEvalUpdate={handleEvalUpdate}
          gameMode={gameMode}
          onGameOver={() => {}}
          onThinkingChange={setIsAiThinking}
          abortControllerRef={abortControllerRef}
          isFlipped={isFlipped}
        />
      </div>

      {/* Right side panel */}
      <div className="side-panel w-full lg:w-64 order-3 flex flex-col gap-3">
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
                onChange={(e) => setElo(Number(e.target.value))}
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

        {/* Mobile move drawer toggle */}
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
