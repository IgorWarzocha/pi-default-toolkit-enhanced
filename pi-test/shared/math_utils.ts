export const clamp = (val: number, min: number, max: number): number => 
  Math.max(min, Math.min(max, val));

export const precisionRound = (val: number, precision: number = 2): number => {
  const factor = Math.pow(10, precision);
  return Math.round(val * factor) / factor;
};
