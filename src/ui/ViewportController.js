/**
 * ViewportController — handles all mouse/keyboard interactions
 * on the 3D viewport: hovering, painting, box-select fill, erase, select,
 * AND transform gizmo interactions (Move/Rotate drag on all 3 axes).
 */
import * as THREE from 'three';

export const GROUND_CATEGORIES = ['ground', 'platform', 'cliff', 'floor', 'tile', 'road', 'path', 'water', 'dirt'];

export function determineLayer(category, filename = '') {
  const cat = (category || '').toLowerCase();
  const fn = (filename || '').toLowerCase();
  if (GROUND_CATEGORIES.includes(cat)) return 'ground';
  if (fn.includes('floor') || fn.includes('ground') || fn.includes('path') || 
      fn.includes('water') || fn.includes('dirt') || fn.includes('grass') || 
      fn.includes('road') || fn.includes('tile') || fn.includes('platform')) {
    return 'ground';
  }
  return 'prop';
}

export default class ViewportController {
  constructor(app, placement, { getSelectedAsset, getToolManager, onUpdateStatusBar, onUpdateMinimap, onUpdatePropertyPanel }) {
    this.app = app;
    this.placement = placement;
    this._getSelectedAsset = getSelectedAsset;
    this._getToolManager = getToolManager;
    this._onUpdateStatusBar = onUpdateStatusBar;
    this._onUpdateMinimap = onUpdateMinimap;
    this._onUpdatePropertyPanel = onUpdatePropertyPanel;

    this._isPainting = false;
    this._isBoxSelecting = false;
    this._boxStartCell = null;
    this._boxCurrentCell = null;

    // Transform drag state
    this._isDraggingGizmo = false;
    this._dragAxis = null;
    this._dragStartWorld = null;
    this._dragOriginalPos = null;
    this._dragOriginalRot = null;
    this._dragStartAngle = null;
  }

  setup() {
    const vp = this.app.viewportEl;
    vp.addEventListener('mousemove', (e) => this._onMouseMove(e));
    vp.addEventListener('mousedown', (e) => this._onMouseDown(e));
    vp.addEventListener('mouseup', async () => await this._onMouseUp());
    vp.addEventListener('mouseleave', () => this._onMouseLeave());
    vp.addEventListener('contextmenu', e => e.preventDefault());
  }

  // ======== RAYCASTING HELPERS ========

