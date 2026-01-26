/**
 * AI Move API Route with Server-Sent Events
 * 
 * Replaces HTTP polling with streaming for real-time updates.
 * Also uses Redis-compatible rate limiting for production.
 */

import { NextRequest } from 'next/server';
import { Chess, Move } from 'chess.js';
import { mapEloToTemperature, pickMoveByProbability } from '../../../utils/elo';
import { RateLimiter } from '../../../lib/rateLimiter';
import { EvaluationEngine } from '../../../lib/chessEngine';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:latest';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const REQUEST_TIMEOUT = 25000;

// Rate limiter singleton
const rateLimiter = RateLimiter.getInstance();

// FEN validation
const FEN_REGEX = /^([rnbqkpRNBQKP1-8]+\/){7}[rnbqkpRNBQKP1-8]+ [wb] [KQkq-]+ [a-h1-8-]+ \d+ \d+$/;

// Encoder for SSE
const encoder = new TextEncoder();

function sendSSE(controller: ReadableStreamDefaultController, event: string, data: unknown) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  controller.enqueue(encoder.encode(message));
}

export async function POST(req: NextRequest) {
  // Rate limiting
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
  const rateLimitResult = await rateLimiter.checkLimit(ip);
  
  if (!rateLimitResult.allowed) {
    return new Response(
      JSON.stringify({ error: 'rate_limited', retryAfter: rateLimitResult.retryAfter }),
      { 
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(rateLimitResult.retryAfter),
        },
      }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400 });
  }

  // Validate FEN
  const fen = body.fen;
  if (typeof fen !== 'string' || fen.length > 100 || !FEN_REGEX.test(fen)) {
    return new Response(JSON.stringify({ error: 'invalid_fen_format' }), { status: 400 });
  }

  // Validate ELO
  const rawElo = typeof body.elo === 'number' ? body.elo : 1200;
  const elo = Math.max(400, Math.min(3000, Math.floor(rawElo)));

  // Check if streaming is requested
  const useStreaming = body.stream === true;

  // Validate position
  let game: Chess;
  try {
    game = new Chess(fen);
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_fen' }), { status: 400 });
  }

  if (game.isGameOver()) {
    return new Response(JSON.stringify({ error: 'game_over' }), { status: 400 });
  }

  const legal = game.moves({ verbose: true });
  if (!legal || legal.length === 0) {
    return new Response(JSON.stringify({ error: 'no_legal_moves' }), { status: 400 });
  }

  // If streaming requested, use SSE
  if (useStreaming) {
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send thinking status
          sendSSE(controller, 'thinking', { status: 'evaluating_moves' });

          // Evaluate moves using pooled engine
          const evaluated = evaluateMoves(fen, legal);
          
          sendSSE(controller, 'thinking', { status: 'selecting_move', movesEvaluated: evaluated.length });

          // Get AI move
          const temperature = mapEloToTemperature(elo);
          const chosenUci = await getAiMove(fen, evaluated, temperature);

          sendSSE(controller, 'thinking', { status: 'applying_move' });

          // Apply the move
          const from = chosenUci.slice(0, 2);
          const to = chosenUci.slice(2, 4);
          const promotion = chosenUci.length > 4 ? chosenUci.slice(4) : undefined;

          const applied = game.move({ from, to, promotion });
          if (!applied) {
            sendSSE(controller, 'error', { error: 'invalid_move_after_validation' });
            controller.close();
            return;
          }

          // Calculate evaluation for display
          const evaluation = EvaluationEngine.evaluate(game.fen()) * 100;

          // Send final move
          sendSSE(controller, 'move', {
            move: applied.san,
            fen: game.fen(),
            evaluation: Math.round(evaluation),
            from,
            to,
          });

          controller.close();
        } catch (err) {
          console.error('SSE stream error:', err);
          sendSSE(controller, 'error', { error: 'internal_error' });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }

  // Non-streaming response (backward compatible)
  try {
    const evaluated = evaluateMoves(fen, legal);
    const temperature = mapEloToTemperature(elo);
    const chosenUci = await getAiMove(fen, evaluated, temperature);

    const from = chosenUci.slice(0, 2);
    const to = chosenUci.slice(2, 4);
    const promotion = chosenUci.length > 4 ? chosenUci.slice(4) : undefined;

    const applied = game.move({ from, to, promotion });
    if (!applied) {
      return new Response(
        JSON.stringify({ error: 'invalid_move_after_validation' }),
        { status: 500 }
      );
    }

    const evaluation = EvaluationEngine.evaluate(game.fen()) * 100;

    return new Response(
      JSON.stringify({
        move: applied.san,
        fen: game.fen(),
        evaluation: Math.round(evaluation),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    console.error('AI move error:', err);
    return new Response(
      JSON.stringify({ error: 'internal_error' }),
      { status: 500 }
    );
  }
}

interface EvaluatedMove {
  san: string;
  uci: string;
  from: string;
  to: string;
  score: number;
  captured?: string;
}

/**
 * Evaluate all legal moves using pooled chess instances
 */
function evaluateMoves(
  fen: string,
  legal: ReturnType<Chess['moves']>
): EvaluatedMove[] {
  return (legal as Move[]).map((m) => {
    const result = EvaluationEngine.evaluateMove(fen, {
      from: m.from,
      to: m.to,
      promotion: m.promotion ?? 'q',
    });

    let score = result.score;

    // Boost for captures
    if (m.captured) {
      const captureBonus: Record<string, number> = {
        p: 1.0, n: 3.5, b: 3.5, r: 5.5, q: 10.0,
      };
      score += captureBonus[m.captured] || 0;
    }

    // Boost for checks
    if (result.isCheck) {
      score += 0.8;
    }

    // Massive boost for checkmate
    if (result.isCheckmate) {
      score += 100;
    }

    return {
      san: m.san,
      uci: `${m.from}${m.to}${m.promotion ?? ''}`,
      from: m.from,
      to: m.to,
      score,
      captured: m.captured,
    };
  });
}

/**
 * Get AI move from LLM or fallback
 */
async function getAiMove(
  fen: string,
  evaluated: EvaluatedMove[],
  temperature: number
): Promise<string> {
  const prompt = buildPrompt(fen, evaluated, temperature);

  try {
    let llmResponse: string | null = null;

    if (!GEMINI_API_KEY) {
      llmResponse = await callOllama(prompt, temperature);
    } else {
      llmResponse = await callGemini(prompt, temperature);
    }

    if (llmResponse) {
      const chosen = parseMoveFromOutput(llmResponse);
      const legalUCIs = evaluated.map((e) => e.uci);

      if (legalUCIs.includes(chosen)) {
        return chosen;
      }

      // Try to match SAN
      const found = evaluated.find((e) => e.san === chosen);
      if (found) {
        return found.uci;
      }
    }
  } catch (err) {
    console.error('LLM execution failed:', err);
  }

  // Fallback: probability-based selection
  return pickMoveByProbability(
    evaluated.map((e) => ({ uci: e.uci, score: e.score })),
    temperature
  );
}

async function callOllama(prompt: string, temperature: number): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      console.error('Ollama API error:', response.status);
      return null;
    }

    const data = await response.json();
    return data.response?.trim() || null;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      console.error('Ollama request timed out');
    } else {
      console.error('Ollama fetch error:', err);
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      console.error('Gemini API error:', response.status);
      return null;
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      console.error('Gemini request timed out');
    } else {
      console.error('Gemini fetch error:', err);
    }
    return null;
  }
}

function buildPrompt(
  fen: string,
  evaluated: EvaluatedMove[],
  temperature: number
): string {
  const movesList = evaluated
    .map((e) => `${e.uci} (SAN: ${e.san}) — eval: ${e.score.toFixed(2)}`)
    .join('\n');

  return `You are a chess move selector. Choose ONE of the legal moves below.

FEN: ${fen}

Legal moves (UCI, SAN, eval):
${movesList}

Choose the best move for the side to move. Output exactly the UCI string (e.g. e2e4, g1f3, e7e8q). No explanation. No punctuation. No JSON. No extra text.

Temperature: ${temperature}
`;
}

function parseMoveFromOutput(out: string | undefined): string {
  if (!out) return '';
  const match = out.match(/[a-h][1-8][a-h][1-8][qrbnk]?/i);
  if (match) {
    return match[0].toLowerCase();
  }
  const s = out.trim().split(/\s|\n/)[0];
  return s.replace(/[^a-h1-8qrbnk]/gi, '').toLowerCase();
}
