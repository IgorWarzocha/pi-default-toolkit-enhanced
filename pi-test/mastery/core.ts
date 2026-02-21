export class Mastery {
  static readonly VERSION = "1.0.0";
  constructor(public readonly name: string) {}
  text(): string {
    if (this.name.length === 0) {
      throw new Error("name MUST NOT be empty");
    }
    return `[${Mastery.VERSION}] ${this.name} active.`;
  }
}
