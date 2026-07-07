// Client-side gallery filtering. Pure DOM: reads data-* attributes off the
// pre-rendered cards and toggles [hidden]. No framework, no search index.
// The grid renders fully server-side, so it still works with JS disabled;
// this only adds interactivity on top.

const q = document.getElementById('q');
const dept = document.getElementById('dept');
const type = document.getElementById('type');
const cards = [...document.querySelectorAll('.row')];
const tagButtons = [...document.querySelectorAll('.tag-toggle')];
const resultLine = document.getElementById('result-line');
const srStatus = document.getElementById('sr-status');
const empty = document.getElementById('empty');

const activeTags = new Set();

function apply() {
  const term = (q?.value || '').trim().toLowerCase();
  const d = dept?.value || '';
  const t = type?.value || '';
  let shown = 0;

  for (const card of cards) {
    const cardTags = (card.dataset.tags || '').split('|').filter(Boolean);
    const matches =
      (!term || card.dataset.search.includes(term)) &&
      (!d || card.dataset.department === d) &&
      (!t || card.dataset.type === t) &&
      // OR within tags: match if the card carries any selected tag
      (activeTags.size === 0 || cardTags.some((tag) => activeTags.has(tag)));

    card.hidden = !matches;
    if (matches) shown++;
  }

  if (resultLine) {
    resultLine.textContent = `${shown} of ${cards.length} shown`;
  }
  if (srStatus) {
    srStatus.textContent = shown === 0 ? 'No entries match those filters.' : `${shown} of ${cards.length} entries shown.`;
  }
  if (empty) empty.hidden = shown !== 0;
}

q?.addEventListener('input', apply);
dept?.addEventListener('change', apply);
type?.addEventListener('change', apply);

for (const btn of tagButtons) {
  btn.addEventListener('click', () => {
    const tag = btn.dataset.tag;
    const pressed = btn.getAttribute('aria-pressed') === 'true';
    btn.setAttribute('aria-pressed', String(!pressed));
    if (pressed) activeTags.delete(tag);
    else activeTags.add(tag);
    apply();
  });
}

apply();
