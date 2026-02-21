/**
 * Prime number utilities
 */
export function generatePrimes(limit: number): number[] {
  const primes: number[] = [];
  for (let n = 2; n <= limit; n++) {
    let isPrime = true;
    for (let i = 2; i <= Math.sqrt(n); i++) {
      if (n % i === 0) {
        isPrime = false;
        break;
      }
    }
    if (isPrime) primes.push(n);
  }
  return primes;
}

export function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i <= Math.sqrt(n); i += 2) {
    if (n % i === 0) return false;
  }
  return true;
 }

 /**
  * Finds nth prime number
  */
 export function nthPrime(n: number): number {
   if (n < 1) throw new Error('n must be positive');
   let count = 0;
   let candidate = 2;
   while (count < n) {
     if (isPrime(candidate)) count++;
     if (count < n) candidate++;
   }
   return candidate;
}
