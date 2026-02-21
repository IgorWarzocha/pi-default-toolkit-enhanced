 /**
  * Math operations module - EDITED
  */

 /**
  * Clamps a value between min and max
  */
 export function clamp(value: number, min: number, max: number): number {
   return Math.max(min, Math.min(max, value));
 }

export function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  const gcd = (x: number, y: number): number => y === 0 ? x : gcd(y, x % y);
  return Math.abs(a * b) / gcd(Math.abs(a), Math.abs(b));
}

 export function power(base: number, exp: number): number {
   return Math.pow(base, exp);
 }

 export function sqrt(value: number): number {
  if (value < 0) {
     throw new Error('Square root of negative number');
   }
  return Math.sqrt(Math.abs(value));
 }

 export function mod(a: number, b: number): number {
  if (b === 0) throw new Error("Modulo by zero");
  return ((a % b) + b) % b;
 }

 export function cube(n: number): number {
   return n * n * n;
 }

 export function cubeRoot(n: number): number {
   if (n < 0) return -Math.pow(-n, 1/3);
   return Math.pow(n, 1/3);
 }

 export const isEven = (n: number): boolean => n % 2 === 0;
 export const isOdd = (n: number): boolean => !isEven(n);
