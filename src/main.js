/**
 * main.js — Thin orchestrator.
 * Wires together all editor modules into a working application.
 *
 * Module structure:
 *   core/
 *     App.js              — Three.js scene, camera, renderer, raycasting
 *   editor/
 *     PlacementController.js — Grid state, place/remove/undo/redo
 *     MapIO.js            — Save & load map JSON
 *   ui/
 *     AssetBrowser.js     — Kit scanning, catalog, asset grid, pagination
 *     ToolManager.js      — Tool switching, toolbar, ghost rotation
 *     ViewportController.js — Mouse events, box fill, place/erase/select
 *     SettingsPanel.js    — Settings modal, grid resize, themes, i18n
 *     MinimapRenderer.js  — 2D canvas minimap
 */
import * as THREE from 'three';
import App from './core/App.js';
import PlacementController from './editor/PlacementController.js';
import MapIO from './editor/MapIO.js';
import AssetBrowser from './ui/AssetBrowser.js';
import ToolManager from './ui/ToolManager.js';
import ViewportController from './ui/ViewportController.js';
import SettingsPanel from './ui/SettingsPanel.js';
import HotkeyManager from './ui/HotkeyManager.js';
import MinimapRenderer from './ui/MinimapRenderer.js';
import MapGenerator from './editor/MapGenerator.js';
import GeneratorDialog from './ui/GeneratorDialog.js';
import DockingManager from './ui/DockingManager.js';

// ===================== SHARED STATE =====================

let selectedAsset = null;

// ===================== INIT CORE =====================

const gridW = parseInt(document.getElementById('grid-width').value) || 50;
const gridH = parseInt(document.getElementById('grid-height').value) || 50;

const app = new App(document.getElementById('viewport'));
app.setGridSize(gridW, gridH);

const placement = new PlacementController(app);
placement.resetGrid(gridW, gridH);

// ===================== UI HELPERS =====================

