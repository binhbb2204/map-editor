/**
 * MapGenerator — Procedural map generator with biome features.
 * Uses simplex noise for natural placement, auto-tiling for paths/rivers,
 * and modular house/farm/mountain cluster generation.
 */
import SimplexNoise from './SimplexNoise.js';

export default class MapGenerator {
  constructor(placement, assetBrowser, app) {
    this.placement = placement;
    this.assetBrowser = assetBrowser;
    this.app = app;
  }

  findExact(baseName) {
    return this.assetBrowser.catalog.find(a => {
      const fn = a.filename.split('/').pop();
      return fn === baseName;
    }) || null;
  }

  findFuzzy(prefix, avoidWords = []) {
    const matches = this.assetBrowser.catalog.filter(a => {
      const fn = a.filename.split('/').pop().toLowerCase();
      if (!fn.startsWith(prefix.toLowerCase())) return false;
      for (const w of avoidWords) if (fn.includes(w.toLowerCase())) return false;
      return true;
    });
    return matches.length > 0 ? matches[Math.floor(Math.random() * matches.length)] : null;
  }

  findFirst(...names) {
    for (const n of names) { const r = this.findExact(n); if (r) return r; }
    return null;
  }

  pickRandom(arr) { return arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)] : null; }

  // ============================================================
  // BIOME FEATURE SELECTION
  // ============================================================
  rollBiome() {
    return {
      has_river: Math.random() < 0.6,
      has_house: Math.random() < 0.65,
      has_mountain: Math.random() < 0.45,
      has_farm: Math.random() < 0.5,
      forest_density: ['none','sparse','sparse','dense'][Math.floor(Math.random()*4)]
    };
  }

  // ============================================================
  // PATH GENERATION — random walk from one edge to opposite
  // ============================================================
  generatePath(grid, w, h) {
    // Horizontal main path
    let pz = Math.floor(h * (0.35 + Math.random() * 0.3));
    for (let x = 0; x < w; x++) {
      if (grid[pz][x] === 'river') { grid[pz][x] = 'bridge'; }
      else grid[pz][x] = 'road';
      // Random vertical drift
      if (Math.random() < 0.15 && pz > 2 && pz < h - 3) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        pz += dir;
        if (grid[pz][x] === 'river') grid[pz][x] = 'bridge';
        else grid[pz][x] = 'road';
      }
    }
    this.mainPathZ = pz;
    return pz;
  }

  // ============================================================
  // RIVER GENERATION — sinuous walk top to bottom
  // ============================================================
  generateRiver(grid, w, h) {
    let rx = Math.floor(w * (0.2 + Math.random() * 0.3));
    for (let z = 0; z < h; z++) {
      if (grid[z][rx] === 'road') grid[z][rx] = 'bridge';
      else grid[z][rx] = 'river';
      if (Math.random() < 0.25 && rx > 2 && rx < w - 3) {
        const d = Math.random() < 0.5 ? -1 : 1;
        rx += d;
        if (grid[z][rx] === 'road') grid[z][rx] = 'bridge';
        else grid[z][rx] = 'river';
      }
    }
    this.riverX = rx;
  }

  // ============================================================
  // HOUSE CLUSTER — rectangular building with walls, door, roof
  // ============================================================
  generateHouse(grid, w, h) {
    // Find clear area away from river
    let cx, cz, tries = 0;
    do {
      cx = Math.floor(w * (0.5 + Math.random() * 0.3));
      cz = Math.floor(h * (0.2 + Math.random() * 0.3));
      tries++;
    } while (tries < 20 && this.areaHasType(grid, cx-3, cz-3, cx+3, cz+3, w, h, 'river'));

    const hw = 2 + Math.floor(Math.random() * 2); // half-width 2-3
    const hh = 2 + Math.floor(Math.random() * 2);
    const x1 = Math.max(1, cx - hw), x2 = Math.min(w-2, cx + hw);
    const z1 = Math.max(1, cz - hh), z2 = Math.min(h-2, cz + hh);

    // Walls on perimeter
    for (let x = x1; x <= x2; x++) {
      for (let z = z1; z <= z2; z++) {
        const onEdge = x === x1 || x === x2 || z === z1 || z === z2;
        if (onEdge) grid[z][x] = 'wall';
        else grid[z][x] = 'house_floor';
      }
    }
    // Door on south wall center
    const doorX = Math.floor((x1 + x2) / 2);
    grid[z2][doorX] = 'gate';
    // Path from door southward to connect to main path
    for (let z = z2 + 1; z < h && grid[z][doorX] === 'grass'; z++) {
      grid[z][doorX] = 'road';
      if (this.mainPathZ && z >= this.mainPathZ) break;
    }

    this.houseRect = { x1, z1, x2, z2, cx, cz };

    // Fence yard around house
    const fy1 = Math.max(0, z1-2), fy2 = Math.min(h-1, z2+2);
    const fx1 = Math.max(0, x1-2), fx2 = Math.min(w-1, x2+2);
    for (let x = fx1; x <= fx2; x++) {
      if (grid[fy1][x] === 'grass') grid[fy1][x] = 'fence';
      if (grid[fy2][x] === 'grass') grid[fy2][x] = 'fence';
    }
    for (let z = fy1; z <= fy2; z++) {
      if (grid[z][fx1] === 'grass') grid[z][fx1] = 'fence';
      if (grid[z][fx2] === 'grass') grid[z][fx2] = 'fence';
    }
    // Fence gate at door column
    if (fy2 < h && grid[fy2][doorX] === 'fence') grid[fy2][doorX] = 'fence_gate_cell';
  }

  areaHasType(grid, x1, z1, x2, z2, w, h, type) {
    for (let z = Math.max(0,z1); z <= Math.min(h-1,z2); z++)
      for (let x = Math.max(0,x1); x <= Math.min(w-1,x2); x++)
        if (grid[z][x] === type) return true;
    return false;
  }

  // ============================================================
  // MOUNTAIN CLUSTER — cliff blocks in a corner
  // ============================================================
  generateMountain(grid, w, h) {
    // Pick a corner
    const corners = [[0,0],[w-1,0],[0,h-1],[w-1,h-1]];
    const [anchorX, anchorZ] = this.pickRandom(corners);
    const radius = Math.min(6, Math.floor(Math.min(w,h)/4));
    const possibleCaves = [];

    for (let z = 0; z < h; z++) {
      for (let x = 0; x < w; x++) {
        const dist = Math.sqrt((x-anchorX)**2 + (z-anchorZ)**2);
        if (dist < radius && grid[z][x] === 'grass') {
          if (dist < radius * 0.5) {
            grid[z][x] = 'cliff_high';
            if (dist > radius * 0.5 - 1.5) possibleCaves.push({x, z});
          }
          else if (dist < radius * 0.8) grid[z][x] = 'cliff_low';
          else grid[z][x] = 'rock';
        }
        // Edge cliffs
        const edgeDist = Math.min(x, z, w-1-x, h-1-z);
        if (edgeDist === 0 && grid[z][x] === 'grass' && Math.random() < 0.4) {
          grid[z][x] = 'cliff_high';
        }
      }
    }

    if (possibleCaves.length > 0 && Math.random() < 0.4) {
      const cave = this.pickRandom(possibleCaves);
      grid[cave.z][cave.x] = 'cliff_cave';
    }
  }

  // ============================================================
  // FARM — crop rows near house or river
  // ============================================================
  generateFarm(grid, w, h) {
    let startX, startZ;
    if (this.houseRect) {
      startX = this.houseRect.x2 + 3;
      startZ = this.houseRect.z1;
    } else {
      startX = Math.floor(w * 0.6);
      startZ = Math.floor(h * 0.6);
    }
    const farmW = 3 + Math.floor(Math.random() * 3);
    const farmH = 3 + Math.floor(Math.random() * 3);
    for (let dz = 0; dz < farmH; dz++) {
      for (let dx = 0; dx < farmW; dx++) {
        const x = startX + dx, z = startZ + dz;
        if (x >= 0 && x < w && z >= 0 && z < h && grid[z][x] === 'grass') {
          grid[z][x] = (dz % 2 === 0) ? 'crop_row' : 'crop_plant';
        }
      }
    }
  }

  // ============================================================
  // AUTO-TILE HELPER
  // ============================================================
  autoTile(typeId, x, z, grid, w, h, straight, bend, cross, split) {
    const get = (gx, gz) => (gz >= 0 && gz < h && gx >= 0 && gx < w) ? grid[gz][gx] : null;
    const isSame = (gx, gz) => {
      const c = get(gx, gz);
      if (c === typeId) return true;
      if (typeId === 'road' && (c === 'gate' || c === 'bridge' || c === 'fence_gate_cell')) return true;
      if (typeId === 'river' && c === 'bridge') return true;
      return false;
    };
    
    // N=1, E=2, S=4, W=8
    const N = isSame(x, z-1) ? 1 : 0;
    const E = isSame(x+1, z) ? 2 : 0;
    const S = isSame(x, z+1) ? 4 : 0;
    const W = isSame(x-1, z) ? 8 : 0;
    const mask = N | E | S | W;

    let asset = straight, rot = 0;
    
    // Explicit lookup table for rotations based on bitmask
    switch (mask) {
      case 0: // Isolated
      case 1: // North only
      case 4: // South only
      case 5: // North + South
        asset = straight; rot = 0; break;
      case 2: // East only
      case 8: // West only
      case 10: // East + West
        asset = straight; rot = 90; break;
      
      case 6: // South + East
        asset = bend || straight; rot = 0; break;
      case 3: // North + East
        asset = bend || straight; rot = 90; break;
      case 9: // North + West
        asset = bend || straight; rot = 180; break;
      case 12: // South + West
        asset = bend || straight; rot = 270; break;
        
      case 14: // South + East + West (missing North)
        asset = split || straight; rot = 0; break;
      case 7: // North + East + South (missing West)
        asset = split || straight; rot = 90; break;
      case 11: // North + East + West (missing South)
        asset = split || straight; rot = 180; break;
      case 13: // North + South + West (missing East)
        asset = split || straight; rot = 270; break;
        
      case 15: // All 4 directions
        asset = cross || straight; rot = 0; break;
    }
    
    return { asset, rot };
  }

  // ============================================================
  // AUTO-TILE FOR WALLS & FENCES (Preserves outward facing)
  // ============================================================
  autoTileWall(typeId, x, z, grid, w, h, straight, corner) {
    const get = (gx, gz) => (gz >= 0 && gz < h && gx >= 0 && gx < w) ? grid[gz][gx] : null;
    const isSame = (gx, gz) => {
      const c = get(gx, gz);
      return c === typeId || c === 'gate' || c === 'fence_gate_cell';
    };
    
    const N = isSame(x, z-1) ? 1 : 0;
    const E = isSame(x+1, z) ? 2 : 0;
    const S = isSame(x, z+1) ? 4 : 0;
    const W = isSame(x-1, z) ? 8 : 0;
    const mask = N | E | S | W;
    
    let asset = straight, rot = 0, isCorner = false;
    switch (mask) {
      case 5: asset = straight; rot = 90; break; // N+S
      case 10: asset = straight; rot = 0; break; // E+W
      case 6: asset = corner || straight; rot = 0; isCorner = true; break; // S+E (NW corner)
      case 3: asset = corner || straight; rot = 90; isCorner = true; break; // N+E (SW)
      case 9: asset = corner || straight; rot = 180; isCorner = true; break; // N+W (SE)
      case 12: asset = corner || straight; rot = 270; isCorner = true; break; // S+W (NE)
      default: asset = straight; rot = 0; break;
    }
    return { asset, rot, isCorner, mask };
  }

  // ============================================================
  // MAIN GENERATE
  // ============================================================
  async generate() {
    if (this.assetBrowser.catalog.length === 0) {
      alert("Please load a kit first!"); return;
    }

    const w = this.placement.gridW;
    const h = this.placement.gridH;
    const seed = Math.random() * 65536;
    const noise = new SimplexNoise(seed);
    const biome = this.rollBiome();
    this.houseRect = null;
    this.mainPathZ = null;
    this.riverX = null;

    // ---- ASSET DISCOVERY ----
    const grassAsset = this.findFirst('ground_grass.glb','platform_grass.glb') || this.assetBrowser.catalog[0];
    const riverStraight = this.findFirst('ground_riverStraight.glb');
    const riverBend = this.findFirst('ground_riverBend.glb');
    const riverCross = this.findFirst('ground_riverCross.glb') || riverStraight;
    const riverSplit = this.findFirst('ground_riverSplit.glb') || riverStraight;
    const pathStraight = this.findFirst('ground_pathStraight.glb','road.glb');
    const pathBend = this.findFirst('ground_pathBend.glb','road-bend.glb');
    const pathCross = this.findFirst('ground_pathCross.glb');
    const pathSplit = this.findFirst('ground_pathSplit.glb');
    const bridgeAsset = this.findFirst('bridge_wood.glb','bridge_stone.glb');
    const wallPiece = this.findFirst('wall.glb');
    const wallCornerPc = this.findFirst('wall-corner.glb');
    const wallDoorPc = this.findFirst('wall-door.glb','wall-doorway-square.glb');
    const wallWindowPc = this.findFirst('wall-window-glass.glb','wall-window-shutters.glb');
    const roofPiece = this.findFirst('roof.glb','roof-flat.glb');
    const roofCornerPc = this.findFirst('roof-corner.glb');
    const roofGablePc = this.findFirst('roof-gable.glb','roof.glb');
    const roofFlatPc = this.findFirst('roof-flat.glb', 'roof.glb');
    const cliffBlock = this.findFirst('cliff_block_rock.glb','cliff_rock.glb');
    const cliffHalf = this.findFirst('cliff_half_rock.glb') || cliffBlock;
    const cliffTop = this.findFirst('cliff_top_rock.glb') || cliffBlock;
    const cliffSteps = this.findFirst('cliff_steps_rock.glb');
    const fenceAsset = this.findFirst('fence_simple.glb','fence.glb');
    const fenceCorner = this.findFirst('fence_corner.glb','fence_bend.glb');
    const fenceGateAsset = this.findFirst('fence_gate.glb','fence-gate.glb');
    const dirtRow = this.findFirst('crops_dirtRow.glb');
    const cropAssets = ['crop_carrot.glb','crop_melon.glb','crop_pumpkin.glb','crop_turnip.glb']
      .map(n => this.findExact(n)).filter(Boolean);
    const cropGrowth = ['crops_cornStageD.glb','crops_wheatStageB.glb','crops_bambooStageB.glb']
      .map(n => this.findExact(n)).filter(Boolean);
    const fountainAsset = this.findFirst('fountain-round.glb','fountain-square.glb','statue_obelisk.glb');

    // Tree collections by density
    const treeTypes = ['tree_oak.glb','tree_default.glb','tree_fat.glb','tree_pineTallA.glb',
      'tree_thin.glb','tree_small.glb','tree_cone.glb','tree_detailed.glb'];
    const treeAssets = treeTypes.map(n => this.findExact(n)).filter(Boolean);
    if (treeAssets.length === 0) { const t = this.findFuzzy('tree'); if (t) treeAssets.push(t); }

    const decorNames = ['stall','tent','cart','lantern','barrel','campfire','pot','sign','log_stack','chest','workbench'];
    const decorAssets = decorNames.map(n => this.findFuzzy(n)).filter(Boolean);
    const flowerAssets = ['flower_redA.glb','flower_purpleA.glb','flower_yellowA.glb']
      .map(n => this.findExact(n)).filter(Boolean);
    const rockAssets = ['rock_largeA.glb','rock_smallA.glb','stone_largeA.glb']
      .map(n => this.findExact(n)).filter(Boolean);
    const bushAssets = ['plant_bush.glb','plant_bushLarge.glb','plant_bushSmall.glb']
      .map(n => this.findExact(n)).filter(Boolean);
    const grassDecor = ['grass.glb','grass_large.glb','grass_leafs.glb']
      .map(n => this.findExact(n)).filter(Boolean);
    const mushroomAssets = ['mushroom_red.glb','mushroom_tan.glb']
      .map(n => this.findExact(n)).filter(Boolean);

    // ---- BUILD LOGICAL GRID ----
    const grid = Array.from({ length: h }, () => Array(w).fill('grass'));

    // Order matters: river first, then path (so bridges work), then structures
    if (biome.has_river && riverStraight) this.generateRiver(grid, w, h);
    if (pathStraight) this.generatePath(grid, w, h);
    if (biome.has_house && wallPiece) this.generateHouse(grid, w, h);
    if (biome.has_mountain && cliffBlock) this.generateMountain(grid, w, h);
    if (biome.has_farm && dirtRow) this.generateFarm(grid, w, h);

    // ---- PLACE 3D OBJECTS ----
    this.placement.resetGrid(w, h);

    const get = (gx, gz) => (gz >= 0 && gz < h && gx >= 0 && gx < w) ? grid[gz][gx] : null;

    for (let z = 0; z < h; z++) {
      for (let x = 0; x < w; x++) {
        const type = grid[z][x];
        const rot4 = () => Math.floor(Math.random()*4)*90;

        // Always place grass base
        await this.placement.placeAsset('ground', x, z, grassAsset, 0, true);

        // ---- RIVER ----
        if (type === 'river' && riverStraight) {
          const t = this.autoTile('river', x, z, grid, w, h, riverStraight, riverBend, riverCross, riverSplit);
          await this.placement.placeAsset('ground', x, z, t.asset, t.rot, true);
        }
        // ---- ROAD ----
        else if (type === 'road' && pathStraight) {
          const t = this.autoTile('road', x, z, grid, w, h, pathStraight, pathBend, pathCross, pathSplit);
          await this.placement.placeAsset('ground', x, z, t.asset, t.rot, true);
        }
        // ---- BRIDGE ----
        else if (type === 'bridge') {
          if (riverStraight) {
            const t = this.autoTile('river', x, z, grid, w, h, riverStraight, riverBend, riverCross, riverSplit);
            await this.placement.placeAsset('ground', x, z, t.asset, t.rot, true);
          }
          if (bridgeAsset) {
            // Align bridge with river direction
            const rivE = get(x+1, z)==='river' || get(x-1, z)==='river';
            const bRot = rivE ? 90 : 0;
            await this.placement.placeAsset('prop', x, z, bridgeAsset, bRot, true);
          }
        }
        // ---- WALL ----
        else if (type === 'wall' && wallPiece && this.houseRect) {
          const hr = this.houseRect;
          const isCorner = (x===hr.x1||x===hr.x2)&&(z===hr.z1||z===hr.z2);
          if (isCorner && wallCornerPc) {
            let cRot = 0;
            if (x===hr.x1&&z===hr.z1) cRot=0;       // NW
            else if (x===hr.x1&&z===hr.z2) cRot=90; // SW
            else if (x===hr.x2&&z===hr.z2) cRot=180;// SE
            else cRot=270;                          // NE
            await this.placement.placeAsset('prop', x, z, wallCornerPc, cRot, true);
          } else {
            const useWindow = wallWindowPc && Math.random() < 0.35;
            const wAsset = useWindow ? wallWindowPc : wallPiece;
            let wRot = 0;
            let edgeName = '';
            
            // As per explicit rule:
            // TOP/BOTTOM (dọc theo Ox): 90 hoặc 270
            // LEFT/RIGHT (dọc theo Oz): 0 hoặc 180
            if (z === hr.z1) { wRot = 90; edgeName = 'TOP/BOTTOM (-Oz)'; }
            else if (z === hr.z2) { wRot = 270; edgeName = 'TOP/BOTTOM (+Oz)'; }
            else if (x === hr.x1) { wRot = 0; edgeName = 'LEFT/RIGHT (-Ox)'; }
            else { wRot = 180; edgeName = 'LEFT/RIGHT (+Ox)'; }
            
            await this.placement.placeAsset('prop', x, z, wAsset, wRot, true);
            
            // Log exactly 8 walls for verification as requested
            if (this.debugWallLogCount === undefined) this.debugWallLogCount = 0;
            if (this.debugWallLogCount < 8) {
              console.log(`[Wall Debug] Placed wall at Grid(${x}, ${z}). Edge: ${edgeName}. Assigned Rotation: ${wRot}`);
              this.debugWallLogCount++;
            }
          }
        }
        // ---- GATE (door in wall) ----
        else if (type === 'gate') {
          if (pathStraight) {
            const t = this.autoTile('road', x, z, grid, w, h, pathStraight, pathBend, pathCross, pathSplit);
            await this.placement.placeAsset('ground', x, z, t.asset, t.rot, true);
          }
          if (wallDoorPc) {
            let gateRot = 0;
            if (this.houseRect) {
              if (z===this.houseRect.z1) gateRot = 90;
              else if (z===this.houseRect.z2) gateRot = 270;
              else if (x===this.houseRect.x1) gateRot = 0;
              else gateRot = 180;
            }
            await this.placement.placeAsset('prop', x, z, wallDoorPc, gateRot, true);
          }
        }
        // ---- HOUSE FLOOR ----
        else if (type === 'house_floor') {
          // Interior decor
          if (decorAssets.length > 0 && Math.random() < 0.25) {
            await this.placement.placeAsset('prop', x, z, this.pickRandom(decorAssets), rot4(), true);
          }
        }
        // ---- FENCE ----
        else if (type === 'fence' && fenceAsset) {
          const t = this.autoTileWall('fence', x, z, grid, w, h, fenceAsset, fenceCorner);
          await this.placement.placeAsset('prop', x, z, t.asset, t.rot, true);
        }
        else if (type === 'fence_gate_cell') {
          if (fenceGateAsset) await this.placement.placeAsset('prop', x, z, fenceGateAsset, 90, true);
          else if (fenceAsset) await this.placement.placeAsset('prop', x, z, fenceAsset, 90, true);
        }
        // ---- CLIFF CAVE ----
        else if (type === 'cliff_cave') {
          const cave = this.findFirst('cliff_cave_rock.glb', 'cliff_cave_stone.glb', 'cliff_rock.glb') || cliffBlock;
          if (cave) {
            let cRot = 0;
            if (get(x, z+1) === 'grass' || get(x, z+1) === 'mountain_buffer') cRot = 0;
            else if (get(x, z-1) === 'grass' || get(x, z-1) === 'mountain_buffer') cRot = 180;
            else if (get(x+1, z) === 'grass' || get(x+1, z) === 'mountain_buffer') cRot = 90;
            else cRot = 270;
            await this.placement.placeAsset('prop', x, z, cave, cRot, true);
          }
        }
        // ---- CLIFF/MOUNTAIN ----
        else if (type === 'cliff_high' && cliffBlock) {
          await this.placement.placeAsset('prop', x, z, cliffBlock, rot4(), true);
          if (Math.random() < 0.5) {
            await this.placement.placeAsset('prop', x, z, cliffTop || cliffBlock, rot4(), true);
          }
        }
        else if (type === 'cliff_low') {
          const piece = Math.random() < 0.5 ? cliffHalf : cliffBlock;
          if (piece) await this.placement.placeAsset('prop', x, z, piece, rot4(), true);
        }
        else if (type === 'rock') {
          const r = this.pickRandom(rockAssets);
          if (r) await this.placement.placeAsset('prop', x, z, r, rot4(), true);
        }
        // ---- FARM ----
        else if (type === 'crop_row' && dirtRow) {
          await this.placement.placeAsset('ground', x, z, dirtRow, 0, true);
          if (cropGrowth.length > 0 && Math.random() < 0.7) {
            await this.placement.placeAsset('prop', x, z, this.pickRandom(cropGrowth), 0, true);
          }
        }
        else if (type === 'crop_plant') {
          if (dirtRow) await this.placement.placeAsset('ground', x, z, dirtRow, 0, true);
          if (cropAssets.length > 0) {
            await this.placement.placeAsset('prop', x, z, this.pickRandom(cropAssets), rot4(), true);
          }
        }

        // ---- Town center fountain ----
        if (this.houseRect && x === this.houseRect.cx && z === this.houseRect.cz && fountainAsset) {
          await this.placement.placeAsset('prop', x, z, fountainAsset, 0, true);
        }
        
        // ---- EDGE CLIFFS (Phase 1 macro placement) ----
        if (type === 'grass') {
          const edgeDist = Math.min(x, z, w-1-x, h-1-z);
          if (edgeDist === 0 && cliffBlock && Math.random() < 0.4) {
            await this.placement.placeAsset('prop', x, z, cliffBlock, rot4(), true);
            grid[z][x] = 'cliff_edge'; // Change type to prevent trees from logically spawning
          }
        }
      }
    }
    
    // ---- ROOF (Placed exactly once per building to avoid overlapping meshes) ----
    if (this.houseRect) {
      const { cx, cz } = this.houseRect;
      const roofToPlace = roofGablePc || roofPiece || roofFlatPc;
      if (roofToPlace) {
        await this.placement.placeAsset('prop', cx, cz, roofToPlace, 0, true);
      }
    }

    // ============================================================
    // PHASE 2: NATURE SCATTER WITH LOGICAL OCCUPIED CHECK
    // ============================================================
    if (this.placement.removeSpecificAsset) {
      console.log(`[MapGenerator DEBUG] Phase 2 start. Biome forest_density parameter: ${biome.forest_density}`);
      let totalTreeCandidates = 0;
      let totalTreesPlaced = 0;
      let filterReasons = { 'cliff': 0, 'structure': 0 };

      // Make sure scene transform is updated just in case for placed props
      if (this.app.scene && this.app.scene.updateMatrixWorld) {
        this.app.scene.updateMatrixWorld(true);
      }
      
      const occupiedBoxes = [];
      // Build occupied-set from all macro structures
      this.placement.forEachCell(this.placement.propLayer, (cellArr, px, pz) => {
        if (cellArr) {
          for (const c of cellArr) {
            if (c.asset.includes('cliff') || c.asset.includes('rock') || c.asset.includes('wall') || c.asset.includes('roof')) {
              occupiedBoxes.push({ category: c.asset.includes('cliff') ? 'cliff' : 'structure', x: px, z: pz });
            }
          }
        }
      });
      
      for (let z = 0; z < h; z++) {
        for (let x = 0; x < w; x++) {
          const type = grid[z][x];
          const rot4 = () => Math.floor(Math.random()*4)*90;
          
          if (type === 'grass') {
            const nVal = noise.fractal(x * 0.08, z * 0.08, 3);
            const nVal2 = noise.fractal(x * 0.12 + 50, z * 0.12 + 50, 2);
  
            // Force a predictable treeThreshold if 'none' to guarantee spawns for debugging
            let treeThreshold = 1.1;
            if (biome.forest_density === 'dense') treeThreshold = 0.42;
            else if (biome.forest_density === 'sparse') treeThreshold = 0.58;
            else if (biome.forest_density === 'none') {
               // DEBUG OVERRIDE: ensure it's not totally barren if we are debugging
               treeThreshold = 0.65; 
            }
            
            let placedObjs = [];
  
            if (nVal > treeThreshold && treeAssets.length > 0) {
              totalTreeCandidates++;
              const treeAssetToPlace = this.pickRandom(treeAssets);
              const t = await this.placement.placeAsset('prop', x, z, treeAssetToPlace, rot4(), true);
              if (t) {
                placedObjs.push(t);
                // Detailed debug for the first 3 placed trees
                if (totalTreesPlaced < 3) {
                   console.log(`[Tree Debug] Candidate Tree added to scene at Grid(${x}, ${z}). Asset: ${treeAssetToPlace.filename}. Scale X: ${t.scale.x.toFixed(2)}`);
                }
                
                if (Math.random() < 0.3 && bushAssets.length > 0) {
                  const b = await this.placement.placeAsset('prop', x, z, this.pickRandom(bushAssets), rot4(), true);
                  if (b) placedObjs.push(b);
                }
              }
            } else if (nVal2 > 0.65 && rockAssets.length > 0 && Math.random() < 0.3) {
              const o = await this.placement.placeAsset('prop', x, z, this.pickRandom(rockAssets), rot4(), true);
              if (o) placedObjs.push(o);
            } else if (nVal2 < 0.3 && flowerAssets.length > 0 && Math.random() < 0.15) {
              const o = await this.placement.placeAsset('prop', x, z, this.pickRandom(flowerAssets), rot4(), true);
              if (o) placedObjs.push(o);
            } else if (grassDecor.length > 0 && Math.random() < 0.12) {
              const o = await this.placement.placeAsset('prop', x, z, this.pickRandom(grassDecor), rot4(), true);
              if (o) placedObjs.push(o);
            } else if (mushroomAssets.length > 0 && nVal > 0.5 && Math.random() < 0.04) {
              const o = await this.placement.placeAsset('prop', x, z, this.pickRandom(mushroomAssets), rot4(), true);
              if (o) placedObjs.push(o);
            }
            
            // Real-time occupied-set check against structural footprints using logical coordinates
            if (placedObjs.length > 0) {
              let overlap = false;
              let filterReason = '';
              for (const ob of occupiedBoxes) {
                const dx = Math.abs(x - ob.x);
                const dz = Math.abs(z - ob.z);
                
                if (ob.category === 'cliff') {
                  if (dx <= 1 && dz <= 1) { overlap = true; filterReason = 'cliff'; break; } // 1-cell buffer for cliffs
                } else {
                  if (dx === 0 && dz === 0) { overlap = true; filterReason = 'structure'; break; } // Exact match for walls/houses
                }
              }
              
              if (overlap) {
                placedObjs.forEach(obj => this.placement.removeSpecificAsset('prop', x, z, obj, true));
                if (placedObjs[0] && placedObjs[0].name !== 'rock') filterReasons[filterReason]++;
              } else if (nVal > treeThreshold && treeAssets.length > 0) {
                totalTreesPlaced++;
              }
            }
          }
        }
      }
      
      console.log(`[MapGenerator DEBUG] Tree Placement Summary:`);
      console.log(`   - Biome forest_density: ${biome.forest_density} (Adjusted Threshold: ${biome.forest_density==='none' ? 0.65 : (biome.forest_density==='dense' ? 0.42 : 0.58)})`);
      console.log(`   - Total tree candidate cells (before filter): ${totalTreeCandidates}`);
      console.log(`   - Total cells filtered by occupied-mask: ${filterReasons.cliff + filterReasons.structure} (Cliffs: ${filterReasons.cliff}, Structures: ${filterReasons.structure})`);
      console.log(`   - Total trees ACTUALLY placed in scene: ${totalTreesPlaced}`);
      if (totalTreeCandidates > 0 && totalTreesPlaced === 0) {
        console.warn(`   - CRITICAL WARNING: 100% of trees were filtered out or failed to load. Check Asset paths and occupied rules!`);
      }
    }

    // Build biome summary
    const features = [];
    if (biome.has_river) features.push('river');
    if (biome.has_house) features.push('house cluster');
    if (biome.has_mountain) features.push('mountain');
    if (biome.has_farm) features.push('farm');
    if (biome.forest_density !== 'none') features.push(`${biome.forest_density} forest`);
    const summary = features.length > 0 ? features.join(' + ') : 'open grassland';

    this.lastBiomeSummary = summary;
    this.lastSeed = seed;
    console.log(`[MapGen] seed=${seed.toFixed(0)}, biome: ${summary}`);

    this.placement.pushHistory({ type: 'generate_map', w, h, biome_summary: summary });
  }
}