  _getWorldHit(e, plane) {
    const rect = this.app.viewportEl.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.app.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.app.camera);
    const intersectVec = new THREE.Vector3();
    const p = plane || this.app.groundPlane;
    if (this.app.raycaster.ray.intersectPlane(p, intersectVec)) {
      return intersectVec;
    }
    return null;
  }

  _hitGizmo(e) {
    const tm = this._getToolManager();
    const gizmo = tm.getGizmoGroup();
    if (!gizmo) return null;

    const rect = this.app.viewportEl.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.app.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.app.camera);

    const intersects = this.app.raycaster.intersectObjects(gizmo.children, true);
    if (intersects.length > 0) {
      let obj = intersects[0].object;
      while (obj && !obj.userData.axis) {
        obj = obj.parent;
      }
      if (obj && obj.userData) {
        this._hitGizmoSign = obj.userData.sign || 1;
        return obj.userData.axis;
      }
    }
    return null;
  }

  // ======== MOUSE EVENTS ========

  _onMouseMove(e) {
    const tm = this._getToolManager();
    const currentTool = tm.getCurrentTool();

    if (this._isDraggingGizmo) {
      this._handleGizmoDrag(e);
      return;
    }

    const cell = this.app.screenToGrid(e.clientX, e.clientY);

    if (cell) {
      if (this._isBoxSelecting) {
        this._boxCurrentCell = cell;
        this.app.showAreaHover(this._boxStartCell.x, this._boxStartCell.z, cell.x, cell.z);
        document.getElementById('status-coords').textContent =
          `Area: ${Math.abs(cell.x - this._boxStartCell.x) + 1}x${Math.abs(cell.z - this._boxStartCell.z) + 1}`;
        this.app.clearGhost();
        return;
      }

      const selectedAsset = this._getSelectedAsset();

      if (currentTool === 't-move' || currentTool === 't-rotate' || currentTool === 't-scale') {
        const gizmoHit = this._hitGizmo(e);
        this.app.viewportEl.style.cursor = gizmoHit ? 'grab' : 'default';
        const tm = this._getToolManager();
        tm.highlightGizmoAxis(gizmoHit, false);
      }

      // Determine target cell accurately
      let targetCell = null;
      if (cell.object3d) {
        targetCell = this.placement.findCellByObject3D(cell.x, cell.z, cell.object3d);
      }
      if (!targetCell) {
        targetCell = this.placement.getCell('prop', cell.x, cell.z);
        if (targetCell) targetCell.layer = 'prop';
        else {
          targetCell = this.placement.getCell('ground', cell.x, cell.z);
          if (targetCell) targetCell.layer = 'ground';
        }
      }
      this._hoveredTargetCell = targetCell;
      
      this.app.clearObjectHighlight();
      
      document.getElementById('status-coords').textContent = `X: ${targetCell ? targetCell.x : cell.x}, Z: ${targetCell ? targetCell.z : cell.z}`;

      if ((currentTool === 'place' || currentTool === 'paint') && selectedAsset && this.app.modelCache[selectedAsset.filename]) {
        // Draw grid hover for placement
        this.app.showHoverAt(cell.x, cell.z, 0xffffff);
        
        const layer = determineLayer(selectedAsset.category, selectedAsset.filename);
        const yOffset = this.placement.calculatePlacementHeight(layer, cell.x, cell.z, selectedAsset.filename);
        this.app.setGhost(this.app.modelCache[selectedAsset.filename], cell.x, cell.z, (tm.currentRotation * Math.PI) / 180, yOffset, selectedAsset.filename);
      } else if (['erase', 'rotate', 'select', 't-select', 't-move', 't-rotate', 't-scale'].includes(currentTool)) {
        this.app.hideHover(); // Don't draw ground tile for selection tools
        
        // Render highlight for hovered object
        if (targetCell && targetCell.object3d) {
          let hoverColor = 0xffffff;
          if (currentTool === 'erase') hoverColor = 0xff4444;
          else if (currentTool === 'rotate') hoverColor = 0x44ffaa;
          else if (['select', 't-select', 't-move', 't-rotate', 't-scale'].includes(currentTool)) hoverColor = 0x88ccff; // Lighter blue for hover

          this.app.setObjectHighlight(targetCell.object3d, hoverColor);
        }
      }

      if (this._isPainting && (currentTool === 'paint' || currentTool === 'place') && selectedAsset) {
        this._doPlace(cell.x, cell.z);
      }
      if (this._isPainting && currentTool === 'erase') {
        this._doErase(cell.x, cell.z);
      }
    } else {
      if (!this._isBoxSelecting) {
        this.app.hideHover();
        this.app.clearGhost();
        this.app.clearObjectHighlight();
        this._hoveredTargetCell = null;
      }
    }
  }

  _onMouseDown(e) {
    if (e.button !== 0) return;
    const tm = this._getToolManager();
    const currentTool = tm.getCurrentTool();

    if (currentTool === 't-move' || currentTool === 't-rotate' || currentTool === 't-scale') {
      const gizmoAxis = this._hitGizmo(e);
      if (gizmoAxis) {
        this._startGizmoDrag(e, gizmoAxis, currentTool);
        return;
      }
    }

    const cell = this.app.screenToGrid(e.clientX, e.clientY);
    if (!cell) return;

    const selectedAsset = this._getSelectedAsset();

    if (e.shiftKey && (currentTool === 'place' || currentTool === 'paint') && selectedAsset) {
      this._isBoxSelecting = true;
      this._boxStartCell = cell;
      this._boxCurrentCell = cell;
      this.app.controls.enabled = false;
      return;
    }

    if (currentTool === 'place' || currentTool === 'paint') {
      this._doPlace(cell.x, cell.z);
      this._isPainting = true;
    } else if (currentTool === 'erase') {
      this._doErase(cell.x, cell.z);
      this._isPainting = true;
    } else if (currentTool === 'select') {
      this._doSelect(cell.x, cell.z);
    } else if (currentTool === 'rotate') {
      this._doRotate(cell.x, cell.z);
    } else if (currentTool === 't-select' || currentTool === 't-move' || currentTool === 't-rotate' || currentTool === 't-scale') {
      this._doTransformSelect(cell.x, cell.z);
    }
  }

  async _onMouseUp() {
    if (this._isDraggingGizmo) {
      this._endGizmoDrag();
      return;
    }
    if (this._isBoxSelecting) {
      this._isBoxSelecting = false;
      this.app.controls.enabled = true;
      if (this._boxStartCell && this._boxCurrentCell && this._getSelectedAsset()) {
        const minX = Math.min(this._boxStartCell.x, this._boxCurrentCell.x);
        const maxX = Math.max(this._boxStartCell.x, this._boxCurrentCell.x);
        const minZ = Math.min(this._boxStartCell.z, this._boxCurrentCell.z);
        const maxZ = Math.max(this._boxStartCell.z, this._boxCurrentCell.z);
        for (let x = minX; x <= maxX; x++) {
          for (let z = minZ; z <= maxZ; z++) {
            await this._doPlace(x, z);
          }
        }
      }
      this._boxStartCell = null;
      this._boxCurrentCell = null;
    }
    this._isPainting = false;
  }

  _onMouseLeave() {
    if (this._isDraggingGizmo) this._endGizmoDrag();
    if (this._isBoxSelecting) {
      this._isBoxSelecting = false;
      this.app.controls.enabled = true;
    }
    this._isPainting = false;
    this.app.hideHover();
    this.app.clearGhost();
    this.app.clearObjectHighlight();
  }

  // ======== PLACEMENT ACTIONS ========

  async _doPlace(x, z) {
    const selectedAsset = this._getSelectedAsset();
    if (!selectedAsset) return;
    const layer = determineLayer(selectedAsset.category, selectedAsset.filename);
    await this.placement.placeAsset(layer, x, z, selectedAsset, this._getToolManager().currentRotation);
    this._onUpdateStatusBar();
    this._onUpdateMinimap();
  }

  _doErase(x, z) {
    if (this._hoveredTargetCell) {
      if (this.placement.selectedCell && 
          this.placement.selectedCell.layer === this._hoveredTargetCell.layer &&
          this.placement.selectedCell.x === this._hoveredTargetCell.x &&
          this.placement.selectedCell.z === this._hoveredTargetCell.z) {
        this.placement.clearSelection();
        this._onUpdatePropertyPanel();
      }
      this.placement.removeSpecificAsset(this._hoveredTargetCell.layer, this._hoveredTargetCell.x, this._hoveredTargetCell.z, this._hoveredTargetCell.object3d);
      this._hoveredTargetCell = null;
      this.app.clearObjectHighlight();
    } else {
      if (this.placement.getCell('prop', x, z)) this.placement.removeAsset('prop', x, z);
      else if (this.placement.getCell('ground', x, z)) this.placement.removeAsset('ground', x, z);
    }
    this._onUpdateStatusBar();
    this._onUpdateMinimap();
  }

  _doSelect(x, z) {
    let target = this._hoveredTargetCell;
    if (!target) {
      const prop = this.placement.getCell('prop', x, z);
      if (prop) target = { layer: 'prop', x, z };
      else {
        const ground = this.placement.getCell('ground', x, z);
        if (ground) target = { layer: 'ground', x, z };
      }
    }
    if (target) {
      this.placement.selectCell(target.layer, target.x, target.z);
    } else {
      this.placement.clearSelection();
    }
    this._onUpdatePropertyPanel();
  }
  
  _doRotate(x, z) {
    let target = this._hoveredTargetCell;
    if (!target) {
      const prop = this.placement.getCell('prop', x, z);
      if (prop) target = { layer: 'prop', x, z };
      else {
        const ground = this.placement.getCell('ground', x, z);
        if (ground) target = { layer: 'ground', x, z };
      }
    }
    if (target) {
      this.placement.selectCell(target.layer, target.x, target.z);
      this.placement.rotateSelected(90);
    }
  }

  _doTransformSelect(x, z) {
    const tm = this._getToolManager();
    let target = this._hoveredTargetCell;
    if (!target) {
      const prop = this.placement.getCell('prop', x, z);
      if (prop) target = { layer: 'prop', x, z };
      else {
        const ground = this.placement.getCell('ground', x, z);
        if (ground) target = { layer: 'ground', x, z };
      }
    }
    
    if (target) {
      this.placement.selectCell(target.layer, target.x, target.z);
      this._onUpdatePropertyPanel();
      if (tm.transformTool === 't-move' || tm.transformTool === 't-rotate' || tm.transformTool === 't-scale') {
        tm._showGizmo(tm.transformTool);
      } else {
        tm._removeGizmo();
      }
    } else {
      this.placement.clearSelection();
      tm._removeGizmo();
      this._onUpdatePropertyPanel();
    }
  }

  // ======== GIZMO DRAG ========

  _startGizmoDrag(e, axis, tool) {
    const sel = this.placement.selectedCell;
    if (!sel) return;
    const cell = this.placement.getCell(sel.layer, sel.x, sel.z);
    if (!cell || !cell.object3d) return;

    this._isDraggingGizmo = true;
    this._dragAxis = axis;
    this._dragTool = tool;
    this._dragOriginalPos = cell.object3d.position.clone();
    this._dragOriginalRot = cell.rotation;
    this._dragOriginalGridX = sel.x;
    this._dragOriginalGridZ = sel.z;

    // Build the correct drag plane based on the axis
    if (tool === 't-move') {
      let axisVec = null;
      if (axis === 'x') axisVec = new THREE.Vector3(1, 0, 0);
      else if (axis === 'y') axisVec = new THREE.Vector3(0, 1, 0);
      else if (axis === 'z') axisVec = new THREE.Vector3(0, 0, 1);
      
      if (axisVec) {
        // Plane containing the axis and facing the camera
        const camDir = new THREE.Vector3();
        this.app.camera.getWorldDirection(camDir);
        const cross = new THREE.Vector3().crossVectors(camDir, axisVec);
        const planeNormal = new THREE.Vector3().crossVectors(axisVec, cross).normalize();
        if (planeNormal.lengthSq() < 0.0001) planeNormal.set(0, 1, 0);
        this._dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, this._dragOriginalPos);
      } else {
        // xz free drag
        this._dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this._dragOriginalPos.y);
      }
    } else if (tool === 't-rotate') {
      if (axis === 'rot-x') {
        this._dragPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -this._dragOriginalPos.x);
      } else if (axis === 'rot-z') {
        this._dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -this._dragOriginalPos.z);
      } else {
        // rot-y (default)
        this._dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this._dragOriginalPos.y);
      }
      this._dragOriginalEuler = cell.object3d.rotation.clone();
    } else if (tool === 't-scale') {
      let axisVec = null;
      if (axis === 'scale-x') axisVec = new THREE.Vector3(1, 0, 0);
      else if (axis === 'scale-y') axisVec = new THREE.Vector3(0, 1, 0);
      else if (axis === 'scale-z') axisVec = new THREE.Vector3(0, 0, 1);

      if (axisVec) {
        const camDir = new THREE.Vector3();
        this.app.camera.getWorldDirection(camDir);
        const cross = new THREE.Vector3().crossVectors(camDir, axisVec);
        const planeNormal = new THREE.Vector3().crossVectors(axisVec, cross).normalize();
        if (planeNormal.lengthSq() < 0.0001) planeNormal.set(0, 1, 0);
        this._dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, this._dragOriginalPos);
      } else {
        this._dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this._dragOriginalPos.y);
      }
      this._dragOriginalScaleX = cell.scaleX !== undefined ? cell.scaleX : 1.0;
      this._dragOriginalScaleY = cell.scaleY !== undefined ? cell.scaleY : 1.0;
      this._dragOriginalScaleZ = cell.scaleZ !== undefined ? cell.scaleZ : 1.0;
    }

    const worldHit = this._getWorldHit(e, this._dragPlane);
    
    if (worldHit) {
      this._dragStartWorld = worldHit.clone();
      if (tool === 't-rotate') {
        const cx = cell.object3d.position.x;
        const cy = cell.object3d.position.y;
        const cz = cell.object3d.position.z;
        if (axis === 'rot-x') {
          this._dragStartAngle = Math.atan2(worldHit.y - cy, worldHit.z - cz);
        } else if (axis === 'rot-z') {
          this._dragStartAngle = Math.atan2(worldHit.y - cy, worldHit.x - cx);
        } else {
          this._dragStartAngle = Math.atan2(worldHit.z - cz, worldHit.x - cx);
        }
      }
    } else {
      return;
    }

    this.app.controls.enabled = false;
    this.app.viewportEl.style.cursor = 'grabbing';
    const tm = this._getToolManager();
    tm.highlightGizmoAxis(axis, true); // Active state
  }

  _handleGizmoDrag(e) {
    const worldHit = this._getWorldHit(e, this._dragPlane);
    if (!worldHit || !this._dragStartWorld) return;

    const sel = this.placement.selectedCell;
    if (!sel) return;
    const cell = this.placement.getCell(sel.layer, sel.x, sel.z);
    if (!cell || !cell.object3d) return;

    const tm = this._getToolManager();
    const snap = tm.getSnapValues();

    if (this._dragTool === 't-move') {
      const delta = worldHit.clone().sub(this._dragStartWorld);
      let newX = this._dragOriginalPos.x;
      let newY = this._dragOriginalPos.y;
      let newZ = this._dragOriginalPos.z;

      if (this._dragAxis === 'x') {
        newX += delta.x;
        if (e.shiftKey) newX = Math.round(newX / 0.01) * 0.01;
        else if (snap.enabled) newX = Math.round(newX / (snap.move * this.app.tileSize)) * (snap.move * this.app.tileSize);
        else newX = Math.round(newX / 0.1) * 0.1;
      } else if (this._dragAxis === 'y') {
        newY += delta.y;
        if (e.shiftKey) newY = Math.round(newY / 0.01) * 0.01;
        else if (snap.enabled) newY = Math.round(newY / (snap.move * this.app.tileSize * 0.5)) * (snap.move * this.app.tileSize * 0.5);
        else newY = Math.round(newY / 0.1) * 0.1;
      } else if (this._dragAxis === 'z') {
        newZ += delta.z;
        if (e.shiftKey) newZ = Math.round(newZ / 0.01) * 0.01;
        else if (snap.enabled) newZ = Math.round(newZ / (snap.move * this.app.tileSize)) * (snap.move * this.app.tileSize);
        else newZ = Math.round(newZ / 0.1) * 0.1;
      } else {
        newX += delta.x;
        newZ += delta.z;
        if (e.shiftKey) {
          newX = Math.round(newX / 0.01) * 0.01;
          newZ = Math.round(newZ / 0.01) * 0.01;
        } else if (snap.enabled) {
          const snapUnit = snap.move * this.app.tileSize;
          newX = Math.round(newX / snapUnit) * snapUnit;
          newZ = Math.round(newZ / snapUnit) * snapUnit;
        } else {
          newX = Math.round(newX / 0.1) * 0.1;
          newZ = Math.round(newZ / 0.1) * 0.1;
        }
      }

      cell.object3d.position.set(newX, newY, newZ);
      tm.updateGizmoPosition();
      this._onUpdatePropertyPanel();

    } else if (this._dragTool === 't-rotate') {
      const cx = this._dragOriginalPos.x;
      const cy = this._dragOriginalPos.y;
      const cz = this._dragOriginalPos.z;

      if (this._dragAxis === 'rot-x') {
        const currentAngle = Math.atan2(worldHit.y - cy, worldHit.z - cz);
        let deltaRad = currentAngle - this._dragStartAngle;
        let newXRad = this._dragOriginalEuler.x + deltaRad;
        if (e.shiftKey) newXRad = (Math.round((newXRad * 180 / Math.PI) / 0.01) * 0.01 * Math.PI) / 180;
        else if (snap.enabled) newXRad = (Math.round((newXRad * 180 / Math.PI) / snap.rotate) * snap.rotate * Math.PI) / 180;
        else newXRad = (Math.round((newXRad * 180 / Math.PI) / 0.1) * 0.1 * Math.PI) / 180;
        cell.object3d.rotation.x = newXRad;
      } else if (this._dragAxis === 'rot-z') {
        const currentAngle = Math.atan2(worldHit.y - cy, worldHit.x - cx);
        let deltaRad = currentAngle - this._dragStartAngle;
        let newZRad = this._dragOriginalEuler.z + deltaRad;
        if (e.shiftKey) newZRad = (Math.round((newZRad * 180 / Math.PI) / 0.01) * 0.01 * Math.PI) / 180;
        else if (snap.enabled) newZRad = (Math.round((newZRad * 180 / Math.PI) / snap.rotate) * snap.rotate * Math.PI) / 180;
        else newZRad = (Math.round((newZRad * 180 / Math.PI) / 0.1) * 0.1 * Math.PI) / 180;
        cell.object3d.rotation.z = newZRad;
      } else {
        // rot-y (default)
        const currentAngle = Math.atan2(worldHit.z - cz, worldHit.x - cx);
        let deltaDeg = ((currentAngle - this._dragStartAngle) * 180) / Math.PI;
        let newRot = this._dragOriginalRot + deltaDeg;
        if (e.shiftKey) newRot = Math.round(newRot / 0.01) * 0.01;
        else if (snap.enabled) newRot = Math.round(newRot / snap.rotate) * snap.rotate;
        else newRot = Math.round(newRot / 0.1) * 0.1;
        newRot = ((newRot % 360) + 360) % 360;
        cell.rotation = newRot;
        cell.object3d.rotation.y = (newRot * Math.PI) / 180;
      }
      this._onUpdatePropertyPanel();

    } else if (this._dragTool === 't-scale') {
      const delta = worldHit.clone().sub(this._dragStartWorld);
      let scaleChange = 0;
      const sign = this._hitGizmoSign || 1;
      
      let newSX = this._dragOriginalScaleX;
      let newSY = this._dragOriginalScaleY;
      let newSZ = this._dragOriginalScaleZ;

      if (this._dragAxis === 'scale-x') {
        scaleChange = delta.x * sign * 0.25;
        newSX = Math.max(0.1, Math.min(20.0, this._dragOriginalScaleX + scaleChange));
      } else if (this._dragAxis === 'scale-y') {
        scaleChange = delta.y * sign * 0.25;
        newSY = Math.max(0.1, Math.min(20.0, this._dragOriginalScaleY + scaleChange));
      } else if (this._dragAxis === 'scale-z') {
        scaleChange = delta.z * sign * 0.25;
        newSZ = Math.max(0.1, Math.min(20.0, this._dragOriginalScaleZ + scaleChange));
      } else if (this._dragAxis === 'scale-all') {
        scaleChange = (delta.x + delta.y + delta.z) * 0.2;
        newSX = Math.max(0.1, Math.min(20.0, this._dragOriginalScaleX + scaleChange));
        newSY = Math.max(0.1, Math.min(20.0, this._dragOriginalScaleY + scaleChange));
        newSZ = Math.max(0.1, Math.min(20.0, this._dragOriginalScaleZ + scaleChange));
      }

      if (e.shiftKey) {
        if (this._dragAxis === 'scale-x' || this._dragAxis === 'scale-all') newSX = Math.round(newSX / 0.01) * 0.01;
        if (this._dragAxis === 'scale-y' || this._dragAxis === 'scale-all') newSY = Math.round(newSY / 0.01) * 0.01;
        if (this._dragAxis === 'scale-z' || this._dragAxis === 'scale-all') newSZ = Math.round(newSZ / 0.01) * 0.01;
      } else if (snap.enabled) {
        if (this._dragAxis === 'scale-x' || this._dragAxis === 'scale-all') newSX = Math.round(newSX / 0.1) * 0.1;
        if (this._dragAxis === 'scale-y' || this._dragAxis === 'scale-all') newSY = Math.round(newSY / 0.1) * 0.1;
        if (this._dragAxis === 'scale-z' || this._dragAxis === 'scale-all') newSZ = Math.round(newSZ / 0.1) * 0.1;
      } else {
        if (this._dragAxis === 'scale-x' || this._dragAxis === 'scale-all') newSX = Math.round(newSX / 0.1) * 0.1;
        if (this._dragAxis === 'scale-y' || this._dragAxis === 'scale-all') newSY = Math.round(newSY / 0.1) * 0.1;
        if (this._dragAxis === 'scale-z' || this._dragAxis === 'scale-all') newSZ = Math.round(newSZ / 0.1) * 0.1;
      }

      cell.scaleX = newSX;
      cell.scaleY = newSY;
      cell.scaleZ = newSZ;
      
      const baseScale = this.app.tileSize;
      cell.object3d.scale.set(baseScale * newSX, baseScale * newSY, baseScale * newSZ);
      this._onUpdatePropertyPanel();
    }
  }

  _endGizmoDrag() {
    this._isDraggingGizmo = false;
    this._dragAxis = null;
    this._dragStartWorld = null;
    this._dragPlane = null;
    this.app.controls.enabled = true;
    this.app.viewportEl.style.cursor = 'default';
    this._onUpdateStatusBar();
    this._onUpdateMinimap();
    this._onUpdatePropertyPanel();
    
    const tm = this._getToolManager();
    tm.highlightGizmoAxis(null);
  }
}
