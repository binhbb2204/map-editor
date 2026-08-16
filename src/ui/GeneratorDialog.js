/**
 * GeneratorDialog — UI Controller for the Procedural Map Generator Options Modal.
 * Allows users to choose themes, tree styles (Fantasy vs Nature vs Mixed), 
 * landscape features (river, roads, plaza/fountain, hedge gardens, markets, houses, farms, mountains),
 * grid dimensions, and seeds.
 */
export default class GeneratorDialog {
  constructor(app, placement, mapGenerator, { onUpdateMinimap, onUpdateStatusBar, onNotify }) {
    this.app = app;
    this.placement = placement;
    this.mapGenerator = mapGenerator;
    this.onUpdateMinimap = onUpdateMinimap;
    this.onUpdateStatusBar = onUpdateStatusBar;
    this.onNotify = onNotify;

    this.overlay = document.getElementById('generator-overlay');
  }

  setup() {
    if (!this.overlay) return;

    // Open Modal triggers
    const openModal = () => {
      this.syncInputsWithState();
      this.overlay.classList.remove('hidden');
    };

    document.getElementById('btn-auto-gen')?.addEventListener('click', openModal);
    document.getElementById('menu-autogen')?.addEventListener('click', openModal);

    // Close Modal triggers
    const closeModal = () => {
      this.overlay.classList.add('hidden');
    };

    document.getElementById('btn-close-gen-x')?.addEventListener('click', closeModal);
    document.getElementById('btn-close-gen')?.addEventListener('click', closeModal);

    // Randomize Seed button
    document.getElementById('btn-gen-rand-seed')?.addEventListener('click', () => {
      const seedInput = document.getElementById('gen-seed');
      if (seedInput) seedInput.value = Math.floor(Math.random() * 999999);
    });

    // Preset theme change handler
    document.getElementById('gen-theme')?.addEventListener('change', (e) => {
      this.applyThemePreset(e.target.value);
    });

    // Randomize All Options button
    document.getElementById('btn-gen-randomize-all')?.addEventListener('click', () => {
      this.randomizeAllOptions();
    });

    // Run Generate button
    document.getElementById('btn-run-generate')?.addEventListener('click', async () => {
      await this.handleGenerate();
    });
  }

  syncInputsWithState() {
    // Ensure grid inputs match current placement grid
    const wInput = document.getElementById('gen-grid-w');
    const hInput = document.getElementById('gen-grid-h');
    if (wInput) wInput.value = this.placement.gridW || 50;
    if (hInput) hInput.value = this.placement.gridH || 50;

    // Ensure seed has a value
    const seedInput = document.getElementById('gen-seed');
    if (seedInput && !seedInput.value) {
      seedInput.value = Math.floor(Math.random() * 999999);
    }
  }

  applyThemePreset(theme) {
    const treeStyle = document.getElementById('gen-tree-style');
    const river = document.getElementById('gen-river');
    const road = document.getElementById('gen-road');
    const fountain = document.getElementById('gen-fountain');
    const hedge = document.getElementById('gen-hedge');
    const market = document.getElementById('gen-market');
    const houses = document.getElementById('gen-houses');
    const farm = document.getElementById('gen-farm');
    const watermill = document.getElementById('gen-watermill');
    const mountain = document.getElementById('gen-mountain');
    const density = document.getElementById('gen-density');

    if (theme === 'fantasy_kingdom') {
      if (treeStyle) treeStyle.value = 'fantasy';
      if (river) river.value = 'yes';
      if (road) road.value = 'road';
      if (fountain) fountain.value = 'round';
      if (hedge) hedge.checked = true;
      if (market) market.checked = true;
      if (houses) houses.value = '3';
      if (farm) farm.checked = true;
      if (watermill) watermill.checked = true;
      if (mountain) mountain.checked = true;
      if (density) density.value = 'medium';
    } else if (theme === 'emerald_sanctuary') {
      if (treeStyle) treeStyle.value = 'fantasy';
      if (river) river.value = 'random';
      if (road) road.value = 'stone';
      if (fountain) fountain.value = 'square';
      if (hedge) hedge.checked = true;
      if (market) market.checked = false;
      if (houses) houses.value = '1';
      if (farm) farm.checked = false;
      if (watermill) watermill.checked = false;
      if (mountain) mountain.checked = true;
      if (density) density.value = 'dense';
    } else if (theme === 'nature_wilderness') {
      if (treeStyle) treeStyle.value = 'nature';
      if (river) river.value = 'yes';
      if (road) road.value = 'dirt';
      if (fountain) fountain.value = 'none';
      if (hedge) hedge.checked = false;
      if (market) market.checked = false;
      if (houses) houses.value = '0';
      if (farm) farm.checked = false;
      if (watermill) watermill.checked = false;
      if (mountain) mountain.checked = true;
      if (density) density.value = 'dense';
    } else if (theme === 'riverside_haven') {
      if (treeStyle) treeStyle.value = 'mixed';
      if (river) river.value = 'yes';
      if (road) road.value = 'road';
      if (fountain) fountain.value = 'round';
      if (hedge) hedge.checked = true;
      if (market) market.checked = true;
      if (houses) houses.value = '2';
      if (farm) farm.checked = true;
      if (watermill) watermill.checked = true;
      if (mountain) mountain.checked = false;
      if (density) density.value = 'medium';
    } else if (theme === 'mountain_stronghold') {
      if (treeStyle) treeStyle.value = 'nature';
      if (river) river.value = 'no';
      if (road) road.value = 'stone';
      if (fountain) fountain.value = 'square';
      if (hedge) hedge.checked = false;
      if (market) market.checked = false;
      if (houses) houses.value = '2';
      if (farm) farm.checked = false;
      if (watermill) watermill.checked = false;
      if (mountain) mountain.checked = true;
      if (density) density.value = 'sparse';
    } else if (theme === 'mixed_wonderland') {
      if (treeStyle) treeStyle.value = 'mixed';
      if (river) river.value = 'yes';
      if (road) road.value = 'road';
      if (fountain) fountain.value = 'random';
      if (hedge) hedge.checked = true;
      if (market) market.checked = true;
      if (houses) houses.value = '3';
      if (farm) farm.checked = true;
      if (watermill) watermill.checked = true;
      if (mountain) mountain.checked = true;
      if (density) density.value = 'medium';
    }
  }

