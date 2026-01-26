/**
 * Zustand Game Store - PRODUCTION VERSION
 * 
 * Single source of truth for ALL game state.
 * Replaces 18+ useState calls with a single, performant store.
 * Uses immer for immutable updates and selectors for minimal re-renders.
 * 
 * IMPORTANT: This is the ONLY place game state should live.
 * Components subscribe to slices they need using selectors.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { Color, Move } from 'chess.js';
import { ChessEngine } from './chessEngine';

// ============================================================================
// Types
// ============================================================================

export type GameMode = 'ai' | 'pvp';

export type TimeControl = {
  initial: number; // seconds
  increment: number; // seconds per move
};

export type GameResult = {
  winner: 'white' | 'black' | 'draw' | null;
  reason: 'checkmate' | 'timeout' | 'resignation' | 'stalemate' | 'draw' | 'agreement' | null;
};

export type AnimatingPiece = {
  piece: string;
  from: string;
  to: string;
  startTime: number;
  duration: number;
  isCapture?: boolean;
};

export type PendingPromotion = {
  from: string;
  to: string;
  color: 'w' | 'b';
};

interface GameState {
  // Core game state
  fen: string;
  turn: Color;
  moves: string[];
  moveHistory: Move[];
  
  // Game status
  isGameOver: boolean;
  gameResult: GameResult;
  statusMsg: string;
  
  // Game settings
  gameMode: GameMode;
  timeControl: string;
  elo: number;
  
  // Time management
  whiteTime: number;
  blackTime: number;
  lastTickTime: number | null;
  
  // UI state
  isFlipped: boolean;
  selectedSquare: string | null;
  legalMoves: string[];
  lastMove: { from: string; to: string } | null;
  kingInCheck: string | null;
  
  // Animation state
  animatingPiece: AnimatingPiece | null;
  capturingSquare: string | null;
  
  // Promotion state
  pendingPromotion: PendingPromotion | null;
  
  // AI state
  isAiThinking: boolean;
  evaluation: number;
  evalDepth: number | null;
  
  // UI panels
  moveDrawerOpen: boolean;
  showGameOverModal: boolean;
}

interface GameActions {
  // Game actions
  setFen: (fen: string) => void;
  makeMove: (from: string, to: string, promotion?: string) => Move | null;
  undoMove: () => boolean;
  newGame: () => void;
  
  // Selection
  selectSquare: (square: string | null) => void;
  clearSelection: () => void;
  
  // Settings
  setGameMode: (mode: GameMode) => void;
  setTimeControl: (tc: string) => void;
  setElo: (elo: number) => void;
  flipBoard: () => void;
  
  // Time
  tickClock: (deltaMs: number) => void;
  addIncrement: (color: Color) => void;
  handleTimeout: (color: Color) => void;
  
  // Game result
  resign: (color: Color) => void;
  offerDraw: () => void;
  
  // Animation
  startAnimation: (from: string, to: string, piece: string, isCapture: boolean) => void;
  endAnimation: () => void;
  
  // Promotion
  setPendingPromotion: (promo: PendingPromotion | null) => void;
  
  // AI
  setAiThinking: (thinking: boolean) => void;
  updateEvaluation: (evaluation: number, depth?: number) => void;
  applyAiMove: (from: string, to: string, promotion?: string) => Move | null;
  
  // UI
  setMoveDrawerOpen: (open: boolean) => void;
  setShowGameOverModal: (show: boolean) => void;
  
  // Derived state helpers
  getEngine: () => ChessEngine;
}

// ============================================================================
// Constants
// ============================================================================

export const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

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
  bullet1: '1 min',
  bullet2: '1|1',
  blitz3: '3 min',
  blitz3_2: '3|2',
  blitz5: '5 min',
  blitz5_3: '5|3',
  rapid10: '10 min',
  rapid15_10: '15|10',
  classical30: '30 min',
  unlimited: '∞',
};

const ANIMATION_DURATION = 180; // ms

// ============================================================================
// Store
// ============================================================================

// Singleton chess engine - one instance, reused via .load()
const engine = ChessEngine.getInstance();

export const useGameStore = create<GameState & GameActions>()(
  subscribeWithSelector(
    immer((set, get) => ({
      // Initial state
      fen: INITIAL_FEN,
      turn: 'w',
      moves: [],
      moveHistory: [],
      isGameOver: false,
      gameResult: { winner: null, reason: null },
      statusMsg: '',
      gameMode: 'pvp',
      timeControl: 'blitz5',
      elo: 1200,
      whiteTime: TIME_CONTROLS.blitz5.initial,
      blackTime: TIME_CONTROLS.blitz5.initial,
      lastTickTime: null,
      isFlipped: false,
      selectedSquare: null,
      legalMoves: [],
      lastMove: null,
      kingInCheck: null,
      animatingPiece: null,
      capturingSquare: null,
      pendingPromotion: null,
      isAiThinking: false,
      evaluation: 0,
      evalDepth: null,
      moveDrawerOpen: false,
      showGameOverModal: false,

      // Actions
      getEngine: () => engine,

      setFen: (fen: string) => {
        engine.load(fen);
        set((state) => {
          state.fen = fen;
          state.turn = engine.turn();
          state.kingInCheck = engine.findKingInCheck();
          
          // Update game status
          if (engine.isCheckmate()) {
            state.statusMsg = 'Checkmate';
            state.isGameOver = true;
            state.gameResult = {
              winner: engine.turn() === 'w' ? 'black' : 'white',
              reason: 'checkmate',
            };
            state.showGameOverModal = true;
          } else if (engine.isStalemate()) {
            state.statusMsg = 'Stalemate';
            state.isGameOver = true;
            state.gameResult = { winner: 'draw', reason: 'stalemate' };
            state.showGameOverModal = true;
          } else if (engine.isDraw()) {
            state.statusMsg = 'Draw';
            state.isGameOver = true;
            state.gameResult = { winner: 'draw', reason: 'draw' };
            state.showGameOverModal = true;
          } else if (engine.inCheck()) {
            state.statusMsg = 'Check';
          } else {
            state.statusMsg = '';
          }
        });
      },

      makeMove: (from: string, to: string, promotion?: string) => {
        const move = engine.move({ from, to, promotion: promotion || 'q' });
        if (!move) return null;

        set((state) => {
          state.fen = engine.fen();
          state.turn = engine.turn();
          state.moves.push(move.san);
          state.moveHistory.push(move);
          state.lastMove = { from, to };
          state.selectedSquare = null;
          state.legalMoves = [];
          state.kingInCheck = engine.findKingInCheck();
          
          // Update game status
          if (engine.isCheckmate()) {
            state.statusMsg = 'Checkmate';
            state.isGameOver = true;
            state.gameResult = {
              winner: engine.turn() === 'w' ? 'black' : 'white',
              reason: 'checkmate',
            };
            state.showGameOverModal = true;
          } else if (engine.isStalemate()) {
            state.statusMsg = 'Stalemate';
            state.isGameOver = true;
            state.gameResult = { winner: 'draw', reason: 'stalemate' };
            state.showGameOverModal = true;
          } else if (engine.isDraw()) {
            state.statusMsg = 'Draw';
            state.isGameOver = true;
            state.gameResult = { winner: 'draw', reason: 'draw' };
            state.showGameOverModal = true;
          } else if (engine.inCheck()) {
            state.statusMsg = 'Check';
          } else {
            state.statusMsg = '';
          }
        });

        return move;
      },

      undoMove: () => {
        const { gameMode } = get();
        const undone = engine.undo();
        if (!undone) return false;

        // In AI mode, undo AI's move too
        if (gameMode === 'ai') {
          engine.undo();
        }

        set((state) => {
          state.fen = engine.fen();
          state.turn = engine.turn();
          state.moves = gameMode === 'ai' ? state.moves.slice(0, -2) : state.moves.slice(0, -1);
          state.moveHistory = gameMode === 'ai' ? state.moveHistory.slice(0, -2) : state.moveHistory.slice(0, -1);
          state.lastMove = null;
          state.kingInCheck = engine.findKingInCheck();
          state.statusMsg = engine.inCheck() ? 'Check' : '';
          state.isGameOver = false;
          state.gameResult = { winner: null, reason: null };
        });

        return true;
      },

      newGame: () => {
        engine.reset();
        const tc = TIME_CONTROLS[get().timeControl];
        
        set((state) => {
          state.fen = INITIAL_FEN;
          state.turn = 'w';
          state.moves = [];
          state.moveHistory = [];
          state.isGameOver = false;
          state.gameResult = { winner: null, reason: null };
          state.statusMsg = '';
          state.whiteTime = tc.initial;
          state.blackTime = tc.initial;
          state.lastTickTime = null;
          state.selectedSquare = null;
          state.legalMoves = [];
          state.lastMove = null;
          state.kingInCheck = null;
          state.animatingPiece = null;
          state.capturingSquare = null;
          state.pendingPromotion = null;
          state.isAiThinking = false;
          state.evaluation = 0;
          state.evalDepth = null;
          state.showGameOverModal = false;
        });
      },

      selectSquare: (square: string | null) => {
        if (!square) {
          set((state) => {
            state.selectedSquare = null;
            state.legalMoves = [];
          });
          return;
        }

        const piece = engine.get(square as any);
        if (piece && piece.color === engine.turn()) {
          const moves = engine.moves({ square: square as any, verbose: true }) as Move[];
          set((state) => {
            state.selectedSquare = square;
            state.legalMoves = moves.map((m) => m.to);
          });
        }
      },

      clearSelection: () => {
        set((state) => {
          state.selectedSquare = null;
          state.legalMoves = [];
        });
      },

      setGameMode: (mode: GameMode) => {
        set((state) => {
          state.gameMode = mode;
        });
        get().newGame();
      },

      setTimeControl: (tc: string) => {
        const control = TIME_CONTROLS[tc];
        set((state) => {
          state.timeControl = tc;
          state.whiteTime = control.initial;
          state.blackTime = control.initial;
        });
      },

      setElo: (elo: number) => {
        set((state) => {
          state.elo = Math.max(400, Math.min(3000, elo));
        });
      },

      flipBoard: () => {
        set((state) => {
          state.isFlipped = !state.isFlipped;
        });
      },

      tickClock: (deltaMs: number) => {
        const { turn, isGameOver, isAiThinking, moves, timeControl } = get();
        if (isGameOver || isAiThinking || moves.length === 0 || timeControl === 'unlimited') {
          return;
        }

        const deltaSec = Math.min(deltaMs / 1000, 2); // Cap at 2s for tab backgrounding

        set((state) => {
          if (turn === 'w') {
            state.whiteTime = Math.max(0, state.whiteTime - deltaSec);
            if (state.whiteTime <= 0) {
              get().handleTimeout('w');
            }
          } else {
            state.blackTime = Math.max(0, state.blackTime - deltaSec);
            if (state.blackTime <= 0) {
              get().handleTimeout('b');
            }
          }
        });
      },

      addIncrement: (color: Color) => {
        const tc = TIME_CONTROLS[get().timeControl];
        if (tc.increment > 0) {
          set((state) => {
            if (color === 'w') {
              state.whiteTime += tc.increment;
            } else {
              state.blackTime += tc.increment;
            }
          });
        }
      },

      handleTimeout: (color: Color) => {
        set((state) => {
          state.isGameOver = true;
          state.gameResult = {
            winner: color === 'w' ? 'black' : 'white',
            reason: 'timeout',
          };
          state.statusMsg = color === 'w' ? 'White ran out of time' : 'Black ran out of time';
          state.showGameOverModal = true;
        });
      },

      resign: (color: Color) => {
        set((state) => {
          state.isGameOver = true;
          state.gameResult = {
            winner: color === 'w' ? 'black' : 'white',
            reason: 'resignation',
          };
          state.statusMsg = color === 'w' ? 'White resigned' : 'Black resigned';
          state.showGameOverModal = true;
        });
      },

      offerDraw: () => {
        const { gameMode } = get();
        if (gameMode === 'pvp') {
          set((state) => {
            state.isGameOver = true;
            state.gameResult = { winner: 'draw', reason: 'agreement' };
            state.statusMsg = 'Draw by agreement';
            state.showGameOverModal = true;
          });
        }
      },

      startAnimation: (from: string, to: string, piece: string, isCapture: boolean) => {
        set((state) => {
          state.animatingPiece = {
            piece,
            from,
            to,
            startTime: performance.now(),
            duration: ANIMATION_DURATION,
            isCapture,
          };
          if (isCapture) {
            state.capturingSquare = to;
          }
        });
      },

      endAnimation: () => {
        set((state) => {
          state.animatingPiece = null;
          state.capturingSquare = null;
        });
      },

      setPendingPromotion: (promo: PendingPromotion | null) => {
        set((state) => {
          state.pendingPromotion = promo;
        });
      },

      setAiThinking: (thinking: boolean) => {
        set((state) => {
          state.isAiThinking = thinking;
        });
      },

      updateEvaluation: (evaluation: number, depth?: number) => {
        set((state) => {
          state.evaluation = evaluation;
          if (depth !== undefined) {
            state.evalDepth = depth;
          }
        });
      },

      // Apply AI move - same as makeMove but called after animation completes
      applyAiMove: (from: string, to: string, promotion?: string) => {
        const move = engine.move({ from, to, promotion: promotion || 'q' });
        if (!move) return null;

        set((state) => {
          state.fen = engine.fen();
          state.turn = engine.turn();
          state.moves.push(move.san);
          state.moveHistory.push(move);
          state.lastMove = { from, to };
          state.selectedSquare = null;
          state.legalMoves = [];
          state.kingInCheck = engine.findKingInCheck();
          
          // Update game status
          if (engine.isCheckmate()) {
            state.statusMsg = 'Checkmate';
            state.isGameOver = true;
            state.gameResult = {
              winner: engine.turn() === 'w' ? 'black' : 'white',
              reason: 'checkmate',
            };
            state.showGameOverModal = true;
          } else if (engine.isStalemate()) {
            state.statusMsg = 'Stalemate';
            state.isGameOver = true;
            state.gameResult = { winner: 'draw', reason: 'stalemate' };
            state.showGameOverModal = true;
          } else if (engine.isDraw()) {
            state.statusMsg = 'Draw';
            state.isGameOver = true;
            state.gameResult = { winner: 'draw', reason: 'draw' };
            state.showGameOverModal = true;
          } else if (engine.inCheck()) {
            state.statusMsg = 'Check';
          } else {
            state.statusMsg = '';
          }
        });

        return move;
      },

      setMoveDrawerOpen: (open: boolean) => {
        set((state) => {
          state.moveDrawerOpen = open;
        });
      },

      setShowGameOverModal: (show: boolean) => {
        set((state) => {
          state.showGameOverModal = show;
        });
      },
    }))
  )
);

// ============================================================================
// Selectors (for performance - only re-render when specific data changes)
// ============================================================================

export const selectGameStatus = (state: GameState) => ({
  isGameOver: state.isGameOver,
  gameResult: state.gameResult,
  statusMsg: state.statusMsg,
});

export const selectTimeState = (state: GameState) => ({
  whiteTime: state.whiteTime,
  blackTime: state.blackTime,
  turn: state.turn,
  isUnlimited: state.timeControl === 'unlimited',
});

export const selectBoardState = (state: GameState) => ({
  fen: state.fen,
  isFlipped: state.isFlipped,
  selectedSquare: state.selectedSquare,
  legalMoves: state.legalMoves,
  lastMove: state.lastMove,
  kingInCheck: state.kingInCheck,
  animatingPiece: state.animatingPiece,
  capturingSquare: state.capturingSquare,
});

export const selectGameSettings = (state: GameState) => ({
  gameMode: state.gameMode,
  timeControl: state.timeControl,
  elo: state.elo,
});
