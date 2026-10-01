# Changelog

## 1.1.15

- Pin Pi SDK development dependencies to 1.0.0 while retaining wildcard host peers.
- Verify real manifest loading, provider catalogs, startup/shutdown and native/bundled Pi hosts offline.
- Exercise real transport adapters with Unicode text, tool calls, empty responses, usage, request hooks and cancellation; no live provider calls.

## 1.1.14

- Test against Pi 0.99.0 and declare host-provided modules as wildcard peers.
- Replace no-op checks with scoped TypeScript checks and an offline real-Pi loader, provider-registration, and session-lifecycle smoke test.
