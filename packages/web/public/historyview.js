import { fetchDiff, isUnavailable } from './api.js';
import { clear, el, formatDateTime, notice } from './dom.js';
import { renderDiff } from './diff.js';
import { buildLanes, ROW_HEIGHT } from './graph.js';
import { hrefFor } from './router.js';

const WORKTREE = 'WORKTREE';

const NO_GIT = () =>
  notice(
    'This project has no readable git history.',
    'History appears once the folder is tracked by git and has at least one commit.',
  );

function commitRow(commit) {
  const subject = el('p', { class: 'commit-subject', text: commit.subject });
  if (commit.refs.length > 0) {
    subject.append(el('span', { class: 'commit-refs', text: commit.refs.join(', ') }));
  }

  const meta = el('p', { class: 'commit-meta' }, [
    el('span', { class: 'commit-hash', text: commit.shortHash }),
    el('span', { text: commit.author.name }),
    el('span', { text: formatDateTime(commit.date) }),
  ]);
  for (const path of commit.touchedDocuments) {
    meta.append(el('a', { class: 'commit-doc', href: hrefFor({ doc: path, view: 'read' }), text: path }));
  }

  return el('li', { class: 'graph-commit', style: `height:${ROW_HEIGHT}px` }, [subject, meta]);
}

/** The repository view: every commit that touched the docs, with its branches. */
export function renderRepositoryGraph(container, graph) {
  clear(container);
  if (isUnavailable(graph)) {
    container.append(NO_GIT());
    return;
  }
  if (graph.commits.length === 0) {
    container.append(
      notice('No commit has touched the docs yet.', 'The graph fills in as documentation changes land.'),
    );
    return;
  }

  const lanes = buildLanes(graph.commits, graph.laneCount);
  const list = el(
    'ol',
    { class: 'graph-commits', style: `margin-left:${lanes.width}px` },
    graph.commits.map(commitRow),
  );

  container.append(
    el('p', {
      class: 'history-meta',
      text: `${graph.commits.length} commits · ${graph.laneCount} ${graph.laneCount === 1 ? 'lane' : 'lanes'}`,
    }),
    el('div', { class: 'graph' }, [lanes.node, list]),
  );
  if (graph.truncated) {
    container.append(el('p', { class: 'graph-truncated', text: 'Older commits are not shown.' }));
  }
}

function revisionEntries(timeline) {
  return [
    {
      hash: WORKTREE,
      shortHash: 'disk',
      subject: 'Working copy',
      author: { name: 'the file as it is on disk' },
      date: undefined,
      changeKind: undefined,
    },
    ...timeline,
  ];
}

function changeNote(revision) {
  if (revision.changeKind === 'renamed' && revision.previousPath) {
    return `renamed from ${revision.previousPath}`;
  }
  return revision.changeKind ?? '';
}

/**
 * The per-document view: a straight timeline, because one file's history is
 * one line. Two markers pick the pair of revisions to compare.
 */
export function renderNoteHistory(container, { path, timeline }) {
  clear(container);
  if (isUnavailable(timeline)) {
    container.append(NO_GIT());
    return;
  }
  if (timeline.length === 0) {
    container.append(
      notice('This document has no commits yet.', 'It will appear here once the change is committed.'),
    );
    return;
  }

  const entries = revisionEntries(timeline);
  const selection = {
    from: timeline[1]?.hash ?? timeline[0].hash,
    to: timeline[1] === undefined ? WORKTREE : timeline[0].hash,
  };

  const diffPane = el('div', { class: 'diff-pane' });
  const rows = el('ol', { class: 'timeline' });

  const showDiff = async () => {
    clear(diffPane).append(el('p', { class: 'diff-loading', text: 'Comparing…' }));
    try {
      const diff = await fetchDiff(path, selection.from, selection.to);
      clear(diffPane).append(isUnavailable(diff) ? NO_GIT() : renderDiff(diff));
    } catch (error) {
      clear(diffPane).append(notice('That comparison could not be read.', error.message));
    }
  };

  for (const entry of entries) {
    const pick = (side) =>
      el('input', {
        type: 'radio',
        name: `revision-${side}`,
        class: 'revision-pick',
        value: entry.hash,
        checked: selection[side] === entry.hash,
        'aria-label': `Compare ${side} ${entry.shortHash}`,
        onchange: () => {
          selection[side] = entry.hash;
          void showDiff();
        },
      });

    rows.append(
      el('li', { class: 'timeline-row' }, [
        el('span', { class: 'timeline-picks' }, [pick('from'), pick('to')]),
        el('span', { class: 'timeline-body' }, [
          el('p', { class: 'commit-subject', text: entry.subject }),
          el('p', { class: 'commit-meta' }, [
            el('span', { class: 'commit-hash', text: entry.shortHash }),
            el('span', { text: entry.author.name }),
            entry.date ? el('span', { text: formatDateTime(entry.date) }) : null,
            changeNote(entry) ? el('span', { class: 'commit-change', text: changeNote(entry) }) : null,
          ]),
        ]),
      ]),
    );
  }

  container.append(
    el('p', { class: 'history-meta', text: `${timeline.length} ${timeline.length === 1 ? 'revision' : 'revisions'}` }),
    el('div', { class: 'timeline-heads' }, [el('span', { text: 'from' }), el('span', { text: 'to' })]),
    rows,
    diffPane,
  );
  void showDiff();
}
