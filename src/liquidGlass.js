/**
 * Smooth Water Flow & Blue Water Ripple Effect Controller
 * Spawns organic concentric blue water ripples on click/tap and hover,
 * tracking cursor water disturbances with zero text blurring or card tilting.
 */

export function initLiquidGlass() {
  if (typeof window === 'undefined') return () => {};

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const activeCards = new Set();
  let rafId = null;

  function spawnBlueRipple(card, x, y) {
    if (prefersReduced) return;

    // Primary ripple ring
    const ripple = document.createElement('span');
    ripple.className = 'blue-water-ripple';
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;

    // Secondary concentric ring for realistic water droplet physics
    const ring = document.createElement('span');
    ring.className = 'blue-water-ripple secondary-ring';
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;

    card.appendChild(ripple);
    card.appendChild(ring);

    setTimeout(() => {
      ripple.remove();
      ring.remove();
    }, 1100);
  }

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
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    spawnBlueRipple(card, x, y);
  }

  function handlePointerLeave(e) {
    const card = e.currentTarget;
    card.classList.remove('water-active');
  }

  function handlePointerDown(e) {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    spawnBlueRipple(card, x, y);
  }

  function bindCard(card) {
    if (!card || activeCards.has(card)) return;
    activeCards.add(card);
    card.classList.add('water-glass-card');

    card.addEventListener('pointerenter', handlePointerEnter, { passive: true });
    card.addEventListener('pointermove', handlePointerMove, { passive: true });
    card.addEventListener('pointerleave', handlePointerLeave, { passive: true });
    card.addEventListener('pointerdown', handlePointerDown, { passive: true });
  }

  function unbindCard(card) {
    if (!card || !activeCards.has(card)) return;
    activeCards.delete(card);
    card.removeEventListener('pointerenter', handlePointerEnter);
    card.removeEventListener('pointermove', handlePointerMove);
    card.removeEventListener('pointerleave', handlePointerLeave);
    card.removeEventListener('pointerdown', handlePointerDown);
  }

  function handleRippleHostDown(e) {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    spawnBlueRipple(el, x, y);
  }

  function bindRippleHost(el) {
    if (!el || activeCards.has(el)) return;
    activeCards.add(el);
    el.classList.add('water-ripple-host');
    el.addEventListener('pointerdown', handleRippleHostDown, { passive: true });
  }

  function unbindRippleHost(el) {
    if (!el || !activeCards.has(el)) return;
    activeCards.delete(el);
    el.removeEventListener('pointerdown', handleRippleHostDown);
  }

  function scanAndBind() {
    const cardSelectors = [
      '.overview-card',
      '.panel',
      '.metric-card',
      '.club-date-badge',
      '.progress-summary article',
      '.member-directory-card',
      '.login-prompt',
      '.library-locked',
      '.question-card'
    ];
    document.querySelectorAll(cardSelectors.join(', ')).forEach(bindCard);

    const rippleSelectors = [
      '.button-dark',
      '.button-primary'
    ];
    document.querySelectorAll(rippleSelectors.join(', ')).forEach(bindRippleHost);
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
    activeCards.forEach((el) => {
      unbindCard(el);
      unbindRippleHost(el);
    });
  };
}
