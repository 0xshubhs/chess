import { NextResponse } from "next/server";
import { Chess } from "chess.js";
import { mapEloToTemperature, pickMoveByProbability } from "../../../utils/elo";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:latest";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

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

  const temperature = mapEloToTemperature(elo);
  const prompt = buildPrompt(fen, evaluated, temperature);

  let chosenUci: string;

  try {
    // Try Ollama first (local), then Gemini (deployed)
    let llmResponse: string | null = null;

    if (!GEMINI_API_KEY) {
      // Use Ollama locally
      llmResponse = await callOllama(prompt, temperature);
    } else {
      // Use Gemini API for deployed version
      llmResponse = await callGemini(prompt, temperature);
    }

    if (llmResponse) {
      const chosen = parseMoveFromOutput(llmResponse);
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
    } else {
      // LLM failed, use fallback
      chosenUci = pickMoveByProbability(
        evaluated.map((e) => ({ uci: e.uci, score: e.score })),
        temperature
      );
    }
  } catch (err) {
    console.error("LLM execution failed:", err);
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

async function callOllama(prompt: string, temperature: number): Promise<string | null> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: {
          temperature: Math.max(0.1, temperature),
          num_predict: 20,
        },
      }),
    });

    if (!response.ok) {
      console.error("Ollama API error:", response.status);
      return null;
    }

    const data = await response.json();
    return data.response?.trim() || null;
  } catch (err) {
    console.error("Ollama fetch error:", err);
    return null;
  }
}

async function callGemini(prompt: string, temperature: number): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: Math.max(0.1, temperature),
            maxOutputTokens: 20,
          },
        }),
      }
    );

    if (!response.ok) {
      console.error("Gemini API error:", response.status);
      return null;
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch (err) {
    console.error("Gemini fetch error:", err);
    return null;
  }
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
