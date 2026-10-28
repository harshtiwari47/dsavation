import React from 'react';
import { LightingEffect } from './LightingEffect.jsx';
import { SnowEffect } from './SnowEffect.jsx';
import './atmosphere.css';

/**
 * AtmosphereBackdrop: Master Atmospheric Coordinator
 * 
 * Modular architectural component combining:
 * 1. Volumetric Ambient Lighting & Aurora Curtains (LightingEffect)
 * 2. Multi-Tier High-Contrast Crystalline Snow System (SnowEffect)
 * 3. Smooth Harmonic Environmental Phase Transitions
 * 
 * 100% GPU-accelerated and strictly non-interactive (pointer-events: none).
 */
export function AtmosphereBackdrop() {
  return (
    <div className="atmosphere-root" aria-hidden="true">
      <LightingEffect />
      <SnowEffect />
    </div>
  );
}
