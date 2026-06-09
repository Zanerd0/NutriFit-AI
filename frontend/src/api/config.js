/** Backend API base URL — `/api` locally (Vite proxy), production URL on deploy. */
export const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "/api";
