'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { promises: fs } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CONFIG_FILE_NAME, DEFAULT_CONFIG, loadConfig } = require('../dist/index.js');

async function makeProject(config) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'docsmirror-config-'));
  if (config !== undefined) {
    const content = typeof config === 'string' ? config : JSON.stringify(config, null, 2);
    await fs.writeFile(path.join(directory, CONFIG_FILE_NAME), content, 'utf8');
  }
  return directory;
}

test('a project with no file gets the defaults, and no config path', async () => {
  const { config, configPath } = await loadConfig(await makeProject());
  assert.deepEqual(config, DEFAULT_CONFIG);
  assert.equal(configPath, undefined);
});

test('include replaces the default, exclude extends it', async () => {
  const directory = await makeProject({ include: ['src/**'], exclude: ['tmp/**'] });
  const { config, configPath } = await loadConfig(directory);

  assert.deepEqual(config.include, ['src/**']);
  assert.ok(config.exclude.includes('tmp/**'));
  for (const pattern of DEFAULT_CONFIG.exclude) {
    assert.ok(config.exclude.includes(pattern), `default exclusion lost: ${pattern}`);
  }
  assert.equal(configPath, path.resolve(directory, CONFIG_FILE_NAME));
});

test('staleness merges field by field over the defaults', async () => {
  const directory = await makeProject({ staleness: { agingAfterDays: 10 } });
  const { config } = await loadConfig(directory);
  assert.deepEqual(config.staleness, {
    agingAfterDays: 10,
    staleAfterDays: DEFAULT_CONFIG.staleness.staleAfterDays,
  });
});

test('overrides layer over the file, last one winning', async () => {
  const directory = await makeProject({ docsRoot: 'documentation', indexes: ['home.md'] });
  const { config } = await loadConfig(directory, { docsRoot: 'handbook' });
  assert.equal(config.docsRoot, 'handbook');
  assert.deepEqual(config.indexes, ['home.md']);
});

test('unknown fields and wrongly typed values are ignored', async () => {
  const directory = await makeProject({ docsRoot: 42, surprise: true, include: 'not-an-array' });
  const { config } = await loadConfig(directory);
  assert.deepEqual(config, DEFAULT_CONFIG);
});

test('a malformed file is an error naming the path, not silent defaults', async () => {
  const directory = await makeProject('{ not json');
  await assert.rejects(loadConfig(directory), (error) => {
    assert.match(error.message, /Cannot read /);
    assert.ok(error.message.includes(CONFIG_FILE_NAME));
    return true;
  });
});