function notify(message) {
  const el = document.createElement('div');
  el.className = 'notification';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

function updateStatusBar() {
  document.getElementById('status-count').textContent = `Objects: ${placement.countObjects()}`;
}

let lastRenderedCell = null;

function updatePropertyPanel() {
  const container = document.getElementById('prop-content');
  const sel = placement.selectedCell;
  if (!sel) {
    container.innerHTML = '<div class="p-4 text-center text-gray-400 text-xs font-semibold mt-4"><i class="fas fa-mouse-pointer text-2xl mb-2 opacity-30 block"></i>Click an object to inspect</div>';
    lastRenderedCell = null;
    return;
  }
  const cell = placement.getCell(sel.layer, sel.x, sel.z);
  if (!cell) {
    container.innerHTML = '<div class="p-4 text-center text-gray-400 text-xs font-semibold mt-4">Empty cell</div>';
    return;
  }

  const obj = cell.object3d;
  const pos = obj ? obj.position : { x: 0, y: 0, z: 0 };
  const rotX = obj ? ((obj.rotation.x * 180) / Math.PI).toFixed(1) : '0';
  const rotY = (cell.rotation !== undefined ? cell.rotation : 0).toFixed ? cell.rotation : cell.rotation;
  const rotZ = obj ? ((obj.rotation.z * 180) / Math.PI).toFixed(1) : '0';
  const sclX = cell.scaleX !== undefined ? cell.scaleX : 1.0;
  const sclY = cell.scaleY !== undefined ? cell.scaleY : 1.0;
  const sclZ = cell.scaleZ !== undefined ? cell.scaleZ : 1.0;
  const pivX = cell.pivotX !== undefined ? cell.pivotX : 0.0;
  const pivY = cell.pivotY !== undefined ? cell.pivotY : 0.0;
  const pivZ = cell.pivotZ !== undefined ? cell.pivotZ : 0.0;
  const collide = cell.collision !== undefined ? cell.collision : true;

  let baseSizeX = 1, baseSizeY = 1, baseSizeZ = 1;
  const innerMesh = obj ? obj.getObjectByName('mesh_wrapper') : null;
  if (innerMesh) {
    const box = new THREE.Box3().setFromObject(innerMesh);
    const size = new THREE.Vector3();
    box.getSize(size);
    baseSizeX = size.x || 1;
    baseSizeY = size.y || 1;
    baseSizeZ = size.z || 1;
  }
  
  const sizeX = (baseSizeX * sclX).toFixed(2);
  const sizeY = (baseSizeY * sclY).toFixed(2);
  const sizeZ = (baseSizeZ * sclZ).toFixed(2);

  if (lastRenderedCell === cell && document.getElementById('prop-pos-all')) {
    // Fast path: Just update inputs without wiping HTML
    document.getElementById('prop-pos-all').value = `${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}`;
    document.getElementById('prop-pos-x').value = pos.x.toFixed(2);
    document.getElementById('prop-pos-y').value = pos.y.toFixed(2);
    document.getElementById('prop-pos-z').value = pos.z.toFixed(2);

    document.getElementById('prop-rot-all').value = `${rotX}, ${rotY}, ${rotZ}`;
    document.getElementById('prop-rot-x').value = rotX;
    document.getElementById('prop-rot-y').value = rotY;
    document.getElementById('prop-rot-z').value = rotZ;

    document.getElementById('prop-size-all').value = `${sizeX}, ${sizeY}, ${sizeZ}`;
    document.getElementById('prop-size-x').value = sizeX;
    document.getElementById('prop-size-y').value = sizeY;
    document.getElementById('prop-size-z').value = sizeZ;

    document.getElementById('prop-pivot-all').value = `${pivX.toFixed(2)}, ${pivY.toFixed(2)}, ${pivZ.toFixed(2)}`;
    document.getElementById('prop-pivot-x').value = pivX.toFixed(2);
    document.getElementById('prop-pivot-y').value = pivY.toFixed(2);
    document.getElementById('prop-pivot-z').value = pivZ.toFixed(2);

    const collisionCheckbox = document.getElementById('prop-collision');
    if (collisionCheckbox) collisionCheckbox.checked = collide;
    return;
  }

  lastRenderedCell = cell;

  const createVector3Prop = (idPrefix, label, valX, valY, valZ) => {
    return `
    <div class="prop-group mb-1 border-b border-gray-200 pb-1" data-search="${label.toLowerCase()} x y z">
      <div class="prop-row cursor-pointer select-none flex items-center" onclick="document.getElementById('group-${idPrefix}').classList.toggle('hidden'); const i=this.querySelector('i'); i.classList.toggle('fa-caret-right'); i.classList.toggle('fa-caret-down');">
        <div class="w-24 text-xs font-semibold text-gray-700 flex items-center"><i class="fas fa-caret-right w-4 text-gray-400 mr-1"></i> ${label}</div>
        <div class="flex-1"><input type="text" class="w-full text-xs border-gray-300 rounded p-1" id="prop-${idPrefix}-all" value="${valX}, ${valY}, ${valZ}" onclick="event.stopPropagation()" /></div>
      </div>
      <div id="group-${idPrefix}" class="pl-4 hidden relative mt-1">
        <div class="absolute left-[7px] top-0 bottom-3 border-l-2 border-gray-200"></div>
        <div class="prop-row relative flex items-center mt-1">
          <div class="absolute left-[-9px] top-[14px] w-3 border-t-2 border-gray-200"></div>
          <div class="w-20 text-xs text-gray-600 pl-4 font-medium">X</div>
          <div class="flex-1"><input type="number" class="w-full text-xs border-gray-300 rounded p-1" id="prop-${idPrefix}-x" value="${valX}" step="0.1" /></div>
        </div>
        <div class="prop-row relative flex items-center mt-1">
          <div class="absolute left-[-9px] top-[14px] w-3 border-t-2 border-gray-200"></div>
          <div class="w-20 text-xs text-gray-600 pl-4 font-medium">Y</div>
          <div class="flex-1"><input type="number" class="w-full text-xs border-gray-300 rounded p-1" id="prop-${idPrefix}-y" value="${valY}" step="0.1" /></div>
        </div>
        <div class="prop-row relative flex items-center mt-1">
          <div class="absolute left-[-9px] top-[14px] w-3 border-t-2 border-gray-200"></div>
          <div class="w-20 text-xs text-gray-600 pl-4 font-medium">Z</div>
          <div class="flex-1"><input type="number" class="w-full text-xs border-gray-300 rounded p-1" id="prop-${idPrefix}-z" value="${valZ}" step="0.1" /></div>
        </div>
      </div>
    </div>
    `;
  };

  container.innerHTML = `
    <!-- Search Bar -->
    <div class="mb-2 sticky top-0 bg-white z-10 pt-2 pb-2">
      <input type="text" id="prop-search" class="w-full text-xs border-gray-300 rounded p-1" placeholder="Filter Properties..." />
    </div>

    <!-- Data Category -->
    <div class="bg-gray-100 font-semibold p-1 text-xs border-b border-gray-300 flex items-center text-gray-700 prop-category cursor-pointer select-none" onclick="document.getElementById('cat-identity').classList.toggle('hidden'); const i=this.querySelector('i'); i.classList.toggle('fa-caret-right'); i.classList.toggle('fa-caret-down');">
      <i class="fas fa-caret-down w-4 text-center"></i> Identity
    </div>
    <div id="cat-identity">
      <div class="prop-group" data-search="asset category layer identity">
        <div class="prop-row mt-1">
          <div class="prop-name">Asset</div>
          <div class="prop-value truncate" title="${cell.asset}">${cell.asset.split('/').pop()}</div>
        </div>
        <div class="prop-row text-gray-500">
          <div class="prop-name">Category</div>
          <div class="prop-value">${cell.category || '—'}</div>
        </div>
        <div class="prop-row mb-1">
          <div class="prop-name">Layer</div>
          <div class="prop-value">${sel.layer}</div>
        </div>
      </div>
    </div>

    <!-- Transform Category -->
    <div class="bg-gray-100 font-semibold p-1 text-xs border-b border-gray-300 flex items-center text-gray-700 mt-2 prop-category cursor-pointer select-none" onclick="document.getElementById('cat-transform').classList.toggle('hidden'); const i=this.querySelector('i'); i.classList.toggle('fa-caret-right'); i.classList.toggle('fa-caret-down');">
      <i class="fas fa-caret-down w-4 text-center"></i> Transform
    </div>
    <div id="cat-transform">
      ${createVector3Prop('pos', 'Position', pos.x.toFixed(2), pos.y.toFixed(2), pos.z.toFixed(2))}
      ${createVector3Prop('rot', 'Rotation', rotX, rotY, rotZ)}
      ${createVector3Prop('size', 'Size', sizeX, sizeY, sizeZ)}
      ${createVector3Prop('pivot', 'Pivot', pivX.toFixed(2), pivY.toFixed(2), pivZ.toFixed(2))}
    </div>

    <!-- Physics Category -->
    <div class="bg-gray-100 font-semibold p-1 text-xs border-b border-gray-300 flex items-center text-gray-700 mt-2 prop-category cursor-pointer select-none" onclick="document.getElementById('cat-physics').classList.toggle('hidden'); const i=this.querySelector('i'); i.classList.toggle('fa-caret-right'); i.classList.toggle('fa-caret-down');">
      <i class="fas fa-caret-down w-4 text-center"></i> Physics
    </div>
    <div id="cat-physics">
      <div class="prop-group mb-1" data-search="collision physics">
        <div class="prop-row mt-1">
          <div class="prop-name">Collision</div>
          <div class="prop-value flex items-center"><input type="checkbox" id="prop-collision" class="rounded border-gray-400" ${collide ? 'checked' : ''} /></div>
        </div>
      </div>
    </div>
  `;

  // Wire up bidirectional bindings
  const bindInput = (id, applyFn) => {
    const el = document.getElementById(id);
    if (!el) return;
    const handler = () => {
      const v = parseFloat(el.value);
      if (isNaN(v)) { el.classList.add('prop-input-error'); return; }
      el.classList.remove('prop-input-error');
      applyFn(v);
    };
    el.addEventListener('change', handler);
    el.addEventListener('input', handler);
  };

  bindInput('prop-pos-x', (v) => { if (obj) obj.position.x = v; toolManager.updateGizmoPosition(); });
  bindInput('prop-pos-y', (v) => { if (obj) obj.position.y = v; toolManager.updateGizmoPosition(); });
  bindInput('prop-pos-z', (v) => { if (obj) obj.position.z = v; toolManager.updateGizmoPosition(); });

  // Helper to parse "x, y, z" string
  const parseVector3 = (str) => {
    const parts = str.split(',').map(s => parseFloat(s.trim()));
    if (parts.length === 3 && parts.every(p => !isNaN(p))) {
      return { x: parts[0], y: parts[1], z: parts[2] };
    }
    return null;
  };

  const bindVector3All = (idPrefix, applyFn) => {
    const el = document.getElementById(`prop-${idPrefix}-all`);
    if (!el) return;
    const handler = () => {
      const vec = parseVector3(el.value);
      if (!vec) { el.classList.add('prop-input-error'); return; }
      el.classList.remove('prop-input-error');
      
      document.getElementById(`prop-${idPrefix}-x`).value = vec.x;
      document.getElementById(`prop-${idPrefix}-y`).value = vec.y;
      document.getElementById(`prop-${idPrefix}-z`).value = vec.z;

      applyFn(vec.x, vec.y, vec.z);
    };
    el.addEventListener('change', handler);
  };

  const bindVector3Single = (idPrefix, axis, applyFn) => {
    const el = document.getElementById(`prop-${idPrefix}-${axis}`);
    if (!el) return;
    const handler = () => {
      const v = parseFloat(el.value);
      if (isNaN(v)) { el.classList.add('prop-input-error'); return; }
      el.classList.remove('prop-input-error');
      
      const x = document.getElementById(`prop-${idPrefix}-x`).value;
      const y = document.getElementById(`prop-${idPrefix}-y`).value;
      const z = document.getElementById(`prop-${idPrefix}-z`).value;
      document.getElementById(`prop-${idPrefix}-all`).value = `${x}, ${y}, ${z}`;

      applyFn(v);
    };
    el.addEventListener('change', handler);
    el.addEventListener('input', handler);
  };

  // Position
  const applyPos = (x, y, z) => {
    if (obj) { obj.position.set(x, y, z); toolManager.updateGizmoPosition(); }
  };
  bindVector3All('pos', applyPos);
  bindVector3Single('pos', 'x', (v) => applyPos(v, obj ? obj.position.y : 0, obj ? obj.position.z : 0));
  bindVector3Single('pos', 'y', (v) => applyPos(obj ? obj.position.x : 0, v, obj ? obj.position.z : 0));
  bindVector3Single('pos', 'z', (v) => applyPos(obj ? obj.position.x : 0, obj ? obj.position.y : 0, v));

  // Rotation
  const applyRot = (x, y, z) => {
    if (obj) { obj.rotation.set(x * Math.PI/180, y * Math.PI/180, z * Math.PI/180); }
    cell.rotation = y;
  };
  bindVector3All('rot', applyRot);
  bindVector3Single('rot', 'x', (v) => { if (obj) obj.rotation.x = v * Math.PI/180; });
  bindVector3Single('rot', 'y', (v) => { if (obj) obj.rotation.y = v * Math.PI/180; cell.rotation = v; });
  bindVector3Single('rot', 'z', (v) => { if (obj) obj.rotation.z = v * Math.PI/180; });

  // Size
  const applySizeAxis = (axis, v) => {
    if (v <= 0) return;
    let baseS = 1;
    if (axis === 'x') baseS = baseSizeX;
    if (axis === 'y') baseS = baseSizeY;
    if (axis === 'z') baseS = baseSizeZ;
    const newScl = v / baseS;
    
    if (axis === 'x') { cell.scaleX = newScl; if (obj) obj.scale.x = app.tileSize * newScl; }
    if (axis === 'y') { cell.scaleY = newScl; if (obj) obj.scale.y = app.tileSize * newScl; }
    if (axis === 'z') { cell.scaleZ = newScl; if (obj) obj.scale.z = app.tileSize * newScl; }
    toolManager.updateGizmoPosition();
  };
  bindVector3All('size', (x, y, z) => { applySizeAxis('x', x); applySizeAxis('y', y); applySizeAxis('z', z); });
  bindVector3Single('size', 'x', (v) => applySizeAxis('x', v));
  bindVector3Single('size', 'y', (v) => applySizeAxis('y', v));
  bindVector3Single('size', 'z', (v) => applySizeAxis('z', v));

  // Pivot
  const applyPivotAxis = (axis, v) => {
    if (axis === 'x') {
      cell.pivotX = v;
      const inner = obj ? obj.getObjectByName('mesh_wrapper') : null;
      if (inner) inner.position.x = -(cell.basePivotX + v);
    } else if (axis === 'y') {
      cell.pivotY = v;
      const inner = obj ? obj.getObjectByName('mesh_wrapper') : null;
      if (inner) inner.position.y = -(cell.basePivotY + v);
    } else if (axis === 'z') {
      cell.pivotZ = v;
      const inner = obj ? obj.getObjectByName('mesh_wrapper') : null;
      if (inner) inner.position.z = -(cell.basePivotZ + v);
    }
  };
  bindVector3All('pivot', (x, y, z) => { applyPivotAxis('x', x); applyPivotAxis('y', y); applyPivotAxis('z', z); });
  bindVector3Single('pivot', 'x', (v) => applyPivotAxis('x', v));
  bindVector3Single('pivot', 'y', (v) => applyPivotAxis('y', v));
  bindVector3Single('pivot', 'z', (v) => applyPivotAxis('z', v));

  // Search Filter Logic
  const searchInput = document.getElementById('prop-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase().trim();
      const groups = container.querySelectorAll('.prop-group');
      const categories = container.querySelectorAll('.prop-category');
      
      groups.forEach(group => {
        const keywords = group.getAttribute('data-search') || '';
        if (term === '' || keywords.includes(term)) {
          group.style.display = 'block';
        } else {
          group.style.display = 'none';
        }
      });
      
      // Hide categories if all their children are hidden (simple implementation)
      // Since categories are just visual separators, we could leave them or hide them.
      // For simplicity, we just filter the prop-groups.
    });
  }

  const collisionCheckbox = document.getElementById('prop-collision');
  if (collisionCheckbox) {
    collisionCheckbox.addEventListener('change', () => {
      cell.collision = collisionCheckbox.checked;
    });
  }
}

