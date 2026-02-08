import { html, svg } from "lit";
import type { ThemeName } from "../theme";

export function renderCanvasGeometry(theme: ThemeName) {
  switch (theme) {
    case "grid":
      return gridGeometry;
    case "outlands":
      return outlandsGeometry;
    case "endofline":
      return endoflineGeometry;
  }
}

const gridGeometry = html`
  <div class="canvas-geo">
    <svg viewBox="0 0 6000 4000">
      <!-- Concentric rings -->
      ${svg`
        <circle class="cg-ring" cx="3000" cy="2000" r="800"/>
        <circle class="cg-ring" cx="3000" cy="2000" r="795"/>
        <circle class="cg-ring" cx="3000" cy="2000" r="700" stroke-dasharray="8 20"/>
        <circle class="cg-ring" cx="3000" cy="2000" r="600"/>
      `}
      <!-- Cross lines -->
      ${svg`
        <line class="cg-line" x1="2200" y1="2000" x2="3800" y2="2000"/>
        <line class="cg-line" x1="3000" y1="1200" x2="3000" y2="2800"/>
      `}
      <!-- Angular connectors -->
      ${svg`
        <path class="cg-line-b" d="M1800 800 L2000 800 L2020 780"/>
        <path class="cg-line-b" d="M4200 800 L4000 800 L3980 780"/>
        <path class="cg-line-b" d="M1800 3200 L2000 3200 L2020 3220"/>
        <path class="cg-line-b" d="M4200 3200 L4000 3200 L3980 3220"/>
      `}
      <!-- Hex accents -->
      ${svg`
        <polygon class="cg-line-b" points="3000,1190 3012,1197 3012,1211 3000,1218 2988,1211 2988,1197"/>
        <polygon class="cg-line-b" points="3000,2810 3012,2817 3012,2831 3000,2838 2988,2831 2988,2817"/>
      `}
      <!-- Data dots -->
      ${svg`
        <circle class="cg-dot" cx="2000" cy="800" r="3"/>
        <circle class="cg-dot" cx="4000" cy="800" r="3"/>
        <circle class="cg-dot" cx="2000" cy="3200" r="3"/>
        <circle class="cg-dot" cx="4000" cy="3200" r="3"/>
      `}
    </svg>
  </div>
`;

const outlandsGeometry = html`
  <div class="canvas-geo">
    <svg viewBox="0 0 6000 4000">
      <!-- Concentric rings -->
      ${svg`
        <circle class="cg-ring" cx="3000" cy="2000" r="800"/>
        <circle class="cg-ring" cx="3000" cy="2000" r="790"/>
        <circle class="cg-ring" cx="3000" cy="2000" r="650" stroke-dasharray="12 24"/>
        <circle class="cg-ring" cx="3000" cy="2000" r="500"/>
      `}
      <!-- Cross lines -->
      ${svg`
        <line class="cg-line" x1="2200" y1="2000" x2="3800" y2="2000"/>
        <line class="cg-line" x1="3000" y1="1200" x2="3000" y2="2800"/>
      `}
      <!-- Diamond accents -->
      ${svg`
        <polygon class="cg-acc" points="3000,1180 3020,1200 3000,1220 2980,1200"/>
        <polygon class="cg-acc" points="3000,2800 3020,2820 3000,2840 2980,2820"/>
        <polygon class="cg-acc" points="2180,2000 2200,2020 2180,2040 2160,2020"/>
        <polygon class="cg-acc" points="3820,2000 3840,2020 3820,2040 3800,2020"/>
      `}
      <!-- Corner angles -->
      ${svg`
        <path class="cg-line-b" d="M1800 800 L2000 800 L2020 780"/>
        <path class="cg-line-b" d="M4200 800 L4000 800 L3980 780"/>
        <path class="cg-line-b" d="M1800 3200 L2000 3200 L2020 3220"/>
        <path class="cg-line-b" d="M4200 3200 L4000 3200 L3980 3220"/>
      `}
      <!-- Data dots -->
      ${svg`
        <circle class="cg-dot" cx="2000" cy="800" r="3"/>
        <circle class="cg-dot" cx="4000" cy="800" r="3"/>
        <circle class="cg-dot" cx="2000" cy="3200" r="3"/>
        <circle class="cg-dot" cx="4000" cy="3200" r="3"/>
      `}
    </svg>
  </div>
`;

const endoflineGeometry = html`
  <div class="canvas-geo">
    <svg viewBox="0 0 6000 4000">
      <!-- Concentric hexagons -->
      ${svg`
        <polygon class="cg-ring" points="3000,1200 3693,1600 3693,2400 3000,2800 2307,2400 2307,1600"/>
        <polygon class="cg-ring" points="3000,1300 3606,1650 3606,2350 3000,2700 2394,2350 2394,1650"/>
        <polygon class="cg-ring" points="3000,1500 3433,1750 3433,2250 3000,2500 2567,2250 2567,1750" stroke-dasharray="10 20"/>
      `}
      <!-- Radial lines -->
      ${svg`
        <line class="cg-line" x1="3000" y1="1000" x2="3000" y2="3000"/>
        <line class="cg-line" x1="2134" y1="1500" x2="3866" y2="2500"/>
        <line class="cg-line" x1="2134" y1="2500" x2="3866" y2="1500"/>
      `}
      <!-- Triangle accents -->
      ${svg`
        <polygon class="cg-acc" points="3000,1170 3018,1200 2982,1200"/>
        <polygon class="cg-acc" points="3000,2830 3018,2800 2982,2800"/>
      `}
      <!-- Corner flourishes -->
      ${svg`
        <path class="cg-line-b" d="M1800 800 L1820 780 L1860 780 L1880 800"/>
        <path class="cg-line-b" d="M4120 800 L4140 780 L4180 780 L4200 800"/>
        <path class="cg-line-b" d="M1800 3200 L1820 3220 L1860 3220 L1880 3200"/>
        <path class="cg-line-b" d="M4120 3200 L4140 3220 L4180 3220 L4200 3200"/>
      `}
      <!-- Data dots -->
      ${svg`
        <circle class="cg-dot" cx="2000" cy="800" r="3"/>
        <circle class="cg-dot" cx="4000" cy="800" r="3"/>
        <circle class="cg-dot" cx="2000" cy="3200" r="3"/>
        <circle class="cg-dot" cx="4000" cy="3200" r="3"/>
      `}
    </svg>
  </div>
`;

export const rotatingRing = html`
  <div class="canvas-ring">
    <svg viewBox="0 0 1000 1000">
      ${svg`
        <circle cx="500" cy="500" r="400"
          stroke="var(--pri-ghost)" stroke-width="0.5"
          stroke-dasharray="8 16" fill="none"/>
      `}
    </svg>
  </div>
`;
