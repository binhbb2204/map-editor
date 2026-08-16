/**
 * PlacementController — manages the 2-layer grid data, 
 * placing/removing objects, undo/redo, and scene sync.
 */
export default class PlacementController {
  constructor(app) {
    this.app = app;
    this.gridW = app.gridW;
    this.gridH = app.gridH;

    // 2 layer grids: ground is single object, prop is array of objects
    this.groundLayer = this.createEmptyGrid(false);
    this.propLayer = this.createEmptyGrid(true);

    // History for undo/redo
    this.history = [];
    this.historyIndex = -1;

    // Currently selected
    this.selectedCell = null; // { x, z, layer }

    // Selection highlight
    this.selectionBox = null;
  }

  createEmptyGrid(isArray = false) {
    const grid = [];
    for (let z = 0; z < this.gridH; z++) {
      grid[z] = [];
      for (let x = 0; x < this.gridW; x++) {
        grid[z][x] = isArray ? [] : null;
      }
    }
    return grid;
  }

  resetGrid(w, h) {
    this.gridW = w;
    this.gridH = h;
    this.forEachCell(this.groundLayer, (cell) => {
      if (cell && cell.object3d) this.app.scene.remove(cell.object3d);
    });
    this.forEachCell(this.propLayer, (cellArr) => {
      if (cellArr) cellArr.forEach(c => { if(c.object3d) this.app.scene.remove(c.object3d); });
    });
    this.groundLayer = this.createEmptyGrid(false);
    this.propLayer = this.createEmptyGrid(true);
    this.history = [];
    this.historyIndex = -1;
  }

  resizeGrid(newW, newH) {
    const oldW = this.gridW;
    const oldH = this.gridH;
    this.gridW = newW;
    this.gridH = newH;
    
    // Resize arrays
    for (let z = 0; z < newH; z++) {
      if (!this.groundLayer[z]) this.groundLayer[z] = [];
      if (!this.propLayer[z]) this.propLayer[z] = [];
      
      // Ensure all cols up to newW exist
      for (let x = 0; x < newW; x++) {
        if (this.groundLayer[z][x] === undefined) this.groundLayer[z][x] = null;
        if (this.propLayer[z][x] === undefined) this.propLayer[z][x] = [];
      }
      
      // Trim cols if shrinking (and remove objects)
      if (oldW > newW) {
        for (let x = newW; x < oldW; x++) {
          if (this.groundLayer[z][x]?.object3d) this.app.scene.remove(this.groundLayer[z][x].object3d);
          if (this.propLayer[z][x]) this.propLayer[z][x].forEach(c => { if(c.object3d) this.app.scene.remove(c.object3d); });
        }
        this.groundLayer[z].length = newW;
        this.propLayer[z].length = newW;
      }
    }
    
    // Trim rows if shrinking
    if (oldH > newH) {
      for (let z = newH; z < oldH; z++) {
        if (this.groundLayer[z]) {
          for (let x = 0; x < oldW; x++) {
            if (this.groundLayer[z][x]?.object3d) this.app.scene.remove(this.groundLayer[z][x].object3d);
          }
        }
        if (this.propLayer[z]) {
          for (let x = 0; x < oldW; x++) {
            if (this.propLayer[z][x]) this.propLayer[z][x].forEach(c => { if(c.object3d) this.app.scene.remove(c.object3d); });
          }
        }
      }
      this.groundLayer.length = newH;
      this.propLayer.length = newH;
    }
    
    this.app.setGridSize(newW, newH);
  }

  forEachCell(grid, fn) {
    for (let z = 0; z < grid.length; z++) {
      for (let x = 0; x < (grid[z] ? grid[z].length : 0); x++) {
        fn(grid[z][x], x, z);
      }
    }
  }

  getLayer(layerName) {
    return layerName === 'ground' ? this.groundLayer : this.propLayer;
  }

  getCell(layer, x, z) {
    const grid = this.getLayer(layer);
    if (z >= 0 && z < grid.length && x >= 0 && x < grid[z].length) {
      if (layer === 'prop') {
        const arr = grid[z][x];
        return arr && arr.length > 0 ? arr[arr.length - 1] : null;
      }
      return grid[z][x];
    }
    return null;
  }