// ===================== INIT MODULES =====================

const minimap = new MinimapRenderer(placement);
const updateMinimap = () => minimap.update();

const assetBrowser = new AssetBrowser(app, (asset) => {
  selectedAsset = asset;
  toolManager.setTool('place');
  toolManager.currentRotation = 0;
});

const toolManager = new ToolManager(app, placement, {
  onSave: () => mapIO.save(),
  onUpdateMinimap: updateMinimap,
  onUpdatePropertyPanel: updatePropertyPanel,
  onUpdateStatusBar: updateStatusBar,
  getSelectedAsset: () => selectedAsset,
  getCurrentRotation: () => toolManager.currentRotation,
  setCurrentRotation: (r) => { toolManager.currentRotation = r; }
});
toolManager.currentRotation = 0;

const viewport = new ViewportController(app, placement, {
  getSelectedAsset: () => selectedAsset,
  getToolManager: () => toolManager,
  onUpdateStatusBar: updateStatusBar,
  onUpdateMinimap: updateMinimap,
  onUpdatePropertyPanel: updatePropertyPanel,
});

const settingsPanel = new SettingsPanel(app, placement, {
  onUpdateMinimap: updateMinimap,
  onNotify: notify
});

const mapIO = new MapIO(placement, assetBrowser, {
  onUpdateStatusBar: updateStatusBar,
  onUpdateMinimap: updateMinimap,
  onNotify: notify
});

