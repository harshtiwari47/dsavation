import React, { useMemo } from 'react';

/**
 * Geometric Snowflake Crystal SVG for prominent foreground ice stars
 */
function SnowflakeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M4.93 19.07l14.14-14.14M12 5l-2-2m4 0l-2 2M12 19l-2 2m4 0l-2-2M5 12l-2-2m0 4l2-2M19 12l2-2m0 4l-2-2" />
    </svg>
  );
}

/**
 * SnowEffect: High-Contrast Crystalline Multi-Tier Snow System
 * 
 * Features:
 * - 3 distinct particle tiers:
 *   * Tier 0: Background micro-ice dust (depth volume)
 *   * Tier 1: Midground crisp ice spheres with specular reflection
 *   * Tier 2: Foreground geometric ice crystals & diamond snowflakes
 * - Split-depth rendering:
 *   * Background snow (z-index 0)
 *   * Foreground floating snow (z-index 5, strictly pointer-events: none)
 * - Negative delays ensure snow is fully populated across the screen immediately
 * - Decoupled CSS motion architecture (drift on wrapper, sparkle/spin on inner crystal)
 *   completely eliminates transform override collisions
 */
export function SnowEffect() {
  const { backgroundFlakes, foregroundFlakes } = useMemo(() => {
    const bg = [];
    const fg = [];
    const totalCount = 44;

    for (let i = 0; i < totalCount; i++) {
      // Deterministic pseudo-random generation
      const tier = i % 3; // 0: micro-dust, 1: midground, 2: foreground
      const isForeground = tier >= 1; // Tier 1 and 2 in foreground for crisp visibility
      const isCrystalSvg = tier === 2 && i % 2 === 0;

      const left = ((i * 3.14159 * 23) % 97.5).toFixed(1);
      const delay = -((i * 1.618 * 5.5) % 24).toFixed(1);
      
      let size, duration, sway;
      if (tier === 0) {
        // Micro-dust (background layer)
        size = 3 + (i % 2);
        duration = (18 + (i % 6) * 1.5).toFixed(1);
        sway = ((i % 2 === 0 ? 1 : -1) * (18 + (i % 12))).toFixed(0);
      } else if (tier === 1) {
        // Midground crisp flakes (foreground layer)
        size = 5 + (i % 3);
        duration = (12 + (i % 5) * 1.2).toFixed(1);
        sway = ((i % 2 === 0 ? 1 : -1) * (30 + (i % 20))).toFixed(0);
      } else {
        // Foreground crystals (large, prominent)
        size = isCrystalSvg ? 14 + (i % 4) : 8 + (i % 4);
        duration = (8.5 + (i % 4) * 1.1).toFixed(1);
        sway = ((i % 2 === 0 ? 1 : -1) * (42 + (i % 24))).toFixed(0);
      }

      const flake = {
        id: i,
        tier,
        isCrystalSvg,
        style: {
          left: `${left}%`,
          width: `${size}px`,
          height: `${size}px`,
          animationDuration: `${duration}s`,
          animationDelay: `${delay}s`,
          '--sway-x': `${sway}px`,
        },
      };

      if (isForeground) {
        fg.push(flake);
      } else {
        bg.push(flake);
      }
    }

    return { backgroundFlakes: bg, foregroundFlakes: fg };
  }, []);

  return (
    <>
      {/* Background Snow Layer (z-index 0) */}
      <div className="atmosphere-snow-back" aria-hidden="true">
        {backgroundFlakes.map((flake) => (
          <div
            key={flake.id}
            className={`snow-particle tier-${flake.tier}`}
            style={flake.style}
          >
            <span className="snowflake-crystal" />
          </div>
        ))}
      </div>

      {/* Foreground Snow Layer (z-index 5, strictly pointer-events: none) */}
      <div className="atmosphere-snow-fore" aria-hidden="true">
        {foregroundFlakes.map((flake) => (
          <div
            key={flake.id}
            className={`snow-particle tier-${flake.tier}${flake.isCrystalSvg ? ' is-crystal' : ''}`}
            style={flake.style}
          >
            <span className="snowflake-crystal">
              {flake.isCrystalSvg && <SnowflakeIcon />}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