  findCellByObject3D(x, z, object3d) {
    const checkCell = (cx, cz) => {
      const pArr = this.propLayer[cz][cx];
      if (pArr) {
        for (let i = pArr.length - 1; i >= 0; i--) {
          if (pArr[i].object3d === object3d) return { layer: 'prop', index: i, ...pArr[i], x: cx, z: cz };
        }
      }
      const gCell = this.groundLayer[cz][cx];
      if (gCell && gCell.object3d === object3d) return { layer: 'ground', ...gCell, x: cx, z: cz };
      return null;
    };

    // Fast path: try provided x, z
    if (z >= 0 && z < this.gridH && x >= 0 && x < this.gridW) {
      const cell = checkCell(x, z);
      if (cell) return cell;
    }
    
    // Slow path: full grid search (required if object has been dragged to another physical cell)
    for (let cz = 0; cz < this.gridH; cz++) {
      for (let cx = 0; cx < this.gridW; cx++) {
        const cell = checkCell(cx, cz);
        if (cell) return cell;
      }
    }
    return null;
  }

  /** Place an asset on the grid. Returns the 3D object. */
  async placeAsset(layer, x, z, assetInfo, rotation = 0, skipHistory = false) {
    const grid = this.getLayer(layer);
    if (z < 0 || z >= this.gridH || x < 0 || x >= this.gridW) return null;

    // Remove existing object at this cell for ground, or check stack for prop
    let oldCell = null;
    if (layer === 'ground') {
      oldCell = grid[z][x];
      if (oldCell && oldCell.object3d) {
        this.app.scene.remove(oldCell.object3d);
      }
    } else {
      const arr = grid[z][x];
      if (arr.length > 0) {
        const top = arr[arr.length - 1];
        if (top.asset === assetInfo.filename && top.rotation === rotation) {
          // Prevent infinite stacking of the exact same object during drag
          return null;
        }
      }
    }

    // Load model
    let obj;
    try {
      obj = await this.app.loadModel(assetInfo.filename, assetInfo.fileHandle, assetInfo.url);
    } catch (e) {
      console.error('Failed to load model', assetInfo.filename, e);
      return null;
    }

    // CRITICAL FIX (Issue 14): Clone materials per-instance so highlighting
    // one object doesn't mutate the shared material affecting all instances.
    obj.traverse(c => {
      if (c.isMesh && c.material) {
        c.material = c.material.clone();
      }
    });

    // Wrap to support custom Pivot
    const wrapper = new THREE.Group();
    obj.name = 'mesh_wrapper';
    wrapper.add(obj);

    // In modular tile kits (Kenney kits), the (0,0) origin is ALREADY the tile center!
    // Edge/wall assets (hedge, wall, fence) are authored at tile boundaries.
    const autoPivotX = 0;
    const autoPivotY = 0;
    const autoPivotZ = 0;

    obj.position.set(0, 0, 0);

    // Normalize scale per kit (survival-kit uses 0.5 base units, so needs 2.0x packScale)
    let packScale = 1.0;
    if (assetInfo.filename && assetInfo.filename.toLowerCase().includes('survival-kit')) {
      packScale = 2.0;
    }
    const scale = this.app.tileSize * packScale;
    wrapper.scale.set(scale, scale, scale);

    // Position
    const pos = this.app.gridToWorld(x, z);
    
    // Auto-calculate height if placing a prop on top of ground
    const yOffset = this.calculatePlacementHeight(layer, x, z, assetInfo.filename);
    
    const rotatedPivot = new THREE.Vector3(autoPivotX * scale, autoPivotY * scale, autoPivotZ * scale);
    const rotEuler = new THREE.Euler(0, rotation * Math.PI / 180, 0);
    rotatedPivot.applyEuler(rotEuler);

    wrapper.position.set(pos.x + rotatedPivot.x, yOffset + rotatedPivot.y, pos.z + rotatedPivot.z);
    wrapper.rotation.y = rotEuler.y;

    this.app.scene.add(wrapper);

    const cellData = {
      asset: assetInfo.filename,
      fileHandle: assetInfo.fileHandle,
      rotation: rotation,
      category: assetInfo.category,
      code: assetInfo.code,
      collision: true,  // Default: collidable (Issue 16)
      scaleX: 1.0,
      scaleY: 1.0,
      scaleZ: 1.0,
      basePivotX: autoPivotX,
      basePivotY: autoPivotY,
      basePivotZ: autoPivotZ,
      pivotX: 0.0,
      pivotY: 0.0,
      pivotZ: 0.0
    };
    // Make sure object3d points to the wrapper!
    cellData.object3d = wrapper;
    if (layer === 'ground') {
      grid[z][x] = cellData;
    } else {
      grid[z][x].push(cellData);
    }

    // Record history
    if (!skipHistory) {
      this.pushHistory({
        type: 'place',
        layer, x, z,
        newData: { filename: assetInfo.filename, fileHandle: assetInfo.fileHandle, category: assetInfo.category, code: assetInfo.code, rotation },
        oldData: oldCell ? { filename: oldCell.asset, fileHandle: oldCell.fileHandle, category: oldCell.category, code: oldCell.code, rotation: oldCell.rotation } : null
      });
    }

    return obj;
  }

