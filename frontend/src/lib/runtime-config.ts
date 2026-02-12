const DEFAULT_API_BASE_URL = 'http://localhost:7589';
const DEFAULT_SOCKET_URL = 'http://localhost:7590';

type DesktopConfig = {
  apiBaseUrl?: string;
  socketUrl?: string;
};

function readDesktopConfig(): DesktopConfig | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return window.wdpcmDesktopConfig;
}

function sanitizeBaseUrl(value: string | undefined, fallback: string): string {
  if (!value || !value.trim()) {
    return fallback;
  }
  return value.replace(/\/+$/, '');
}

export function getApiBaseUrl(): string {
  const desktopConfig = readDesktopConfig();
  return sanitizeBaseUrl(desktopConfig?.apiBaseUrl, DEFAULT_API_BASE_URL);
}

export function getSocketUrl(): string {
  const desktopConfig = readDesktopConfig();
  return sanitizeBaseUrl(desktopConfig?.socketUrl, DEFAULT_SOCKET_URL);
}

export function getApiUrl(pathname: string): string {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}
