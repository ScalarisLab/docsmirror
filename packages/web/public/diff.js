import { el, notice } from './dom.js';

const SIGNS = { added: '+', removed: '−', context: ' ' };

function diffLine(line) {
  return el('div', { class: `diff-line diff-${line.kind}` }, [
    el('span', { class: 'diff-gutter', text: line.oldLine === undefined ? '' : String(line.oldLine) }),
    el('span', { class: 'diff-gutter', text: line.newLine === undefined ? '' : String(line.newLine) }),
    el('span', { class: 'diff-sign', text: SIGNS[line.kind] ?? ' ' }),
    el('span', { class: 'diff-text', text: line.text }),
  ]);
}

/** A unified diff, drawn as text with a quiet wash on the changed lines. */
export function renderDiff(diff) {
  if (diff.binary) {
    return notice('These revisions differ in binary content.', 'There is nothing to show line by line.');
  }
  if (diff.hunks.length === 0) {
    return notice('These two revisions are identical.', 'Pick a different pair to see what changed.');
  }

  const body = el('div', { class: 'diff' }, [
    el('p', { class: 'diff-stats' }, [
      el('span', { class: 'stat-added', text: `+${diff.stats.added}` }),
      el('span', { class: 'stat-removed', text: `−${diff.stats.removed}` }),
    ]),
  ]);

  for (const hunk of diff.hunks) {
    body.append(el('p', { class: 'diff-hunk-header', text: hunk.header }));
    const block = el('div', { class: 'diff-hunk' });
    for (const line of hunk.lines) {
      block.append(diffLine(line));
    }
    body.append(block);
  }
  return body;
}