  removeAsset(layer, x, z, skipHistory = false) {
    const grid = this.getLayer(layer);
    if (z < 0 || z >= this.gridH || x < 0 || x >= this.gridW) return;

    let cell = null;
    if (layer === 'prop') {
      const arr = grid[z][x];
      if (!arr || arr.length === 0) return;
      cell = arr.pop();
    } else {
      cell = grid[z][x];
      if (!cell) return;
      grid[z][x] = null;
    }

    if (cell.object3d) {
      this.app.scene.remove(cell.object3d);
    }

    if (!skipHistory) {
      this.pushHistory({
        type: 'remove',
        layer, x, z,
        oldData: { filename: cell.asset, fileHandle: cell.fileHandle, category: cell.category, code: cell.code, rotation: cell.rotation }
      });
    }
  }

  removeSpecificAsset(layer, x, z, object3d, skipHistory = false) {
    const grid = this.getLayer(layer);
    if (z < 0 || z >= this.gridH || x < 0 || x >= this.gridW) return;

    let cell = null;
    if (layer === 'prop') {
      const arr = grid[z][x];
      if (!arr || arr.length === 0) return;
      const index = arr.findIndex(c => c.object3d === object3d);
      if (index !== -1) {
        cell = arr[index];
        arr.splice(index, 1);
      }
    } else {
      cell = grid[z][x];
      if (cell && cell.object3d === object3d) {
        grid[z][x] = null;
      } else {
        cell = null;
      }
    }

    if (!cell) return;

    if (cell.object3d) {
      this.app.scene.remove(cell.object3d);
    }

    if (!skipHistory) {
      this.pushHistory({
        type: 'remove',
        layer, x, z,
        oldData: { filename: cell.asset, fileHandle: cell.fileHandle, category: cell.category, code: cell.code, rotation: cell.rotation }
      });
    }
  }

  /** Rotate selected object */
  rotateSelected(deltaAngle) {
    if (!this.selectedCell) return;
    const { x, z, layer } = this.selectedCell;
    const cell = this.getCell(layer, x, z);
    if (!cell) return;

    const oldRot = cell.rotation;
    cell.rotation = (cell.rotation + deltaAngle + 360) % 360;
    cell.object3d.rotation.y = (cell.rotation * Math.PI) / 180;

    this.pushHistory({
      type: 'rotate',
      layer, x, z,
      oldRotation: oldRot,
      newRotation: cell.rotation
    });
  }

  /** Select a cell (for property panel) */
  selectCell(layer, x, z) {
    if (this.selectedCell) {
      const oldCell = this.getCell(this.selectedCell.layer, this.selectedCell.x, this.selectedCell.z);
      if (oldCell && oldCell.object3d) {
        this.app.clearSelectionHighlight();
      }
    }
    this.selectedCell = { x, z, layer };
    const cell = this.getCell(layer, x, z);
    if (cell && cell.object3d) {
      this.app.setSelectionHighlight(cell.object3d, 0x58a6ff);
    }
  }
  clearSelection() {
    if (this.selectedCell) {
      const cell = this.getCell(this.selectedCell.layer, this.selectedCell.x, this.selectedCell.z);
      if (cell && cell.object3d) {
        this.app.clearSelectionHighlight();
      }
    }
    this.selectedCell = null;
    this.app.clearSelectionHighlight();
  }

  /** Undo/Redo */
  pushHistory(action) {
    // Trim future
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(action);
    this.historyIndex = this.history.length - 1;
  }

  async undo() {
    if (this.historyIndex < 0) return;
    const action = this.history[this.historyIndex];
    this.historyIndex--;
    await this.revertAction(action);
  }

  async redo() {
    if (this.historyIndex >= this.history.length - 1) return;
    this.historyIndex++;
    const action = this.history[this.historyIndex];
    await this.applyAction(action);
  }

  async revertAction(action) {
    if (action.type === 'place') {
      if (action.oldData) {
        await this.placeAsset(action.layer, action.x, action.z, action.oldData, action.oldData.rotation, true);
      } else {
        this.removeAsset(action.layer, action.x, action.z, true);
      }
    } else if (action.type === 'remove') {
      await this.placeAsset(action.layer, action.x, action.z, action.oldData, action.oldData.rotation, true);
    } else if (action.type === 'rotate') {
      const cell = this.getCell(action.layer, action.x, action.z);
      if (cell) {
        cell.rotation = action.oldRotation;
        cell.object3d.rotation.y = (cell.rotation * Math.PI) / 180;
      }
    }
  }

