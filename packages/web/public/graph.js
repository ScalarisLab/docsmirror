import { svg } from './dom.js';

/** Geometry shared with the stylesheet: rows must line up with the lanes. */
export const ROW_HEIGHT = 58;
const LANE_WIDTH = 19;
const LEFT_INSET = 10;
const LANE_COLOURS = 4;

const laneX = (lane) => LEFT_INSET + lane * LANE_WIDTH;
const rowY = (index) => index * ROW_HEIGHT + ROW_HEIGHT / 2;
const laneColour = (lane) => `var(--lane-${lane % LANE_COLOURS})`;

function edgePath(x1, y1, x2, y2) {
  if (x1 === x2) {
    return `M${x1} ${y1} L${x2} ${y2}`;
  }
  const bend = (y2 - y1) * 0.42;
  return `M${x1} ${y1} C${x1} ${y1 + bend} ${x2} ${y2 - bend} ${x2} ${y2}`;
}

/**
 * The lane drawing behind the commit list: one line per branch, one dot per
 * commit, merges hollow. Drawn from `lane` and `parents`, the graph is the
 * history's own shape, not an illustration of it.
 */
export function buildLanes(commits, laneCount) {
  const width = laneX(Math.max(0, laneCount - 1)) + LEFT_INSET + 4;
  const height = commits.length * ROW_HEIGHT;
  const rowOf = new Map(commits.map((commit, index) => [commit.hash, index]));
  const edges = svg('g', { class: 'lane-edges' });
  const dots = svg('g', { class: 'lane-dots' });

  commits.forEach((commit, index) => {
    const x = laneX(commit.lane);
    const y = rowY(index);

    commit.parents.forEach((parentHash, position) => {
      const parentRow = rowOf.get(parentHash);
      if (parentRow === undefined) {
        edges.append(
          svg('path', {
            d: edgePath(x, y, x, height),
            stroke: laneColour(commit.lane),
            class: 'lane-edge lane-edge-open',
          }),
        );
        return;
      }
      const parent = commits[parentRow];
      edges.append(
        svg('path', {
          d: edgePath(x, y, laneX(parent.lane), rowY(parentRow)),
          stroke: laneColour(position === 0 ? commit.lane : parent.lane),
          class: 'lane-edge',
        }),
      );
    });

    const merge = commit.parents.length > 1;
    dots.append(
      svg('circle', {
        cx: x,
        cy: y,
        r: merge ? 4.2 : 3.6,
        class: `lane-dot${merge ? ' is-merge' : ''}${index === 0 ? ' is-tip' : ''}`,
        fill: merge ? 'var(--paper)' : laneColour(commit.lane),
        stroke: laneColour(commit.lane),
      }),
    );
  });

  return {
    width,
    node: svg('svg', { class: 'graph-lanes', width, height, 'aria-hidden': 'true' }, [edges, dots]),
  };
}
