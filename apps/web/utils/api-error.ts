export function apiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== "object" || error === null) {
    return fallback;
  }
  if ("data" in error && typeof error.data === "object" && error.data !== null &&
      "error" in error.data && typeof error.data.error === "string") {
    return error.data.error;
  }
  return fallback;
}