  async applyAction(action) {
    if (action.type === 'place') {
      await this.placeAsset(action.layer, action.x, action.z, action.newData, action.newData.rotation, true);
    } else if (action.type === 'remove') {
      this.removeAsset(action.layer, action.x, action.z, true);
    } else if (action.type === 'rotate') {
      const cell = this.getCell(action.layer, action.x, action.z);
      if (cell) {
        cell.rotation = action.newRotation;
        cell.object3d.rotation.y = (cell.rotation * Math.PI) / 180;
      }
    }
  }

  /** Get dynamic height of the ground cell at x, z */
  calculatePlacementHeight(layer, x, z, filename = '') {
    if (layer !== 'prop') return 0;
    
    let yOffset = this.getGroundHeightAt(x, z, filename);
    yOffset += 0.01; // Z-fighting epsilon

    // Auto-lift roofs that are placed over empty space
    if (filename.toLowerCase().includes('roof') && yOffset < 0.1) {
      let maxAdj = 0;
      const neighbors = [[-1,0], [1,0], [0,-1], [0,1]];
      for (const [dx, dz] of neighbors) {
        const nx = x + dx, nz = z + dz;
        if (nx >= 0 && nx < this.gridW && nz >= 0 && nz < this.gridH) {
          const arr = this.propLayer[nz][nx];
          if (arr) {
            for (const c of arr) {
              if (c.asset.toLowerCase().includes('roof') && c.object3d) {
                maxAdj = Math.max(maxAdj, c.object3d.position.y);
              }
            }
          }
        }
      }
      if (maxAdj > 0) {
        yOffset = maxAdj;
      } else {
        yOffset = this.app.tileSize; // Default to 1-story height
      }
    }
    return yOffset;
  }

  getGroundHeightAt(x, z, placingFilename = '') {
    if (z < 0 || z >= this.gridH || x < 0 || x >= this.gridW) return 0;
    
    const objectsToTest = [];
    const groundCell = this.groundLayer[z][x];
    if (groundCell && groundCell.object3d) objectsToTest.push(groundCell.object3d);
    
    const isPlacingFoliage = /tree|grass|flower|mushroom|bush|plant/i.test(placingFilename);

    if (this.propLayer[z][x]) {
      for (const p of this.propLayer[z][x]) {
        if (p.object3d) {
          const fn = (p.asset || '').toLowerCase();
          // Never stack foliage on top of trees, and don't treat trees as platforms
          if (fn.includes('tree') || (isPlacingFoliage && (fn.includes('grass') || fn.includes('flower') || fn.includes('bush')))) {
            continue;
          }
          objectsToTest.push(p.object3d);
        }
      }
    }

    if (objectsToTest.length > 0) {
      let maxY = 0;
      for (const obj of objectsToTest) {
        const box = new THREE.Box3().setFromObject(obj);
        if (box.max.y > maxY && box.max.y < 1000) {
          maxY = box.max.y;
        }
      }
      if (maxY > 0) return maxY;
    }
    return 0;
  }

  /** Count total objects */
  countObjects() {
    let count = 0;
    this.forEachCell(this.groundLayer, (c) => { if (c) count++; });
    this.forEachCell(this.propLayer, (arr) => { if (arr) count += arr.length; });
    return count;
  }

