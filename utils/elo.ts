export function mapEloToTemperature(elo: number): number {
  // map [600..2400] to temperature [1.2 .. 0.1] (lower temp = stronger play)
  // Lower temperature means AI is more likely to pick the best move
  const clamped = Math.max(600, Math.min(2400, elo));
  const t = 1.2 - ((clamped - 600) / (2400 - 600)) * (1.2 - 0.1);
  return Number(t.toFixed(3));
}

export function pickMoveByProbability(
  items: { uci: string; score: number }[],
  temperature: number
): string {
  // At very low temperature (high ELO), just pick the best move
  if (temperature < 0.2) {
    const best = items.reduce((a, b) => (a.score > b.score ? a : b));
    return best.uci;
  }
  
  // convert scores to positive logits; higher score => more weight
  const max = Math.max(...items.map((i) => i.score));
  const logits = items.map((i) => Math.exp((i.score - max) / Math.max(temperature, 0.01)));
  const sum = logits.reduce((a, b) => a + b, 0);
  const probs = logits.map((l) => l / sum);
  // sample
  let r = Math.random();
  for (let i = 0; i < probs.length; i++) {
    r -= probs[i];
    if (r <= 0) return items[i].uci;
  }
  return items[items.length - 1].uci;
}
