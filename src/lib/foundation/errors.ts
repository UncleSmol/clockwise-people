/**
 * Sanitizes backend, PostgreSQL, and schema errors into friendly user-facing messages.
 * Prevents raw technical database strings (e.g., column ambiguous, relation not found, PGRST errors)
 * from ever being surfaced to end users.
 */
export function sanitizeUserFacingErrorMessage(
  rawError: unknown,
  fallback = "Oops, something went wrong. Please try again or contact support."
): string {
  if (!rawError) return fallback;

  const message =
    typeof rawError === "string"
      ? rawError
      : typeof (rawError as any)?.message === "string"
      ? (rawError as any).message
      : "";

  if (!message || typeof message !== "string") return fallback;

  // Technical database, SQL, RPC, and internal infrastructure signatures
  const technicalSignatures = [
    "column reference",
    "ambiguous",
    "relation",
    "does not exist",
    "syntax error",
    "violates foreign key",
    "violates not-null",
    "violates check",
    "violates unique",
    "duplicate key",
    "schema cache",
    "pgrst",
    "function public.",
    "operator does not exist",
    "permission denied",
    "unterminated",
    "null value in column",
    "invalid input syntax",
    "prepared statement",
    "connection refused",
    "deadlock detected",
    "server error",
    "fatal:",
    "stack trace",
  ];

  const lower = message.toLowerCase();
  const isTechnical = technicalSignatures.some((sig) => lower.includes(sig));

  if (isTechnical) {
    console.error("[Internal System Error Sanitized]:", message);
    return "Oops, something went wrong. Please try again or contact support.";
  }

  return message;
}
