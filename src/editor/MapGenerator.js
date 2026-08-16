/**
 * MapGenerator — Enhanced Procedural Generator for 50x50 Fantasy & Medieval Maps.
 * Features:
 *   - Customizable options (World Theme, Tree Styles [Fantasy vs Nature vs Mixed], Forest Density,
 *     River, Roads, Plaza/Fountains, Hedge Gardens, Marketplaces, Houses, Farmlands, Mountains).
 *   - Grand Town Plaza with center Fountains (round/square), lanterns, pillars, and banners.
 *   - Royal Hedge Gardens & Courtyards with Hedges, Hedge Gates, statues, trimmed bushes, and flowerbeds.
 *   - Vibrant Marketplace with stalls (red/green/wood), market carts, and seating.
 *   - Multi-building Village & Manors with walls, windows, doors, chimneys, balconies, and rooves.
 *   - Meandering River with Watermill, fishing pier, canoe, and stone/wood bridges.
 *   - Agricultural Farmland with Windmill and vegetable crop rows.
 *   - Mountain Fortress & Cliff Plateaus with cave entrances and stone staircases.
 *   - Organic Fantasy Nature Scatter (trees, wildflowers, mushrooms, bushes, rocks) with Simplex noise.
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
    for (const n of names) {
      const r = this.findExact(n);
      if (r) return r;
    }
    return null;
  }

  pickRandom(arr) {
    return (arr && arr.length > 0) ? arr[Math.floor(Math.random() * arr.length)] : null;
  }

  // ============================================================
  // BIOME & THEME SELECTION
  // ============================================================
  rollBiome() {
    const themes = [
      'fantasy_kingdom',
      'emerald_sanctuary',
      'riverside_haven',
      'mountain_stronghold',
      'mixed_wonderland'
    ];
    const theme = this.pickRandom(themes);

    return {
      theme,
      has_river: theme !== 'mountain_stronghold' ? (Math.random() < 0.75) : (Math.random() < 0.3),
      has_plaza: true,
      has_hedge_garden: true,
      has_market: theme !== 'emerald_sanctuary' ? (Math.random() < 0.85) : (Math.random() < 0.4),
      has_village: true,
      house_count: 3,
      has_farm: Math.random() < 0.7,
      has_watermill: Math.random() < 0.8,
      has_mountain: theme === 'mountain_stronghold' || Math.random() < 0.65,
      forest_density: 'medium',
      tree_style: theme === 'nature_wilderness' ? 'nature' : (theme === 'mixed_wonderland' ? 'mixed' : 'fantasy'),
      road_type: 'road',
      fountain_type: 'round'
    };
  }

  // ============================================================
  // RIVER GENERATION — Sinuous path across the map
  // ============================================================
  generateRiver(grid, w, h) {
    let rx = Math.floor(w * (0.2 + Math.random() * 0.25));
    const riverCoords = [];
    
    for (let z = 0; z < h; z++) {
      grid[z][rx] = 'river';
      riverCoords.push({ x: rx, z });
      
      // Random sinuous wandering
      if (Math.random() < 0.35 && rx > 3 && rx < w - 4) {
        const d = Math.random() < 0.5 ? -1 : 1;
        rx += d;
        grid[z][rx] = 'river';
        riverCoords.push({ x: rx, z });
      }
    }
    this.riverCoords = riverCoords;
    this.riverX = rx;
  }

  // ============================================================
  // ROAD NETWORK GENERATION
  // ============================================================
  generateRoads(grid, w, h, plazaCenter) {
    const roadCoords = [];
    const pz = plazaCenter ? plazaCenter.cz : Math.floor(h * 0.5);
    const px = plazaCenter ? plazaCenter.cx : Math.floor(w * 0.5);

    // East-West Main Thoroughfare
    for (let x = 0; x < w; x++) {
      if (grid[pz][x] === 'river') {
        grid[pz][x] = 'bridge';
      } else if (grid[pz][x] === 'grass') {
        grid[pz][x] = 'road';
      }
      roadCoords.push({ x, z: pz });
    }

    // North-South Boulevard through Plaza
    for (let z = 0; z < h; z++) {
      if (grid[z][px] === 'river') {
        grid[z][px] = 'bridge';
      } else if (grid[z][px] === 'grass') {
        grid[z][px] = 'road';
      }
      roadCoords.push({ x: px, z });
    }

    this.mainRoads = roadCoords;
    this.mainPathZ = pz;
    this.mainPathX = px;
  }

  // ============================================================
  // GRAND TOWN PLAZA (Central Fountain Square)
  // ============================================================
  generateGrandPlaza(grid, w, h, cx, cz) {
    const radius = 3; // 7x7 square plaza
    const x1 = Math.max(1, cx - radius), x2 = Math.min(w - 2, cx + radius);
    const z1 = Math.max(1, cz - radius), z2 = Math.min(h - 2, cz + radius);

    for (let z = z1; z <= z2; z++) {
      for (let x = x1; x <= x2; x++) {
        if (grid[z][x] !== 'river' && grid[z][x] !== 'bridge') {
          grid[z][x] = 'plaza';
        }
      }
    }

    // Center fountain
    grid[cz][cx] = 'fountain';

    // Corner decorative pillars/lanterns/banners
    grid[z1][x1] = 'plaza_pillar';
    grid[z1][x2] = 'plaza_pillar';
    grid[z2][x1] = 'plaza_pillar';
    grid[z2][x2] = 'plaza_pillar';

    // Benches / lanterns around fountain
    if (cz - 1 >= z1) grid[cz - 1][cx] = 'plaza_bench';
    if (cz + 1 <= z2) grid[cz + 1][cx] = 'plaza_bench';
    if (cx - 1 >= x1) grid[cz][cx - 1] = 'plaza_lantern';
    if (cx + 1 <= x2) grid[cz][cx + 1] = 'plaza_lantern';

    this.plazaRect = { x1, z1, x2, z2, cx, cz };
  }

  // ============================================================
  // ROYAL HEDGE GARDEN & COURTYARD (Hedges, Hedge Gates, Statues)
  // ============================================================
  generateHedgeGarden(grid, w, h) {
    const gw = 7 + Math.floor(Math.random() * 2);
    const gh = 7 + Math.floor(Math.random() * 2);
    
    let gx1 = 0, gz1 = 0, found = false;
    const candidates = [
      { x: Math.floor(w * 0.65), z: Math.floor(h * 0.2) },
      { x: Math.floor(w * 0.65), z: Math.floor(h * 0.65) },
      { x: Math.floor(w * 0.25), z: Math.floor(h * 0.65) },
      { x: Math.floor(w * 0.2), z: Math.floor(h * 0.2) }
    ];

    for (const cand of candidates) {
      const x2 = cand.x + gw, z2 = cand.z + gh;
      if (x2 < w - 2 && z2 < h - 2 && !this.areaHasType(grid, cand.x - 1, cand.z - 1, x2 + 1, z2 + 1, w, h, ['river', 'bridge', 'plaza', 'wall_stone', 'wall_wood', 'cliff_high'])) {
        gx1 = cand.x;
        gz1 = cand.z;
        found = true;
        break;
      }
    }

    if (!found) {
      gx1 = Math.max(2, Math.floor(w * 0.6));
      gz1 = Math.max(2, Math.floor(h * 0.2));
    }

    const gx2 = Math.min(w - 3, gx1 + gw);
    const gz2 = Math.min(h - 3, gz1 + gh);
    const gcx = Math.floor((gx1 + gx2) / 2);
    const gcz = Math.floor((gz1 + gz2) / 2);

    // Build Hedge perimeter
    for (let x = gx1; x <= gx2; x++) {
      for (let z = gz1; z <= gz2; z++) {
        const isEdge = (x === gx1 || x === gx2 || z === gz1 || z === gz2);
        if (isEdge) {
          grid[z][x] = 'hedge';
        } else {
          grid[z][x] = 'garden_floor';
        }
      }
    }

    // Hedge Gate on South edge (or edge closest to road)
    const gateX = gcx;
    const gateZ = gz2;
    grid[gateZ][gateX] = 'hedge_gate';

    // Cross stone pathways inside garden
    for (let x = gx1 + 1; x < gx2; x++) grid[gcz][x] = 'garden_path';
    for (let z = gz1 + 1; z < gz2; z++) grid[z][gcx] = 'garden_path';

    // Center statue or secondary fountain
    grid[gcz][gcx] = (Math.random() < 0.6) ? 'garden_statue' : 'garden_fountain';

    // Flower beds and ornamental bushes in 4 quadrants
    const quads = [
      { x: gx1 + 1, z: gz1 + 1 },
      { x: gx2 - 1, z: gz1 + 1 },
      { x: gx1 + 1, z: gz2 - 1 },
      { x: gx2 - 1, z: gz2 - 1 }
    ];
    for (const q of quads) {
      if (grid[q.z][q.x] === 'garden_floor') {
        grid[q.z][q.x] = (Math.random() < 0.5) ? 'garden_flower' : 'garden_bush';
      }
    }

    // Connect hedge gate to main path
    for (let z = gz2 + 1; z < h; z++) {
      if (grid[z][gateX] === 'road' || grid[z][gateX] === 'plaza') break;
      if (grid[z][gateX] === 'grass') grid[z][gateX] = 'road';
    }

    this.hedgeGarden = { x1: gx1, z1: gz1, x2: gx2, z2: gz2, cx: gcx, cz: gcz, gateX, gateZ };
  }

  // ============================================================
  // VIBRANT MARKET DISTRICT (Stalls, Carts, Benches, Lanterns)
  // ============================================================
  generateMarketplace(grid, w, h, plazaCenter) {
    const pz = plazaCenter ? plazaCenter.cz : Math.floor(h * 0.5);
    const px = plazaCenter ? plazaCenter.cx : Math.floor(w * 0.5);

    // Place market stalls along the East road next to plaza
    const startX = px + 4;
    const endX = Math.min(w - 4, startX + 6);

    for (let x = startX; x <= endX; x += 2) {
      // North side of road: Stalls
      if (pz - 1 >= 0 && grid[pz - 1][x] === 'grass') {
        const stallType = ['market_stall_red', 'market_stall_green', 'market_stall_wood'][Math.floor(Math.random() * 3)];
        grid[pz - 1][x] = stallType;
        if (x + 1 <= endX && grid[pz - 1][x + 1] === 'grass') grid[pz - 1][x + 1] = 'market_cart';
      }
      // South side of road: Carts, Benches, Barrels
      if (pz + 1 < h && grid[pz + 1][x] === 'grass') {
        grid[pz + 1][x] = (Math.random() < 0.5) ? 'market_bench' : 'market_crate';
        if (x + 1 <= endX && grid[pz + 1][x + 1] === 'grass') grid[pz + 1][x + 1] = 'plaza_lantern';
      }
    }
  }

  // ============================================================
  // MULTI-BUILDING VILLAGE & HOUSES (Manor, Cottages, Outposts)
  // ============================================================
  generateVillageHouses(grid, w, h, count = 3) {
    this.houses = [];
    if (count <= 0) return;

    const houseConfigs = [
      { name: 'manor', w: 3, h: 3, isStone: true, hasChimney: true, hasFence: true },
      { name: 'cottage', w: 2, h: 3, isStone: false, hasChimney: true, hasFence: true },
      { name: 'outpost', w: 2, h: 2, isStone: true, hasChimney: false, hasFence: false, isFlatRoof: true },
      { name: 'cabin', w: 3, h: 2, isStone: false, hasChimney: true, hasFence: false }
    ];

    const attempts = [
      { x: Math.floor(w * 0.45), z: Math.floor(h * 0.25) },
      { x: Math.floor(w * 0.28), z: Math.floor(h * 0.35) },
      { x: Math.floor(w * 0.45), z: Math.floor(h * 0.65) },
      { x: Math.floor(w * 0.72), z: Math.floor(h * 0.45) },
      { x: Math.floor(w * 0.25), z: Math.floor(h * 0.75) }
    ];

    let houseIdx = 0;
    for (const cand of attempts) {
      if (houseIdx >= count) break;
      const cfg = houseConfigs[houseIdx % houseConfigs.length];
      const hw = cfg.w, hh = cfg.h;
      const x1 = cand.x, z1 = cand.z;
      const x2 = x1 + hw - 1, z2 = z1 + hh - 1;

      if (x2 < w - 2 && z2 < h - 2 && !this.areaHasType(grid, x1 - 2, z1 - 2, x2 + 2, z2 + 2, w, h, ['river', 'bridge', 'plaza', 'hedge', 'wall_stone', 'wall_wood', 'cliff_high'])) {
        // Walls and Floors
        for (let x = x1; x <= x2; x++) {
          for (let z = z1; z <= z2; z++) {
            const onEdge = (x === x1 || x === x2 || z === z1 || z === z2);
            if (onEdge) {
              grid[z][x] = cfg.isStone ? 'wall_stone' : 'wall_wood';
            } else {
              grid[z][x] = 'house_floor';
            }
          }
        }

        // Door on south wall center
        const doorX = Math.floor((x1 + x2) / 2);
        grid[z2][doorX] = cfg.isStone ? 'door_stone' : 'door_wood';

        // Connect door southward to road
        for (let z = z2 + 1; z < h; z++) {
          if (grid[z][doorX] === 'road' || grid[z][doorX] === 'plaza') break;
          if (grid[z][doorX] === 'grass') grid[z][doorX] = 'road';
        }

        // Yard fence
        if (cfg.hasFence) {
          const fx1 = Math.max(0, x1 - 1), fx2 = Math.min(w - 1, x2 + 1);
          const fz1 = Math.max(0, z1 - 1), fz2 = Math.min(h - 1, z2 + 1);
          for (let x = fx1; x <= fx2; x++) {
            if (grid[fz1][x] === 'grass') grid[fz1][x] = 'fence';
            if (grid[fz2][x] === 'grass') grid[fz2][x] = 'fence';
          }
          for (let z = fz1; z <= fz2; z++) {
            if (grid[z][fx1] === 'grass') grid[z][fx1] = 'fence';
            if (grid[z][fx2] === 'grass') grid[z][fx2] = 'fence';
          }
          if (fz2 < h && grid[fz2][doorX] === 'fence') grid[fz2][doorX] = 'fence_gate_cell';
        }

        this.houses.push({
          x1, z1, x2, z2,
          cx: Math.floor((x1 + x2) / 2),
          cz: Math.floor((z1 + z2) / 2),
          doorX, doorZ: z2,
          cfg
        });
        houseIdx++;
      }
    }
  }

  // ============================================================
  // RIVERSIDE WATERMILL & FISHING PIER
  // ============================================================
  generateWatermill(grid, w, h) {
    if (!this.riverCoords || this.riverCoords.length === 0) return;
    
    for (let i = 5; i < this.riverCoords.length - 5; i++) {
      const rc = this.riverCoords[i];
      const landX = rc.x + 1;
      const landZ = rc.z;

      if (landX < w - 3 && landZ < h - 3 && grid[landZ][landX] === 'grass' && grid[landZ + 1][landX] === 'grass') {
        grid[landZ][landX] = 'watermill';
        grid[landZ][rc.x] = 'watermill_dock';
        if (landZ + 1 < h && grid[landZ + 1][rc.x] === 'river') grid[landZ + 1][rc.x] = 'canoe_cell';
        this.watermillPos = { x: landX, z: landZ, riverX: rc.x };
        break;
      }
    }
  }

  // ============================================================
  // FARMLAND & WINDMILL
  // ============================================================
  generateFarm(grid, w, h) {
    const fw = 5 + Math.floor(Math.random() * 2);
    const fh = 5 + Math.floor(Math.random() * 2);

    let fx = Math.floor(w * 0.15);
    let fz = Math.floor(h * 0.7);

    if (fx + fw >= w - 2) fx = w - fw - 3;
    if (fz + fh >= h - 2) fz = h - fh - 3;

    for (let dz = 0; dz < fh; dz++) {
      for (let dx = 0; dx < fw; dx++) {
        const x = fx + dx, z = fz + dz;
        if (x >= 0 && x < w && z >= 0 && z < h && grid[z][x] === 'grass') {
          grid[z][x] = (dz % 2 === 0) ? 'crop_row' : 'crop_plant';
        }
      }
    }

    // Place Windmill near farm
    if (fz - 2 >= 0 && fx < w && grid[fz - 1][fx] === 'grass') {
      grid[fz - 1][fx] = 'windmill';
    }
  }

  // ============================================================
  // MOUNTAIN & CLIFF CAVERNS
  // ============================================================
  generateMountain(grid, w, h) {
    const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
    const [anchorX, anchorZ] = this.pickRandom(corners);
    const radius = Math.min(10, Math.floor(Math.min(w, h) / 3.5));

    for (let z = 0; z < h; z++) {
      for (let x = 0; x < w; x++) {
        const dist = Math.sqrt((x - anchorX) ** 2 + (z - anchorZ) ** 2);
        if (dist < radius && grid[z][x] === 'grass') {
          if (dist < radius * 0.45) grid[z][x] = 'cliff_high';
          else if (dist < radius * 0.75) grid[z][x] = 'cliff_low';
          else grid[z][x] = 'rock';
        }
      }
    }

    const caveX = anchorX === 0 ? Math.floor(radius * 0.4) : anchorX - Math.floor(radius * 0.4);
    const caveZ = anchorZ === 0 ? Math.floor(radius * 0.4) : anchorZ - Math.floor(radius * 0.4);
    if (caveZ >= 0 && caveZ < h && caveX >= 0 && caveX < w) {
      grid[caveZ][caveX] = 'cliff_cave';
    }
  }

  areaHasType(grid, x1, z1, x2, z2, w, h, types) {
    const typeArr = Array.isArray(types) ? types : [types];
    for (let z = Math.max(0, z1); z <= Math.min(h - 1, z2); z++) {
      for (let x = Math.max(0, x1); x <= Math.min(w - 1, x2); x++) {
        if (typeArr.includes(grid[z][x])) return true;
      }
    }
    return false;
  }

  // ============================================================
  // AUTO-TILE HELPERS
  // ============================================================
  autoTile(typeId, x, z, grid, w, h, straight, bend, cross, split) {
    const get = (gx, gz) => (gz >= 0 && gz < h && gx >= 0 && gx < w) ? grid[gz][gx] : null;
    const isSame = (gx, gz) => {
      const c = get(gx, gz);
      if (c === typeId) return true;
      if (typeId === 'road' && (c === 'plaza' || c === 'bridge' || c === 'garden_path' || c === 'door_stone' || c === 'door_wood' || c === 'hedge_gate' || c === 'fence_gate_cell')) return true;
      if (typeId === 'river' && (c === 'bridge' || c === 'watermill_dock')) return true;
      return false;
    };

    const N = isSame(x, z - 1) ? 1 : 0;
    const E = isSame(x + 1, z) ? 2 : 0;
    const S = isSame(x, z + 1) ? 4 : 0;
    const W = isSame(x - 1, z) ? 8 : 0;
    const mask = N | E | S | W;

    let asset = straight, rot = 0;
    switch (mask) {
      case 0:
      case 1:
      case 4:
      case 5: asset = straight; rot = 0; break;
      case 2:
      case 8:
      case 10: asset = straight; rot = 90; break;
      case 6: asset = bend || straight; rot = 0; break;
      case 3: asset = bend || straight; rot = 90; break;
      case 9: asset = bend || straight; rot = 180; break;
      case 12: asset = bend || straight; rot = 270; break;
      case 14: asset = split || straight; rot = 0; break;
      case 7: asset = split || straight; rot = 90; break;
      case 11: asset = split || straight; rot = 180; break;
      case 13: asset = split || straight; rot = 270; break;
      case 15: asset = cross || straight; rot = 0; break;
      default: asset = straight; rot = 0; break;
    }
    return { asset, rot };
  }

  // ============================================================
  // MAIN GENERATE METHOD (Accepts user options)
  // ============================================================
  async generate(options = {}) {
    if (this.assetBrowser.catalog.length === 0) {
      alert("Please load a kit first!");
      return;
    }

    const w = this.placement.gridW;
    const h = this.placement.gridH;
    const seed = (options.seed !== undefined && !isNaN(options.seed)) ? Number(options.seed) : Math.random() * 65536;
    const noise = new SimplexNoise(seed);

    // Merge rolled defaults with user options
    const rolled = this.rollBiome();
    const biome = {
      theme: options.theme || rolled.theme,
      has_river: options.river === 'yes' ? true : (options.river === 'no' ? false : (options.river === 'random' ? Math.random() < 0.7 : rolled.has_river)),
      has_plaza: options.fountain !== 'none',
      fountain_type: options.fountain || 'round',
      has_hedge_garden: options.hedgeGarden !== undefined ? options.hedgeGarden : rolled.has_hedge_garden,
      has_market: options.market !== undefined ? options.market : rolled.has_market,
      has_village: options.houseCount !== undefined ? (options.houseCount > 0) : rolled.has_village,
      house_count: options.houseCount !== undefined ? options.houseCount : (w >= 40 ? 3 : 2),
      has_farm: options.farm !== undefined ? options.farm : rolled.has_farm,
      has_watermill: options.watermill !== undefined ? options.watermill : rolled.has_watermill,
      has_mountain: options.mountain !== undefined ? options.mountain : rolled.has_mountain,
      forest_density: options.forestDensity || rolled.forest_density,
      tree_style: options.treeStyle || rolled.tree_style,
      road_type: options.road || rolled.road_type
    };

    // Reset internal state
    this.houses = [];
    this.plazaRect = null;
    this.hedgeGarden = null;
    this.riverCoords = [];

    // ---- ASSET DISCOVERY ----
    const grassAsset = this.findFirst('ground_grass.glb', 'platform_grass.glb') || this.assetBrowser.catalog[0];
    const riverStraight = this.findFirst('ground_riverStraight.glb');
    const riverBend = this.findFirst('ground_riverBend.glb');
    const riverCross = this.findFirst('ground_riverCross.glb') || riverStraight;
    const riverSplit = this.findFirst('ground_riverSplit.glb') || riverStraight;
    
    // Roads & Paths
    let roadStraight = this.findFirst('road.glb', 'ground_pathStraight.glb');
    let roadBend = this.findFirst('road-bend.glb', 'ground_pathBend.glb');
    let roadCross = this.findFirst('road-corner.glb', 'ground_pathCross.glb');
    let roadSplit = this.findFirst('ground_pathSplit.glb', 'road.glb');
    
    if (biome.road_type === 'stone') {
      roadStraight = this.findFirst('path_stone.glb', 'road.glb');
      roadBend = this.findFirst('path_stoneCorner.glb', 'path_stone.glb');
    } else if (biome.road_type === 'dirt') {
      roadStraight = this.findFirst('ground_pathStraight.glb', 'road.glb');
      roadBend = this.findFirst('ground_pathBend.glb', 'ground_pathStraight.glb');
    }

    const stonePathAsset = this.findFirst('path_stone.glb', 'path_stoneCircle.glb', 'road.glb');
    const bridgeStone = this.findFirst('bridge_stone.glb', 'bridge_stoneRound.glb', 'bridge_wood.glb');

    // Fountains
    const fountainRound = this.findFirst('fountain-round.glb', 'fountain-round-detail.glb', 'fountain-square.glb');
    const fountainSquare = this.findFirst('fountain-square.glb', 'fountain-square-detail.glb', 'fountain-round.glb');
    let chosenFountain = fountainRound;
    if (biome.fountain_type === 'square') chosenFountain = fountainSquare || fountainRound;
    else if (biome.fountain_type === 'random') chosenFountain = (Math.random() < 0.5) ? fountainRound : fountainSquare;

    // Hedges & Gates
    const hedgeStraight = this.findFirst('hedge.glb', 'hedge-large.glb');
    const hedgeCurved = this.findFirst('hedge-curved.glb', 'hedge-large-curved.glb', 'hedge.glb');
    const hedgeGate = this.findFirst('hedge-gate.glb', 'hedge-large-gate.glb', 'hedge.glb');

    // Market & Village Props
    const stallRed = this.findFirst('stall-red.glb', 'stall.glb');
    const stallGreen = this.findFirst('stall-green.glb', 'stall.glb');
    const stallWood = this.findFirst('stall.glb', 'stall-red.glb');
    const stallBench = this.findFirst('stall-bench.glb', 'stall-stool.glb');
    const marketCart = this.findFirst('cart.glb', 'cart-high.glb');
    const lanternAsset = this.findFirst('lantern.glb');
    const bannerRed = this.findFirst('banner-red.glb');
    const bannerGreen = this.findFirst('banner-green.glb');
    const pillarStone = this.findFirst('pillar-stone.glb', 'pillar-wood.glb');
    const watermillAsset = this.findFirst('watermill.glb', 'watermill-wide.glb');
    const windmillAsset = this.findFirst('windmill.glb');
    const canoeAsset = this.findFirst('canoe.glb');
    const planksDock = this.findFirst('planks.glb', 'planks-half.glb');
    const chimneyAsset = this.findFirst('chimney.glb', 'chimney-top.glb');

    // Buildings & Walls
    const wallStone = this.findFirst('wall.glb');
    const wallStoneCorner = this.findFirst('wall-corner.glb');
    const wallStoneDoor = this.findFirst('wall-door.glb', 'wall-doorway-square.glb');
    const wallStoneWindow = this.findFirst('wall-window-glass.glb', 'wall-window-shutters.glb');
    
    const wallWood = this.findFirst('wall-wood.glb', 'wall.glb');
    const wallWoodCorner = this.findFirst('wall-wood-corner.glb', 'wall-corner.glb');
    const wallWoodDoor = this.findFirst('wall-wood-door.glb', 'wall-door.glb');
    const wallWoodWindow = this.findFirst('wall-wood-window-glass.glb', 'wall-window-glass.glb');

    const roofGable = this.findFirst('roof-high-gable.glb', 'roof-gable.glb', 'roof.glb');
    const roofPiece = this.findFirst('roof.glb', 'roof-high.glb', 'roof-flat.glb');

    // Statues & Gardens
    const statueList = ['statue_obelisk.glb', 'statue_head.glb', 'statue_column.glb', 'statue_ring.glb', 'statue_columnDamaged.glb']
      .map(n => this.findExact(n)).filter(Boolean);
    const flowerList = ['flower_redA.glb', 'flower_purpleA.glb', 'flower_yellowA.glb', 'flower_redB.glb', 'flower_purpleB.glb']
      .map(n => this.findExact(n)).filter(Boolean);
    const bushList = ['plant_bushDetailed.glb', 'plant_bushLarge.glb', 'plant_bushSmall.glb', 'plant_bush.glb']
      .map(n => this.findExact(n)).filter(Boolean);
    const mushroomList = ['mushroom_red.glb', 'mushroom_tan.glb', 'mushroom_redGroup.glb']
      .map(n => this.findExact(n)).filter(Boolean);

    // Filter Trees based on tree_style
    const fantasyTrees = ['tree-high-round.glb', 'tree-crooked.glb', 'tree-high.glb', 'tree-high-crooked.glb', 'tree.glb']
      .map(n => this.findExact(n)).filter(Boolean);
    const natureTrees = ['tree_oak.glb', 'tree_pineTallA.glb', 'tree_default.glb', 'tree_fat.glb', 'tree_thin.glb', 'tree_small.glb', 'tree_cone.glb', 'tree_detailed.glb']
      .map(n => this.findExact(n)).filter(Boolean);

    let treeList = [];
    if (biome.tree_style === 'fantasy') {
      treeList = fantasyTrees.length > 0 ? fantasyTrees : natureTrees;
    } else if (biome.tree_style === 'nature') {
      treeList = natureTrees.length > 0 ? natureTrees : fantasyTrees;
    } else if (biome.tree_style === 'mystical') {
      treeList = fantasyTrees.filter(t => t.filename.includes('crooked') || t.filename.includes('round'));
      if (treeList.length === 0) treeList = fantasyTrees;
    } else {
      treeList = [...fantasyTrees, ...natureTrees];
    }
    if (treeList.length === 0) {
      const ft = this.findFuzzy('tree');
      if (ft) treeList.push(ft);
    }

    const rockList = ['rock-large.glb', 'rock-small.glb', 'rock-wide.glb', 'rock_largeA.glb', 'rock_smallA.glb', 'stone_largeA.glb']
      .map(n => this.findExact(n)).filter(Boolean);
    const grassDecor = ['grass.glb', 'grass_large.glb', 'grass_leafs.glb']
      .map(n => this.findExact(n)).filter(Boolean);

    // Crops
    const dirtRow = this.findFirst('crops_dirtRow.glb', 'crops_dirtDoubleRow.glb');
    const cropVeg = ['crop_carrot.glb', 'crop_pumpkin.glb', 'crop_melon.glb', 'crop_turnip.glb']
      .map(n => this.findExact(n)).filter(Boolean);
    const cropPlants = ['crops_wheatStageB.glb', 'crops_cornStageD.glb', 'crops_bambooStageB.glb']
      .map(n => this.findExact(n)).filter(Boolean);

    // Cliffs
    const cliffBlock = this.findFirst('cliff_block_rock.glb', 'cliff_rock.glb');
    const cliffHalf = this.findFirst('cliff_half_rock.glb') || cliffBlock;
    const cliffCave = this.findFirst('cliff_cave_rock.glb', 'cliff_rock.glb') || cliffBlock;
    const stoneStairs = this.findFirst('stairs-stone.glb', 'stairs-stone-round.glb', 'stairs-full.glb');

    // Fences
    const fenceAsset = this.findFirst('fence.glb', 'fence_simple.glb');
    const fenceGate = this.findFirst('fence-gate.glb', 'fence_gate.glb');

    // ---- 1. BUILD LOGICAL GRID ----
    const grid = Array.from({ length: h }, () => Array(w).fill('grass'));
    const plazaCenter = { cx: Math.floor(w * 0.48), cz: Math.floor(h * 0.48) };

    // River
    if (biome.has_river && riverStraight) this.generateRiver(grid, w, h);
    
    // Roads & Bridges
    if (biome.road_type !== 'none' && roadStraight) this.generateRoads(grid, w, h, plazaCenter);

    // Grand Plaza & Fountain
    if (biome.has_plaza && chosenFountain) {
      this.generateGrandPlaza(grid, w, h, plazaCenter.cx, plazaCenter.cz);
    }

    // Royal Hedge Garden & Hedge Gates
    if (biome.has_hedge_garden && hedgeStraight) {
      this.generateHedgeGarden(grid, w, h);
    }

    // Marketplace
    if (biome.has_market && (stallRed || stallGreen)) {
      this.generateMarketplace(grid, w, h, plazaCenter);
    }

    // Village Houses (Manor, Cottages)
    if (biome.has_village && wallStone && biome.house_count > 0) {
      this.generateVillageHouses(grid, w, h, biome.house_count);
    }

    // Watermill & Fishing Pier
    if (biome.has_river && biome.has_watermill && watermillAsset) {
      this.generateWatermill(grid, w, h);
    }

    // Farm & Windmill
    if (biome.has_farm && dirtRow) {
      this.generateFarm(grid, w, h);
    }

    // Mountain & Cliffs
    if (biome.has_mountain && cliffBlock) {
      this.generateMountain(grid, w, h);
    }

    // ---- 2. PLACE 3D OBJECTS ON GRID ----
    this.placement.resetGrid(w, h);

    const rot4 = () => Math.floor(Math.random() * 4) * 90;

    for (let z = 0; z < h; z++) {
      for (let x = 0; x < w; x++) {
        const type = grid[z][x];

        // Base Grass Tile on Ground Layer
        await this.placement.placeAsset('ground', x, z, grassAsset, 0, true);

        // ---- RIVER ----
        if (type === 'river' && riverStraight) {
          const t = this.autoTile('river', x, z, grid, w, h, riverStraight, riverBend, riverCross, riverSplit);
          await this.placement.placeAsset('ground', x, z, t.asset, t.rot, true);
        }
        // ---- ROAD ----
        else if (type === 'road' && roadStraight) {
          const t = this.autoTile('road', x, z, grid, w, h, roadStraight, roadBend, roadCross, roadSplit);
          await this.placement.placeAsset('ground', x, z, t.asset, t.rot, true);
        }
        // ---- BRIDGE ----
        else if (type === 'bridge') {
          if (riverStraight) {
            const t = this.autoTile('river', x, z, grid, w, h, riverStraight, riverBend, riverCross, riverSplit);
            await this.placement.placeAsset('ground', x, z, t.asset, t.rot, true);
          }
          if (bridgeStone) {
            const isRivE = (x + 1 < w && grid[z][x + 1] === 'river') || (x - 1 >= 0 && grid[z][x - 1] === 'river');
            const bRot = isRivE ? 90 : 0;
            await this.placement.placeAsset('prop', x, z, bridgeStone, bRot, true);
          }
        }
        // ---- PLAZA & GRAND FOUNTAIN ----
        else if (type === 'plaza') {
          const plazaGround = this.findFirst('road.glb') || roadStraight;
          if (plazaGround) {
            await this.placement.placeAsset('ground', x, z, plazaGround, 0, true);
          } else {
            await this.placement.placeAsset('ground', x, z, grassAsset, 0, true);
            if (stonePathAsset) await this.placement.placeAsset('prop', x, z, stonePathAsset, 0, true);
          }
        }
        else if (type === 'fountain') {
          const plazaGround = this.findFirst('road.glb') || roadStraight;
          if (plazaGround) {
            await this.placement.placeAsset('ground', x, z, plazaGround, 0, true);
          } else {
            await this.placement.placeAsset('ground', x, z, grassAsset, 0, true);
          }
          if (chosenFountain) await this.placement.placeAsset('prop', x, z, chosenFountain, 0, true);
        }
        else if (type === 'plaza_pillar') {
          const plazaGround = this.findFirst('road.glb') || roadStraight;
          if (plazaGround) {
            await this.placement.placeAsset('ground', x, z, plazaGround, 0, true);
          } else {
            await this.placement.placeAsset('ground', x, z, grassAsset, 0, true);
          }
          if (pillarStone) await this.placement.placeAsset('prop', x, z, pillarStone, 0, true);
          const banner = (x + z) % 2 === 0 ? bannerRed : bannerGreen;
          if (banner) await this.placement.placeAsset('prop', x, z, banner, 0, true);
        }
        else if (type === 'plaza_lantern') {
          const plazaGround = this.findFirst('road.glb') || roadStraight;
          if (plazaGround) {
            await this.placement.placeAsset('ground', x, z, plazaGround, 0, true);
          } else {
            await this.placement.placeAsset('ground', x, z, grassAsset, 0, true);
          }
          if (lanternAsset) await this.placement.placeAsset('prop', x, z, lanternAsset, 0, true);
        }
        else if (type === 'plaza_bench') {
          const plazaGround = this.findFirst('road.glb') || roadStraight;
          if (plazaGround) {
            await this.placement.placeAsset('ground', x, z, plazaGround, 0, true);
          } else {
            await this.placement.placeAsset('ground', x, z, grassAsset, 0, true);
          }
          if (stallBench) await this.placement.placeAsset('prop', x, z, stallBench, 90, true);
        }
        // ---- ROYAL HEDGE GARDEN ----
        else if (type === 'hedge' && this.hedgeGarden) {
          await this.placement.placeAsset('ground', x, z, grassAsset, 0, true);
          const hg = this.hedgeGarden;
          const isCorner = (x === hg.x1 || x === hg.x2) && (z === hg.z1 || z === hg.z2);
          
          if (isCorner && hedgeCurved) {
            let cRot = 0;
            if (x === hg.x1 && z === hg.z1) cRot = 270;        // NW
            else if (x === hg.x2 && z === hg.z1) cRot = 0;    // NE
            else if (x === hg.x2 && z === hg.z2) cRot = 90;   // SE
            else if (x === hg.x1 && z === hg.z2) cRot = 180;  // SW
            await this.placement.placeAsset('prop', x, z, hedgeCurved, cRot, true);
          } else if (hedgeStraight) {
            let hRot = 0;
            if (x === hg.x2) hRot = 0;        // East edge
            else if (z === hg.z2) hRot = 90;  // South edge
            else if (x === hg.x1) hRot = 180; // West edge
            else if (z === hg.z1) hRot = 270; // North edge
            await this.placement.placeAsset('prop', x, z, hedgeStraight, hRot, true);
          }
        }
        else if (type === 'hedge_gate') {
          if (roadStraight) await this.placement.placeAsset('ground', x, z, roadStraight, 0, true);
          const hg = this.hedgeGarden;
          const gateAsset = hedgeGate || hedgeStraight;
          if (gateAsset) {
            let gRot = 90;
            if (hg && z === hg.z1) gRot = 270;
            else if (hg && z === hg.z2) gRot = 90;
            else if (hg && x === hg.x1) gRot = 180;
            else if (hg && x === hg.x2) gRot = 0;
            await this.placement.placeAsset('prop', x, z, gateAsset, gRot, true);
          }
        }
        else if (type === 'garden_floor') {
          await this.placement.placeAsset('ground', x, z, grassAsset, 0, true);
        }
        else if (type === 'garden_path') {
          await this.placement.placeAsset('ground', x, z, grassAsset, 0, true);
          if (stonePathAsset) await this.placement.placeAsset('prop', x, z, stonePathAsset, 0, true);
        }
        else if (type === 'garden_statue') {
          await this.placement.placeAsset('ground', x, z, grassAsset, 0, true);
          if (stonePathAsset) await this.placement.placeAsset('prop', x, z, stonePathAsset, 0, true);
          const statue = this.pickRandom(statueList) || fountainSquare;
          if (statue) await this.placement.placeAsset('prop', x, z, statue, 0, true);
        }
        else if (type === 'garden_fountain') {
          await this.placement.placeAsset('ground', x, z, grassAsset, 0, true);
          const fAsset = fountainSquare || fountainRound;
          if (fAsset) await this.placement.placeAsset('prop', x, z, fAsset, 0, true);
        }
        else if (type === 'garden_flower') {
          await this.placement.placeAsset('ground', x, z, grassAsset, 0, true);
          const fl = this.pickRandom(flowerList);
          if (fl) await this.placement.placeAsset('prop', x, z, fl, rot4(), true);
        }
        else if (type === 'garden_bush') {
          await this.placement.placeAsset('ground', x, z, grassAsset, 0, true);
          const b = this.pickRandom(bushList);
          if (b) await this.placement.placeAsset('prop', x, z, b, rot4(), true);
        }
        // ---- MARKETPLACE ----
        else if (type.startsWith('market_stall')) {
          if (roadStraight) await this.placement.placeAsset('ground', x, z, roadStraight, 0, true);
          let stallAsset = stallRed;
          if (type.includes('green')) stallAsset = stallGreen;
          else if (type.includes('wood')) stallAsset = stallWood;
          if (stallAsset) await this.placement.placeAsset('prop', x, z, stallAsset, 0, true);
        }
        else if (type === 'market_cart') {
          if (roadStraight) await this.placement.placeAsset('ground', x, z, roadStraight, 0, true);
          if (marketCart) await this.placement.placeAsset('prop', x, z, marketCart, 0, true);
        }
        else if (type === 'market_bench') {
          if (roadStraight) await this.placement.placeAsset('ground', x, z, roadStraight, 0, true);
          if (stallBench) await this.placement.placeAsset('prop', x, z, stallBench, 0, true);
        }
        else if (type === 'market_crate') {
          if (roadStraight) await this.placement.placeAsset('ground', x, z, roadStraight, 0, true);
          const crate = this.findFirst('log_stack.glb', 'pot_large.glb') || lanternAsset;
          if (crate) await this.placement.placeAsset('prop', x, z, crate, 0, true);
        }
        // ---- HOUSES & BUILDINGS ----
        else if (type === 'wall_stone' || type === 'wall_wood') {
          const isStone = (type === 'wall_stone');
          const wPiece = isStone ? wallStone : wallWood;
          const wCorner = isStone ? wallStoneCorner : wallWoodCorner;
          const wWin = isStone ? wallStoneWindow : wallWoodWindow;

          const house = this.houses.find(hObj => x >= hObj.x1 && x <= hObj.x2 && z >= hObj.z1 && z <= hObj.z2);
          if (house) {
            const isCorner = (x === house.x1 || x === house.x2) && (z === house.z1 || z === house.z2);
            if (isCorner && wCorner) {
              let cRot = 0;
              if (x === house.x1 && z === house.z1) cRot = 180;      // NW
              else if (x === house.x2 && z === house.z1) cRot = 270; // NE
              else if (x === house.x2 && z === house.z2) cRot = 0;   // SE
              else if (x === house.x1 && z === house.z2) cRot = 90;  // SW
              await this.placement.placeAsset('prop', x, z, wCorner, cRot, true);
            } else {
              const useWin = wWin && Math.random() < 0.4;
              const assetToUse = useWin ? wWin : wPiece;
              let wRot = 0;
              if (z === house.z1) wRot = 270;       // North wall
              else if (x === house.x2) wRot = 0;   // East wall
              else if (z === house.z2) wRot = 90;  // South wall
              else if (x === house.x1) wRot = 180; // West wall
              await this.placement.placeAsset('prop', x, z, assetToUse, wRot, true);
            }
          }
        }
        else if (type === 'door_stone' || type === 'door_wood') {
          if (roadStraight) await this.placement.placeAsset('ground', x, z, roadStraight, 0, true);
          const dPiece = (type === 'door_stone') ? wallStoneDoor : wallWoodDoor;
          if (dPiece) await this.placement.placeAsset('prop', x, z, dPiece, 90, true);
        }
        else if (type === 'house_floor') {
          const plazaGround = this.findFirst('road.glb') || roadStraight;
          if (plazaGround) await this.placement.placeAsset('ground', x, z, plazaGround, 0, true);
          const decor = this.findFirst('bed.glb', 'pot_large.glb', 'log_stack.glb');
          if (decor && Math.random() < 0.3) {
            await this.placement.placeAsset('prop', x, z, decor, rot4(), true);
          }
        }
        else if (type === 'fence' && fenceAsset) {
          await this.placement.placeAsset('prop', x, z, fenceAsset, 90, true);
        }
        else if (type === 'fence_gate_cell') {
          const fg = fenceGate || fenceAsset;
          if (fg) await this.placement.placeAsset('prop', x, z, fg, 90, true);
        }
        // ---- WATERMILL & DOCK ----
        else if (type === 'watermill' && watermillAsset) {
          await this.placement.placeAsset('prop', x, z, watermillAsset, 0, true);
        }
        else if (type === 'watermill_dock' && planksDock) {
          if (riverStraight) {
            const t = this.autoTile('river', x, z, grid, w, h, riverStraight, riverBend, riverCross, riverSplit);
            await this.placement.placeAsset('ground', x, z, t.asset, t.rot, true);
          }
          await this.placement.placeAsset('prop', x, z, planksDock, 0, true);
        }
        else if (type === 'canoe_cell') {
          if (riverStraight) {
            const t = this.autoTile('river', x, z, grid, w, h, riverStraight, riverBend, riverCross, riverSplit);
            await this.placement.placeAsset('ground', x, z, t.asset, t.rot, true);
          }
          if (canoeAsset) await this.placement.placeAsset('prop', x, z, canoeAsset, 90, true);
        }
        // ---- FARMLAND & WINDMILL ----
        else if (type === 'crop_row') {
          await this.placement.placeAsset('ground', x, z, grassAsset, 0, true);
          if (dirtRow) await this.placement.placeAsset('prop', x, z, dirtRow, 0, true);
          if (cropPlants.length > 0 && Math.random() < 0.75) {
            await this.placement.placeAsset('prop', x, z, this.pickRandom(cropPlants), 0, true);
          }
        }
        else if (type === 'crop_plant') {
          await this.placement.placeAsset('ground', x, z, grassAsset, 0, true);
          if (dirtRow) await this.placement.placeAsset('prop', x, z, dirtRow, 0, true);
          if (cropVeg.length > 0) {
            await this.placement.placeAsset('prop', x, z, this.pickRandom(cropVeg), rot4(), true);
          }
        }
        else if (type === 'windmill') {
          await this.placement.placeAsset('ground', x, z, grassAsset, 0, true);
          if (windmillAsset) await this.placement.placeAsset('prop', x, z, windmillAsset, 0, true);
        }
        // ---- MOUNTAIN & CLIFFS ----
        else if (type === 'cliff_high' && cliffBlock) {
          await this.placement.placeAsset('prop', x, z, cliffBlock, rot4(), true);
          if (Math.random() < 0.4) {
            const cliffTop = this.findFirst('cliff_top_rock.glb') || cliffBlock;
            await this.placement.placeAsset('prop', x, z, cliffTop, rot4(), true);
          }
        }
        else if (type === 'cliff_low') {
          const piece = cliffHalf || cliffBlock;
          if (piece) await this.placement.placeAsset('prop', x, z, piece, rot4(), true);
        }
        else if (type === 'cliff_cave' && cliffCave) {
          await this.placement.placeAsset('prop', x, z, cliffCave, 0, true);
          if (stoneStairs) await this.placement.placeAsset('prop', x, z, stoneStairs, 0, true);
        }
        else if (type === 'rock') {
          const r = this.pickRandom(rockList);
          if (r) await this.placement.placeAsset('prop', x, z, r, rot4(), true);
        }
      }
    }

    // Place modular roofs & chimneys covering every tile of each house
    if (this.houses && this.houses.length > 0) {
      for (const house of this.houses) {
        const { x1, z1, x2, z2, cfg } = house;
        const hw = x2 - x1 + 1;
        const hh = z2 - z1 + 1;

        for (let z = z1; z <= z2; z++) {
          for (let x = x1; x <= x2; x++) {
            const isCorner = (x === x1 || x === x2) && (z === z1 || z === z2);
            
            if (cfg.isFlatRoof && (roofPiece || roofGable)) {
              await this.placement.placeAsset('prop', x, z, roofPiece || roofGable, 0, true);
            } else if (hw === 2) {
              // 2-tile wide cottage: slopes down to West on left (rot=0), down to East on right (rot=180)
              const rAsset = roofPiece || roofGable;
              if (rAsset) {
                const rRot = (x === x1) ? 0 : 180;
                await this.placement.placeAsset('prop', x, z, rAsset, rRot, true);
              }
            } else if (hh === 2) {
              // 2-tile deep building: slopes down to North on top (rot=90), down to South on bottom (rot=270)
              const rAsset = roofPiece || roofGable;
              if (rAsset) {
                const rRot = (z === z1) ? 90 : 270;
                await this.placement.placeAsset('prop', x, z, rAsset, rRot, true);
              }
            } else if (hw >= 3 && hh >= 3) {
              // 3x3 or larger Manor with 4 corners and sloped sides
              if (isCorner && roofCorner) {
                let cRot = 0;
                if (x === x1 && z === z1) cRot = 180;      // NW
                else if (x === x2 && z === z1) cRot = 270; // NE
                else if (x === x2 && z === z2) cRot = 0;   // SE
                else if (x === x1 && z === z2) cRot = 90;  // SW
                await this.placement.placeAsset('prop', x, z, roofCorner, cRot, true);
              } else if (z === z1 && roofPiece) {
                await this.placement.placeAsset('prop', x, z, roofPiece, 90, true);
              } else if (x === x2 && roofPiece) {
                await this.placement.placeAsset('prop', x, z, roofPiece, 180, true);
              } else if (z === z2 && roofPiece) {
                await this.placement.placeAsset('prop', x, z, roofPiece, 270, true);
              } else if (x === x1 && roofPiece) {
                await this.placement.placeAsset('prop', x, z, roofPiece, 0, true);
              } else {
                const centerRoof = roofGable || roofPiece;
                if (centerRoof) await this.placement.placeAsset('prop', x, z, centerRoof, 0, true);
              }
            } else {
              const rAsset = roofGable || roofPiece;
              if (rAsset) await this.placement.placeAsset('prop', x, z, rAsset, 0, true);
            }
          }
        }

        // Place Chimney on roof
        if (cfg.hasChimney && chimneyAsset) {
          await this.placement.placeAsset('prop', house.x1, house.z1, chimneyAsset, 0, true);
        }
      }
    }

    // ---- 3. ORGANIC NATURE SCATTER WITH SIMPLEX NOISE ----
    let treeThreshold = 0.54;
    if (biome.forest_density === 'dense') treeThreshold = 0.40;
    else if (biome.forest_density === 'sparse') treeThreshold = 0.65;
    else if (biome.forest_density === 'none') treeThreshold = 999;

    const forbiddenCoords = new Set();
    for (let z = 0; z < h; z++) {
      for (let x = 0; x < w; x++) {
        if (grid[z][x] !== 'grass') {
          for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx, nz = z + dz;
              if (nx >= 0 && nx < w && nz >= 0 && nz < h) {
                forbiddenCoords.add(`${nx},${nz}`);
              }
            }
          }
        }
      }
    }

    if (biome.forest_density !== 'none' && treeList.length > 0) {
      for (let z = 0; z < h; z++) {
        for (let x = 0; x < w; x++) {
          if (grid[z][x] === 'grass' && !forbiddenCoords.has(`${x},${z}`)) {
            const nTree = noise.fractal(x * 0.09, z * 0.09, 3);
            const nFlower = noise.fractal(x * 0.15 + 40, z * 0.15 + 40, 2);

            if (nTree > treeThreshold) {
              const treeAsset = this.pickRandom(treeList);
              await this.placement.placeAsset('prop', x, z, treeAsset, rot4(), true);
              grid[z][x] = 'tree';
            } else if (nFlower > 0.68 && flowerList.length > 0) {
              await this.placement.placeAsset('prop', x, z, this.pickRandom(flowerList), rot4(), true);
              grid[z][x] = 'flower';
            } else if (nFlower < 0.32 && mushroomList.length > 0 && Math.random() < (biome.tree_style === 'mystical' ? 0.45 : 0.2)) {
              await this.placement.placeAsset('prop', x, z, this.pickRandom(mushroomList), rot4(), true);
              grid[z][x] = 'mushroom';
            } else if (bushList.length > 0 && Math.random() < 0.08) {
              await this.placement.placeAsset('prop', x, z, this.pickRandom(bushList), rot4(), true);
              grid[z][x] = 'bush';
            } else if (grassDecor.length > 0 && Math.random() < 0.12) {
              await this.placement.placeAsset('prop', x, z, this.pickRandom(grassDecor), rot4(), true);
              grid[z][x] = 'grass_decor';
            } else if (rockList.length > 0 && Math.random() < 0.03) {
              await this.placement.placeAsset('prop', x, z, this.pickRandom(rockList), rot4(), true);
              grid[z][x] = 'rock';
            }
          }
        }
      }
    }

    // Build biome summary
    const features = [];
    features.push(biome.theme.replace(/_/g, ' '));
    features.push(`style: ${biome.tree_style}`);
    if (biome.has_river) features.push('river');
    if (biome.has_plaza) features.push('grand fountain plaza');
    if (biome.has_hedge_garden) features.push('royal hedge garden');
    if (biome.has_market) features.push('market district');
    if (biome.has_village) features.push(`${this.houses.length} village houses`);
    if (biome.has_watermill) features.push('watermill & pier');
    if (biome.has_farm) features.push('farmland & windmill');
    if (biome.has_mountain) features.push('mountain cave');
    if (biome.forest_density !== 'none') features.push(`${biome.forest_density} forest`);

    const summary = features.join(' + ');
    this.lastBiomeSummary = summary;
    this.lastSeed = seed;
    console.log(`[MapGen 50x50] seed=${seed.toFixed(0)}, biome: ${summary}`);

    this.placement.pushHistory({ type: 'generate_map', w, h, biome_summary: summary });
  }
}