const mapGenerator = new MapGenerator(placement, assetBrowser, app);

const hotkeys = new HotkeyManager(placement, toolManager, {
  onUpdateMinimap: updateMinimap,
  onUpdateStatusBar: updateStatusBar,
  onUpdatePropertyPanel: updatePropertyPanel,
  onSave: () => mapIO.save()
});

// ===================== START EDITOR =====================

async function startEditor() {
  const setupSec = document.getElementById('setup-section');
  if (setupSec) setupSec.style.display = 'none';
  const browserSec = document.getElementById('browser-section');
  if (browserSec) browserSec.style.display = 'flex';

  await assetBrowser.prepareTextures();
  assetBrowser.buildCatalog();
  await assetBrowser.loadDefaultModels(); // Load pre-provided models!
  
  // Rerender catalog & filters
  assetBrowser.renderCategoryFilter();
  assetBrowser.renderAssetGrid();
  
  // Hook up Layer Tabs (Props vs Ground)
  document.querySelectorAll('.layer-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.layer-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const layer = btn.textContent.toLowerCase().includes('ground') ? 'ground' : 'props';
      assetBrowser.setLayerFilter(layer);
    });
  });
  assetBrowser.renderAssetGrid();
}

// Initialize module listeners
toolManager.setupToolbar();
viewport.setup();
settingsPanel.setup();
hotkeys.setup();
assetBrowser.setupSearch();
updateStatusBar();

