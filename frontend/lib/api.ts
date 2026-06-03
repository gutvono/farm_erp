// API calls use relative URLs — Next.js rewrites proxy them to the backend.
// This avoids cross-origin cookie issues in all environments.


type FetchOptions = RequestInit & {
  params?: Record<string, string | number | boolean | undefined>;
};

export async function apiFetch<T = unknown>(
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  const { params, ...fetchOptions } = options;

  let url = path;

  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        searchParams.set(key, String(value));
      }
    }
    const queryString = searchParams.toString();
    if (queryString) {
      url = `${url}?${queryString}`;
    }
  }

  const response = await fetch(url, {
    ...fetchOptions,
    credentials: "include", // Always send cookies for session auth
    headers: {
      "Content-Type": "application/json",
      ...fetchOptions.headers,
    },
  });

  const data = await response.json().catch(() => null);

  if (response.status === 401) {
    const isAuthCheck = path === "/api/auth/login" || path === "/api/auth/me";
    if (!isAuthCheck && typeof window !== "undefined") {
      window.location.href = "/login";
    }
    const message = data?.detail ?? "Sessão expirada. Faça login novamente.";
    throw new Error(message);
  }

  if (!response.ok) {
    const message =
      data?.detail ?? data?.message ?? `Erro ${response.status}: ${response.statusText}`;
    throw new Error(message);
  }

  return data as T;
}
