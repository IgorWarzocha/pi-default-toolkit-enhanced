export function multiply(a: number, b: number): number {
  return a * b;
}

export function square(n: number): number {
  return n * n;
}

export function cube(n: number): number {
  return n * n * n;
}

export function sqrt(n: number): number {
  return Math.sqrt(n);
}

export function factorial(n: number): number {
  if (n < 0) throw new Error('Factorial undefined for negative numbers');
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

export function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) return false;
  }
  return true;
}
