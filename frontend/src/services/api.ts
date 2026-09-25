/**
 * Single place where the browser talks to the backend. In development Vite
 * proxies these paths to the backend; in production VITE_API_BASE_URL points
 * at the Render deployment.
 */
const BASE_URL = import.meta.env['VITE_API_BASE_URL'] ?? '';

export interface IntegrationReadiness {
  database: boolean;
  schedulerAuth: boolean;
}

export interface HealthResponse {
  status: string;
  service: string;
  environment: string;
  integrations: IntegrationReadiness;
  checkedAt: string;
}

export interface SearchHit {
  storeProductId: string;
  name: string;
  brand: string | null;
  category: string | null;
  productUrl: string;
}

export interface ProductDetail {
  storeProductId: string;
  name: string;
  brand: string | null;
  category: string | null;
  sku: string | null;
  optionAxis: string | null;
  options: Array<{ id: string; label: string }>;
  productUrl: string;
}

export interface TrackedTarget {
  id: string;
  storeProductId: string;
  productName: string;
  selectedOption: string;
  productUrl: string;
  latest: { price: number; stock: string; observedAt: string } | null;
  lastScrape: {
    outcome: string;
    attemptedAt: string;
    errorCode: string | null;
  } | null;
}

export interface HistoryEntry {
  price: number;
  stock: string;
  observed_at: string;
}

export interface AttemptEntry {
  attempt_number: number;
  attempted_at: string;
  outcome: 'success' | 'retried' | 'failed';
  price: number | null;
  stock: string | null;
  http_status: number | null;
  error_code: string | null;
  error_message: string | null;
}

export class ApiError extends Error {
  status: number;
  code: string | null;

  constructor(status: number, code: string | null, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function readJson<T>(response: Response, path: string): Promise<T> {
  let body: unknown = null;
  try {
    body = (await response.json()) as unknown;
  } catch {
    throw new ApiError(response.status, null, `${path} returned non-JSON (HTTP ${response.status})`);
  }
  if (!response.ok) {
    const record = (body ?? {}) as Record<string, unknown>;
    throw new ApiError(
      response.status,
      typeof record['error'] === 'string' ? record['error'] : null,
      typeof record['message'] === 'string'
        ? record['message']
        : `${path} failed with HTTP ${response.status}`,
    );
  }
  return body as T;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { accept: 'application/json' },
  });
  return readJson<T>(response, path);
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { accept: 'application/json', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return readJson<T>(response, path);
}

export function fetchHealth(): Promise<HealthResponse> {
  return getJson<HealthResponse>('/health');
}

export async function searchProducts(query: string): Promise<SearchHit[]> {
  const data = await getJson<{ results: SearchHit[] }>(
    `/api/products/search?q=${encodeURIComponent(query)}`,
  );
  return data.results;
}

export function fetchProduct(id: string): Promise<ProductDetail> {
  return getJson<ProductDetail>(`/api/products/${encodeURIComponent(id)}`);
}

export async function listTracked(): Promise<TrackedTarget[]> {
  const data = await getJson<{ results: TrackedTarget[] }>('/api/tracked-products');
  return data.results;
}

export interface TrackResult extends TrackedTarget {
  deduped: boolean;
  firstScrape: { outcome: string; latest: TrackedTarget['latest'] } | null;
}

export function trackProduct(storeProductId: string, selectedOption: string): Promise<TrackResult> {
  return postJson<TrackResult>('/api/tracked-products', {
    storeProductId,
    selectedOption,
  });
}

export function fetchHistory(id: string): Promise<HistoryEntry[]> {
  return getJson<{ results: HistoryEntry[] }>(
    `/api/tracked-products/${encodeURIComponent(id)}/history?limit=100`,
  ).then((data) => data.results);
}

export function fetchScrapeLog(id: string): Promise<AttemptEntry[]> {
  return getJson<{ results: AttemptEntry[] }>(
    `/api/tracked-products/${encodeURIComponent(id)}/scrape-log?limit=100`,
  ).then((data) => data.results);
}

export function rescrapeTarget(id: string): Promise<{ succeeded: number; failed: number }> {
  return postJson(`/api/tracked-products/${encodeURIComponent(id)}/scrape`);
}

export function exportCsvUrl(): string {
  return `${BASE_URL}/api/export.csv`;
}
