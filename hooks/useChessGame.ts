"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { Chess, Color, Move } from "chess.js";

export type GameMode = "ai" | "pvp";
export type TimeControl = {
  initial: number; // seconds
  increment: number; // seconds per move
};

export type GameResult = {
  winner: "white" | "black" | "draw" | null;
  reason: "checkmate" | "timeout" | "resignation" | "stalemate" | "draw" | "agreement" | null;
};

export const TIME_CONTROLS: Record<string, TimeControl> = {
  bullet1: { initial: 60, increment: 0 },
  bullet2: { initial: 60, increment: 1 },
  blitz3: { initial: 180, increment: 0 },
  blitz3_2: { initial: 180, increment: 2 },
  blitz5: { initial: 300, increment: 0 },
  blitz5_3: { initial: 300, increment: 3 },
  rapid10: { initial: 600, increment: 0 },
  rapid15_10: { initial: 900, increment: 10 },
  classical30: { initial: 1800, increment: 0 },
  unlimited: { initial: 0, increment: 0 },
};

export const TIME_CONTROL_LABELS: Record<string, string> = {
  bullet1: "1 min",
  bullet2: "1|1",
  blitz3: "3 min",
  blitz3_2: "3|2",
  blitz5: "5 min",
  blitz5_3: "5|3",
  rapid10: "10 min",
  rapid15_10: "15|10",
  classical30: "30 min",
  unlimited: "∞",
};

const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export interface GameState {
  fen: string;
  turn: Color;
  moves: string[];
  moveHistory: Move[];
  isGameOver: boolean;
  gameResult: GameResult;
  statusMsg: string;
  gameMode: GameMode;
  timeControl: string;
  whiteTime: number;
  blackTime: number;
  isFlipped: boolean;
  elo: number;
  evaluation: number;
  evalDepth: number | undefined;
}

