/**
 * Single place where the browser talks to the backend. In development Vite
 * proxies these paths to the backend; in production VITE_API_BASE_URL points
 * at the Render deployment. Writes attach the Supabase session token when
 * signed in; reads stay public so the dashboard is gradable without login.
 */
import { supabase } from "../lib/supabase";

const BASE_URL = import.meta.env['VITE_API_BASE_URL'] ?? '';

async function authHeaders(): Promise<Record<string, string>> {
  try {
    const token = (await supabase?.auth.getSession())?.data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export interface IntegrationReadiness {
  database: boolean;
  schedulerAuth: boolean;
  userAuth?: boolean;
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
  scrapeIntervalHours?: number;
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
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json',
      ...(await authHeaders()),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return readJson<T>(response, path);
}

export async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { accept: 'application/json', ...(await authHeaders()), ...init?.headers },
  });
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

export function trackProduct(
  storeProductId: string,
  selectedOption: string,
  scrapeIntervalHours = 2,
): Promise<TrackResult> {
  return postJson<TrackResult>('/api/tracked-products', {
    storeProductId,
    selectedOption,
    scrapeIntervalHours,
  });
}

export async function updateInterval(id: string, scrapeIntervalHours: number): Promise<unknown> {
  const r = await authedFetch(`/api/tracked-products/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scrapeIntervalHours }),
  });
  if (!r.ok) {
    let message = `interval update failed with HTTP ${r.status}`;
    try {
      const body = (await r.json()) as { message?: string };
      if (typeof body.message === 'string') message = body.message;
    } catch {
      /* non-JSON: keep status message */
    }
    throw new Error(message);
  }
  return r.json() as Promise<unknown>;
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

export interface AlertItem {
  type: 'price_drop' | 'back_in_stock' | 'scrape_failed';
  trackedProductId: string;
  storeProductId: string;
  productName: string;
  selectedOption: string;
  fromPrice?: number;
  toPrice?: number;
  dropPct?: number;
  stock?: string;
  errorCode?: string | null;
  observedAt?: string;
  attemptedAt?: string;
}

export interface ChangeEvent {
  attempted_at: string;
  error_code: string;
  error_message: string | null;
  store_product_id: string;
  product_name: string;
  selected_option: string;
}

export async function fetchAlerts(): Promise<AlertItem[]> {
  const data = await getJson<{ results: AlertItem[] }>('/api/alerts');
  return data.results;
}

export async function fetchChangeEvents(): Promise<ChangeEvent[]> {
  const data = await getJson<{ results: ChangeEvent[] }>('/api/change-events');
  return data.results;
}

export function trackByProduct(
  storeProductId: string,
  options: string[],
  scrapeIntervalHours = 2,
): Promise<{ succeeded: number; failed: number; targets: unknown }> {
  return postJson('/api/tracked-products/by-product', { storeProductId, options, scrapeIntervalHours });
}

export function exportCsvUrl(): string {
  return `${BASE_URL}/api/export.csv`;
}
