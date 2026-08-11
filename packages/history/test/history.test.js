'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { GitHistory } = require('../dist/index.js');

/**
 * A repository with the shapes that matter: a branch, a real merge, a rename,
 * and an uncommitted edit.
 */
function makeRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docsmirror-history-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' }).toString().trim();
  const write = (relative, text) => {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), text);
  };

  git('init', '-b', 'main');
  git('config', 'user.email', 'tests@example.com');
  git('config', 'user.name', 'Tests');
  // Pin down ambient global config: a contributor with commit signing on
  // must still be able to run the suite, and line counts in the diff
  // assertions must not depend on the platform's CRLF conversion.
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.autocrlf', 'false');

  write('docs/guide.md', '# Guide\n\nFirst version.\n');
  git('add', '.');
  git('commit', '-m', 'Add the guide');

  write('docs/guide.md', '# Guide\n\nSecond version.\nAn added line.\n');
  git('add', '.');
  git('commit', '-m', 'Expand the guide');

  git('checkout', '-b', 'side');
  write('docs/aside.md', '# Aside\n\nOn a branch.\n');
  git('add', '.');
  git('commit', '-m', 'Add an aside on a branch');
  git('checkout', 'main');
  git('merge', '--no-ff', 'side', '-m', 'Merge the aside');

  git('mv', 'docs/guide.md', 'docs/handbook.md');
  git('commit', '-m', 'Rename guide to handbook');

  write('docs/handbook.md', '# Guide\n\nSecond version.\nAn added line.\nUncommitted edit.\n');
  return root;
}

test('reports availability only for a real repository', async () => {
  assert.equal(await new GitHistory(makeRepository()).isAvailable(), true);

  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'docsmirror-plain-'));
  assert.equal(await new GitHistory(empty).isAvailable(), false);
});

test('the graph keeps its topology, including merges, when scoped to a path', async () => {
  const history = new GitHistory(makeRepository());

  const unscoped = await history.repositoryGraph();
  const scoped = await history.repositoryGraph({ pathPrefix: 'docs' });

  // Filtering by path makes git simplify history by default, which prunes the
  // merge and flattens the graph into a line. Scoping must not lose commits.
  assert.equal(scoped.commits.length, unscoped.commits.length);
  assert.equal(scoped.commits.length, 5);

  const merge = scoped.commits.find((commit) => commit.parents.length === 2);
  assert.ok(merge !== undefined, 'the merge commit must survive path scoping');
  assert.equal(merge.subject, 'Merge the aside');
  assert.equal(scoped.head, 'main');
  assert.equal(scoped.truncated, false);
});

test('lanes place a branch beside its trunk', async () => {
  const graph = await new GitHistory(makeRepository()).repositoryGraph({ pathPrefix: 'docs' });

  assert.ok(graph.laneCount >= 2, `expected a second lane, got ${graph.laneCount}`);
  assert.ok(graph.commits.every((commit) => Number.isInteger(commit.lane) && commit.lane >= 0));

  const branchCommit = graph.commits.find((commit) => commit.subject.startsWith('Add an aside'));
  const mergeCommit = graph.commits.find((commit) => commit.parents.length === 2);
  assert.notEqual(branchCommit.lane, mergeCommit.lane);
});

test('a timeline follows a rename back through its previous path', async () => {
  const timeline = await new GitHistory(makeRepository()).fileTimeline('docs/handbook.md');

  assert.deepEqual(
    timeline.map((revision) => revision.changeKind),
    ['renamed', 'modified', 'added'],
  );
  assert.equal(timeline[0].previousPath, 'docs/guide.md');
  assert.equal(timeline[2].subject, 'Add the guide');
  assert.match(timeline[0].date, /^\d{4}-\d{2}-\d{2}/);
});

test('reads a file as it was, and reports nothing for a path that did not exist', async () => {
  const history = new GitHistory(makeRepository());
  const timeline = await history.fileTimeline('docs/handbook.md');
  const first = timeline[timeline.length - 1];

  const content = await history.readAtRevision('docs/guide.md', first.hash);
  assert.match(content, /First version\./);
  assert.equal(await history.readAtRevision('docs/absent.md', first.hash), undefined);
});

test('diffs carry line numbers, counts, and the uncommitted state', async () => {
  const history = new GitHistory(makeRepository());
  const timeline = await history.fileTimeline('docs/handbook.md');
  const oldest = timeline[timeline.length - 1];
  const second = timeline[timeline.length - 2];

  const diff = await history.diff('docs/guide.md', oldest.hash, second.hash);
  assert.equal(diff.binary, false);
  assert.deepEqual(diff.stats, { added: 2, removed: 1 });
  const added = diff.hunks[0].lines.filter((line) => line.kind === 'added');
  assert.deepEqual(
    added.map((line) => line.newLine),
    [3, 4],
  );
  assert.ok(diff.hunks[0].lines.some((line) => line.kind === 'context' && line.oldLine === 1));

  const worktree = await history.diff('docs/handbook.md', 'HEAD', 'WORKTREE');
  assert.equal(worktree.stats.added, 1);
  assert.ok(
    worktree.hunks.some((hunk) =>
      hunk.lines.some((line) => line.kind === 'added' && line.text.includes('Uncommitted edit')),
    ),
  );
});

test('rejects an argument that could be read as a git flag', async () => {
  const history = new GitHistory(makeRepository());
  await assert.rejects(() => history.readAtRevision('--upload-pack=touch', 'HEAD'));
  await assert.rejects(() => history.fileTimeline('--output=/tmp/pwned'));
});

test('a worktree read refuses a path that escapes the repository', async () => {
  const root = makeRepository();
  const secret = `${path.basename(root)}-outside.md`;
  fs.writeFileSync(path.join(path.dirname(root), secret), 'must stay unreachable\n');

  const escaped = await new GitHistory(root).readAtRevision(path.join('docs', '..', '..', secret), 'WORKTREE');
  assert.equal(escaped, undefined);
});
