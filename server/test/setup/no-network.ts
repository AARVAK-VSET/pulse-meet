/**
 * Runs before every test file (Jest `setupFilesAfterEnv`).
 *
 * Blocks all outbound network traffic except loopback, which supertest uses to talk
 * to the in-process Nest app. If a test accidentally reaches the real GoogleApiService
 * (or any other external service), it fails loudly instead of touching production data.
 */
import * as http from 'http';
import * as https from 'https';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** Hosts that tests tried (and failed) to reach; lets tests assert the guard actually fired. */
export const blockedHosts: string[] = [];

const hostOf = (args: unknown[]): string | undefined => {
  const [first, second] = args;
  if (typeof first === 'string') return new URL(first).hostname;
  if (first instanceof URL) return first.hostname;
  const opts = (first ?? second) as http.RequestOptions | undefined;
  return opts?.hostname ?? opts?.host?.split(':')[0] ?? 'localhost';
};

const guard = (mod: typeof http | typeof https, method: 'request' | 'get'): void => {
  const original = mod[method] as (...args: unknown[]) => unknown;
  (mod as any)[method] = (...args: unknown[]) => {
    const host = hostOf(args);
    if (!host || !LOOPBACK_HOSTS.has(host)) {
      blockedHosts.push(host);
      throw new Error(`[test] Outbound network call to "${host}" blocked. Mock the external service instead.`);
    }
    return original.apply(mod, args);
  };
};

guard(http, 'request');
guard(http, 'get');
guard(https, 'request');
guard(https, 'get');

globalThis.fetch = (async (input: string | URL | Request) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  blockedHosts.push(new URL(url).hostname);
  throw new Error(`[test] Outbound fetch to "${url}" blocked. Mock the external service instead.`);
}) as typeof fetch;
