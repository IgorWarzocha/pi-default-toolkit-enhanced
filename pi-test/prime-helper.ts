import { isPrime } from './primes';

/**
 * Extended prime utilities for calculator
 */
export function primeFactors(n: number): number[] {
  if (n < 2) return [];
  const factors: number[] = [];
  let divisor = 2;
  let remaining = n;
  
  while (divisor * divisor <= remaining) {
    while (remaining % divisor === 0) {
      factors.push(divisor);
      remaining /= divisor;
    }
    divisor++;
  }
  if (remaining > 1) factors.push(remaining);
  return factors;
}

export function goldbachConjecture(n: number): [number, number] | null {
  if (n < 4 || n % 2 !== 0) return null;
  for (let i = 2; i <= n / 2; i++) {
    if (isPrime(i) && isPrime(n - i)) {
      return [i, n - i];
    }
  }
  return null;
}
