/** Domain errors carry intent; the HTTP layer maps them to status codes. */
export class DomainError extends Error {
  constructor(
    readonly kind: "validation" | "forbidden" | "not_found" | "conflict",
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const forbidden = (message: string, details?: unknown) => new DomainError("forbidden", message, details);
export const conflict = (message: string, details?: unknown) => new DomainError("conflict", message, details);
export const invalid = (message: string, details?: unknown) => new DomainError("validation", message, details);
export const notFound = (message: string) => new DomainError("not_found", message);
