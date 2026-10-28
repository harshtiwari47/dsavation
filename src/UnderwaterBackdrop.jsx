import React from 'react';

/**
 * Underwater Atmosphere Backdrop
 * Features:
 * - Cohesive oceanic depth with soft ambient caustics
 * - School of agile oceanic fish swimming with carangiform caudal tail flutter
 * - Majestic swimming blue whale with gentle tail and flipper undulation
 * - Translucent bioluminescent jellyfish with rhythmic bell contractions
 * - Soft, feathered micro-bubbles and surface sunray caustics
 * - 100% GPU-accelerated and strictly non-interactive (pointer-events: none)
 */

function SchoolFish({ className, delay, size = 48 }) {
  return (
    <div className={`school-fish ${className}`} style={{ animationDelay: delay, width: `${size}px` }}>
      <svg viewBox="0 0 100 42" fill="none" className="school-fish-svg" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="fishGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--fish-head, rgba(56, 189, 248, 0.75))" />
            <stop offset="55%" stopColor="var(--fish-body, rgba(14, 165, 233, 0.58))" />
            <stop offset="100%" stopColor="var(--fish-tail, rgba(3, 105, 161, 0.42))" />
          </linearGradient>
        </defs>
        {/* Streamlined Hydrodynamic Body */}
        <path
          className="fish-torso"
          d="M 6,21 C 18,10 45,9 68,16 C 76,18 84,19 88,21 C 84,23 76,24 68,26 C 45,33 18,32 6,21 Z"
          fill="url(#fishGrad)"
        />
        {/* Caudal Tail Fin (Carangiform Propulsive Flutter) */}
        <path
          className="fish-caudal"
          d="M 86,21 C 91,12 96,6 99,5 C 96,14 95,18 96,21 C 95,24 96,28 99,37 C 96,36 91,30 86,21 Z"
          fill="url(#fishGrad)"
        />
        {/* Dorsal Fin */}
        <path d="M 42,10 C 52,5 62,6 64,13 Z" fill="url(#fishGrad)" opacity="0.85" />
        {/* Pectoral Fin */}
        <path d="M 30,22 C 38,27 42,32 40,33 C 38,34 32,30 28,24 Z" fill="url(#fishGrad)" opacity="0.9" />
        {/* Specular Eye */}
        <circle cx="16" cy="18" r="1.8" fill="rgba(255, 255, 255, 0.95)" />
        <circle cx="16" cy="18" r="0.9" fill="#021422" />
      </svg>
    </div>
  );
}

