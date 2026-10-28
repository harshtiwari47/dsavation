import React, { useEffect, useState, useRef } from 'react';

/**
 * LightingEffect: Volumetric Sunbeams, Radiant Celestial Sun, Caustics & Dynamic Spotlight
 * 
 * Architecture:
 * 1. Background Layer (z-index 0):
 *    - Celestial Sun Crown with pulsing core & rotating ray corona
 *    - Aurora wave curtains & ambient bioluminescent glow orbs
 * 2. Foreground Layer (z-index 3, pointer-events: none):
 *    - Volumetric God Ray Shafts streaming across the cards and viewport
 *    - Dynamic Caustic Shimmer Waves
 *    - Interactive Cursor Spotlight tracking mouse movement with smooth inertia
 * 3. Smooth Harmonic Environmental Phase Transitions:
 *    - Glacial Daybreak -> Boreal Aurora -> Oceanic Twilight
 */
export function LightingEffect() {
  const [spotlight, setSpotlight] = useState({ x: -300, y: -300, active: false });
  const idleTimerRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const handlePointerMove = (e) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setSpotlight({ x: e.clientX, y: e.clientY, active: true });
      });

      // After 3.5s of inactivity, revert to graceful ambient drift
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        setSpotlight((prev) => ({ ...prev, active: false }));
      }, 3500);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  return (
    <>
      {/* --------------------------------------------------------------------
          Background Lighting Layer (z-index 0)
          -------------------------------------------------------------------- */}
      <div className="atmosphere-lighting-back" aria-hidden="true">
        {/* Radiant Celestial Sun Source at Upper Canopy */}
        <div className="lighting-sun-crown">
          <div className="sun-core" />
          <div className="sun-corona" />
          <div className="sun-radiance" />
        </div>

        {/* Aurora Shimmer Wave Curtains */}
        <div className="lighting-aurora curtain-1" />
        <div className="lighting-aurora curtain-2" />

        {/* Ambient Bioluminescent Color Orbs */}
        <div className="lighting-glow-orb orb-cyan" />
        <div className="lighting-glow-orb orb-teal" />
        <div className="lighting-glow-orb orb-sapphire" />
      </div>

      {/* --------------------------------------------------------------------
          Foreground Volumetric Lighting Layer (z-index 3, pointer-events: none)
          Projects visible streaming sunshafts and spotlight directly across the scene
          -------------------------------------------------------------------- */}
      <div className="atmosphere-lighting-fore" aria-hidden="true">
        {/* Volumetric Streaming God Rays (Distinct Visible Light Shafts) */}
        <div className="lighting-god-rays">
          <div className="god-ray ray-1" />
          <div className="god-ray ray-2" />
          <div className="god-ray ray-3" />
          <div className="god-ray ray-4" />
          <div className="god-ray ray-5" />
        </div>

        {/* Caustic Sunlight Shimmer Wave */}
        <div className="caustic-shimmer-wave" />

        {/* Interactive / Ambient Cursor Spotlight */}
        <div
          className={`lighting-spotlight ${spotlight.active ? 'is-following' : 'is-drifting'}`}
          style={
            spotlight.active
              ? { transform: `translate3d(${spotlight.x}px, ${spotlight.y}px, 0)` }
              : undefined
          }
        />
      </div>
    </>
  );
}
