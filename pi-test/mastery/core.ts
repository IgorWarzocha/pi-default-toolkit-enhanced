export class Mastery {
  static readonly VERSION = "1.0.0";
  private static instance: Mastery;
  constructor(public readonly name: string) {}

  static getInstance(name: string = "default"): Mastery {
    if (!Mastery.instance) {
      Mastery.instance = new Mastery(name);
    }
    return Mastery.instance;
  }

  text(): string {
    if (this.name.length === 0) {
      throw new Error("name MUST NOT be empty");
    }
    return `[${Mastery.VERSION}] ${this.name} active.`;
  }
}
