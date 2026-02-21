 import { Calculator } from '../calculator';
 
 describe('Calculator', () => {
   test('adds two numbers', () => {
     const calc = new Calculator();
     expect(calc.add(2, 3)).toBe(5);
   });
 
   test('subtracts correctly', () => {
     const calc = new Calculator();
     expect(calc.subtract(10, 4)).toBe(6);
   });
 });
