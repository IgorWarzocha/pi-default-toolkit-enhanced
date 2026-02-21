export class Sample1 {
  name: string = "renamed-sample";
 value: number = 100;
  description: string = "Added via multi-edit";

  getName(): string {
    return this.name;
  }

  getValue(): number {
    return this.value;
  }
}
