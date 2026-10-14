/* Begin the device V4 review with a clear marking layer, while preserving a local backup. */
(() => {
  const notesKey = 'milk-assistant-demo-review';
  const cycleKey = 'milk-assistant-demo-review-cycle';
  const cycle = '2026-08-11-device-v4-clean';
  if (localStorage.getItem(cycleKey) === cycle) return;
  const previous = localStorage.getItem(notesKey);
  if (previous && previous !== '[]') localStorage.setItem(`milk-assistant-demo-review-backup-${cycle}`, previous);
  localStorage.removeItem(notesKey);
  localStorage.setItem(cycleKey, cycle);
})();