// Auto-start editor immediately on page load!
startEditor();

// ===================== PANEL RESIZING & TOGGLING =====================

// Left Resizer
const resizerLeft = document.getElementById('resizer-left');
const leftDock = document.getElementById('dock-left');
let isResizingLeft = false;

if (resizerLeft && leftDock) {
  resizerLeft.addEventListener('mousedown', (e) => {
    isResizingLeft = true;
    resizerLeft.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  });
}

// Right Resizer
const resizerRight = document.getElementById('resizer-right');
const rightDock = document.getElementById('dock-right');
let isResizingRight = false;

if (resizerRight && rightDock) {
  resizerRight.addEventListener('mousedown', (e) => {
    isResizingRight = true;
    resizerRight.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  });
}

// Minimap Resizer
const resizerMinimap = document.getElementById('resizer-minimap');
const minimapContainer = document.getElementById('minimap-container');
let isResizingMinimap = false;

if (resizerMinimap && minimapContainer) {
  resizerMinimap.addEventListener('mousedown', (e) => {
    isResizingMinimap = true;
    resizerMinimap.classList.add('bg-blue-500');
    document.body.style.cursor = 'row-resize';
    e.preventDefault();
  });
}

window.addEventListener('mousemove', (e) => {
  if (isResizingLeft) {
    const newW = Math.max(180, Math.min(e.clientX, 500));
    leftDock.style.width = `${newW}px`;
    if (app && app.onResize) app.onResize();
  } else if (isResizingRight) {
    const newW = Math.max(200, Math.min(window.innerWidth - e.clientX, 500));
    rightDock.style.width = `${newW}px`;
    if (app && app.onResize) app.onResize();
  } else if (isResizingMinimap) {
    const rect = rightDock.getBoundingClientRect();
    const newH = Math.max(120, Math.min(e.clientY - rect.top, rect.height - 100));
    minimapContainer.style.height = `${newH}px`;
    updateMinimap();
  }
});

