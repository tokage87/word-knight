export const LOGICAL_WIDTH = 640;
export const LOGICAL_HEIGHT = 360;

// Horizon line. Raising this (smaller y) shrinks the sky and expands the
// ground strip below — important on widescreen fullscreen, where the old
// 280 left ~78% of the canvas as empty sky and the bottom HUD overlapped
// the combat area. Everything parallax-related (sky gradient, mountains,
// houses, trees, bushes, knight/enemy spawns) is anchored to this value
// and shifts in lockstep, so the only re-check needed is that the HUD
// doesn't overlap the new knight/enemy Y.
export const GROUND_Y = 210;
export const KNIGHT_X = 110;
