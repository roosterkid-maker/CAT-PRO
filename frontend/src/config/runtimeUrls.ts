function resolveRuntimeUrl(
  configuredUrl: string | undefined,
): string {
  const normalizedConfiguredUrl =
    configuredUrl
      ?.trim()
      .replace(/\/+$/, "");

  if (normalizedConfiguredUrl) {
    return normalizedConfiguredUrl;
  }

  if (typeof window !== "undefined") {
    return window.location.origin.replace(
      /\/+$/,
      "",
    );
  }

  return "";
}

export const API_BASE_URL =
  resolveRuntimeUrl(
    import.meta.env.VITE_API_BASE_URL,
  );

export const SOCKET_URL =
  resolveRuntimeUrl(
    import.meta.env.VITE_SOCKET_URL,
  );
