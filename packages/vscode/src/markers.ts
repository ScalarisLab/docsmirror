/**
 * Collapsed pointer markers.
 *
 * A `@docs path#anchor` line is machine text a human rarely needs to read. The
 * marker hides the target half and writes the section's title in its place, so
 * the comment reads as prose. The file on disk is never touched: the pointer is
 * the source of truth, and rewriting it to make it prettier would break every
 * other tool that reads it.
 *
 * This is a decoration rather than an inlay hint on purpose, twice over. VS
 * Code truncates hints at `editor.inlayHints.maximumLength`, which cuts a real
 * heading in half; and an inlay hint only renders at all when the editor's own
 * `editor.inlayHints.enabled` setting allows it, which not every reader leaves
 * on, while a decoration is unconditional. A hint's label can carry a
 * clickable `command`, which a decoration cannot, that was tried here, but a
 * label that is clickable only for readers with hints turned on is worse than
 * one that always renders and is opened next to, not on.
 *
 * The line is also the accordion's closed half: it ends in a chevron, it
 * turns over when the section below it is open, and a click opens and closes
 * it. The decoration itself cannot be clicked, painted content is not part
 * of the editor's click hit-testing, only real characters are, so the click
 * that works is the one landing on `@docs` itself, or anywhere on the line
 * that is not the label's own painted text, both real: the comment prefix,
 * the indentation, and the background past the end of the line. See
 * [inline documentation](#inline-documentation) for how that click is read
 * out of the caret position.
 *
 * Two rules keep the marker honest. It only hides a pointer the server
 * resolved, so a label can never be invented; and it steps aside when the caret
 * is inside the pointer itself and the section is closed, so the raw text is
 * always there to be edited. That reveal is drawn from cache, never from a round
 * trip, because text that lags behind the caret is worse than text that never
 * moved.
 * @docs vscode.md#collapsed-markers
 */

import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import type { ExpandedSections } from './inline';
import type { PointerCache, PointerMarker, PointerMarkersResult, ProtocolRange } from './pointers';
import { SETTINGS_SECTION } from './settings';

/** Quiet period before a typed change is asked about again. */
const REFRESH_DELAY_MS = 150;

/**
 * The pointer's target, taken out of the flow with the title written in its
 * place. The replacement text travels with each range, so one type serves every
 * marker in the file.
 */
const collapsed = vscode.window.createTextEditorDecorationType({
  textDecoration: 'none; display: none;',
  rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
});

/** A pointer that leads nowhere keeps its text and is told, in red, why. */
const unresolved = vscode.window.createTextEditorDecorationType({
  after: {
    contentText: ' ⚠ unresolved',
    color: new vscode.ThemeColor('editorError.foreground'),
    fontStyle: 'italic',
  },
  rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
});

function toRange(range: ProtocolRange): vscode.Range {
  return new vscode.Range(range.start.line, range.start.character, range.end.line, range.end.character);
}

/**
 * What the collapsed line reads: the section's title and a chevron, after the
 * `@docs` keyword the file already carries.
 *
 * The title and the state of the accordion, and nothing else. The staleness
 * word was dropped from the line on purpose: the line is now a control the
 * reader clicks, and a control reads as a control when it says one thing. The
 * full freshness line still exists in the hover, where there is room for it.
 */
function labelOf(marker: PointerMarker, open: boolean): string {
  return `${marker.label} ${open ? '▴' : '▾'}`;
}

/**
 * `inlayHints.enabled` is the master switch for annotating a pointer line at
 * all; `markers.enabled` only chooses between the marker and the plain hint. A
 * reader who turned annotations off meant all of them.
 */
export function markersEnabled(): boolean {
  const settings = vscode.workspace.getConfiguration(SETTINGS_SECTION);
  return settings.get<boolean>('markers.enabled', true) && settings.get<boolean>('inlayHints.enabled', true);
}

/**
 * Whether the caret is on a pointer line, published so the keybinding only
 * exists where it means something. A shortcut that swallows a key everywhere
 * else is how an extension earns itself an uninstall.
 *
 * It fails closed, unknown means off, so a stale `true` can never eat a key
 * the reader meant for something else.
 */
function publishCursorContext(editor: vscode.TextEditor | undefined, result: PointerMarkersResult | undefined): void {
  if (editor !== undefined && editor !== vscode.window.activeTextEditor) {
    return;
  }
  const lines = new Set((result?.markers ?? []).map((marker) => marker.range.start.line));
  const onPointer =
    editor !== undefined && editor.selections.some((selection) => lines.has(selection.active.line));
  void vscode.commands.executeCommand('setContext', 'docsmirror.pointerOnLine', onPointer);
}