window.addEventListener('mouseup', () => {
  if (isResizingLeft || isResizingRight || isResizingMinimap) {
    isResizingLeft = false;
    isResizingRight = false;
    isResizingMinimap = false;
    if (resizerLeft) resizerLeft.classList.remove('dragging');
    if (resizerRight) resizerRight.classList.remove('dragging');
    if (resizerMinimap) resizerMinimap.classList.remove('bg-blue-500');
    document.body.style.cursor = 'default';
  }
});

// Panel Visibility Toggles
function togglePanel(panelEl, chkEl, resizerEl) {
  if (!panelEl) return;
  const isHidden = panelEl.style.display === 'none';
  if (isHidden) {
    panelEl.style.display = 'flex';
    if (resizerEl) resizerEl.style.display = 'block';
    if (chkEl) chkEl.style.display = 'inline-block';
  } else {
    panelEl.style.display = 'none';
    if (resizerEl) resizerEl.style.display = 'none';
    if (chkEl) chkEl.style.display = 'none';
  }
  if (app && app.onResize) app.onResize();
}

// Left Asset Panel Toggles
const toggleLeft = () => togglePanel(leftDock, document.getElementById('chk-toolbox'), resizerLeft);
document.getElementById('btn-toggle-left-panel')?.addEventListener('click', toggleLeft);
document.getElementById('btn-quick-toolbox')?.addEventListener('click', toggleLeft);
document.getElementById('btn-collapse-left')?.addEventListener('click', toggleLeft);

