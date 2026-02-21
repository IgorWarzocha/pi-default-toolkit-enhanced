export const config = {
  precision: 14,
  maxDigits: 15,
  decimalPlaces: 4,
  currency: 'USD',
  theme: 'dark',
  debugMode: true,
};

export const appInfo = {
  name: "Calculator",
  version: "1.0.0",
};

export const features = {
  historyEnabled: true,
  scientificMode: true,
  primeChecking: true,
  factorialEnabled: true,
  complexOperations: false,
  clampEnabled: true,
  primeGeneration: true
};

export const limits = {
  maxFactorial: 170,
  maxPrimeSearch: 10000,
  historySize: 100
};
