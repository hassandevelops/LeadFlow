export function phoneDigits(value: string): string {
  return value.replace(/\D+/g, "");
}

export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) {
    return false;
  }
  const digitsA = phoneDigits(a);
  const digitsB = phoneDigits(b);
  if (digitsA.length < 7 || digitsB.length < 7) {
    return false;
  }
  return digitsA === digitsB || digitsA.endsWith(digitsB) || digitsB.endsWith(digitsA);
}
