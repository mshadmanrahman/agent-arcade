# DALL-E Asset Generation Guide for Agent Arcade

## Overview

This guide specifies exactly how to generate image assets using DALL-E that integrate with the Three.js isometric office scene. All assets are loaded as textures on 3D geometry (billboard sprites, textured planes, or mapped surfaces).

---

## How Assets Are Used in Three.js

| Method | Best For | How It Works |
|--------|----------|-------------|
| **Billboard sprites** | Characters, plants, furniture | 2D image on a plane that always faces the camera |
| **Textures on geometry** | Floors, walls, rugs | Image mapped onto 3D surface |
| **Sprite sheets** | Character animations | Multiple frames in one image, cycled at runtime |

---

## 1. CHARACTER SPRITES (Most Important)

### What's needed
- **4 views per character**: front, back, left, right
- **Isometric angle**: ~35 degrees from above, matching the game camera
- **Transparent background** (use DALL-E's PNG transparency option)
- **512x512 resolution** (will be cropped and scaled in code)
- **Consistent style** across all characters (use same style prefix)

### Prompt template
```
Isometric pixel art character, [CHARACTER DESCRIPTION], viewed from
[DIRECTION], 35-degree top-down angle, chibi proportions (large head,
small body), transparent background, clean edges, no shadow on ground,
game asset style, 512x512
```

### Directions to generate per character
```
- "viewed from the front-right"     (default isometric view)
- "viewed from the back-right"      (sitting at desk, facing screen)
- "viewed from the left side"       (walking left)
- "viewed from the right side"      (walking right)
```

### Recommended character variants (6 total, one per agent)
```
1. "a friendly robot programmer with blue LED eyes and silver body"
2. "a wizard coder with purple robes and a glowing laptop staff"
3. "a cyberpunk hacker with neon green hoodie and AR goggles"
4. "a steampunk engineer with brass goggles and leather apron"
5. "a space cadet developer with a small helmet and orange suit"
6. "a forest elf coder with green tunic and leaf accessories"
```

### Walk animation frames (4 frames per direction)
```
Same character prompt, but add:
"walking pose, [left/right] foot forward, frame [1/2/3/4] of walk cycle"
```

### Sitting pose (for when working at desk)
```
Same character, "sitting in an office chair, typing on keyboard,
viewed from behind at 35-degree isometric angle, transparent background"
```

### Idle pose
```
Same character, "standing idle, slight breathing pose,
viewed from front-right at 35-degree isometric angle, transparent background"
```

---

## 2. FURNITURE SPRITES

### Format
Isometric view, transparent background, 512x512

### Prompt template
```
Isometric game asset, [FURNITURE DESCRIPTION], 35-degree top-down view,
[ART STYLE] style, transparent background, clean edges,
no shadow on ground, game sprite, 512x512
```

### Items to generate
```
1.  "modern office desk with dual monitors, keyboard, and coffee mug"
2.  "ergonomic office chair, dark blue mesh fabric, 5-wheel base"
3.  "tall wooden bookshelf with colorful books and small plant"
4.  "server rack with blinking green and blue LED lights, 4 units"
5.  "coffee machine on a small counter with white mugs and pastries"
6.  "water cooler with blue water jug on top"
7.  "potted plant, lush green monstera leaves in terracotta pot"
8.  "tall potted plant, snake plant in modern white pot"
9.  "office couch, dark navy leather, two-seater with cushions"
10. "whiteboard on stand with colorful sticky notes and diagrams"
11. "standing desk with single ultrawide curved monitor"
12. "office printer/copier machine, modern gray"
13. "coat rack with jackets and a backpack"
14. "small coffee table with magazines and a plant"
15. "mini fridge, stainless steel, slightly open with glow"
16. "office divider/partition, frosted glass with metal frame"
```

---

## 3. FLOOR TEXTURES (Tileable)

### Format
Square, seamless tileable, 256x256 or 512x512

### Prompt template
```
Seamless tileable texture, [SURFACE TYPE], viewed directly from above,
flat even lighting, no shadows, game floor texture, 256x256
```

### Surfaces to generate
```
1. "light gray office carpet with subtle fiber texture"
2. "warm honey hardwood floor planks with visible grain"
3. "modern checkered tile floor, cream and warm gray alternating"
4. "dark blue luxury carpet with subtle diamond pattern"
5. "polished concrete floor, light gray with subtle speckles"
6. "herringbone wood parquet floor, warm brown tones"
```

---

## 4. WALL TEXTURES

### Format
Square, seamless tileable, 256x256

### Prompt template
```
Seamless tileable texture, [WALL TYPE], viewed straight on from front,
flat even lighting, no perspective distortion, 256x256
```

### Walls to generate
```
1. "modern office wall, light gray with subtle vertical panel lines"
2. "exposed brick wall, warm brown and red tones"
3. "glass office partition with thin metal frame grid"
4. "painted concrete wall, warm off-white with subtle texture"
```

---

## 5. SPAWN / MAGIC EFFECT FRAMES

### Format
512x512, transparent background, 6 frames for animation sequence

### Prompt template
```
Magic teleportation effect, [FRAME DESCRIPTION], top-down isometric view,
transparent background, glowing particles, blue and gold energy,
game VFX asset, 512x512
```

### Frames to generate (6 total)
```
Frame 1: "small glowing circle appearing on the ground, faint blue sparks"
Frame 2: "expanding ring of blue light with gold spiral particles rising"
Frame 3: "tall beam of light shooting upward, swirling particles at peak intensity"
Frame 4: "character silhouette materializing inside the light beam"
Frame 5: "light beam fading, sparkles dissipating outward, figure becoming solid"
Frame 6: "final golden sparkles fading away, tiny glow circle remains on ground"
```

---

## 6. UI ELEMENTS (Optional)

### Format
Transparent PNG, various sizes

```
Game UI element, [DESCRIPTION], pixel art style, transparent background

Elements:
- "plus button icon, green glowing, 64x64"
- "minus button icon, subtle gray, 64x64"
- "gear/settings icon, metallic, 64x64"
- "grid/layout icon, blue, 64x64"
- "close X button, red, 48x48"
- "agent status badge, green online dot, 32x32"
- "name tag background, dark rounded rectangle with glow border"
```

---

## Technical Specifications

```
FORMAT:          PNG with alpha transparency
RESOLUTION:      512x512 (characters, furniture, effects)
                 256x256 (floor/wall textures)
                 64x64 or 128x128 (UI elements)
CAMERA ANGLE:    35-degree isometric top-down (for sprites)
                 Straight-on (for textures)
BACKGROUND:      Transparent (sprites/effects/UI)
                 Solid/seamless (textures)
COLOR SPACE:     sRGB
FILE SIZE:       Keep under 500KB per image
```

---

## File Naming Convention

```
{category}_{name}_{variant}_{direction/frame}.png

Examples:
  char_robot_blue_front.png
  char_robot_blue_back.png
  char_robot_blue_walk_front_1.png
  char_robot_blue_walk_front_2.png
  char_robot_blue_sitting.png
  furniture_desk_modern.png
  furniture_chair_blue.png
  floor_wood_honey.png
  wall_brick_warm.png
  effect_spawn_3.png
  ui_btn_plus.png
```

---

## File Organization

Place all generated assets in:
```
assets/dalle/
  characters/
    robot/
      front.png, back.png, left.png, right.png
      walk_front_1.png, walk_front_2.png, walk_front_3.png, walk_front_4.png
      sitting.png, idle.png
    wizard/
      (same structure)
    hacker/
      (same structure)
    ... (6 characters total)
  furniture/
    desk_modern.png
    chair_blue.png
    bookshelf.png
    server_rack.png
    coffee_machine.png
    water_cooler.png
    plant_monstera.png
    plant_snake.png
    couch_navy.png
    whiteboard.png
    ...
  textures/
    floor_wood_honey.png
    floor_carpet_gray.png
    floor_tile_checker.png
    wall_gray_panels.png
    wall_brick_warm.png
    ...
  effects/
    spawn_1.png through spawn_6.png
  ui/
    btn_plus.png
    btn_minus.png
    btn_settings.png
    ...
```

---

## Integration Notes (for the developer)

### Characters
- Loaded as `THREE.SpriteMaterial` with the PNG as texture
- Billboard sprites always face the camera (no rotation needed)
- Direction/animation frame swapped by changing `sprite.material.map`
- Walk cycle: 4 frames at ~8 FPS per direction
- Sitting: single frame, used when agent state is "typing" or "reading"

### Furniture
- Loaded as textured `THREE.PlaneGeometry` positioned in the scene
- Planes angled to match isometric view OR use billboard mode
- Replaces current procedural 3D box furniture
- Z-sorting handled by Three.js depth buffer

### Floor/Wall Textures
- Applied to existing geometry via `MeshStandardMaterial({ map: texture })`
- Set `texture.wrapS = texture.wrapT = THREE.RepeatWrapping` for tiling
- Adjust `texture.repeat.set(tilesX, tilesY)` for scale

### Spawn Effect
- 6-frame animation using `CanvasTexture` or cycling `SpriteMaterial.map`
- Played once on spawn, ~0.4s per frame = 2.4s total effect
- Additive blending for glow: `material.blending = THREE.AdditiveBlending`

### Build Pipeline
- New script: `scripts/generate-dalle-data.js` converts PNGs to base64
- Outputs `src/webview/dalleAssets.ts` with named data URIs
- Or: use webview resource URIs for larger asset sets (avoids bundle bloat)

---

## Style Consistency Tips

1. **Use the same style prefix** in every prompt:
   ```
   "Low-poly isometric game art style, vibrant warm colors,
   soft cel-shaded lighting, clean vector edges, modern tech office theme, ..."
   ```

2. **Generate all characters in one DALL-E session** to maintain consistent style

3. **Test one character first** (front view only). Send it to the developer to verify it loads correctly before generating the full set.

4. **Keep the color palette warm and vibrant**:
   - Avoid pure black/white
   - Use saturated but not neon colors
   - Match the existing office color scheme (warm grays, honey wood, navy accents)

5. **Character height consistency**: All characters should be roughly the same height in their sprite (fill about 80% of the 512px height)

---

## Quick Start Checklist

For a minimum viable visual overhaul, generate in this order:

- [ ] 1 character (robot) - front view only (test integration)
- [ ] Same character - all 4 directions
- [ ] Same character - walk cycle (4 frames, front direction)
- [ ] Same character - sitting pose
- [ ] 3 more characters (wizard, hacker, steampunk)
- [ ] Desk + Chair + Monitor (top 3 furniture items)
- [ ] Floor texture (wood) + Wall texture (gray)
- [ ] Spawn effect (6 frames)
- [ ] Remaining furniture items
- [ ] Remaining characters (space cadet, elf)
- [ ] UI elements
