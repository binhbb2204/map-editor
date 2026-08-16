/**
 * ToolManager — handles tool switching, toolbar UI,
 * layer toggles, ghost rotation, and transform tools.
 */
import * as THREE from 'three';

export default class ToolManager {
  constructor(app, placement, { onSave, onUpdateMinimap, onUpdatePropertyPanel, onUpdateStatusBar, getSelectedAsset, getCurrentRotation, setCurrentRotation }) {
    this.app = app;
    this.placement = placement;
    this.currentTool = 'select';
    this.currentRotation = 0;

    // Transform tool state
    this.transformTool = null; // 't-select' | 't-move' | 't-rotate' | 't-scale'
    this.snapEnabled = true;
    this.moveSnap = 1;
    this.rotateSnap = 90;

    this._onSave = onSave;
    this._onUpdateMinimap = onUpdateMinimap;
    this._onUpdatePropertyPanel = onUpdatePropertyPanel;
    this._onUpdateStatusBar = onUpdateStatusBar;
    this._getSelectedAsset = getSelectedAsset;
    this._getCurrentRotation = getCurrentRotation;
    this._setCurrentRotation = setCurrentRotation;
  }

  setTool(tool) {
    this.currentTool = tool;
    this.transformTool = null;

    // Clear all highlights
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tool-${tool}`)?.classList.add('active');
    document.getElementById('status-tool').textContent = `Tool: ${tool.charAt(0).toUpperCase() + tool.slice(1)}`;

    this.app.clearGhost();
    this._removeGizmo();

    if (tool === 'select') {
      this.app.viewportEl.style.cursor = 'default';
      this.app.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
    } else if (tool === 'erase') {
      this.app.viewportEl.style.cursor = 'not-allowed';
      this.app.controls.mouseButtons.LEFT = null;
    } else {
      this.app.viewportEl.style.cursor = 'crosshair';
      this.app.controls.mouseButtons.LEFT = null;
    }
  }

  setTransformTool(tool) {
    this.transformTool = tool;
    this.currentTool = tool; // So viewport knows the active mode

    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tool-${tool}`)?.classList.add('active');

    const labels = { 't-select': 'Select', 't-move': 'Move', 't-rotate': 'Rotate', 't-scale': 'Scale' };
    document.getElementById('status-tool').textContent = `Tool: ${labels[tool] || tool}`;

    this.app.clearGhost();

    if (tool === 't-select' || tool === 't-move' || tool === 't-rotate' || tool === 't-scale') {
      this.app.viewportEl.style.cursor = 'default';
      this.app.controls.mouseButtons.LEFT = null;
    }

