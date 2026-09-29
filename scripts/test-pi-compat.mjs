import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Import Pi only after selecting a disposable agent directory. Never read user auth/cache.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const home = await mkdtemp(join(tmpdir(), 'pi-provider-compat-'));
const previousHome = process.env.PI_CODING_AGENT_DIR;
const previousFetch = globalThis.fetch;
process.env.PI_CODING_AGENT_DIR = home;
globalThis.fetch = async () => new Response('', { status: 503 });
let session;
try {
  const { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager, VERSION } = await import('@earendil-works/pi-coding-agent');
  assert.equal(VERSION, '0.99.0', 'run compatibility checks against the pinned host');
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const hostPackages = ['@earendil-works/pi-ai', '@earendil-works/pi-agent-core', '@earendil-works/pi-coding-agent', '@earendil-works/pi-tui', 'typebox'];
  for (const name of hostPackages) {
    assert.equal(manifest.dependencies?.[name], undefined, `${name} must not be installed as a runtime dependency`);
    if (manifest.peerDependencies?.[name] !== undefined) assert.equal(manifest.peerDependencies[name], '*');
  }
  const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
  const resourceLoader = new DefaultResourceLoader({
    cwd: home, agentDir: home, settingsManager,
    additionalExtensionPaths: [join(root, 'index.ts')],
    noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
  });
  await resourceLoader.reload();
  const loaded = resourceLoader.getExtensions();
  assert.deepEqual(loaded.errors, [], 'extension must load in the real Pi loader');
  assert.deepEqual(loaded.warnings ?? [], [], 'extension must not produce host-dependency warnings');
  assert.equal(loaded.extensions.length, 1, 'load only this provider');
  const registrations = [...loaded.runtime.pendingProviderRegistrations];
  assert.ok(registrations.length > 0, 'factory must register a provider before session startup');
  const modelRuntime = await ModelRuntime.create({ authPath: join(home, 'auth.json'), modelsPath: null, modelsStorePath: join(home, 'models-cache'), allowModelNetwork: false });
  ({ session } = await createAgentSession({ cwd: home, agentDir: home, resourceLoader, modelRuntime, settingsManager, sessionManager: SessionManager.inMemory(home), noTools: true }));
  const errors = [];
  await session.bindExtensions({ mode: 'print', onError: (error) => errors.push(error) });
  await new Promise((done) => setImmediate(done));
  let modelCount = 0;
  for (const { name, config } of registrations) {
    const models = modelRuntime.getAllModels(name);
    assert.equal(models.length, config.models.length, `${name}: all configured models must survive host registration`);
    assert.ok(models.length > 0, `${name}: nonempty catalog`);
    assert.equal(new Set(models.map((model) => model.id)).size, models.length, `${name}: unique model IDs`);
    for (const model of models) {
      assert.equal(model.provider, name);
      assert.ok(model.api && model.baseUrl && model.id && model.name);
      if (model.type === 'image') assert.ok(model.output.includes('image'));
      else assert.ok(model.contextWindow > 0, `${name}/${model.id}: positive context limit`);
      if (model.type === 'chat') assert.ok(model.maxTokens > 0, `${name}/${model.id}: positive output limit`);
      assert.ok(model.input.includes('text'));
      for (const cost of Object.values(model.cost)) assert.ok(Number.isFinite(cost) && cost >= 0);
    }
    if (name === 'opencode') {
      const { getAllBuiltinModels } = await import('@earendil-works/pi-ai/providers/all');
      for (const native of getAllBuiltinModels(name).filter(model => model.type !== 'chat')) {
        assert.ok(models.some(model => model.id === native.id && model.type === native.type), `${native.id}: preserve native operation`);
        assert.ok(!modelRuntime.getModels(name).some(model => model.id === native.id), `${native.id}: must not become a chat model`);
      }
      assert.equal(typeof modelRuntime.getProvider(name).classify, 'function');
    }
    modelCount += models.length;
  }
  await session.extensionRunner.emit({ type: 'session_shutdown' });
  assert.deepEqual(errors, [], 'startup and shutdown handlers must work with Pi 0.99 contexts');
  console.log(`${manifest.name}: Pi ${VERSION} loader, manifest, session startup, and ${modelCount} models OK`);
} finally {
  session?.dispose();
  globalThis.fetch = previousFetch;
  if (previousHome === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousHome;
  await rm(home, { recursive: true, force: true });
}