  randomizeAllOptions() {
    const themes = ['fantasy_kingdom', 'emerald_sanctuary', 'nature_wilderness', 'riverside_haven', 'mountain_stronghold', 'mixed_wonderland'];
    const themeSelect = document.getElementById('gen-theme');
    if (themeSelect) {
      themeSelect.value = themes[Math.floor(Math.random() * themes.length)];
      this.applyThemePreset(themeSelect.value);
    }

    const seedInput = document.getElementById('gen-seed');
    if (seedInput) seedInput.value = Math.floor(Math.random() * 999999);
  }

  async handleGenerate() {
    const theme = document.getElementById('gen-theme')?.value || 'fantasy_kingdom';
    const treeStyle = document.getElementById('gen-tree-style')?.value || 'fantasy';
    const forestDensity = document.getElementById('gen-density')?.value || 'medium';
    const river = document.getElementById('gen-river')?.value || 'yes';
    const road = document.getElementById('gen-road')?.value || 'road';
    const fountain = document.getElementById('gen-fountain')?.value || 'round';
    
    const hedgeGarden = document.getElementById('gen-hedge')?.checked ?? true;
    const market = document.getElementById('gen-market')?.checked ?? true;
    const houseCount = parseInt(document.getElementById('gen-houses')?.value || '3');
    const farm = document.getElementById('gen-farm')?.checked ?? true;
    const watermill = document.getElementById('gen-watermill')?.checked ?? true;
    const mountain = document.getElementById('gen-mountain')?.checked ?? true;

    const w = parseInt(document.getElementById('gen-grid-w')?.value) || 50;
    const h = parseInt(document.getElementById('gen-grid-h')?.value) || 50;
    const seedVal = parseInt(document.getElementById('gen-seed')?.value) || Math.floor(Math.random() * 999999);

    // If grid size changed, resize the grid first
    if (w !== this.placement.gridW || h !== this.placement.gridH) {
      this.placement.resizeGrid(w, h);
      const gwEl = document.getElementById('grid-width');
      const ghEl = document.getElementById('grid-height');
      if (gwEl) gwEl.value = w;
      if (ghEl) ghEl.value = h;
    }

    const options = {
      theme,
      treeStyle,
      forestDensity,
      river,
      road,
      fountain,
      hedgeGarden,
      market,
      houseCount,
      farm,
      watermill,
      mountain,
      seed: seedVal,
      w,
      h
    };

    // Close modal & run generate
    this.overlay.classList.add('hidden');
    document.body.style.cursor = 'wait';

    try {
      await this.mapGenerator.generate(options);
      this.onUpdateStatusBar();
      this.onUpdateMinimap();
      const summary = this.mapGenerator.lastBiomeSummary || 'Custom Fantasy World';
      this.onNotify(`World Generated: ${summary}`);
    } catch (err) {
      console.error("Map Generation error:", err);
      this.onNotify("Generation completed with notices. Check console for details.");
    } finally {
      document.body.style.cursor = 'default';
    }
  }
}
