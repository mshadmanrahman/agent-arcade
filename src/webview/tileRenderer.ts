/**
 * Rich procedural pixel art renderer for office tiles.
 * Draws at 16x16 virtual resolution (3x scale to 48x48 actual pixels),
 * giving authentic pixel art crispness inspired by LimeZu's Modern Interiors.
 *
 * Each tile is rendered once to the offscreen office canvas at init.
 * Runtime cost is zero; visual complexity is free.
 */

import type { TileType, OfficeTile } from './office';

// ---------------------------------------------------------------------------
// Palette: LimeZu Modern Office style — light gray floors, dark outlines
// Matches the look from Modern_Office_Revamped Office_Design examples
// ---------------------------------------------------------------------------
const PAL = {
  // Floor (light warm gray — the dominant color in the reference)
  floorBase:      '#B8B0A8',
  floorPlankA:    '#C0B8B0',
  floorPlankB:    '#B0A8A0',
  floorGrain:     '#A8A098',
  floorGap:       '#989890',
  floorKnot:      '#A0A098',
  floorHighlight: '#C8C0B8',

  // Wall (dark navy outlines — thin border style, not solid brick)
  wallBase:       '#3A4050',
  wallBrickA:     '#424858',
  wallBrickB:     '#4A5060',
  wallMortar:     '#303848',
  wallTrim:       '#505868',
  wallShadow:     '#282E3C',

  // Desk (warm beige/tan wood with equipment)
  woodDark:       '#9A7848',
  woodMid:        '#C8A870',
  woodLight:      '#D8BC88',
  woodGrain:      '#B09058',
  screenBg:       '#1A2030',
  screenGlow:     '#5CC8FF',
  screenCode1:    '#A088E0',
  screenCode2:    '#50D8A0',
  screenCode3:    '#F0A050',
  keyboardBg:     '#485060',
  keyboardKey:    '#586878',
  mousePad:       '#384050',
  mouse:          '#8898A8',
  stickyYellow:   '#FFD54F',
  stickyText:     '#A06000',
  mugBody:        '#F0F0E8',
  mugCoffee:      '#8B4020',
  monitorStand:   '#606870',

  // Chair (dark navy-blue fabric — matches reference)
  seatFabric:     '#3A4058',
  seatHighlight:  '#4A5068',
  seatShadow:     '#2A3048',
  chairBase:      '#484E5C',
  chairWheel:     '#585E6C',

  // Plant (vibrant green on terracotta)
  potBase:        '#A04818',
  potRim:         '#B85C20',
  potHighlight:   '#CC6E28',
  soil:           '#604020',
  leafDark:       '#2A8848',
  leafMid:        '#38A858',
  leafLight:      '#50C870',
  leafBright:     '#70E890',

  // Server (dark tech with bright LEDs)
  rackBody:       '#303840',
  rackFace:       '#404850',
  rackVent:       '#505860',
  ledGreen:       '#40E870',
  ledAmber:       '#FFB830',
  ledBlue:        '#5090FF',
  ledOff:         '#303840',
  cableGray:      '#707880',

  // Coffee station
  counterTop:     '#908880',
  counterFront:   '#787068',
  machineBody:    '#404040',
  machinePanel:   '#303030',
  buttonRed:      '#FF5050',
  buttonGreen:    '#40E868',
  cupWhite:       '#F8F8F0',
  cupShadow:      '#D8D0C8',
  steam:          'rgba(255,255,255,0.30)',

  // Door
  matBase:        '#A09888',
  matStripeA:     '#887868',
  matStripeB:     '#C0B8A8',
  threshold:      '#A0A8B0',

  // Window
  windowFrame:    '#3A4050',
  windowSill:     '#606870',
  glassDark:      '#102030',
  glassDeep:      '#203040',
  starWhite:      '#F0F0FF',
  cityLight1:     '#FFD050',
  cityLight2:     '#FF9848',
  cityLight3:     '#FF6868',
  windowGlow:     'rgba(120,180,255,0.08)',

  // Whiteboard
  boardWhite:     '#F0F0E8',
  boardGray:      '#D0D0C8',
  boardFrame:     '#606870',
  boardShadow:    '#909098',
  markerRed:      '#E84040',
  markerBlue:     '#4080E8',
  markerGreen:    '#38C860',
  markerBlack:    '#202830',
  trayColor:      '#909098',

  // Bookshelf (warm wood with colorful books)
  shelfWood:      '#906028',
  shelfSide:      '#704818',
  shelfTop:       '#A87038',
  bookRed:        '#D83030',
  bookBlue:       '#3068D8',
  bookGreen:      '#28A848',
  bookPurple:     '#7838D8',
  bookYellow:     '#E8C020',
  bookOrange:     '#E86020',
  bookTeal:       '#20A890',
  bookPink:       '#D840A0',

  // Water cooler
  jugBlue:        '#70B0F0',
  jugHighlight:   '#98C8FF',
  jugBubble:      '#C0DEFF',
  dispenserBody:  '#D0D0C8',
  dispenserDark:  '#A0A098',
  tapMetal:       '#989898',

  // Rug (warm rust/burgundy — contrasts with gray floor)
  rugBase:        '#8B4028',
  rugBorder:      '#A85838',
  rugPattern:     '#984830',
  rugAccent:      '#C87050',
  rugFringe:      '#B86048',

  // Lamp
  lampBase:       '#585050',
  lampPole:       '#888078',
  lampShade:      '#E8E0D8',
  lampShadeTop:   '#F0E8E0',
  lampGlow:       'rgba(255,230,100,0.10)',
  lampGlowInner:  'rgba(255,230,100,0.18)',
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Virtual pixel size (48px tile / 16 virtual pixels = 3x scale) */
const PX = 3;

/** Draw a rectangle in 16x16 virtual pixel coordinates */
function vRect(
  ctx: CanvasRenderingContext2D,
  bx: number, by: number,
  vx: number, vy: number,
  vw: number, vh: number,
  color: string
): void {
  ctx.fillStyle = color;
  ctx.fillRect(bx + vx * PX, by + vy * PX, vw * PX, vh * PX);
}

/** Deterministic pseudo-random from grid position (for per-tile variation) */
function tileSeed(gx: number, gy: number): number {
  return ((gx * 7 + gy * 13 + gx * gy * 3) & 0xffff) % 17;
}

/** Pick from an array using seed */
function pick<T>(arr: readonly T[], seed: number, offset: number = 0): T {
  return arr[(seed + offset) % arr.length];
}

// ---------------------------------------------------------------------------
// Per-tile renderers
// ---------------------------------------------------------------------------

function renderFloorTile(
  ctx: CanvasRenderingContext2D, bx: number, by: number,
  gx: number, gy: number
): void {
  const s = tileSeed(gx, gy);

  // Base fill
  vRect(ctx, bx, by, 0, 0, 16, 16, PAL.floorBase);

  // 4 horizontal wood planks
  for (let p = 0; p < 4; p++) {
    const py = p * 4;
    const shade = (p + s) % 2 === 0 ? PAL.floorPlankA : PAL.floorPlankB;
    vRect(ctx, bx, by, 0, py, 16, 3, shade);

    // Grain lines
    const grainX = (s + p * 5) % 10;
    const grainLen = 3 + (s + p) % 4;
    vRect(ctx, bx, by, grainX, py + 1, grainLen, 1, PAL.floorGrain);

    // Second grain line on alternate planks
    if ((s + p) % 3 === 0) {
      const g2x = (grainX + 7) % 13;
      vRect(ctx, bx, by, g2x, py + 2, 2, 1, PAL.floorGrain);
    }

    // Gap between planks
    vRect(ctx, bx, by, 0, py + 3, 16, 1, PAL.floorGap);
  }

  // Occasional knot
  if (s % 5 === 0) {
    const kx = (s * 3) % 11 + 2;
    const ky = (s * 7) % 11 + 2;
    vRect(ctx, bx, by, kx, ky, 2, 2, PAL.floorKnot);
  }

  // Subtle highlight speck
  if ((gx + gy) % 4 === 0) {
    vRect(ctx, bx, by, (s % 10) + 3, (s % 8) + 4, 1, 1, PAL.floorHighlight);
  }
}

function renderWallTile(
  ctx: CanvasRenderingContext2D, bx: number, by: number,
  gx: number, gy: number
): void {
  const s = tileSeed(gx, gy);

  // Base wall color
  vRect(ctx, bx, by, 0, 0, 16, 16, PAL.wallBase);

  // Brick pattern: 4 rows of bricks
  for (let row = 0; row < 4; row++) {
    const rowY = row * 4;
    const offset = row % 2 === 0 ? 0 : 4;

    for (let col = 0; col < 3; col++) {
      const brickX = offset + col * 6;
      if (brickX >= 16) continue;
      const brickW = Math.min(5, 16 - brickX);
      const shade = (row + col + s) % 3 === 0 ? PAL.wallBrickB : PAL.wallBrickA;
      vRect(ctx, bx, by, brickX, rowY, brickW, 3, shade);
    }

    // Mortar line
    vRect(ctx, bx, by, 0, rowY + 3, 16, 1, PAL.wallMortar);
  }

  // Baseboard trim at bottom (if adjacent to floor below)
  vRect(ctx, bx, by, 0, 14, 16, 2, PAL.wallTrim);

  // Dark edge at top
  vRect(ctx, bx, by, 0, 0, 16, 1, PAL.wallShadow);
}

function renderWallTopTile(
  ctx: CanvasRenderingContext2D, bx: number, by: number
): void {
  vRect(ctx, bx, by, 0, 0, 16, 16, PAL.wallBase);
  // Subtle panel lines
  vRect(ctx, bx, by, 0, 7, 16, 1, PAL.wallMortar);
  vRect(ctx, bx, by, 0, 15, 16, 1, PAL.wallTrim);
}

function renderDeskTile(
  ctx: CanvasRenderingContext2D, bx: number, by: number,
  gx: number, gy: number
): void {
  const s = tileSeed(gx, gy);

  // Desk surface (wood)
  vRect(ctx, bx, by, 1, 1, 14, 14, PAL.woodMid);
  // Wood grain highlights
  vRect(ctx, bx, by, 2, 3, 10, 1, PAL.woodGrain);
  vRect(ctx, bx, by, 3, 7, 8, 1, PAL.woodGrain);
  vRect(ctx, bx, by, 2, 11, 6, 1, PAL.woodGrain);
  // Desk edge shadow
  vRect(ctx, bx, by, 1, 14, 14, 1, PAL.woodDark);
  vRect(ctx, bx, by, 1, 1, 14, 1, PAL.woodLight);

  // Monitor body
  vRect(ctx, bx, by, 3, 2, 10, 7, '#1e293b');
  // Screen with code lines
  vRect(ctx, bx, by, 4, 3, 8, 5, PAL.screenBg);
  // "Code" lines on screen
  vRect(ctx, bx, by, 5, 4, 4, 1, PAL.screenCode1);
  vRect(ctx, bx, by, 5, 5, 6, 1, PAL.screenCode2);
  vRect(ctx, bx, by, 5, 6, 3, 1, PAL.screenCode3);
  // Screen bezel highlight
  vRect(ctx, bx, by, 4, 3, 8, 1, PAL.screenGlow);
  // Monitor stand
  vRect(ctx, bx, by, 7, 9, 2, 1, PAL.monitorStand);
  vRect(ctx, bx, by, 6, 10, 4, 1, PAL.monitorStand);

  // Keyboard
  vRect(ctx, bx, by, 3, 11, 8, 2, PAL.keyboardBg);
  // Individual key dots (2px wide, 1px gaps)
  for (let k = 0; k < 3; k++) {
    vRect(ctx, bx, by, 4 + k * 2, 11, 1, 1, PAL.keyboardKey);
    vRect(ctx, bx, by, 4 + k * 2, 12, 1, 1, PAL.keyboardKey);
  }

  // Mouse pad + mouse (right side)
  vRect(ctx, bx, by, 12, 10, 3, 4, PAL.mousePad);
  vRect(ctx, bx, by, 13, 11, 1, 2, PAL.mouse);

  // Sticky note (varies by desk)
  if (s % 3 === 0) {
    vRect(ctx, bx, by, 1, 10, 2, 2, PAL.stickyYellow);
    vRect(ctx, bx, by, 1, 10, 2, 1, PAL.stickyText);
  }

  // Coffee mug (varies by desk)
  if (s % 3 === 1) {
    vRect(ctx, bx, by, 1, 12, 2, 2, PAL.mugBody);
    vRect(ctx, bx, by, 1, 12, 2, 1, PAL.mugCoffee);
  }
}

function renderChairTile(
  ctx: CanvasRenderingContext2D, bx: number, by: number
): void {
  // Floor underneath
  vRect(ctx, bx, by, 0, 0, 16, 16, PAL.floorBase);
  // Plank hint
  vRect(ctx, bx, by, 0, 3, 16, 1, PAL.floorGap);
  vRect(ctx, bx, by, 0, 7, 16, 1, PAL.floorGap);
  vRect(ctx, bx, by, 0, 11, 16, 1, PAL.floorGap);

  // 5-spoke base (star shape: center + 5 spokes)
  vRect(ctx, bx, by, 7, 7, 2, 2, PAL.chairBase);
  // Spokes
  vRect(ctx, bx, by, 4, 10, 2, 1, PAL.chairBase);
  vRect(ctx, bx, by, 10, 10, 2, 1, PAL.chairBase);
  vRect(ctx, bx, by, 4, 5, 2, 1, PAL.chairBase);
  vRect(ctx, bx, by, 10, 5, 2, 1, PAL.chairBase);
  vRect(ctx, bx, by, 7, 11, 2, 1, PAL.chairBase);
  // Caster wheels
  vRect(ctx, bx, by, 3, 10, 1, 1, PAL.chairWheel);
  vRect(ctx, bx, by, 12, 10, 1, 1, PAL.chairWheel);
  vRect(ctx, bx, by, 3, 5, 1, 1, PAL.chairWheel);
  vRect(ctx, bx, by, 12, 5, 1, 1, PAL.chairWheel);
  vRect(ctx, bx, by, 7, 12, 1, 1, PAL.chairWheel);

  // Seat cushion (circular-ish, 8x8 centered)
  vRect(ctx, bx, by, 4, 4, 8, 8, PAL.seatFabric);
  vRect(ctx, bx, by, 5, 3, 6, 1, PAL.seatFabric);
  vRect(ctx, bx, by, 5, 12, 6, 1, PAL.seatFabric);
  // Highlight on cushion
  vRect(ctx, bx, by, 5, 5, 4, 2, PAL.seatHighlight);
  // Shadow on edges
  vRect(ctx, bx, by, 4, 11, 8, 1, PAL.seatShadow);

  // Chair back (top)
  vRect(ctx, bx, by, 4, 1, 8, 3, PAL.seatFabric);
  vRect(ctx, bx, by, 5, 1, 6, 1, PAL.seatHighlight);

  // Armrests
  vRect(ctx, bx, by, 3, 4, 1, 6, PAL.chairBase);
  vRect(ctx, bx, by, 12, 4, 1, 6, PAL.chairBase);
}

function renderPlantTile(
  ctx: CanvasRenderingContext2D, bx: number, by: number,
  gx: number, gy: number
): void {
  const s = tileSeed(gx, gy);

  // Floor base
  vRect(ctx, bx, by, 0, 0, 16, 16, PAL.floorBase);
  vRect(ctx, bx, by, 0, 3, 16, 1, PAL.floorGap);
  vRect(ctx, bx, by, 0, 7, 16, 1, PAL.floorGap);

  // Shadow on floor
  vRect(ctx, bx, by, 4, 14, 8, 2, PAL.floorGap);

  // Terracotta pot
  vRect(ctx, bx, by, 5, 10, 6, 5, PAL.potBase);
  vRect(ctx, bx, by, 6, 10, 4, 5, PAL.potBase);
  // Pot rim
  vRect(ctx, bx, by, 4, 9, 8, 1, PAL.potRim);
  vRect(ctx, bx, by, 4, 9, 2, 1, PAL.potHighlight);
  // Soil
  vRect(ctx, bx, by, 5, 10, 6, 1, PAL.soil);

  // Leaf canopy (layered circles approximated with rectangles)
  // Back leaves (darker)
  vRect(ctx, bx, by, 4, 3, 8, 6, PAL.leafDark);
  vRect(ctx, bx, by, 3, 4, 10, 4, PAL.leafDark);
  // Mid leaves
  vRect(ctx, bx, by, 5, 2, 6, 6, PAL.leafMid);
  vRect(ctx, bx, by, 4, 3, 8, 4, PAL.leafMid);
  // Front highlights
  vRect(ctx, bx, by, 6, 3, 3, 3, PAL.leafLight);
  vRect(ctx, bx, by, 9, 5, 2, 2, PAL.leafBright);
  // Individual leaf tips
  vRect(ctx, bx, by, 3, 2, 2, 1, PAL.leafMid);
  vRect(ctx, bx, by, 11, 3, 1, 2, PAL.leafLight);
  if (s % 2 === 0) {
    vRect(ctx, bx, by, 2, 5, 1, 2, PAL.leafDark);
  }
}

function renderServerTile(
  ctx: CanvasRenderingContext2D, bx: number, by: number
): void {
  // Floor base
  vRect(ctx, bx, by, 0, 0, 16, 16, PAL.floorBase);

  // Rack body
  vRect(ctx, bx, by, 2, 1, 12, 14, PAL.rackBody);
  // Rack face plate
  vRect(ctx, bx, by, 3, 1, 10, 13, PAL.rackFace);

  // 3 server units
  for (let u = 0; u < 3; u++) {
    const uy = 2 + u * 4;
    // Unit face
    vRect(ctx, bx, by, 4, uy, 8, 3, PAL.rackBody);
    // LED indicator
    const ledColor = u === 0 ? PAL.ledGreen : u === 1 ? PAL.ledAmber : PAL.ledBlue;
    vRect(ctx, bx, by, 5, uy + 1, 1, 1, ledColor);
    // Drive bay lines
    vRect(ctx, bx, by, 7, uy, 4, 1, PAL.rackVent);
    vRect(ctx, bx, by, 7, uy + 2, 4, 1, PAL.rackVent);
  }

  // Ventilation holes at bottom
  for (let v = 0; v < 4; v++) {
    vRect(ctx, bx, by, 5 + v * 2, 13, 1, 1, PAL.rackVent);
  }

  // Cable bundle at bottom
  vRect(ctx, bx, by, 6, 14, 1, 2, PAL.cableGray);
  vRect(ctx, bx, by, 9, 14, 1, 2, PAL.cableGray);
}

function renderCoffeeTile(
  ctx: CanvasRenderingContext2D, bx: number, by: number
): void {
  // Wall background (this sits against the wall)
  vRect(ctx, bx, by, 0, 0, 16, 16, PAL.wallBase);
  vRect(ctx, bx, by, 0, 14, 16, 2, PAL.wallTrim);

  // Counter
  vRect(ctx, bx, by, 1, 10, 14, 5, PAL.counterFront);
  vRect(ctx, bx, by, 1, 9, 14, 2, PAL.counterTop);

  // Coffee machine body
  vRect(ctx, bx, by, 3, 2, 10, 7, PAL.machineBody);
  vRect(ctx, bx, by, 4, 3, 8, 5, PAL.machinePanel);
  // Buttons
  vRect(ctx, bx, by, 5, 4, 1, 1, PAL.buttonRed);
  vRect(ctx, bx, by, 7, 4, 1, 1, PAL.buttonGreen);
  // Drip area
  vRect(ctx, bx, by, 5, 6, 4, 1, PAL.rackBody);

  // Cup on counter
  vRect(ctx, bx, by, 6, 10, 2, 2, PAL.cupWhite);
  vRect(ctx, bx, by, 6, 10, 2, 1, PAL.mugCoffee);
  // Steam wisps
  vRect(ctx, bx, by, 6, 9, 1, 1, PAL.steam);
  vRect(ctx, bx, by, 8, 8, 1, 1, PAL.steam);

  // Cup stack (to the right)
  vRect(ctx, bx, by, 11, 10, 2, 1, PAL.cupWhite);
  vRect(ctx, bx, by, 11, 11, 2, 1, PAL.cupShadow);

  // Small condiment containers
  vRect(ctx, bx, by, 2, 10, 1, 2, PAL.stickyYellow);
  vRect(ctx, bx, by, 3, 10, 1, 2, PAL.cupWhite);
}

function renderDoorTile(
  ctx: CanvasRenderingContext2D, bx: number, by: number
): void {
  // Floor base
  vRect(ctx, bx, by, 0, 0, 16, 16, PAL.floorBase);
  vRect(ctx, bx, by, 0, 3, 16, 1, PAL.floorGap);
  vRect(ctx, bx, by, 0, 7, 16, 1, PAL.floorGap);

  // Welcome mat
  vRect(ctx, bx, by, 2, 3, 12, 10, PAL.matBase);
  // Woven stripe pattern
  for (let stripe = 0; stripe < 4; stripe++) {
    const sy = 4 + stripe * 2;
    vRect(ctx, bx, by, 3, sy, 10, 1, stripe % 2 === 0 ? PAL.matStripeA : PAL.matStripeB);
  }
  // Mat border
  vRect(ctx, bx, by, 2, 3, 12, 1, PAL.matStripeA);
  vRect(ctx, bx, by, 2, 12, 12, 1, PAL.matStripeA);

  // Threshold strip (metallic)
  vRect(ctx, bx, by, 0, 0, 16, 1, PAL.threshold);
  vRect(ctx, bx, by, 0, 15, 16, 1, PAL.threshold);
}

function renderEmptyTile(
  ctx: CanvasRenderingContext2D, bx: number, by: number
): void {
  vRect(ctx, bx, by, 0, 0, 16, 16, '#11111b');
}

// ---------------------------------------------------------------------------
// NEW: Floor variants + Void
// ---------------------------------------------------------------------------

/** Carpet floor for the lounge: warm tan/brown weave (matches reference) */
function renderFloorCarpetTile(
  ctx: CanvasRenderingContext2D, bx: number, by: number,
  gx: number, gy: number
): void {
  const s = tileSeed(gx, gy);

  // Base carpet color (warm brown/tan — like the reference lower room)
  vRect(ctx, bx, by, 0, 0, 16, 16, '#A89078');

  // Carpet weave pattern (horizontal fibers)
  for (let row = 0; row < 16; row++) {
    if ((row + s) % 3 === 0) {
      const shade = (row + s) % 2 === 0 ? '#B09880' : '#A08870';
      vRect(ctx, bx, by, 0, row, 16, 1, shade);
    }
  }

  // Cross-weave pattern
  for (let col = 0; col < 16; col += 4) {
    const offset = (s + col) % 3;
    vRect(ctx, bx, by, col + offset, (s * 3) % 12 + 2, 1, 2, '#B8A088');
  }

  // Highlight speck
  if ((gx + gy) % 5 === 0) {
    vRect(ctx, bx, by, (s % 10) + 3, (s % 8) + 4, 1, 1, '#C0A890');
  }
}

/** Tile floor for the hallway: clean checkered pattern */
function renderFloorTileTile(
  ctx: CanvasRenderingContext2D, bx: number, by: number,
  gx: number, gy: number
): void {
  // Checkered tiles (cream and light gray)
  const isEven = (gx + gy) % 2 === 0;
  const baseA = '#C8C0B0'; // warm cream
  const baseB = '#A8A098'; // warm gray
  const base = isEven ? baseA : baseB;

  vRect(ctx, bx, by, 0, 0, 16, 16, base);

  // Grout lines (dark gap between tiles)
  vRect(ctx, bx, by, 0, 0, 16, 1, '#908880');
  vRect(ctx, bx, by, 0, 0, 1, 16, '#908880');
  vRect(ctx, bx, by, 0, 15, 16, 1, '#908880');
  vRect(ctx, bx, by, 15, 0, 1, 16, '#908880');

  // Surface texture
  const s = tileSeed(gx, gy);
  if (s % 4 === 0) {
    vRect(ctx, bx, by, (s % 10) + 3, (s % 8) + 3, 2, 1, isEven ? '#D0C8B8' : '#B0A8A0');
  }

  // Center highlight
  if ((gx * gy) % 7 === 0) {
    vRect(ctx, bx, by, 7, 7, 2, 2, isEven ? '#D8D0C0' : '#B8B0A8');
  }
}

/** VOID tile: deep black empty space */
function renderVoidTile(
  ctx: CanvasRenderingContext2D, bx: number, by: number
): void {
  vRect(ctx, bx, by, 0, 0, 16, 16, '#08080E');
}

// ---------------------------------------------------------------------------
// NEW tile renderers
// ---------------------------------------------------------------------------

function renderWindowTile(
  ctx: CanvasRenderingContext2D, bx: number, by: number,
  gx: number
): void {
  // Wall background
  vRect(ctx, bx, by, 0, 0, 16, 16, PAL.wallBase);

  // Window frame (outer)
  vRect(ctx, bx, by, 2, 2, 12, 12, PAL.windowFrame);
  // Glass (inner)
  vRect(ctx, bx, by, 3, 3, 10, 10, PAL.glassDark);

  // Cross divider (4 panes)
  vRect(ctx, bx, by, 7, 3, 2, 10, PAL.windowFrame);
  vRect(ctx, bx, by, 3, 7, 10, 2, PAL.windowFrame);

  // Night sky with city lights
  // Top-left pane
  vRect(ctx, bx, by, 4, 4, 3, 3, PAL.glassDeep);
  vRect(ctx, bx, by, 5, 4, 1, 1, PAL.starWhite);
  // Top-right pane
  vRect(ctx, bx, by, 9, 4, 4, 3, PAL.glassDeep);
  vRect(ctx, bx, by, 11, 5, 1, 1, PAL.starWhite);
  // Bottom-left pane: city buildings
  vRect(ctx, bx, by, 4, 10, 2, 2, PAL.wallBrickA);
  vRect(ctx, bx, by, 3, 11, 1, 1, PAL.wallBrickB);
  vRect(ctx, bx, by, 5, 9, 1, 3, PAL.wallBrickA);
  // Building windows (city lights)
  vRect(ctx, bx, by, 4, 10, 1, 1, gx % 2 === 0 ? PAL.cityLight1 : PAL.cityLight2);
  vRect(ctx, bx, by, 5, 10, 1, 1, PAL.cityLight3);
  // Bottom-right pane: more buildings
  vRect(ctx, bx, by, 10, 10, 2, 2, PAL.wallBrickA);
  vRect(ctx, bx, by, 12, 9, 1, 3, PAL.wallBrickB);
  vRect(ctx, bx, by, 10, 10, 1, 1, PAL.cityLight1);
  vRect(ctx, bx, by, 11, 11, 1, 1, PAL.cityLight2);

  // Window sill
  vRect(ctx, bx, by, 1, 13, 14, 1, PAL.windowSill);

  // Baseboard trim
  vRect(ctx, bx, by, 0, 14, 16, 2, PAL.wallTrim);
  vRect(ctx, bx, by, 0, 0, 16, 1, PAL.wallShadow);
}

function renderWhiteboardTile(
  ctx: CanvasRenderingContext2D, bx: number, by: number
): void {
  // Wall background
  vRect(ctx, bx, by, 0, 0, 16, 16, PAL.wallBase);
  vRect(ctx, bx, by, 0, 14, 16, 2, PAL.wallTrim);
  vRect(ctx, bx, by, 0, 0, 16, 1, PAL.wallShadow);

  // Board frame
  vRect(ctx, bx, by, 1, 2, 14, 10, PAL.boardFrame);
  // White surface
  vRect(ctx, bx, by, 2, 3, 12, 8, PAL.boardWhite);

  // Scribbles!
  // Box diagram
  vRect(ctx, bx, by, 3, 4, 3, 2, PAL.markerBlue);
  vRect(ctx, bx, by, 4, 5, 1, 1, PAL.boardWhite);
  // Arrow
  vRect(ctx, bx, by, 7, 5, 3, 1, PAL.markerRed);
  vRect(ctx, bx, by, 9, 4, 1, 1, PAL.markerRed);
  vRect(ctx, bx, by, 9, 6, 1, 1, PAL.markerRed);
  // Another box
  vRect(ctx, bx, by, 10, 4, 3, 2, PAL.markerGreen);
  vRect(ctx, bx, by, 11, 5, 1, 1, PAL.boardWhite);
  // "TODO" dots (simulating text)
  vRect(ctx, bx, by, 3, 8, 4, 1, PAL.markerBlack);
  vRect(ctx, bx, by, 3, 9, 6, 1, PAL.markerBlack);

  // Marker tray
  vRect(ctx, bx, by, 2, 11, 12, 1, PAL.trayColor);
  // Markers on tray
  vRect(ctx, bx, by, 3, 11, 2, 1, PAL.markerRed);
  vRect(ctx, bx, by, 6, 11, 2, 1, PAL.markerBlue);
  vRect(ctx, bx, by, 9, 11, 2, 1, PAL.markerGreen);
}

function renderBookshelfTile(
  ctx: CanvasRenderingContext2D, bx: number, by: number,
  gx: number, gy: number
): void {
  const s = tileSeed(gx, gy);

  // Floor base
  vRect(ctx, bx, by, 0, 0, 16, 16, PAL.floorBase);

  // Shelf unit body
  vRect(ctx, bx, by, 1, 0, 14, 15, PAL.shelfSide);
  vRect(ctx, bx, by, 2, 0, 12, 15, PAL.shelfWood);

  // 3 shelves
  const bookColors = [
    PAL.bookRed, PAL.bookBlue, PAL.bookGreen, PAL.bookPurple,
    PAL.bookYellow, PAL.bookOrange, PAL.bookTeal, PAL.bookPink,
  ];

  for (let shelf = 0; shelf < 3; shelf++) {
    const sy = 1 + shelf * 5;

    // Books on this shelf
    let bx2 = 3;
    for (let b = 0; b < 5; b++) {
      const bookW = 1 + (s + b + shelf) % 2;
      const bookH = 3 + (s + b) % 2;
      const bookY = sy + (4 - bookH);
      const color = pick(bookColors, s + b + shelf * 3);
      vRect(ctx, bx, by, bx2, bookY, bookW, bookH, color);
      bx2 += bookW;
      if (bx2 >= 13) break;
    }

    // Shelf board
    vRect(ctx, bx, by, 2, sy + 4, 12, 1, PAL.shelfTop);
  }

  // Base/feet
  vRect(ctx, bx, by, 2, 15, 12, 1, PAL.shelfSide);
}

function renderWaterCoolerTile(
  ctx: CanvasRenderingContext2D, bx: number, by: number
): void {
  // Floor base
  vRect(ctx, bx, by, 0, 0, 16, 16, PAL.floorBase);
  vRect(ctx, bx, by, 0, 3, 16, 1, PAL.floorGap);
  vRect(ctx, bx, by, 0, 7, 16, 1, PAL.floorGap);

  // Shadow
  vRect(ctx, bx, by, 4, 14, 8, 2, PAL.floorGap);

  // Water jug (top)
  vRect(ctx, bx, by, 5, 1, 6, 4, PAL.jugBlue);
  vRect(ctx, bx, by, 6, 0, 4, 1, PAL.jugBlue);
  // Jug highlight
  vRect(ctx, bx, by, 6, 1, 2, 2, PAL.jugHighlight);
  // Bubble
  vRect(ctx, bx, by, 9, 2, 1, 1, PAL.jugBubble);

  // Neck
  vRect(ctx, bx, by, 7, 5, 2, 1, PAL.dispenserBody);

  // Dispenser body
  vRect(ctx, bx, by, 4, 6, 8, 8, PAL.dispenserBody);
  vRect(ctx, bx, by, 5, 7, 6, 6, PAL.dispenserDark);
  // Taps
  vRect(ctx, bx, by, 6, 8, 1, 1, PAL.ledBlue);
  vRect(ctx, bx, by, 9, 8, 1, 1, PAL.ledAmber);
  // Drip tray
  vRect(ctx, bx, by, 5, 12, 6, 1, PAL.tapMetal);

  // Base
  vRect(ctx, bx, by, 4, 14, 8, 2, PAL.dispenserDark);
}

function renderRugTile(
  ctx: CanvasRenderingContext2D, bx: number, by: number,
  gx: number, gy: number
): void {
  // Floor base shows through at edges
  vRect(ctx, bx, by, 0, 0, 16, 16, PAL.floorBase);
  vRect(ctx, bx, by, 0, 3, 16, 1, PAL.floorGap);

  // Rug body
  vRect(ctx, bx, by, 1, 1, 14, 14, PAL.rugBase);

  // Border pattern (inner rectangle)
  vRect(ctx, bx, by, 2, 2, 12, 1, PAL.rugBorder);
  vRect(ctx, bx, by, 2, 13, 12, 1, PAL.rugBorder);
  vRect(ctx, bx, by, 2, 2, 1, 12, PAL.rugBorder);
  vRect(ctx, bx, by, 13, 2, 1, 12, PAL.rugBorder);

  // Geometric center pattern (diamond)
  vRect(ctx, bx, by, 7, 4, 2, 1, PAL.rugAccent);
  vRect(ctx, bx, by, 6, 5, 4, 1, PAL.rugAccent);
  vRect(ctx, bx, by, 5, 6, 6, 1, PAL.rugAccent);
  vRect(ctx, bx, by, 5, 7, 6, 2, PAL.rugPattern);
  vRect(ctx, bx, by, 6, 7, 4, 2, PAL.rugAccent);
  vRect(ctx, bx, by, 5, 9, 6, 1, PAL.rugAccent);
  vRect(ctx, bx, by, 6, 10, 4, 1, PAL.rugAccent);
  vRect(ctx, bx, by, 7, 11, 2, 1, PAL.rugAccent);

  // Corner accents
  vRect(ctx, bx, by, 3, 3, 1, 1, PAL.rugAccent);
  vRect(ctx, bx, by, 12, 3, 1, 1, PAL.rugAccent);
  vRect(ctx, bx, by, 3, 12, 1, 1, PAL.rugAccent);
  vRect(ctx, bx, by, 12, 12, 1, 1, PAL.rugAccent);

  // Fringe at top and bottom
  for (let f = 0; f < 6; f++) {
    vRect(ctx, bx, by, 2 + f * 2, 0, 1, 1, PAL.rugFringe);
    vRect(ctx, bx, by, 2 + f * 2, 15, 1, 1, PAL.rugFringe);
  }
}

function renderLampTile(
  ctx: CanvasRenderingContext2D, bx: number, by: number
): void {
  // Floor base
  vRect(ctx, bx, by, 0, 0, 16, 16, PAL.floorBase);
  vRect(ctx, bx, by, 0, 3, 16, 1, PAL.floorGap);
  vRect(ctx, bx, by, 0, 7, 16, 1, PAL.floorGap);

  // Warm glow circle on floor (painted first, underneath)
  vRect(ctx, bx, by, 2, 2, 12, 12, PAL.lampGlow);
  vRect(ctx, bx, by, 4, 4, 8, 8, PAL.lampGlowInner);

  // Lamp base (circular)
  vRect(ctx, bx, by, 6, 13, 4, 2, PAL.lampBase);
  vRect(ctx, bx, by, 5, 14, 6, 1, PAL.lampBase);

  // Pole
  vRect(ctx, bx, by, 7, 5, 2, 8, PAL.lampPole);

  // Shade (trapezoid-ish)
  vRect(ctx, bx, by, 4, 2, 8, 4, PAL.lampShade);
  vRect(ctx, bx, by, 3, 3, 10, 2, PAL.lampShade);
  // Shade highlight
  vRect(ctx, bx, by, 5, 2, 4, 1, PAL.lampShadeTop);
  // Light bulb glow at bottom of shade
  vRect(ctx, bx, by, 6, 5, 4, 1, PAL.stickyYellow);
}

// ---------------------------------------------------------------------------
// Chair overlay: armrests + front cushion drawn OVER seated agents
// ---------------------------------------------------------------------------

/**
 * Render only the parts of the chair that should appear IN FRONT of a
 * seated character: the two armrests and the front cushion edge.
 * This creates the visual effect of sitting "in" the chair.
 *
 * Call after drawing the agent sprite to complete the chair-agent sandwich:
 *   chair body (Z-sort) -> agent sprite -> chair overlay (this function)
 */
export function renderChairOverlay(
  ctx: CanvasRenderingContext2D, bx: number, by: number
): void {
  // Armrests (full length, both sides)
  vRect(ctx, bx, by, 3, 4, 1, 6, PAL.chairBase);
  vRect(ctx, bx, by, 12, 4, 1, 6, PAL.chairBase);

  // Front cushion shadow edge
  vRect(ctx, bx, by, 4, 11, 8, 1, PAL.seatShadow);

  // Front cushion bottom
  vRect(ctx, bx, by, 5, 12, 6, 1, PAL.seatFabric);
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

/** Render a single tile procedurally */
export function renderTile(
  ctx: CanvasRenderingContext2D,
  type: TileType,
  px: number,
  py: number,
  _tileSize: number,
  gridX: number,
  gridY: number
): void {
  switch (type) {
    case 'floor':         renderFloorTile(ctx, px, py, gridX, gridY); break;
    case 'floor_carpet':  renderFloorCarpetTile(ctx, px, py, gridX, gridY); break;
    case 'floor_tile':    renderFloorTileTile(ctx, px, py, gridX, gridY); break;
    case 'wall':          renderWallTile(ctx, px, py, gridX, gridY); break;
    case 'wall_top':      renderWallTopTile(ctx, px, py); break;
    case 'desk':          renderDeskTile(ctx, px, py, gridX, gridY); break;
    case 'chair':         renderChairTile(ctx, px, py); break;
    case 'plant':         renderPlantTile(ctx, px, py, gridX, gridY); break;
    case 'server':        renderServerTile(ctx, px, py); break;
    case 'coffee':        renderCoffeeTile(ctx, px, py); break;
    case 'door':          renderDoorTile(ctx, px, py); break;
    case 'window':        renderWindowTile(ctx, px, py, gridX); break;
    case 'whiteboard':    renderWhiteboardTile(ctx, px, py); break;
    case 'bookshelf':     renderBookshelfTile(ctx, px, py, gridX, gridY); break;
    case 'watercooler':   renderWaterCoolerTile(ctx, px, py); break;
    case 'rug':           renderRugTile(ctx, px, py, gridX, gridY); break;
    case 'lamp':          renderLampTile(ctx, px, py); break;
    case 'void':          renderVoidTile(ctx, px, py); break;
    case 'empty':         renderEmptyTile(ctx, px, py); break;
  }
}

// ---------------------------------------------------------------------------
// Ambient effects (post-processing pass)
// ---------------------------------------------------------------------------

/** Add shadows near walls and light pools near windows/lamps */
export function renderAmbientEffects(
  ctx: CanvasRenderingContext2D,
  grid: readonly (readonly OfficeTile[])[],
  rows: number,
  cols: number,
  tileSize: number
): void {
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const tile = grid[y][x];
      if (!tile.walkable && tile.type !== 'rug' && tile.type !== 'lamp') continue;

      const px = x * tileSize;
      const py = y * tileSize;

      // Shadow on south side of walls (floor tile below a wall)
      if (y > 0 && isWallLike(grid[y - 1][x].type)) {
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(px, py, tileSize, PX * 2);
      }

      // Shadow on east side of west walls
      if (x > 0 && grid[y][x - 1].type === 'wall') {
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        ctx.fillRect(px, py, PX * 2, tileSize);
      }

      // Light pool below windows
      if (y > 0 && grid[y - 1][x].type === 'window') {
        ctx.fillStyle = PAL.windowGlow;
        ctx.fillRect(px, py, tileSize, tileSize);
        if (y + 1 < rows && grid[y + 1][x].walkable) {
          ctx.fillStyle = 'rgba(100,160,255,0.03)';
          ctx.fillRect(x * tileSize, (y + 1) * tileSize, tileSize, tileSize);
        }
      }

      // Light pool around lamps (3x3 area)
      if (tile.type === 'lamp') {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
            if (dx === 0 && dy === 0) continue;
            if (!grid[ny][nx].walkable) continue;
            ctx.fillStyle = PAL.lampGlow;
            ctx.fillRect(nx * tileSize, ny * tileSize, tileSize, tileSize);
          }
        }
      }
    }
  }
}

function isWallLike(type: TileType): boolean {
  return type === 'wall' || type === 'wall_top' || type === 'window' || type === 'whiteboard';
}
