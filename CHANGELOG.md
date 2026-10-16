# Changelog

## 1.1.28

- Pin Pi SDK development dependencies to 1.3.0 while retaining wildcard host peers; verify real manifest loading, lifecycle and native/bundled Pi hosts offline.

## 1.1.26

- Pin Pi SDK development dependencies to 1.2.0 while retaining wildcard host peers; verify real manifest loading, lifecycle and native/bundled Pi hosts offline.

## 1.1.22

- Quiet startup sync: background `/v1/models` revalidation runs only with an API key, only when the disk cache is older than 1 hour (`PI_PROVIDER_SYNC_TTL_MS`, `0` = always), missing, or fetched with a different key, and only in one pi process at a time (lock file next to the cache). Failed refreshes back off for 5 minutes; sessions that skip adopt a cache refreshed by another process.
- Never store the API key: key changes are detected via a salted sha256 fingerprint in `cache/opencode-go-models.sync.json`. The cache file format is unchanged.
- Usage widget: no polling without a UI (print/JSON mode, fan-out child agents) or without an API key. Background usage polls are shared across pi processes — one process polls `/zen/go/v1/usage` per 30 seconds and writes `cache/opencode-go-usage.json`, the others render it. `/opencode-go-usage` still always re-reads the API.
- Write the model cache atomically and swallow API key resolution failures in `session_start`.
- Add vitest coverage for the sync policy, the session_start integration and usage polling dedupe.

## 1.1.15

- Pin Pi SDK development dependencies to 1.0.0 while retaining wildcard host peers.
- Verify real manifest loading, provider catalogs, startup/shutdown and native/bundled Pi hosts offline.
- Exercise real transport adapters with Unicode text, tool calls, empty responses, usage, request hooks and cancellation; no live provider calls.

## 1.1.14

- Test against Pi 0.99.0 and declare host-provided modules as wildcard peers.
- Replace no-op checks with scoped TypeScript checks and an offline real-Pi loader, provider-registration, and session-lifecycle smoke test.
