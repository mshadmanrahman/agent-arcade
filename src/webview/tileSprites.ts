/**
 * Tile sprite system for the Modern Office asset pack.
 * Loads individual 48x48 tile sprites from base64 data URIs.
 *
 * If tileAssets.ts is empty (asset pack not present), all draw calls
 * return false and the office renderer uses procedural fallback from
 * tileRenderer.ts. This makes the asset pack optional.
 */

import { TILE_SPRITE_URIS } from './tileAssets';

/** Loaded tile images keyed by sprite name */
const tileImages = new Map<string, HTMLImageElement>();
let tilesReady = false;

function initTileSprites(): void {
  const entries = Object.entries(TILE_SPRITE_URIS);
  if (entries.length === 0) return;

  let loadCount = 0;
  const total = entries.length;

  for (const [name, uri] of entries) {
    const img = new Image();
    img.onload = () => {
      loadCount++;
      if (loadCount === total) {
        tilesReady = true;
      }
    };
    img.src = uri;
    tileImages.set(name, img);
  }
}

// Start loading on module init
initTileSprites();

/** Check if tile sprites from the asset pack are loaded and available */
export function hasTileSprites(): boolean {
  return tilesReady;
}

/**
 * Draw a named tile sprite at the given position.
 * Returns true if drawn, false if sprite unavailable (use procedural fallback).
 */
export function drawTileSprite(
  ctx: CanvasRenderingContext2D,
  name: string,
  px: number,
  py: number,
  size: number
): boolean {
  if (!tilesReady) return false;

  const img = tileImages.get(name);
  if (!img || !img.complete) return false;

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, px, py, size, size);
  return true;
}
