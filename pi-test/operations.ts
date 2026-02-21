 /**
  * Math operations module
  */

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

 export const isEven = (n: number): boolean => n % 2 === 0;
 export const isOdd = (n: number): boolean => !isEven(n);
