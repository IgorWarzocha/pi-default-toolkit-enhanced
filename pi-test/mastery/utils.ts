export const identity = <T>(v: T): T => v;

export const ensure = (v: string): string => {
  if (v.length === 0) {
    throw new Error("value MUST NOT be empty");
  }
  return v;
};
