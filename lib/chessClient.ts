import { Chess } from "chess.js";

export function newGameFen(): string {
  const g = new Chess();
  return g.fen();
}

export function isValidFen(fen: string): boolean {
  try {
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
}
