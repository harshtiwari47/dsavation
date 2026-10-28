import React, { useEffect, useState, useRef, useCallback } from 'react';

/**
 * Realistic Branching Lightning Bolt Paths
 * Modeled after natural atmospheric electrical discharges (main trunk + multiple branching forks).
 */
const LIGHTNING_BOLTS = [
  {
    id: 0,
    width: 320,
    height: 360,
    viewBox: '0 0 320 360',
    trunk: 'M 160 0 L 150 45 L 175 85 L 148 135 L 180 180 L 160 235 L 190 280 L 175 335',
    branches: [
      'M 175 85 L 210 110 L 230 155 L 245 170',
      'M 148 135 L 115 160 L 98 200 L 85 220',
      'M 180 180 L 225 210 L 240 255',
    ],
  },
  {
    id: 1,
    width: 300,
    height: 340,
    viewBox: '0 0 300 340',
    trunk: 'M 140 0 L 155 50 L 130 95 L 160 150 L 138 200 L 165 255 L 145 315',
    branches: [
      'M 130 95 L 95 125 L 80 165',
      'M 160 150 L 195 180 L 215 225',
      'M 138 200 L 110 230 L 95 270',
    ],
  },
  {
    id: 2,
    width: 340,
    height: 380,
    viewBox: '0 0 340 380',
    trunk: 'M 180 0 L 165 40 L 195 85 L 170 135 L 205 185 L 185 240 L 215 295 L 195 350',
    branches: [
      'M 165 40 L 130 65 L 110 110 L 85 135',
      'M 195 85 L 235 115 L 255 160 L 275 185',
      'M 170 135 L 135 168 L 120 210',
      'M 205 185 L 240 215 L 260 260',
    ],
  },
];

/**
 * LightingEffect: Cinematic Thunder & Lightning Atmospheric System
 * 
 * Features:
 * - Natural, organic thunder strikes occurring at randomized intervals (8s - 14s)
 * - Multi-stage realistic electrical discharge flash (strike -> micro-dip -> return stroke -> smooth roll-off)
 * - Intricate branching SVG lightning bolts with electric ionization glow
 * - Ambient atmospheric thunder sheet flash that illuminates sky and snow without obscuring text
 * - 100% non-blocking (pointer-events: none) and GPU-accelerated
 */
export function LightingEffect() {
  const [activeStrike, setActiveStrike] = useState(null);
  const timeoutRef = useRef(null);
  const isMountedRef = useRef(true);

  const triggerThunder = useCallback(() => {
    if (!isMountedRef.current) return;
    // Suppress lightning calculation completely on mobile devices (<= 800px)
    if (typeof window !== 'undefined' && window.innerWidth <= 800) return;

    // Pick random bolt variant and screen position (10% to 75% horizontal offset)
    const boltIndex = Math.floor(Math.random() * LIGHTNING_BOLTS.length);
    const xPos = 12 + Math.random() * 66;

    setActiveStrike({
      id: Date.now(),
      bolt: LIGHTNING_BOLTS[boltIndex],
      x: xPos,
      isStriking: true,
    });

    // Realistic thunder flash duration: ~480ms multi-stroke discharge
    setTimeout(() => {
      if (isMountedRef.current) {
        setActiveStrike(null);
      }
    }, 480);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    const isMobileOrNarrow = () => typeof window !== 'undefined' && window.innerWidth <= 800;

    // Natural randomized schedule: thunder strikes every 8 to 14 seconds (desktop/tablet only)
    const scheduleNextThunder = () => {
      const delay = 8000 + Math.random() * 6000;
      timeoutRef.current = setTimeout(() => {
        if (!isMobileOrNarrow()) {
          triggerThunder();
        }
        scheduleNextThunder();
      }, delay);
    };

    // First initial lightning strike shortly after load (3.5s) if not mobile
    timeoutRef.current = setTimeout(() => {
      if (!isMobileOrNarrow()) {
        triggerThunder();
      }
      scheduleNextThunder();
    }, 3500);

    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [triggerThunder]);

  return (
    <div className="thunder-atmosphere" aria-hidden="true">
      {/* Ambient Thunder Sky Flash Sheet */}
      <div
        className={`thunder-flash-sheet ${activeStrike ? 'is-flashing' : ''}`}
      />

      {/* Realistic Electric Lightning Bolt */}
      {activeStrike && (
        <div
          className="lightning-bolt-container"
          style={{ left: `${activeStrike.x}%` }}
        >
          <svg
            className="lightning-bolt-svg"
            viewBox={activeStrike.bolt.viewBox}
            width={activeStrike.bolt.width}
            height={activeStrike.bolt.height}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* Outer Ionized Corona Glow */}
            <path
              d={activeStrike.bolt.trunk}
              className="bolt-corona"
              strokeWidth="6"
            />
            {activeStrike.bolt.branches.map((b, i) => (
              <path
                key={`branch-corona-${i}`}
                d={b}
                className="bolt-corona"
                strokeWidth="4"
              />
            ))}

            {/* Radiant Mid-Layer Arc */}
            <path
              d={activeStrike.bolt.trunk}
              className="bolt-mid"
              strokeWidth="3.5"
            />
            {activeStrike.bolt.branches.map((b, i) => (
              <path
                key={`branch-mid-${i}`}
                d={b}
                className="bolt-mid"
                strokeWidth="2.2"
              />
            ))}

            {/* Intense Pure White Electric Core */}
            <path
              d={activeStrike.bolt.trunk}
              className="bolt-core"
              strokeWidth="2"
            />
            {activeStrike.bolt.branches.map((b, i) => (
              <path
                key={`branch-core-${i}`}
                d={b}
                className="bolt-core"
                strokeWidth="1.2"
              />
            ))}
          </svg>
        </div>
      )}
    </div>
  );
}
