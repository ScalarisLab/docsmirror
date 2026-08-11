# Staleness

Documentation rots quietly. A pointer that still resolves can still be pointing at something nobody
has looked at in two years, and that is worth showing without demanding that authors maintain
metadata by hand.

## How staleness is computed

Staleness is derived from the target document's last-modified date, the only signal available for
free. Two thresholds classify it:

| Value | Meaning |
| --- | --- |
| `fresh` | Changed more recently than `agingAfterDays` (default 90). |
| `aging` | Older than `agingAfterDays`, newer than `staleAfterDays`. |
| `stale` | Older than `staleAfterDays` (default 180). |
| `unknown` | The docs root cannot supply a modification date. |

Tune the thresholds in `docsmirror.config.json`:

```json
{
  "staleness": {
    "agingAfterDays": 120,
    "staleAfterDays": 365
  }
}
```

Staleness is **informational**. It is shown in the editor's inlay hint and in the hover; it never
produces a diagnostic and never fails `docsmirror check`. A document that has not changed may
simply be a document that was right the first time, and a build that fails on the calendar is a
build people learn to ignore.

Be aware of what the signal actually measures on a local docs root: filesystem modification time.
A fresh clone, a checkout, or some archive extractions rewrite it, so the first read after cloning
can report everything as `fresh`. The date is a hint about attention, not an audit trail.
