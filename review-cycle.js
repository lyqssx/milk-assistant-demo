/* Start each implementation round with a clean annotation canvas without losing the prior notes. */
(() => {
  const notesKey = 'milk-assistant-demo-review';
  const cycleKey = 'milk-assistant-demo-review-cycle';
  const cycle = '2026-08-11-r3-clean';
  if (localStorage.getItem(cycleKey) === cycle) return;
  const previous = localStorage.getItem(notesKey);
  if (previous && previous !== '[]') {
    localStorage.setItem(`milk-assistant-demo-review-backup-${cycle}`, previous);
  }
  localStorage.removeItem(notesKey);
  localStorage.setItem(cycleKey, cycle);
})();
