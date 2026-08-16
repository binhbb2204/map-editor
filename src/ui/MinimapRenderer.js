/**
 * MinimapRenderer — renders the 2D minimap overview onto canvas elements.
 */
export const MINIMAP_COLORS = {
  'ground_grass': '#2d6a4f',
  'ground_river': '#1565c0',
  'ground_path': '#8d6e63',
  'ground': '#2d6a4f',
  'cliff': '#795548',
  'path': '#6d4c41',
  'road': '#546e7a',
  'tree': '#1b4332',
  'rock': '#78909c',
  'stone': '#607d8b',
  'bridge': '#a1887f',
  'fence': '#bcaaa4',
  'tent': '#e65100',
  'campfire': '#ff6d00',
  'plant': '#4caf50',
  'flower': '#e91e63',
  'mushroom': '#9c27b0',
  'cactus': '#7cb342',
  'grass': '#66bb6a',
  'lily': '#26a69a',
  'crop': '#aed581',
  'crops': '#aed581',
  'canoe': '#00838f',
  'watermill': '#4db6ac',
  'log': '#6d4c41',
  'stump': '#5d4037',
  'statue': '#9e9e9e',
  'sign': '#ff9800',
  'platform': '#4e342e',
  'pot': '#ff7043',
  'hanging': '#66bb6a',
  'wall': '#b0bec5',
  'roof': '#ef9a9a',
  'stairs': '#90a4ae',
  'fountain': '#4fc3f7',
  'hedge': '#388e3c',
  'lantern': '#ffee58',
  'banner': '#e53935',
  'cart': '#a1887f',
  'stall': '#ff8f00',
};

export default class MinimapRenderer {
  constructor(placement) {
    this.placement = placement;
  }

  update() {
    this.renderToCanvas('minimap');
    this.renderToCanvas('minimap-large');
  }

  getCellColor(cell) {
    if (!cell) return null;
    const name = cell.asset || '';
    for (const key of Object.keys(MINIMAP_COLORS)) {
      if (name.startsWith(key)) return MINIMAP_COLORS[key];
    }
    if (cell.category && MINIMAP_COLORS[cell.category]) return MINIMAP_COLORS[cell.category];
    return null;
  }

  renderToCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cellSize = Math.min(w / this.placement.gridW, h / this.placement.gridH);
    const renderW = cellSize * this.placement.gridW;
    const renderH = cellSize * this.placement.gridH;
    const offsetX = (w - renderW) / 2;
    const offsetY = (h - renderH) / 2;

    // Background
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, w, h);

    // Map area background
    ctx.fillStyle = '#161b22';
    ctx.fillRect(offsetX, offsetY, renderW, renderH);

    // Grid lines
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = canvasId === 'minimap-large' ? 1.5 : 0.5;
    for (let x = 0; x <= this.placement.gridW; x++) {
      ctx.beginPath(); ctx.moveTo(offsetX + x * cellSize, offsetY); ctx.lineTo(offsetX + x * cellSize, offsetY + renderH); ctx.stroke();
    }
    for (let z = 0; z <= this.placement.gridH; z++) {
      ctx.beginPath(); ctx.moveTo(offsetX, offsetY + z * cellSize); ctx.lineTo(offsetX + renderW, offsetY + z * cellSize); ctx.stroke();
    }

    // Ground layer
    this.placement.forEachCell(this.placement.groundLayer, (cell, x, z) => {
      if (cell) {
        ctx.fillStyle = this.getCellColor(cell) || '#3e2723';
        ctx.fillRect(offsetX + x * cellSize + 0.5, offsetY + z * cellSize + 0.5, cellSize - 1, cellSize - 1);
      }
    });

    // Prop layer (array per cell)
    this.placement.forEachCell(this.placement.propLayer, (cellArr, x, z) => {
      if (!cellArr || cellArr.length === 0) return;
      cellArr.forEach((cell, i) => {
        const color = this.getCellColor(cell);
        if (!color) return;
        ctx.fillStyle = color;
        const pad = cellSize * (0.15 + i * 0.05);
        ctx.fillRect(offsetX + x * cellSize + pad, offsetY + z * cellSize + pad, cellSize - pad * 2, cellSize - pad * 2);
      });
    });
  }
}
