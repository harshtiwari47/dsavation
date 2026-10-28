/**
 * Liquid Glass Physics & Interactive Dynamics Controller
 * Provides real-time cursor refraction tracking, dynamic 3D tilt,
 * fluid squash-and-stretch jiggle physics, and mobile touch rebound.
 */

export function initLiquidGlass() {
  if (typeof window === 'undefined') return () => {};

  // Check if user prefers reduced motion
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let rafId = null;
  const activeCards = new Set();

  function triggerLiquidJiggle(element, intensity = 1) {
    if (prefersReduced) return;
    element.classList.remove('liquid-jiggling', 'liquid-squish');
    // Force reflow to restart animation
    void element.offsetWidth;
    element.classList.add('liquid-jiggling');

    // Create a dynamic splash ripple at the point of interaction
    const ripple = document.createElement('span');
    ripple.className = 'liquid-glass-ripple';
    element.appendChild(ripple);
    setTimeout(() => {
      ripple.remove();
    }, 900);

    setTimeout(() => {
      element.classList.remove('liquid-jiggling');
    }, 750);
  }

  function handlePointerMove(e) {
    if (prefersReduced) return;
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const xPercent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    const yPercent = Math.max(0, Math.min(100, (y / rect.height) * 100));

    // Dynamic tilt calculation (-6deg to +6deg)
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const tiltX = ((y - centerY) / centerY) * -5;
    const tiltY = ((x - centerX) / centerX) * 5;

    card.style.setProperty('--liquid-x', `${xPercent.toFixed(1)}%`);
    card.style.setProperty('--liquid-y', `${yPercent.toFixed(1)}%`);
    card.style.setProperty('--liquid-tilt-x', `${tiltX.toFixed(2)}deg`);
    card.style.setProperty('--liquid-tilt-y', `${tiltY.toFixed(2)}deg`);
  }

  function handlePointerEnter(e) {
    const card = e.currentTarget;
    card.classList.add('liquid-hovered');
    triggerLiquidJiggle(card, 1);
  }

  function handlePointerLeave(e) {
    const card = e.currentTarget;
    card.classList.remove('liquid-hovered', 'liquid-squish');
    card.style.setProperty('--liquid-tilt-x', '0deg');
    card.style.setProperty('--liquid-tilt-y', '0deg');
  }

  function handlePointerDown(e) {
    if (prefersReduced) return;
    const card = e.currentTarget;
    card.classList.add('liquid-squish');
  }

  function handlePointerUp(e) {
    if (prefersReduced) return;
    const card = e.currentTarget;
    if (card.classList.contains('liquid-squish')) {
      card.classList.remove('liquid-squish');
      triggerLiquidJiggle(card, 1.2);
    }
  }

  function bindCard(card) {
    if (!card || activeCards.has(card)) return;
    activeCards.add(card);
    card.classList.add('liquid-glass');

    card.addEventListener('pointerenter', handlePointerEnter, { passive: true });
    card.addEventListener('pointermove', handlePointerMove, { passive: true });
    card.addEventListener('pointerleave', handlePointerLeave, { passive: true });
    card.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('pointerup', handlePointerUp, { passive: true });
  }

  function unbindCard(card) {
    if (!card || !activeCards.has(card)) return;
    activeCards.delete(card);
    card.removeEventListener('pointerenter', handlePointerEnter);
    card.removeEventListener('pointermove', handlePointerMove);
    card.removeEventListener('pointerleave', handlePointerLeave);
    card.removeEventListener('pointerdown', handlePointerDown);
    window.removeEventListener('pointerup', handlePointerUp);
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

  // Initial scan
  scanAndBind();

  // Observe DOM changes to automatically bind dynamically rendered cards
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
