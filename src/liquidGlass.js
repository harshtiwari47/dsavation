/**
 * Smooth Water Flow Effect Controller
 * Tracks gentle pointer water disturbance and coordinates without
 * any card rotation, tilt, or text warping, keeping text 100% sharp.
 */

export function initLiquidGlass() {
  if (typeof window === 'undefined') return () => {};

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const activeCards = new Set();
  let rafId = null;

  function handlePointerMove(e) {
    if (prefersReduced) return;
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const xPercent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    const yPercent = Math.max(0, Math.min(100, (y / rect.height) * 100));

    card.style.setProperty('--water-x', `${xPercent.toFixed(1)}%`);
    card.style.setProperty('--water-y', `${yPercent.toFixed(1)}%`);
  }

  function handlePointerEnter(e) {
    const card = e.currentTarget;
    card.classList.add('water-active');
  }

  function handlePointerLeave(e) {
    const card = e.currentTarget;
    card.classList.remove('water-active');
  }

  function bindCard(card) {
    if (!card || activeCards.has(card)) return;
    activeCards.add(card);
    card.classList.add('water-glass-card');

    card.addEventListener('pointerenter', handlePointerEnter, { passive: true });
    card.addEventListener('pointermove', handlePointerMove, { passive: true });
    card.addEventListener('pointerleave', handlePointerLeave, { passive: true });
  }

  function unbindCard(card) {
    if (!card || !activeCards.has(card)) return;
    activeCards.delete(card);
    card.removeEventListener('pointerenter', handlePointerEnter);
    card.removeEventListener('pointermove', handlePointerMove);
    card.removeEventListener('pointerleave', handlePointerLeave);
  }

  function scanAndBind() {
    const selectors = [
      '.overview-card',
      '.panel',
      '.metric-card',
      '.club-date-badge',
      '.progress-summary article',
      '.member-directory-card',
      '.login-prompt',
      '.library-locked'
    ];
    const elements = document.querySelectorAll(selectors.join(', '));
    elements.forEach(bindCard);
  }

  scanAndBind();

  const observer = new MutationObserver(() => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(scanAndBind);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    if (rafId) cancelAnimationFrame(rafId);
    activeCards.forEach(unbindCard);
  };
}
