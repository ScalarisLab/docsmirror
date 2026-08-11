import { saveDocument } from './api.js';
import { el } from './dom.js';

const AUTOSAVE_DELAY_MS = 900;

/**
 * The editing surface: the markdown itself, in the reading pane, saved on its
 * own. Edits are written after a short pause, when the field loses focus, and
 * before the app leaves the document, so there is no unsaved state to lose
 * and nothing to confirm on the way out.
 */
export function createEditor({ path, markdown, onStatus, onSaved }) {
  const field = el('textarea', {
    class: 'editor',
    spellcheck: 'false',
    'aria-label': `Markdown source of ${path}`,
  });
  field.value = markdown;

  let savedText = markdown;
  let timer;
  let inFlight;

  const isDirty = () => field.value !== savedText;

  const save = async () => {
    if (!isDirty()) {
      return;
    }
    const attempted = field.value;
    onStatus('saving');
    try {
      const node = await saveDocument(path, attempted);
      savedText = attempted;
      onStatus(isDirty() ? 'edited' : 'saved');
      onSaved?.(node);
    } catch (error) {
      onStatus('error', error.message);
    }
  };

  const flush = async () => {
    clearTimeout(timer);
    await inFlight;
    if (isDirty()) {
      inFlight = save();
      await inFlight;
    }
  };

  field.addEventListener('input', () => {
    onStatus('edited');
    clearTimeout(timer);
    timer = setTimeout(() => {
      inFlight = Promise.resolve(inFlight).then(save);
    }, AUTOSAVE_DELAY_MS);
  });

  field.addEventListener('blur', () => {
    void flush();
  });

  field.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void flush();
    }
  });

  const node = el('div', { class: 'editor-shell' }, [field]);
  onStatus('saved');

  return {
    node,
    isDirty,
    flush,
    focus: () => field.focus(),
  };
}
