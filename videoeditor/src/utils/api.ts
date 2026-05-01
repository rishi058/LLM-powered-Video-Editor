/**
 * Simple API URL helper for the Vite SPA.
 *
 * In development, Vite proxies /api/* to the render-server (port 8000).
 * Direct calls to the Python FastAPI backend use the FASTAPI_URL env var or default.
 *
 * In production, serve the SPA and Express under the same origin; Python AI
 * endpoints live at a separate URL configured via VITE_FASTAPI_URL.
 */

// FastAPI (Python backend) base URL — used only for AI/LLM endpoints
export const FASTAPI_URL: string =
  typeof import.meta !== "undefined" && (import.meta as unknown as Record<string, unknown>).env
    ? ((import.meta as unknown as { env: Record<string, string> }).env.VITE_FASTAPI_URL ?? "http://localhost:3000")
    : "http://localhost:3000";

/**
 * Returns the correct URL for a given endpoint.
 *
 * @param endpoint  - path, e.g. "/render", "/api/assets"
 * @param fastapi   - if true, route to the Python FastAPI backend
 */
export const apiUrl = (endpoint: string, fastapi: boolean = false): string => {
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  if (fastapi) {
    return `${FASTAPI_URL}${path}`;
  }
  // Relative URL — Vite dev proxy forwards /api/* to render-server
  return path;
};
