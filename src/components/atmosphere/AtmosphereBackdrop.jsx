import React from 'react';
import { LightingEffect } from './LightingEffect.jsx';
import { SnowEffect } from './SnowEffect.jsx';
import './atmosphere.css';

/**
 * AtmosphereBackdrop: Master Atmospheric Coordinator
 * 
 * Modular architectural component combining:
 * 1. Volumetric Ambient Lighting & Celestial Sun Crown (LightingEffect)
 * 2. Multi-Tier High-Contrast Crystalline Snow System (SnowEffect)
 * 3. Smooth Harmonic Environmental Phase Transitions
 * 
 * Mounts unconstrained fixed layers to guarantee stacking fidelity:
 * - Background Lighting & Snow (z-index: 0)
 * - Foreground Volumetric God Rays & Spotlight (z-index: 4, pointer-events: none)
 * - Foreground Crystalline Snowflakes & Ice Stars (z-index: 5, pointer-events: none)
 */
export function AtmosphereBackdrop() {
  return (
    <>
      <LightingEffect />
      <SnowEffect />
    </>
  );
}
