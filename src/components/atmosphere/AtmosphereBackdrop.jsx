import React from 'react';
import { SnowEffect } from './SnowEffect.jsx';
import './atmosphere.css';

/**
 * AtmosphereBackdrop: Master Atmospheric Coordinator
 * 
 * Tranquil crystalline snow and soft bubble drift system:
 * - Over 80% of particles drift smoothly behind cards (z-index: 0)
 * - Subtle foreground ice crystals/bubbles float above cards (z-index: 3, pointer-events: none)
 * - Zero CPU impact on mobile devices (animation paused on <= 800px)
 */
export function AtmosphereBackdrop() {
  return <SnowEffect />;
}