export function useChessGame() {
  // Core game state
  const [fen, setFenState] = useState(INITIAL_FEN);
  const [moves, setMoves] = useState<string[]>([]);
  const [moveHistory, setMoveHistory] = useState<Move[]>([]);
  const [statusMsg, setStatusMsg] = useState("");
  const [gameMode, setGameModeState] = useState<GameMode>("pvp");
  const [isFlipped, setIsFlipped] = useState(false);
  const [elo, setElo] = useState(1200);
  const [evaluation, setEvaluation] = useState(0);
  const [evalDepth, setEvalDepth] = useState<number | undefined>();
  
  // Time control state
  const [timeControl, setTimeControlState] = useState("blitz5");
  const [whiteTime, setWhiteTime] = useState(TIME_CONTROLS.blitz5.initial);
  const [blackTime, setBlackTime] = useState(TIME_CONTROLS.blitz5.initial);
  
  // Game result state
  const [gameResult, setGameResult] = useState<GameResult>({ winner: null, reason: null });
  
  // Abort controller for AI requests
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Derived state
  const game = useMemo(() => new Chess(fen), [fen]);
  const turn = game.turn();
  const isGameOver = game.isGameOver() || gameResult.winner !== null;
  
  // Set FEN and update game state
  const setFen = useCallback((newFen: string) => {
    setFenState(newFen);
    const g = new Chess(newFen);
    
    // Update status message
    if (g.isCheckmate()) {
      setStatusMsg("Checkmate");
      setGameResult({
        winner: g.turn() === "w" ? "black" : "white",
        reason: "checkmate",
      });
    } else if (g.isStalemate()) {
      setStatusMsg("Stalemate");
      setGameResult({ winner: "draw", reason: "stalemate" });
    } else if (g.isDraw()) {
      setStatusMsg("Draw");
      setGameResult({ winner: "draw", reason: "draw" });
    } else if (g.inCheck()) {
      setStatusMsg("Check");
    } else {
      setStatusMsg("");
    }
  }, []);
  
  // Add move to history
  const addMove = useCallback((move: Move) => {
    setMoves(prev => [...prev, move.san]);
    setMoveHistory(prev => [...prev, move]);
  }, []);
  
  // Start new game
  const newGame = useCallback(() => {
    // Abort any pending AI request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    setFenState(INITIAL_FEN);
    setMoves([]);
    setMoveHistory([]);
    setStatusMsg("");
    setGameResult({ winner: null, reason: null });
    setEvaluation(0);
    setEvalDepth(undefined);
    
    // Reset timers
    const tc = TIME_CONTROLS[timeControl];
    setWhiteTime(tc.initial);
    setBlackTime(tc.initial);
  }, [timeControl]);
  
  // Change game mode
  const setGameMode = useCallback((mode: GameMode, skipConfirm = false) => {
    if (!skipConfirm && moves.length > 0) {
      if (!window.confirm("Start a new game? Current progress will be lost.")) {
        return;
      }
    }
    setGameModeState(mode);
    newGame();
  }, [moves.length, newGame]);
  
  // Change time control
  const setTimeControl = useCallback((tc: string) => {
    setTimeControlState(tc);
    const control = TIME_CONTROLS[tc];
    setWhiteTime(control.initial);
    setBlackTime(control.initial);
  }, []);
  
  // Flip board
  const flipBoard = useCallback(() => {
    setIsFlipped(prev => !prev);
  }, []);
  
  // Resign
  const resign = useCallback((color: Color) => {
    setGameResult({
      winner: color === "w" ? "black" : "white",
      reason: "resignation",
    });
    setStatusMsg(color === "w" ? "White resigned" : "Black resigned");
  }, []);
  
  // Offer draw (in PvP mode, auto-accept for simplicity)
  const offerDraw = useCallback(() => {
    if (gameMode === "pvp") {
      setGameResult({ winner: "draw", reason: "agreement" });
      setStatusMsg("Draw by agreement");
    }
  }, [gameMode]);
  
  // Handle timeout
  const handleTimeout = useCallback((color: Color) => {
    setGameResult({
      winner: color === "w" ? "black" : "white",
      reason: "timeout",
    });
    setStatusMsg(color === "w" ? "White ran out of time" : "Black ran out of time");
  }, []);
  
  // Add increment to clock after move
  const addIncrement = useCallback((color: Color) => {
    const tc = TIME_CONTROLS[timeControl];
    if (tc.increment > 0) {
      if (color === "w") {
        setWhiteTime(prev => prev + tc.increment);
      } else {
        setBlackTime(prev => prev + tc.increment);
      }
    }
  }, [timeControl]);
  
  // Update evaluation
  const updateEvaluation = useCallback((eval_: number, depth?: number) => {
    setEvaluation(eval_);
    if (depth !== undefined) setEvalDepth(depth);
  }, []);
  
  // Undo move
  const undo = useCallback(() => {
    const g = new Chess(fen);
    const undone = g.undo();
    if (!undone) return false;
    
    // In AI mode, undo AI's move too
    if (gameMode === "ai") {
      g.undo();
    }
    
    setFen(g.fen());
    setMoves(prev => gameMode === "ai" ? prev.slice(0, -2) : prev.slice(0, -1));
    setMoveHistory(prev => gameMode === "ai" ? prev.slice(0, -2) : prev.slice(0, -1));
    return true;
  }, [fen, gameMode, setFen]);
  
  return {
    // State
    fen,
    turn,
    moves,
    moveHistory,
    isGameOver,
    gameResult,
    statusMsg,
    gameMode,
    timeControl,
    whiteTime,
    blackTime,
    isFlipped,
    elo,
    evaluation,
    evalDepth,
    abortControllerRef,
    
    // Setters
    setFen,
    setWhiteTime,
    setBlackTime,
    setElo,
    
    // Actions
    addMove,
    newGame,
    setGameMode,
    setTimeControl,
    flipBoard,
    resign,
    offerDraw,
    handleTimeout,
    addIncrement,
    updateEvaluation,
    undo,
  };
}
