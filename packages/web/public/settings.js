import { el } from './dom.js';

/**
 * Settings, and the one control there is: which theme the page is set in.
 *
 * The theme is not a switch loitering in a corner of the interface. It is a
 * preference, it lives behind the affordance preferences live behind, and that
 * affordance is part of the page's running head rather than a bar above it.
 */

const STORAGE_KEY = 'docsmirror.theme';

/**
 * The settings drop currently open, if any. One document-level listener serves
 * every control this module ever draws, the folio that hosts it is redrawn on
 * each navigation, and a listener added per render would pile up on the
 * document for the life of the page.
 */
let openDrop;

document.addEventListener('pointerdown', (event) => {
  if (openDrop === undefined || openDrop.wrap.contains(event.target)) {
    return;
  }
  openDrop.close();
  openDrop = undefined;
});
const CHOICES = [
  { id: 'system', label: 'Match the system' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

function stored() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return CHOICES.some((choice) => choice.id === value) ? value : 'system';
  } catch {
    // Private modes refuse storage. The preference is then simply not remembered.
    return 'system';
  }
}

function remember(choice) {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Same as above: failing to remember is not a reason to fail to apply.
  }
}

/** Applies the preference before first paint, so no frame shows the wrong theme. */
export function applyStoredTheme() {
  const choice = stored();
  document.documentElement.dataset.theme = choice === 'system' ? '' : choice;
}

/**
 * The settings control: a quiet word in the running head, and the choices
 * directly under it, the same disclosure shape as the breadcrumb and the
 * search suggestions, because they are all the same gesture.
 */
export function settingsControl() {
  const panel = el('div', { class: 'drop settings-drop', hidden: true });
  const close = () => {
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  };
  const button = el(
    'button',
    {
      type: 'button',
      class: 'tool',
      'aria-expanded': 'false',
      'aria-haspopup': 'true',
      onclick: () => {
        const open = panel.hidden;
        panel.hidden = !open;
        button.setAttribute('aria-expanded', String(open));
        openDrop = open ? { wrap, close } : undefined;
      },
    },
    ['Settings'],
  );

  const draw = () => {
    const current = stored();
    panel.replaceChildren(
      el('p', { class: 'drop-label', text: 'Theme' }),
      ...CHOICES.map((choice) =>
        el('button', {
          type: 'button',
          class: `drop-row${current === choice.id ? ' is-current' : ''}`,
          'aria-pressed': String(current === choice.id),
          text: choice.label,
          onclick: () => {
            remember(choice.id);
            applyStoredTheme();
            draw();
          },
        }),
      ),
    );
  };
  draw();

  const wrap = el('div', { class: 'has-drop' }, [button, panel]);
  return wrap;
}
