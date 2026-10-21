/*
 * Deck bridge — lets the Pinnacle 360 viewer talk to a <deck-stage> deck.
 *
 * Add one line after deck-stage.js in any deck that lives in library/decks/<id>/:
 *   <script src="../../deck-bridge.js"></script>
 *
 * Without it a deck still opens and presents; the viewer just can't show the
 * slide counter, jump to a slide, or display speaker notes.
 *
 * Deck → hub:  { pinnacle: 1, type: 'slide', index, total, labels, notes }
 *              { pinnacle: 1, type: 'key', key }   (Esc / F / N pressed inside the deck)
 * Hub → deck:  { pinnacle: 1, type: 'goto' | 'next' | 'prev' | 'hello', index? }
 */
(() => {
  // tools/snap-thumbs.sh loads decks with ?_snap=1 — settle transitions instantly
  // so thumbnails show finished states, not mid-fade frames.
  if (/[?&]_snap=/.test(location.search)) {
    const s = document.createElement('style');
    s.textContent = '*,*::before,*::after{transition:none !important;animation-duration:0s !important}';
    document.head.appendChild(s);
  }

  const deck = document.querySelector('deck-stage');
  if (!deck || window.parent === window) return;

  const slides = () => Array.from(deck.children).filter(n => n.tagName === 'SECTION');
  const post = msg => { try { window.parent.postMessage(Object.assign({ pinnacle: 1 }, msg), '*'); } catch (e) {} };
  const report = (index, total) => {
    const s = slides();
    post({
      type: 'slide',
      index,
      total: total == null ? s.length : total,
      labels: s.map((el, i) => el.getAttribute('data-label') || 'Slide ' + (i + 1)),
      notes: s.map(el => el.getAttribute('data-speaker-notes') || ''),
    });
  };

  deck.addEventListener('slidechange', e => report(e.detail.index, e.detail.total));

  window.addEventListener('message', e => {
    const d = e.data;
    if (!d || d.pinnacle !== 1) return;
    if (d.type === 'goto' && typeof deck.goTo === 'function') deck.goTo(d.index);
    else if (d.type === 'next' && typeof deck.next === 'function') deck.next();
    else if (d.type === 'prev' && typeof deck.prev === 'function') deck.prev();
    else if (d.type === 'hello') {
      const i = slides().findIndex(s => s.hasAttribute('data-deck-active'));
      report(i < 0 ? 0 : i);
    }
  });

  // Keys the hub owns. Arrow keys stay with the deck.
  window.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === 'Escape' || e.key === 'f' || e.key === 'F' || e.key === 'n' || e.key === 'N') post({ type: 'key', key: e.key });
  });
})();
