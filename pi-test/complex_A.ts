export class ComplexA {
  constructor() {
    return;
  }

  methodOne() {
    return 1;
  }

  methodTwo() {
    return 2;
  }

  methodThree() {
    return 3;
  }

  methodFour() {
    return this.methodOne() + this.methodTwo() + this.methodThree();
  }

  methodFive() {
    return 5;
  }
}