  /** Export map as JSON */
  exportJSON(mapName = 'arena_map') {
    const objects = [];

    this.forEachCell(this.groundLayer, (cell, x, z) => {
      if (cell) {
        objects.push({
          asset: cell.asset,
          x, z, // Logical grid coords
          posX: cell.object3d ? cell.object3d.position.x : undefined,
          posY: cell.object3d ? cell.object3d.position.y : undefined,
          posZ: cell.object3d ? cell.object3d.position.z : undefined,
          rotX: cell.object3d ? cell.object3d.rotation.x : undefined,
          rotY: cell.object3d ? cell.object3d.rotation.y : undefined,
          rotZ: cell.object3d ? cell.object3d.rotation.z : undefined,
          rotation: cell.rotation, // Logical rotation for backward compat
          scaleX: cell.scaleX,
          scaleY: cell.scaleY,
          scaleZ: cell.scaleZ,
          basePivotX: cell.basePivotX,
          basePivotY: cell.basePivotY,
          basePivotZ: cell.basePivotZ,
          pivotX: cell.pivotX,
          pivotY: cell.pivotY,
          pivotZ: cell.pivotZ,
          collision: cell.collision,
          layer: 'ground'
        });
      }
    });

    this.forEachCell(this.propLayer, (cellArr, x, z) => {
      if (cellArr) {
        for (const cell of cellArr) {
          objects.push({
            asset: cell.asset,
            x, z,
            posX: cell.object3d ? cell.object3d.position.x : undefined,
            posY: cell.object3d ? cell.object3d.position.y : undefined,
            posZ: cell.object3d ? cell.object3d.position.z : undefined,
            rotX: cell.object3d ? cell.object3d.rotation.x : undefined,
            rotY: cell.object3d ? cell.object3d.rotation.y : undefined,
            rotZ: cell.object3d ? cell.object3d.rotation.z : undefined,
            rotation: cell.rotation,
            scaleX: cell.scaleX,
            scaleY: cell.scaleY,
            scaleZ: cell.scaleZ,
            basePivotX: cell.basePivotX,
            basePivotY: cell.basePivotY,
            basePivotZ: cell.basePivotZ,
            pivotX: cell.pivotX,
            pivotY: cell.pivotY,
            pivotZ: cell.pivotZ,
            collision: cell.collision,
            layer: 'prop'
          });
        }
      }
    });

    return {
      mapName,
      gridSize: { width: this.gridW, height: this.gridH },
      tileSize: this.app.tileSize,
      objects
    };
  }

  /** Import map from JSON */
  async importJSON(data, fileHandles) {
    this.resetGrid(data.gridSize.width, data.gridSize.height);
    this.app.setGridSize(data.gridSize.width, data.gridSize.height);

    for (const obj of data.objects) {
      const handle = fileHandles[obj.asset];
      if (!handle) {
        console.warn('Missing file handle for', obj.asset);
        continue;
      }
      const obj3d = await this.placeAsset(obj.layer, obj.x, obj.z, {
        filename: obj.asset,
        fileHandle: handle,
        category: obj.asset.split('_')[0],
        code: ''
      }, obj.rotation || 0, true);

      // Apply custom transforms and settings
      if (obj3d) {
        const cell = this.getCell(obj.layer, obj.x, obj.z);
        if (cell) {
          if (obj.posX !== undefined) obj3d.position.x = obj.posX;
          if (obj.posY !== undefined) obj3d.position.y = obj.posY;
          if (obj.posZ !== undefined) obj3d.position.z = obj.posZ;
          
          if (obj.rotX !== undefined) obj3d.rotation.x = obj.rotX;
          if (obj.rotY !== undefined) obj3d.rotation.y = obj.rotY;
          if (obj.rotZ !== undefined) obj3d.rotation.z = obj.rotZ;

          if (obj.scaleX !== undefined) cell.scaleX = obj.scaleX; else cell.scaleX = obj.scaleMultiplier || 1.0;
          if (obj.scaleY !== undefined) cell.scaleY = obj.scaleY; else cell.scaleY = obj.scaleMultiplier || 1.0;
          if (obj.scaleZ !== undefined) cell.scaleZ = obj.scaleZ; else cell.scaleZ = obj.scaleMultiplier || 1.0;
          
          const baseScale = this.app.tileSize;
          obj3d.scale.set(baseScale * cell.scaleX, baseScale * cell.scaleY, baseScale * cell.scaleZ);

          if (obj.collision !== undefined) {
            cell.collision = obj.collision;
          }

          if (obj.basePivotX !== undefined) cell.basePivotX = obj.basePivotX; else cell.basePivotX = 0;
          if (obj.basePivotY !== undefined) cell.basePivotY = obj.basePivotY; else cell.basePivotY = 0;
          if (obj.basePivotZ !== undefined) cell.basePivotZ = obj.basePivotZ; else cell.basePivotZ = 0;

          if (obj.pivotX !== undefined) cell.pivotX = obj.pivotX; else cell.pivotX = 0;
          if (obj.pivotY !== undefined) cell.pivotY = obj.pivotY; else cell.pivotY = 0;
          if (obj.pivotZ !== undefined) cell.pivotZ = obj.pivotZ; else cell.pivotZ = 0;

          const inner = obj3d.getObjectByName('mesh_wrapper');
          if (inner) inner.position.set(-(cell.basePivotX + cell.pivotX), -(cell.basePivotY + cell.pivotY), -(cell.basePivotZ + cell.pivotZ));
        }
      }
    }
  }
}

// Need THREE for Box3
import * as THREE from 'three';
