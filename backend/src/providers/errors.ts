export class ProviderError extends Error {
  readonly permanent: boolean;
  readonly code?: string;

  constructor(message: string, options?: { permanent?: boolean; code?: string }) {
    super(message);
    this.name = "ProviderError";
    this.permanent = options?.permanent ?? false;
    this.code = options?.code;
  }
}

export function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}
