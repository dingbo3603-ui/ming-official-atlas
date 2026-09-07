import { HISTORY_REVISION } from './history-revision';

const values = new Map<string, unknown>();
const pending = new Map<string, Promise<unknown>>();
const abortError = () => new DOMException('The request was cancelled', 'AbortError');
export function personShard(id: string): string {
  let hash = 0x811c9dc5;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, '0').slice(-2);
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(url, {signal: controller.signal, headers: {Accept: 'application/json'}});
    if (!response.ok) throw new Error(`资料请求失败（${response.status}）`);
    const body = await response.text();
    let value: unknown;
    try { value = JSON.parse(body.replace(/^\uFEFF/, '')); }
    catch { throw new Error('资料响应不完整'); }
    if (!value || typeof value !== 'object' || ('error' in value)) throw new Error('资料响应无效');
    return value;
  } finally { clearTimeout(timer); }
}

/** A failed PHP request never replaces a valid published MySQL snapshot. */
async function load(url: string): Promise<unknown> {
  const params = new URL(url, 'http://local').searchParams;
  const revision = params.get('v') || HISTORY_REVISION;
  const base = `/api/snapshots/${revision}/`;
  const action = params.get('action');
  const id = params.get('id') || '';
  const path = action === 'bootstrap' ? 'bootstrap.json'
    : action === 'year' ? `years/${params.get('year')}.json`
    : action === 'dataset' ? `datasets/${params.get('name')}.json`
    : action === 'person' ? `people/${personShard(id)}.json` : null;
  const candidates = path ? (action === 'person' || action === 'bootstrap' ? [url, base + path] : [base + path, url]) : [url];
  let error: unknown;
  for (const candidate of candidates) {
    try {
      let result = await fetchJson(candidate);
      if (action === 'person' && candidate !== url) {
        result = (result as Record<string, unknown>)[id];
        if (!result) throw new Error('未找到这位人物的履历');
      }
      if (result && typeof result === 'object' && 'revision' in result && result.revision !== revision) throw new Error('资料版本正在更新');
      return result;
    } catch (failure) { error = failure; }
  }
  throw error;
}

/** Share in-flight reads; cancellation only detaches that caller. Failed reads are never cached. */
export function readHistoryJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(abortError());
  let task = pending.get(url);
  if (values.has(url)) task = Promise.resolve(values.get(url));
  if (!task) {
    task = load(url).then(value => { values.set(url, value); return value; }).finally(() => pending.delete(url));
    pending.set(url, task);
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal?.addEventListener('abort', onAbort, {once: true});
    task.then(value => {if (!signal?.aborted) resolve(value as T);}, error => {if (!signal?.aborted) reject(error);})
      .finally(() => signal?.removeEventListener('abort', onAbort));
  });
}