// Right Panel Toggles (Properties)
const toggleRight = () => togglePanel(rightDock, document.getElementById('chk-props'), resizerRight);
document.getElementById('btn-toggle-props-panel')?.addEventListener('click', toggleRight);
document.getElementById('btn-quick-props')?.addEventListener('click', toggleRight);
document.getElementById('btn-collapse-right')?.addEventListener('click', toggleRight);

// Minimap Full Toggle
const toggleMinimap = () => {
  if (!minimapContainer) return;
  const isHidden = minimapContainer.style.display === 'none';
  minimapContainer.style.display = isHidden ? 'flex' : 'none';
  const chk = document.getElementById('chk-minimap');
  if (chk) chk.style.display = isHidden ? 'inline-block' : 'none';
};
document.getElementById('btn-toggle-minimap-panel')?.addEventListener('click', toggleMinimap);
document.getElementById('btn-quick-minimap')?.addEventListener('click', toggleMinimap);

// Vertical Minimize Helpers
function toggleVerticalMinimize(btnId, contentSelectors) {
  document.getElementById(btnId)?.addEventListener('click', (e) => {
    // find the dockable panel wrapper to avoid affecting drag
    const panel = e.target.closest('.dockable-panel');
    if (!panel) return;
    
    let isMinimized = false;
    contentSelectors.forEach(selector => {
      const el = panel.querySelector(selector);
      if (el) {
        isMinimized = el.style.display === 'none';
        el.style.display = isMinimized ? '' : 'none';
      }
    });
    
    // Toggle icon
    const icon = e.currentTarget.querySelector('i');
    if (icon) {
      if (!isMinimized) {
        icon.classList.remove('fa-minus');
        icon.classList.add('fa-plus');
      } else {
        icon.classList.remove('fa-plus');
        icon.classList.add('fa-minus');
      }
    }
    if (app && app.onResize) app.onResize();
  });
}

toggleVerticalMinimize('btn-minimize-toolbox', ['#browser-section', '#setup-section']);
toggleVerticalMinimize('btn-toggle-minimap-minimize', ['.relative.bg-slate-900']);
toggleVerticalMinimize('btn-minimize-props', ['#prop-content']);

// Action Ribbon Toggle
const ribbon = document.getElementById('action-ribbon');
document.getElementById('btn-toggle-ribbon')?.addEventListener('click', () => {
  if (!ribbon) return;
  const isHidden = ribbon.style.display === 'none';
  ribbon.style.display = isHidden ? 'flex' : 'none';
  const chk = document.getElementById('chk-ribbon');
  if (chk) chk.style.display = isHidden ? 'inline-block' : 'none';
});

