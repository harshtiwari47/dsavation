import React, { useMemo } from 'react';

/**
 * Delicate Geometric Snowflake Crystal SVG
 */
function SnowflakeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M4.93 19.07l14.14-14.14M12 5l-2-2m4 0l-2 2M12 19l-2 2m4 0l-2-2M5 12l-2-2m0 4l2-2M19 12l2-2m0 4l-2-2" />
    </svg>
  );
}

/**
 * SnowEffect: Tranquil Crystalline Snow & Bubble Drift System
 * 
 * Features:
 * - Calibrated frequency: reduced particle count (28 particles) & slower, gentler drift (20s - 38s)
 * - Layer distribution:
 *   * Over 80% (23 particles) move strictly BEHIND the cards (z-index: 0)
 *   * Only ~18% (5 particles) float delicately ABOVE the cards (z-index: 3)
 * - Negative delays ensure balanced immediate distribution without sudden bursts
 * - Strictly non-interactive (pointer-events: none) and GPU-accelerated
 */
export function SnowEffect() {
  const { backgroundFlakes, foregroundFlakes } = useMemo(() => {
    const bg = [];
    const fg = [];
    const totalCount = 28;

    for (let i = 0; i < totalCount; i++) {
      // Allocate only 1 in 6 particles to the foreground (5 total), remaining 23 to background
      const isForeground = i % 6 === 0;
      const tier = isForeground ? 2 : (i % 2); // Tier 0 or 1 for background, Tier 2 for foreground
      const isCrystalSvg = isForeground && (i === 0 || i === 12);

      const left = ((i * 3.4159 * 23) % 96.5).toFixed(1);
      const delay = -((i * 1.718 * 6.2) % 30).toFixed(1);
      
      let size, duration, sway;
      if (isForeground) {
        // Few foreground particles: soft, gentle, slow drift (24s - 34s)
        size = isCrystalSvg ? 12 : 7 + (i % 3);
        duration = (24 + (i % 5) * 2.2).toFixed(1);
        sway = ((i % 2 === 0 ? 1 : -1) * (24 + (i % 16))).toFixed(0);
      } else if (tier === 0) {
        // Micro background dust/bubbles (26s - 38s)
        size = 3 + (i % 2);
        duration = (26 + (i % 6) * 2.4).toFixed(1);
        sway = ((i % 2 === 0 ? 1 : -1) * (16 + (i % 12))).toFixed(0);
      } else {
        // Midground background bubbles/flakes (20s - 30s)
        size = 4 + (i % 3);
        duration = (20 + (i % 5) * 2.0).toFixed(1);
        sway = ((i % 2 === 0 ? 1 : -1) * (22 + (i % 14))).toFixed(0);
      }

      const flake = {
        id: i,
        tier,
        isForeground,
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
      {/* Background Snow / Bubble Layer (Over 80% behind the cards: z-index 0) */}
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

      {/* Foreground Snow / Bubble Layer (Few particles above cards: z-index 3, pointer-events: none) */}
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