    // Show gizmo for selected object when switching to move/rotate/scale
    if ((tool === 't-move' || tool === 't-rotate' || tool === 't-scale') && this.placement.selectedCell) {
      this._showGizmo(tool);
    } else {
      this._removeGizmo();
    }
  }

  getCurrentTool() {
    return this.currentTool;
  }

  isTransformTool() {
    return this.transformTool !== null;
  }

  updateGhostRotation() {
    if (this.app.ghostObject) {
      this.app.ghostObject.rotation.y = (this._getCurrentRotation() * Math.PI) / 180;
    }
  }

  // ======== GIZMO MANAGEMENT ========

  _showGizmo(tool) {
    this._removeGizmo();
    const sel = this.placement.selectedCell;
    if (!sel) return;

    const cell = this.placement.getCell(sel.layer, sel.x, sel.z);
    if (!cell || !cell.object3d) return;

    const pos = cell.object3d.position.clone();
    pos.y += 0.1;

    const gizmoGroup = new THREE.Group();
    gizmoGroup.userData.isGizmo = true;    if (tool === 't-move') {
      const createArrow = (color, axisDir, axisName) => {
        const group = new THREE.Group();
        let hoverC = color;
        if (axisName === 'x') hoverC = 0xff6666;
        if (axisName === 'y') hoverC = 0x66ff66;
        if (axisName === 'z') hoverC = 0x6666ff;
        
        group.userData = { axis: axisName, defaultColor: color, hoverColor: hoverC, activeColor: 0xffea00 };
        const mat = new THREE.MeshBasicMaterial({ color: color, depthTest: false });

        const shaftGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.5, 16);
        const shaft = new THREE.Mesh(shaftGeo, mat);
        shaft.position.y = 0.75;

        const headGeo = new THREE.ConeGeometry(0.22, 0.5, 16);
        const head = new THREE.Mesh(headGeo, mat);
        head.position.y = 1.75;

        const arrowContent = new THREE.Group();
        arrowContent.add(shaft);
        arrowContent.add(head);

        if (axisDir.x === 1) arrowContent.rotation.z = -Math.PI / 2;
        else if (axisDir.x === -1) arrowContent.rotation.z = Math.PI / 2;
        else if (axisDir.y === -1) arrowContent.rotation.z = Math.PI;
        else if (axisDir.z === 1) arrowContent.rotation.x = Math.PI / 2;
        else if (axisDir.z === -1) arrowContent.rotation.x = -Math.PI / 2;
        
        group.add(arrowContent);
        return group;
      };

      gizmoGroup.add(createArrow(0xff0000, new THREE.Vector3(1, 0, 0), 'x'));
      gizmoGroup.add(createArrow(0xff0000, new THREE.Vector3(-1, 0, 0), 'x'));
      gizmoGroup.add(createArrow(0x00ff00, new THREE.Vector3(0, 1, 0), 'y'));
      gizmoGroup.add(createArrow(0x00ff00, new THREE.Vector3(0, -1, 0), 'y'));
      gizmoGroup.add(createArrow(0x0000ff, new THREE.Vector3(0, 0, 1), 'z'));
      gizmoGroup.add(createArrow(0x0000ff, new THREE.Vector3(0, 0, -1), 'z'));

      // Center sphere (free XZ drag)
      const sphereGeo = new THREE.SphereGeometry(0.3, 16, 16);
      const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffff33, depthTest: false });
      const sphere = new THREE.Mesh(sphereGeo, sphereMat);
      sphere.userData = { axis: 'xz', defaultColor: 0xffff33, hoverColor: 0xffffff, activeColor: 0xffffff };
      gizmoGroup.add(sphere);

    } else if (tool === 't-rotate') {
      // 3D Oxyz Rotation rings (Red X, Green Y, Blue Z)
      const createRing = (color, axisName, rotEuler) => {
        const ringGeo = new THREE.TorusGeometry(1.8, 0.05, 12, 64);
        let hoverC = color;
        if (axisName === 'rot-x') hoverC = 0xff6666;
        if (axisName === 'rot-y') hoverC = 0x66ff66;
        if (axisName === 'rot-z') hoverC = 0x6666ff;
        const ringMat = new THREE.MeshBasicMaterial({ color: color, depthTest: false, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.copy(rotEuler);
        ring.userData = { axis: axisName, defaultColor: color, hoverColor: hoverC, activeColor: 0xffea00 };
        return ring;
      };

      // X ring (Red, rotates around X axis)
      gizmoGroup.add(createRing(0xff0000, 'rot-x', new THREE.Euler(0, Math.PI / 2, 0)));
      // Y ring (Green, rotates around Y axis - flat on XZ)
      gizmoGroup.add(createRing(0x00ff00, 'rot-y', new THREE.Euler(Math.PI / 2, 0, 0)));
      // Z ring (Blue, rotates around Z axis - flat on XY)
      gizmoGroup.add(createRing(0x0000ff, 'rot-z', new THREE.Euler(0, 0, 0)));
    } else if (tool === 't-scale') {
      // Scale gizmo with cube handles at +Ox, -Ox, +Oy, -Oy, +Oz, -Oz
      const createScaleHandle = (color, axisDir, axisName, sign) => {
        const group = new THREE.Group();
        let hoverC = color;
        if (axisName === 'scale-x') hoverC = 0xff6666;
        if (axisName === 'scale-y') hoverC = 0x66ff66;
        if (axisName === 'scale-z') hoverC = 0x6666ff;

        group.userData = { axis: axisName, sign: sign, defaultColor: color, hoverColor: hoverC, activeColor: 0xffea00 };
        const mat = new THREE.MeshBasicMaterial({ color: color, depthTest: false });

        // Line shaft
        const points = [new THREE.Vector3(0, 0, 0), axisDir.clone().multiplyScalar(2.0)];
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineBasicMaterial({ color: color, depthTest: false, linewidth: 3 });
        const line = new THREE.Line(lineGeo, lineMat);

        // Sphere handle at tip
        const boxGeo = new THREE.SphereGeometry(0.12, 16, 16);
        const box = new THREE.Mesh(boxGeo, mat);
        box.position.copy(axisDir.clone().multiplyScalar(2.075));

        group.add(line);
        group.add(box);
        return group;
      };

      gizmoGroup.add(createScaleHandle(0xff0000, new THREE.Vector3(1, 0, 0), 'scale-x', 1));
      gizmoGroup.add(createScaleHandle(0xff0000, new THREE.Vector3(-1, 0, 0), 'scale-x', -1));
      gizmoGroup.add(createScaleHandle(0x00ff00, new THREE.Vector3(0, 1, 0), 'scale-y', 1));
      gizmoGroup.add(createScaleHandle(0x00ff00, new THREE.Vector3(0, -1, 0), 'scale-y', -1));
      gizmoGroup.add(createScaleHandle(0x0000ff, new THREE.Vector3(0, 0, 1), 'scale-z', 1));
      gizmoGroup.add(createScaleHandle(0x0000ff, new THREE.Vector3(0, 0, -1), 'scale-z', -1));

      // Center sphere for uniform scale
      const centerBoxGeo = new THREE.SphereGeometry(0.18, 16, 16);
      const centerBoxMat = new THREE.MeshBasicMaterial({ color: 0xffff33, depthTest: false });
      const centerBox = new THREE.Mesh(centerBoxGeo, centerBoxMat);
      centerBox.userData = { axis: 'scale-all', sign: 1, defaultColor: 0xffff33, hoverColor: 0xffffff, activeColor: 0xffffff };
      gizmoGroup.add(centerBox);
    }

    gizmoGroup.position.copy(pos);
    this.app.scene.add(gizmoGroup);
    this._gizmoGroup = gizmoGroup;
  }

  _removeGizmo() {
    if (this._gizmoGroup) {
      this.app.scene.remove(this._gizmoGroup);
      this._gizmoGroup = null;
    }
  }

  highlightGizmoAxis(axis, isActive = false) {
    if (!this._gizmoGroup) return;
    this._gizmoGroup.children.forEach(c => {
      let colorHex = c.userData.defaultColor;
      let targetScale = 1.0;

      if (c.userData.axis === axis) {
        colorHex = isActive ? c.userData.activeColor : c.userData.hoverColor;
        targetScale = isActive ? 1.4 : 1.15; // Scale up noticeably when active/dragging, slightly when hovering
      }

      // Update scale
      c.scale.set(targetScale, targetScale, targetScale);

      // Update color for thick arrows (which are groups containing meshes)
      if (c.type === 'Group') {
        c.children.forEach(child => {
          if (child.type === 'Group') {
            child.children.forEach(mesh => mesh.material.color.setHex(colorHex));
          }
        });
      } else if (c.material && c.material.color) {
        // Sphere or ring
        c.material.color.setHex(colorHex);
      }
    });
  }

  updateGizmoPosition() {
    if (!this._gizmoGroup) return;
    const sel = this.placement.selectedCell;
    if (!sel) return;
    const cell = this.placement.getCell(sel.layer, sel.x, sel.z);
    if (!cell || !cell.object3d) return;
    const pos = cell.object3d.position.clone();
    pos.y += 0.1;
    this._gizmoGroup.position.copy(pos);
  }

  getGizmoGroup() {
    return this._gizmoGroup || null;
  }

  // ======== SNAP ========

  getSnapValues() {
    return {
      enabled: this.snapEnabled,
      move: this.moveSnap,
      rotate: this.rotateSnap
    };
  }

  // ======== LAYER VISIBILITY ========

  toggleLayerVisibility(layer, visible) {
    const grid = this.placement.getLayer(layer);
    this.placement.forEachCell(grid, (cell) => {
      if (cell && cell.object3d) cell.object3d.visible = visible;
    });
  }

  // ======== SETUP ========

  setupToolbar() {
    // Original placement tools
    document.getElementById('tool-select').addEventListener('click', () => this.setTool('select'));
    document.getElementById('tool-place').addEventListener('click', () => this.setTool('place'));
    document.getElementById('tool-paint').addEventListener('click', () => this.setTool('paint'));
    document.getElementById('tool-erase').addEventListener('click', () => this.setTool('erase'));

    // Rotation buttons
    document.getElementById('btn-rotate-cw').addEventListener('click', () => {
      if (this.placement.selectedCell) {
        this.placement.rotateSelected(90);
        this._onUpdatePropertyPanel();
        if (this.transformTool === 't-rotate') this._showGizmo('t-rotate');
      } else {
        this._setCurrentRotation((this._getCurrentRotation() + 90) % 360);
        this.updateGhostRotation();
      }
    });
    document.getElementById('btn-rotate-ccw').addEventListener('click', () => {
      if (this.placement.selectedCell) {
        this.placement.rotateSelected(-90);
        this._onUpdatePropertyPanel();
        if (this.transformTool === 't-rotate') this._showGizmo('t-rotate');
      } else {
        this._setCurrentRotation((this._getCurrentRotation() - 90 + 360) % 360);
        this.updateGhostRotation();
      }
    });

    document.getElementById('btn-save').addEventListener('click', this._onSave);

    // Layer toggles
    document.getElementById('layer-ground').addEventListener('click', (e) => {
      e.target.classList.toggle('active');
      this.toggleLayerVisibility('ground', e.target.classList.contains('active'));
    });
    document.getElementById('layer-prop').addEventListener('click', (e) => {
      e.target.classList.toggle('active');
      this.toggleLayerVisibility('prop', e.target.classList.contains('active'));
    });

    // ---- Transform Tools ----
    document.getElementById('tool-t-select').addEventListener('click', () => this.setTransformTool('t-select'));
    document.getElementById('tool-t-move').addEventListener('click', () => this.setTransformTool('t-move'));
    document.getElementById('tool-t-rotate').addEventListener('click', () => this.setTransformTool('t-rotate'));
    document.getElementById('tool-t-scale').addEventListener('click', () => this.setTransformTool('t-scale'));

    // Snap settings
    const snapCheckbox = document.getElementById('snap-enabled');
    const snapMoveInput = document.getElementById('snap-move-val');
    const snapRotateInput = document.getElementById('snap-rotate-val');

    snapCheckbox.addEventListener('change', () => {
      this.snapEnabled = snapCheckbox.checked;
    });
    snapMoveInput.addEventListener('change', () => {
      this.moveSnap = parseFloat(snapMoveInput.value) || 1;
    });
    snapRotateInput.addEventListener('change', () => {
      this.rotateSnap = parseInt(snapRotateInput.value) || 90;
    });
  }
}
