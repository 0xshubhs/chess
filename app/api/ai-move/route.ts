import { NextResponse } from "next/server";
import { Chess } from "chess.js";
import { spawnSync } from "child_process";
import { mapEloToTemperature, pickMoveByProbability } from "../../../utils/elo";

export async function POST(req: Request) {
  const body = await req.json();
  const fen = body.fen as string;
  const elo = typeof body.elo === "number" ? body.elo : 1200;

  const game = new Chess(fen);
  if (game.isGameOver()) {
    return NextResponse.json({ error: "game_over" }, { status: 400 });
  }

  const legal = game.moves({ verbose: true });
  if (!legal || legal.length === 0) {
    return NextResponse.json({ error: "no_legal_moves" }, { status: 400 });
  }

  // Evaluate each legal move locally (material + tiny heuristics)
  const evaluated = legal.map((m) => {
    const g = new Chess(fen);
    g.move({ from: m.from, to: m.to, promotion: m.promotion ?? "q" });
    const score = simpleEval(g);
    return {
      san: m.san,
      uci: `${m.from}${m.to}${m.promotion ?? ""}`,
      to: m.to,
      from: m.from,
      score,
    };
  });

  // Convert to prompt for Ollama — include only legal moves and their simple scores.
  const temperature = mapEloToTemperature(elo);

  const prompt = buildPrompt(fen, evaluated, temperature);

  // Run Ollama CLI synchronously (server environment) — make sure OLLAMA_BIN is in PATH or set in env.
  const ollama = process.env.OLLAMA_BIN || "ollama";
  const model = process.env.OLLAMA_MODEL || "llama2";

  let chosenUci: string;

  try {
    const result = spawnSync(ollama, ["run", model], {
      input: prompt,
      encoding: "utf-8",
      maxBuffer: 10_000_000,
      timeout: 60000, // 60 second timeout
    });

    if (result.error) {
      console.error("Ollama error:", result.error);
      // Fallback to local probability-based selection
      chosenUci = pickMoveByProbability(
        evaluated.map((e) => ({ uci: e.uci, score: e.score })),
        temperature
      );
    } else {
      const stdout = result.stdout?.trim();
      // Attempt to parse the chosen move from output — be permissive
      const chosen = parseMoveFromOutput(stdout);

      // Validate chosen move
      const legalUCIs = evaluated.map((e) => e.uci);

      chosenUci = chosen;
      if (!legalUCIs.includes(chosenUci)) {
        // try to convert SAN to UCI
        const found = evaluated.find((e) => e.san === chosen);
        if (found) chosenUci = found.uci;
      }

      if (!legalUCIs.includes(chosenUci)) {
        // fallback: pick by local probability based on evaluation & temperature
        chosenUci = pickMoveByProbability(
          evaluated.map((e) => ({ uci: e.uci, score: e.score })),
          temperature
        );
      }
    }
  } catch (err) {
    console.error("Ollama execution failed:", err);
    // Fallback to local probability-based selection
    chosenUci = pickMoveByProbability(
      evaluated.map((e) => ({ uci: e.uci, score: e.score })),
      temperature
    );
  }

  // apply
  const from = chosenUci.slice(0, 2);
  const to = chosenUci.slice(2, 4);
  const promotion = chosenUci.length > 4 ? chosenUci.slice(4) : undefined;

  const applied = game.move({ from, to, promotion });
  if (!applied) {
    return NextResponse.json(
      { error: "invalid_move_after_validation" },
      { status: 500 }
    );
  }

  return NextResponse.json({ move: applied.san, fen: game.fen() });
}

function buildPrompt(
  fen: string,
  evaluated: { san: string; uci: string; score: number }[],
  temperature: number
): string {
  // Keep prompt minimal and explicit: DO NOT ask to invent moves.
  const movesList = evaluated
    .map((e) => `${e.uci} (SAN: ${e.san}) — eval: ${e.score.toFixed(2)}`)
    .join("\n");
  return `You are a chess move selector. Choose ONE of the legal moves below.

FEN: ${fen}

Legal moves (UCI, SAN, eval):
${movesList}

Choose the best move for the side to move. Output exactly the UCI string (e.g. e2e4, g1f3, e7e8q). No explanation. No punctuation. No JSON. No extra text.

Temperature: ${temperature}
`;
}

function parseMoveFromOutput(out: string | undefined): string {
  if (!out) return "";
  // Look for UCI-like patterns (e.g., e2e4, g1f3, e7e8q)
  const match = out.match(/[a-h][1-8][a-h][1-8][qrbnk]?/i);
  if (match) {
    return match[0].toLowerCase();
  }
  // Fallback: just take the first word and clean it
  const s = out.trim().split(/\s|\n/)[0];
  return s.replace(/[^a-h1-8qrbnk]/gi, "").toLowerCase();
}

function simpleEval(game: Chess): number {
  // very small eval: material only
  const pieceValues: Record<string, number> = {
    p: 1,
    n: 3,
    b: 3.1,
    r: 5,
    q: 9,
    k: 0,
  };
  const board = game.board();
  let score = 0;
  for (const row of board) {
    for (const p of row) {
      if (!p) continue;
      const sign = p.color === "w" ? 1 : -1;
      score += sign * (pieceValues[p.type] || 0);
    }
  }
  // from perspective of side to move
  return score * (game.turn() === "w" ? 1 : -1);
}
