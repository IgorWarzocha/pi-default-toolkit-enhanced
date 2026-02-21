import { multiply } from './utils/math';
import { power, sqrt, mod } from './operations';
import { logger } from './logger';
import { precisionRound } from './shared/math_utils';

/**
 * Calculator Application
 * Supports basic arithmetic operations
 */

export class Calculator {
  private result: number = 0;
  private history: string[] = [];

  /**
   * Square of a number
   */
  square(n: number): number {
    return multiply(n, n);
  }

  power = power;
  mod = mod;

  sqrt(n: number): number {
    return sqrt(n);
  }

  /**
   * Computes power with validation
   */
  pow(base: number, exp: number): number {
    const result = this.power(base, exp);
    this.record(`pow(${base}, ${exp}) = ${result}`);
    return result;
  }

  /**
   * Adds two numbers
  */
  add(a: number, b: number): number {
    return a + b;
  }

  /**
   * Subtracts b from a
   */
  subtract(a: number, b: number): number {
   return subtractFn(a, b);
  }

  /**
   * Multiplies two numbers
   */
  multiply(a: number, b: number): number {
    return multiply(a, b);
  }

  /**
   * Divides a by b
   * @throws Error if divisor is zero
   */
  divide(a: number, b: number): number {
    if (b === 0) {
      logger.error('Attempted division by zero');
      throw new Error('Division by zero');
    }
    const res = precisionRound(a / b);
    this.record(`divide(${a}, ${b}) = ${res}`);
    return res;
  }

  /**
   * Computes factorial of n
   * @throws Error if n is negative or too large
   */
  factorial(n: number): number {
    if (n < 0) throw new Error('Factorial of negative number');
    if (n > 170) throw new Error('Factorial overflow (max n=170)');
    if (n === 0 || n === 1) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) {
      result *= i;
    }
    this.record(`factorial(${n}) = ${result}`);
    return result;
  }

  private record(entry: string): void {
    this.history.push(entry);
    logger.info(entry);
  }

  /**
   * Returns calculation history
   */
  getHistory(): string[] {
    return [...this.history];
  }

  /**
   * Returns current result
   */
  getResult(): number {
    return this.result;
  }

  /**
   * Resets calculator
   */
  reset(): void {
    this.result = 0;
  }
}

/**
 * Entry point
 */
function main(): void {
  const calc = new Calculator();
  console.log('Calculator initialized');
  console.log('2 + 3 =', calc.add(2, 3));
  console.log('10 - 4 =', calc.subtract(10, 4));
  console.log('5 * 6 =', calc.multiply(5, 6));
  console.log('20 / 4 =', calc.divide(20, 4));
}

main();
