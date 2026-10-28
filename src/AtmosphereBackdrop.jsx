import React, { useMemo } from 'react';

/**
 * AtmosphereBackdrop: Cinematic Ambient Lighting & Multi-Tier Snow Effect
 * 
 * Features:
 * - Dynamic volumetric lighting beams and breathing celestial aurora curtains
 * - Smooth, harmonic ambient lighting transitions (ice crystalline <-> celestial aurora)
 * - 3-tier parallax drifting snow particles with organic wind sway and specular glints
 * - 100% GPU-accelerated (translate3d, opacity) and strictly non-interactive
 * - Completely responsive across all viewport sizes and respects prefers-reduced-motion
 */

export function AtmosphereBackdrop() {
  // Deterministic snowflake parameters (size, left %, duration, delay, sway, tier)
  const snowflakes = useMemo(() => {
    const list = [];
    const count = 38;
    for (let i = 0; i < count; i++) {
      // 3 tiers: 0: background dust, 1: midground flakes, 2: foreground crystals
      const tier = i % 3;
      const left = ((i * 2.71828 * 17) % 98).toFixed(1);
      const delay = -((i * 1.414 * 7) % 20).toFixed(1);
      
      let size, duration, blur, sway, opacity;
      if (tier === 0) {
        // Background micro-dust
        size = 2 + (i % 2);
        duration = (20 + (i % 8) * 1.5).toFixed(1);
        blur = 0;
        sway = ((i % 2 === 0 ? 1 : -1) * (20 + (i % 15))).toFixed(0);
        opacity = 0.45;
      } else if (tier === 1) {
        // Midground crisp flakes
        size = 4 + (i % 3);
        duration = (13 + (i % 6) * 1.2).toFixed(1);
        blur = 0;
        sway = ((i % 2 === 0 ? 1 : -1) * (35 + (i % 25))).toFixed(0);
        opacity = 0.75;
      } else {
        // Foreground soft bokeh crystals
        size = 7 + (i % 5);
        duration = (8.5 + (i % 5) * 1.1).toFixed(1);
        blur = 1.2;
        sway = ((i % 2 === 0 ? 1 : -1) * (50 + (i % 30))).toFixed(0);
        opacity = 0.55;
      }

      list.push({
        id: i,
        tier,
        style: {
          left: `${left}%`,
          width: `${size}px`,
          height: `${size}px`,
          animationDuration: `${duration}s`,
          animationDelay: `${delay}s`,
          filter: blur ? `blur(${blur}px)` : 'none',
          opacity,
          '--sway-x': `${sway}px`,
        },
      });
    }
    return list;
  }, []);

  return (
    <div className="atmosphere-backdrop" aria-hidden="true">
      {/* Volumetric Ethereal Light Beams with Smooth Harmonic Transition */}
      <div className="lighting-chamber">
        <div className="light-beam beam-left" />
        <div className="light-beam beam-center" />
        <div className="light-beam beam-right" />
        <div className="aurora-curtain curtain-primary" />
        <div className="aurora-curtain curtain-secondary" />
      </div>

      {/* Atmospheric Ambient Lighting Glow Orbs */}
      <div className="lighting-glow glow-1" />
      <div className="lighting-glow glow-2" />
      <div className="lighting-glow glow-3" />

      {/* Multi-Tier Drifting Snow Particles */}
      <div className="snow-container">
        {snowflakes.map((flake) => (
          <span
            key={flake.id}
            className={`snowflake tier-${flake.tier}`}
            style={flake.style}
          />
        ))}
      </div>
    </div>
  );
}
