export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    const parts = [
      e.message,
      e.details,
      e.hint,
      e.code ? `code=${String(e.code)}` : null,
    ].filter(Boolean).map(String);

    if (parts.length) return parts.join(" · ");

    try {
      return JSON.stringify(error);
    } catch {
      return "Unknown error";
    }
  }

  return String(error ?? "Unknown error");
}
