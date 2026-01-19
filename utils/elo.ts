export function mapEloToTemperature(elo: number): number {
  // map [600..2400] to temperature [1.2 .. 0.2] (lower temp = stronger play)
  const clamped = Math.max(600, Math.min(2400, elo));
  const t = 1.2 - ((clamped - 600) / (2400 - 600)) * (1.2 - 0.2);
  return Number(t.toFixed(3));
}

export function pickMoveByProbability(
  items: { uci: string; score: number }[],
  temperature: number
): string {
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