// Reset Layout
document.getElementById('btn-reset-layout')?.addEventListener('click', () => {
  if (leftDock) { leftDock.style.display = 'flex'; leftDock.style.width = '270px'; }
  if (rightDock) { rightDock.style.display = 'flex'; rightDock.style.width = '280px'; }
  if (minimapContainer) minimapContainer.style.display = 'flex';
  if (ribbon) ribbon.style.display = 'flex';
  if (resizerLeft) resizerLeft.style.display = 'block';
  if (resizerRight) resizerRight.style.display = 'block';
  notify('Layout reset!');
  if (app && app.onResize) app.onResize();
});

// File Menu Binds
document.getElementById('btn-file-new')?.addEventListener('click', () => {
  placement.resetGrid(placement.gridW, placement.gridH);
  updateStatusBar();
  updateMinimap();
  notify('New Map Created');
});
document.getElementById('btn-save-menu')?.addEventListener('click', () => mapIO.save());
const handleUndo = async () => {
  await placement.undo();
  updateStatusBar();
  updateMinimap();
  if (placement.selectedCell) {
    const { layer, x, z } = placement.selectedCell;
    if (!placement.getCell(layer, x, z)) placement.clearSelection();
    updatePropertyPanel();
  }
};

const handleRedo = async () => {
  await placement.redo();
  updateStatusBar();
  updateMinimap();
  if (placement.selectedCell) {
    const { layer, x, z } = placement.selectedCell;
    if (!placement.getCell(layer, x, z)) placement.clearSelection();
    updatePropertyPanel();
  }
};

document.getElementById('menu-undo')?.addEventListener('click', handleUndo);
document.getElementById('menu-redo')?.addEventListener('click', handleRedo);
document.getElementById('btn-undo')?.addEventListener('click', handleUndo);
document.getElementById('btn-redo')?.addEventListener('click', handleRedo);
const generatorDialog = new GeneratorDialog(app, placement, mapGenerator, {
  onUpdateMinimap: updateMinimap,
  onUpdateStatusBar: updateStatusBar,
  onNotify: notify
});
generatorDialog.setup();

document.getElementById('btn-settings-menu')?.addEventListener('click', () => {
  document.getElementById('settings-overlay').classList.remove('hidden');
});

// Add kit folder handler
document.getElementById('btn-add-kit')?.addEventListener('click', async () => {
  try {
    const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
    await assetBrowser.scanKitFolder(dirHandle);
    await assetBrowser.prepareTextures();
    assetBrowser.buildCatalog();
    assetBrowser.renderCategoryFilter();
    assetBrowser.renderAssetGrid();
    notify('Đã thêm folder mới!');
  } catch (e) {
    if (e.name !== 'AbortError') console.error(e);
  }
});

document.getElementById('btn-load-map')?.addEventListener('click', () => mapIO.load(app, startEditor));

// ===================== FLOATING WINDOW DRAGGING =====================

function makeDraggable(el, headerEl) {
  if (!el || !headerEl) return;
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

  headerEl.onmousedown = (e) => {
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'I' || e.target.tagName === 'INPUT') return;
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  };

  function elementDrag(e) {
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    el.style.top = Math.max(0, el.offsetTop - pos2) + "px";
    el.style.left = Math.max(0, el.offsetLeft - pos1) + "px";
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

const floatingMinimap = document.getElementById('large-minimap-overlay');
const minimapHeader = document.getElementById('minimap-drag-header');
makeDraggable(floatingMinimap, minimapHeader);

document.getElementById('btn-close-large-minimap')?.addEventListener('click', () => {
  if (floatingMinimap) floatingMinimap.classList.add('hidden');
});

const dockingManager = new DockingManager();
dockingManager.init();