function paint(
  editor: vscode.TextEditor,
  result: PointerMarkersResult,
  expandedLines: ReadonlySet<number>,
): void {
  // The caret is inside the pointer, rather than merely on its line. Clicking
  // the marker parks the caret at column 0 precisely so that closing a section
  // does not answer by unfolding the raw path the reader just clicked away.
  const editing = (marker: PointerMarker): boolean =>
    editor.selections.some(
      (selection) =>
        selection.active.line === marker.range.start.line &&
        selection.active.character >= marker.range.start.character,
    );
  const hidden: vscode.DecorationOptions[] = [];
  const broken: vscode.DecorationOptions[] = [];

  for (const marker of result.markers) {
    if (!marker.resolved) {
      broken.push({ range: toRange(marker.range) });
      continue;
    }
    const open = expandedLines.has(marker.range.start.line);
    // Open wins over the caret: a section the reader just clicked open must not
    // answer by turning back into the raw path they clicked on.
    if (!open && editing(marker)) {
      continue;
    }
    hidden.push({
      range: toRange(marker.targetRange),
      renderOptions: {
        after: {
          contentText: labelOf(marker, open),
          color: new vscode.ThemeColor('editorCodeLens.foreground'),
          fontStyle: 'italic',
        },
      },
    });
  }

  editor.setDecorations(collapsed, hidden);
  editor.setDecorations(unresolved, broken);
}

function clear(editor: vscode.TextEditor): void {
  editor.setDecorations(collapsed, []);
  editor.setDecorations(unresolved, []);
}

/**
 * Draws the markers and keeps them drawn. Returns a redraw for the moments only
 * the caller knows about, the server having just started, or restarted.
 */
export function registerPointerMarkers(
  context: vscode.ExtensionContext,
  client: () => LanguageClient | undefined,
  expanded: ExpandedSections,
  cache: PointerCache,
): () => void {
  /** One pending redraw per document: two files edited back to back must not
   *  cancel each other's repaint. */
  const timers = new Map<string, NodeJS.Timeout>();

  /** Redraws from cache when it can, and only then asks the server. */
  const draw = (editors: readonly vscode.TextEditor[]): void => {
    // The keybinding outlives the decorations: `Alt+D` still opens the peek
    // view with markers off, so the cursor context is published from every
    // answer and only the painting is skipped.
    const painting = markersEnabled();
    if (!painting) {
      for (const editor of editors) {
        clear(editor);
      }
    }
    const apply = (editor: vscode.TextEditor, result: PointerMarkersResult): void => {
      publishCursorContext(editor, result);
      if (painting) {
        paint(editor, result, expanded.linesIn(editor.document.uri.toString()));
      }
    };
    const active = client();
    for (const editor of editors) {
      const cached = cache.get(editor.document);
      if (cached !== undefined) {
        apply(editor, cached);
        continue;
      }
      if (active === undefined) {
        publishCursorContext(editor, undefined);
        continue;
      }
      const document = editor.document;
      // Until the answer lands, this editor is assumed to hold no pointer.
      publishCursorContext(editor, undefined);
      void cache
        .fetch(active, document)
        .then((result) => {
          if (result === undefined) {
            return;
          }
          for (const target of vscode.window.visibleTextEditors) {
            if (target.document === document) {
              apply(target, result);
            }
          }
        })
        .catch(() => clear(editor));
    }
  };

  const editorsShowing = (document: vscode.TextDocument): vscode.TextEditor[] =>
    vscode.window.visibleTextEditors.filter((editor) => editor.document === document);

  const drawSoon = (document: vscode.TextDocument): void => {
    const key = document.uri.toString();
    const pending = timers.get(key);
    if (pending !== undefined) {
      clearTimeout(pending);
    }
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        draw(editorsShowing(document));
      }, REFRESH_DELAY_MS),
    );
  };

  context.subscriptions.push(
    collapsed,
    unresolved,
    // A section opening or closing changes which markers may speak.
    expanded.onDidChange(() => draw(vscode.window.visibleTextEditors)),
    new vscode.Disposable(() => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    }),
    vscode.window.onDidChangeVisibleTextEditors((editors) => draw(editors)),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor === undefined) {
        publishCursorContext(undefined, undefined);
        return;
      }
      draw([editor]);
    }),
    // Straight from cache: the caret must never wait on the server to uncover
    // the line it just landed on.
    vscode.window.onDidChangeTextEditorSelection((event) => draw([event.textEditor])),
    vscode.workspace.onDidChangeTextDocument((event) => drawSoon(event.document)),
    vscode.workspace.onDidCloseTextDocument((document) => cache.forget(document)),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(SETTINGS_SECTION)) {
        cache.clear();
        draw(vscode.window.visibleTextEditors);
      }
    }),
  );

  return () => {
    cache.clear();
    draw(vscode.window.visibleTextEditors);
  };
}
