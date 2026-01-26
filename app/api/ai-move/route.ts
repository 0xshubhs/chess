import { NextResponse } from "next/server";
import { Chess } from "chess.js";
import { mapEloToTemperature, pickMoveByProbability } from "../../../utils/elo";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:latest";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const REQUEST_TIMEOUT = 25000; // 25 seconds timeout

// Simple in-memory rate limiting (use Redis in production)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 30; // requests per minute
const RATE_WINDOW = 60000; // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_WINDOW });
    return true;
  }
  
  if (record.count >= RATE_LIMIT) {
    return false;
  }
  
  record.count++;
  return true;
}

// FEN validation regex - basic structure check
const FEN_REGEX = /^([rnbqkpRNBQKP1-8]+\/){7}[rnbqkpRNBQKP1-8]+ [wb] [KQkq-]+ [a-h1-8-]+ \d+ \d+$/;

export async function POST(req: Request) {
  // Rate limiting
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  
  // Validate FEN is a string and matches basic pattern
  const fen = body.fen;
  if (typeof fen !== "string" || fen.length > 100 || !FEN_REGEX.test(fen)) {
    return NextResponse.json({ error: "invalid_fen_format" }, { status: 400 });
  }
  
  // Validate and clamp ELO to reasonable bounds
  const rawElo = typeof body.elo === "number" ? body.elo : 1200;
  const elo = Math.max(400, Math.min(3000, Math.floor(rawElo)));

  // Validate FEN
  let game: Chess;
  try {
    game = new Chess(fen);
  } catch {
    return NextResponse.json({ error: "invalid_fen" }, { status: 400 });
  }
  
  if (game.isGameOver()) {
    return NextResponse.json({ error: "game_over" }, { status: 400 });
  }

  const legal = game.moves({ verbose: true });
  if (!legal || legal.length === 0) {
    return NextResponse.json({ error: "no_legal_moves" }, { status: 400 });
  }

  // Evaluate each legal move locally (material + position + captures)
  const evaluated = legal.map((m) => {
    const g = new Chess(fen);
    g.move({ from: m.from, to: m.to, promotion: m.promotion ?? "q" });
    let score = simpleEval(g);
    
    // Boost score for captures (the bigger the captured piece, the bigger the boost)
    if (m.captured) {
      const captureBonus: Record<string, number> = {
        p: 1.0,
        n: 3.5,
        b: 3.5,
        r: 5.5,
        q: 10.0,
      };
      score += captureBonus[m.captured] || 0;
    }
    
    // Bonus for checks
    if (g.inCheck()) {
      score += 0.8;
    }
    
    // Bonus for checkmate
    if (g.isCheckmate()) {
      score += 100;
    }
    
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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  
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
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error("Ollama API error:", response.status);
      return null;
    }

    const data = await response.json();
    return data.response?.trim() || null;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      console.error("Ollama request timed out");
    } else {
      console.error("Ollama fetch error:", err);
    }
    return null;
  }
}

async function callGemini(prompt: string, temperature: number): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

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
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error("Gemini API error:", response.status);
      return null;
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      console.error("Gemini request timed out");
    } else {
      console.error("Gemini fetch error:", err);
    }
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
  // Enhanced eval: material + position + captures
  const pieceValues: Record<string, number> = {
    p: 1,
    n: 3,
    b: 3.1,
    r: 5,
    q: 9,
    k: 0,
  };
  
  // Center squares are valuable
  const centerBonus: Record<string, number> = {
    d4: 0.3, e4: 0.3, d5: 0.3, e5: 0.3,
    c3: 0.1, d3: 0.1, e3: 0.1, f3: 0.1,
    c4: 0.2, f4: 0.2, c5: 0.2, f5: 0.2,
    c6: 0.1, d6: 0.1, e6: 0.1, f6: 0.1,
  };
  
  const board = game.board();
  let score = 0;
  
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (!p) continue;
      const sign = p.color === "w" ? 1 : -1;
      const square = "abcdefgh".charAt(f) + (8 - r);
      
      // Material value
      score += sign * (pieceValues[p.type] || 0);
      
      // Center control bonus
      if (centerBonus[square] && p.type !== "k") {
        score += sign * centerBonus[square];
      }
      
      // Pawn advancement bonus (pawns closer to promotion are more valuable)
      if (p.type === "p") {
        const advancementBonus = p.color === "w" 
          ? (7 - r) * 0.05  // White pawns advance up the board
          : r * 0.05;        // Black pawns advance down
        score += sign * advancementBonus;
      }
    }
  }
  
  // Bonus for having check
  if (game.inCheck()) {
    score += game.turn() === "w" ? -0.5 : 0.5;
  }
  
  // from perspective of side to move
  return score * (game.turn() === "w" ? 1 : -1);
}