export function UnderwaterBackdrop() {
  return (
    <div className="underwater-backdrop" aria-hidden="true">
      {/* Surface Sunlight Caustic Rays */}
      <div className="underwater-sunrays" />

      {/* Deep Ocean Soft Ambient Depth Layers (Diffused, zero hard circles) */}
      <div className="underwater-orb orb-abyss-1" />
      <div className="underwater-orb orb-abyss-2" />
      <div className="underwater-orb orb-abyss-3" />

      {/* School of Agile Oceanic Fishes (Carangiform Swarm Motion) */}
      <div className="fish-school">
        <SchoolFish className="fish-1" delay="0s" size={56} />
        <SchoolFish className="fish-2" delay="0.5s" size={46} />
        <SchoolFish className="fish-3" delay="1.1s" size={50} />
        <SchoolFish className="fish-4" delay="1.6s" size={42} />
        <SchoolFish className="fish-5" delay="2.2s" size={48} />
      </div>

      {/* Majestic Blue Whale */}
      <div className="underwater-whale">
        <svg
          className="underwater-whale-svg"
          viewBox="0 0 520 180"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="whaleBodyGrad" x1="0%" y1="30%" x2="100%" y2="70%">
              <stop offset="0%" stopColor="var(--whale-head, rgba(56, 189, 248, 0.55))" />
              <stop offset="38%" stopColor="var(--whale-body, rgba(14, 165, 233, 0.45))" />
              <stop offset="75%" stopColor="var(--whale-tail, rgba(30, 95, 125, 0.35))" />
              <stop offset="100%" stopColor="var(--whale-fluke, rgba(14, 116, 144, 0.28))" />
            </linearGradient>
            <linearGradient id="whaleBellyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(255, 255, 255, 0)" />
              <stop offset="100%" stopColor="rgba(186, 230, 253, 0.28)" />
            </linearGradient>
          </defs>

          {/* Whale Torso & Flukes */}
          <path
            className="whale-torso"
            d="M 42,88 
               C 65,48 145,38 245,42 
               C 345,46 415,64 455,88 
               C 475,84 498,70 514,58 
               C 508,80 499,90 485,96 
               C 499,102 509,112 514,134 
               C 498,122 475,108 455,104 
               C 415,128 345,146 245,148 
               C 155,150 78,138 42,106 
               C 36,100 36,94 42,88 Z"
            fill="url(#whaleBodyGrad)"
          />

          {/* Ventral Grooves / Throat Pleats */}
          <path
            d="M 42,88 C 72,122 152,145 245,146 C 185,142 115,132 65,110 Z"
            fill="url(#whaleBellyGrad)"
          />
          <path
            d="M 75,98 C 120,118 180,128 230,126"
            stroke="rgba(224, 242, 254, 0.35)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M 95,106 C 135,122 190,130 235,129"
            stroke="rgba(224, 242, 254, 0.3)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M 115,114 C 150,126 195,132 235,131"
            stroke="rgba(224, 242, 254, 0.22)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />

          {/* Pectoral Flipper */}
          <path
            className="whale-flipper"
            d="M 185,110 C 228,144 258,162 245,167 C 232,171 196,150 170,118 Z"
            fill="url(#whaleBodyGrad)"
            opacity="0.88"
          />

          {/* Dorsal Fin */}
          <path
            d="M 380,54 C 395,46 408,48 412,58 Z"
            fill="url(#whaleBodyGrad)"
          />

          {/* Whale Eye */}
          <circle cx="82" cy="82" r="3" fill="rgba(255, 255, 255, 0.9)" />
          <circle cx="82" cy="82" r="1.5" fill="#031522" />

          {/* Specular Dorsal Ridge Highlight */}
          <path
            d="M 92,52 C 172,44 272,50 365,68"
            stroke="rgba(255, 255, 255, 0.45)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>

        {/* Ambient Exhale Micro-bubbles from Whale */}
        <div className="whale-spray" />
      </div>

      {/* Bioluminescent Jellyfish 1 (Large - Ascending Right) */}
      <div className="underwater-jellyfish jellyfish-1">
        <svg
          className="underwater-jellyfish-svg"
          viewBox="0 0 160 260"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <radialGradient id="jellyBellGrad1" cx="50%" cy="35%" r="60%">
              <stop offset="0%" stopColor="var(--jelly-core, rgba(167, 243, 208, 0.75))" />
              <stop offset="50%" stopColor="var(--jelly-mid, rgba(56, 189, 248, 0.55))" />
              <stop offset="90%" stopColor="var(--jelly-rim, rgba(14, 165, 233, 0.35))" />
              <stop offset="100%" stopColor="rgba(56, 189, 248, 0)" />
            </radialGradient>
            <linearGradient id="tentacleGrad1" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(56, 189, 248, 0.7)" />
              <stop offset="55%" stopColor="rgba(147, 197, 253, 0.45)" />
              <stop offset="100%" stopColor="rgba(216, 180, 254, 0.12)" />
            </linearGradient>
          </defs>

          {/* Jellyfish Bell Umbrella */}
          <g className="jelly-bell-group">
            <path
              className="jelly-bell"
              d="M 25,95 
                 C 20,40 140,40 135,95 
                 C 128,105 116,98 104,103 
                 C 92,98 80,98 68,103 
                 C 56,98 44,98 32,105 
                 C 27,100 24,98 25,95 Z"
              fill="url(#jellyBellGrad1)"
            />
            {/* Inner Bell Luminous Cap */}
            <path
              d="M 45,85 C 40,55 120,55 115,85 C 105,90 95,85 80,88 C 65,85 55,90 45,85 Z"
              fill="rgba(255, 255, 255, 0.38)"
            />
            {/* Specular Rim Arc */}
            <path
              d="M 35,92 C 55,48 105,48 125,92"
              stroke="rgba(255, 255, 255, 0.8)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>

          {/* Oral Arms / Center Frills */}
          <g className="jelly-oral-arms">
            <path
              d="M 68,98 C 64,125 74,150 68,180 C 63,150 71,125 68,98"
              stroke="rgba(167, 243, 208, 0.65)"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <path
              d="M 92,98 C 96,125 86,150 92,180 C 97,150 89,125 92,98"
              stroke="rgba(167, 243, 208, 0.65)"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <path
              d="M 80,98 C 76,135 84,170 78,210 C 82,170 76,135 80,98"
              stroke="rgba(224, 242, 254, 0.8)"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </g>

          {/* Trailing Flowing Tentacles */}
          <g className="jelly-tentacles">
            <path
              className="tentacle t1"
              d="M 38,102 C 30,140 46,180 34,235"
              stroke="url(#tentacleGrad1)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              className="tentacle t2"
              d="M 54,103 C 48,150 60,195 50,250"
              stroke="url(#tentacleGrad1)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              className="tentacle t3"
              d="M 106,103 C 112,150 100,195 110,250"
              stroke="url(#tentacleGrad1)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              className="tentacle t4"
              d="M 122,102 C 130,140 114,180 126,235"
              stroke="url(#tentacleGrad1)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </g>
        </svg>
      </div>

      {/* Bioluminescent Jellyfish 2 (Medium - Ascending Left) */}
      <div className="underwater-jellyfish jellyfish-2">
        <svg
          className="underwater-jellyfish-svg"
          viewBox="0 0 160 260"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <radialGradient id="jellyBellGrad2" cx="50%" cy="35%" r="60%">
              <stop offset="0%" stopColor="var(--jelly-core-2, rgba(147, 197, 253, 0.7))" />
              <stop offset="50%" stopColor="var(--jelly-mid-2, rgba(96, 165, 250, 0.5))" />
              <stop offset="90%" stopColor="var(--jelly-rim-2, rgba(37, 99, 235, 0.3))" />
              <stop offset="100%" stopColor="rgba(56, 189, 248, 0)" />
            </radialGradient>
          </defs>

          {/* Jellyfish Bell Umbrella */}
          <g className="jelly-bell-group">
            <path
              className="jelly-bell"
              d="M 25,95 
                 C 20,40 140,40 135,95 
                 C 128,105 116,98 104,103 
                 C 92,98 80,98 68,103 
                 C 56,98 44,98 32,105 
                 C 27,100 24,98 25,95 Z"
              fill="url(#jellyBellGrad2)"
            />
            <path
              d="M 45,85 C 40,55 120,55 115,85 C 105,90 95,85 80,88 C 65,85 55,90 45,85 Z"
              fill="rgba(255, 255, 255, 0.3)"
            />
            <path
              d="M 35,92 C 55,48 105,48 125,92"
              stroke="rgba(255, 255, 255, 0.7)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>

          {/* Oral Arms */}
          <g className="jelly-oral-arms">
            <path
              d="M 68,98 C 64,125 74,150 68,180 C 63,150 71,125 68,98"
              stroke="rgba(147, 197, 253, 0.6)"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <path
              d="M 92,98 C 96,125 86,150 92,180 C 97,150 89,125 92,98"
              stroke="rgba(147, 197, 253, 0.6)"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <path
              d="M 80,98 C 76,135 84,170 78,210 C 82,170 76,135 80,98"
              stroke="rgba(219, 234, 254, 0.75)"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </g>

          {/* Trailing Flowing Tentacles */}
          <g className="jelly-tentacles">
            <path
              className="tentacle t1"
              d="M 38,102 C 30,140 46,180 34,235"
              stroke="rgba(96, 165, 250, 0.6)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              className="tentacle t2"
              d="M 54,103 C 48,150 60,195 50,250"
              stroke="rgba(147, 197, 253, 0.5)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              className="tentacle t3"
              d="M 106,103 C 112,150 100,195 110,250"
              stroke="rgba(147, 197, 253, 0.5)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              className="tentacle t4"
              d="M 122,102 C 130,140 114,180 126,235"
              stroke="rgba(96, 165, 250, 0.6)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </g>
        </svg>
      </div>

      {/* Floating Micro-bubbles (Soft specular reflections, zero hard borders) */}
      <div className="underwater-bubble bubble-1" />
      <div className="underwater-bubble bubble-2" />
      <div className="underwater-bubble bubble-3" />
      <div className="underwater-bubble bubble-4" />
      <div className="underwater-bubble bubble-5" />
      <div className="underwater-bubble bubble-6" />
      <div className="underwater-bubble bubble-7" />
    </div>
  );
}
