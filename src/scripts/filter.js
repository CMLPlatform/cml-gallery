// Client-side gallery filtering. Pure DOM: reads data-* attributes off the
// pre-rendered cards and toggles [hidden]. No framework, no search index.
// The grid renders fully server-side, so it still works with JS disabled;
// this only adds interactivity on top. The filter state lives in the URL query
// (?q=&dept=&type=&tags=a,b), so a filtered view can be linked.

import { filterQuery, matches, readFilters } from '../lib/filter.ts';

const q = document.getElementById('q');
const dept = document.getElementById('dept');
const type = document.getElementById('type');
const cards = [...document.querySelectorAll('.row')];
const tagButtons = [...document.querySelectorAll('.tag-toggle')];
const resultLine = document.getElementById('result-line');
const srStatus = document.getElementById('sr-status');
const empty = document.getElementById('empty');

const activeTags = new Set();

// Restore the filters from the URL. A select keeps '' for a value it has no option for,
// and a tag no button carries is dropped.
const initial = readFilters(location.search);
if (q) q.value = initial.q;
if (dept) dept.value = initial.dept;
if (type) type.value = initial.type;
for (const btn of tagButtons) {
  if (initial.tags.includes(btn.dataset.tag)) {
    activeTags.add(btn.dataset.tag);
    btn.setAttribute('aria-pressed', 'true');
  }
}

function apply() {
  const filters = { q: q?.value || '', dept: dept?.value || '', type: type?.value || '', tags: [...activeTags] };
  let shown = 0;

  for (const card of cards) {
    const show = matches(
      {
        search: card.dataset.search || '',
        department: card.dataset.department || '',
        type: card.dataset.type || '',
        tags: (card.dataset.tags || '').split('|').filter(Boolean),
      },
      filters,
    );
    card.hidden = !show;
    if (show) shown++;
  }
  history.replaceState(history.state, '', `${location.pathname}${filterQuery(filters)}${location.hash}`);

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

document.getElementById('clear-filters')?.addEventListener('click', () => {
  if (q) q.value = '';
  if (dept) dept.value = '';
  if (type) type.value = '';
  activeTags.clear();
  for (const btn of tagButtons) btn.setAttribute('aria-pressed', 'false');
  apply();
});

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
