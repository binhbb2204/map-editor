import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Core 3D scene, camera, renderer, grid, raycasting
 */
export default class App {
  constructor(viewportEl) {
    this.viewportEl = viewportEl;
    this.gridW = 20;
    this.gridH = 20;
    this.tileSize = 2;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    // Camera
    const aspect = viewportEl.clientWidth / viewportEl.clientHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
    this.camera.position.set(this.gridW, 20, this.gridH + 10);
    this.camera.lookAt(this.gridW / 2, 0, this.gridH / 2);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(viewportEl.clientWidth, viewportEl.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    viewportEl.appendChild(this.renderer.domElement);

    // Watch for flex layout changes
    const ro = new ResizeObserver(() => this.onResize());
    ro.observe(viewportEl);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set((this.gridW * this.tileSize) / 2, 0, (this.gridH * this.tileSize) / 2);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.maxPolarAngle = Math.PI / 2.1;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE
    };
    // Custom WASD direction-aware key panning
    this.keysPressed = {};
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      this.keysPressed[e.code] = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keysPressed[e.code] = false;
    });
    this.controls.update();

    // Lights
    this.ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    this.scene.add(this.ambientLight);
    this.dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    this.dirLight.position.set(30, 50, 30);
    this.dirLight.castShadow = true;
    this.scene.add(this.dirLight);
    this.hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x556b2f, 0.8);
    this.scene.add(this.hemiLight);

    // Grid Visual
    this.gridGroup = new THREE.Group();
    this.scene.add(this.gridGroup);
    this.buildGrid();

    // Raycasting
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // Ghost preview
    this.ghostObject = null;

    // Hover highlight
    this.hoverIndicator = new THREE.Mesh(
      new THREE.PlaneGeometry(this.tileSize, this.tileSize),
      new THREE.MeshBasicMaterial({ color: 0x58a6ff, transparent: true, opacity: 0.15, side: THREE.DoubleSide })
    );
    this.hoverIndicator.rotation.x = -Math.PI / 2;
    this.hoverIndicator.position.y = 0.02;
    this.hoverIndicator.visible = false;
    this.scene.add(this.hoverIndicator);

    // GLTF Loader
    this.gltfLoader = new GLTFLoader();
    this.modelCache = {};   // filename -> THREE.Object3D
    this.loadingFiles = {};

    // Thumbnail renderer (offscreen)
    this.thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.thumbRenderer.setSize(128, 128);
    this.thumbRenderer.outputColorSpace = THREE.SRGBColorSpace;
    this.thumbScene = new THREE.Scene();
    this.thumbCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    const thumbLight = new THREE.AmbientLight(0xffffff, 1.0);
    this.thumbScene.add(thumbLight);
    const thumbDir = new THREE.DirectionalLight(0xffffff, 0.6);
    thumbDir.position.set(3, 5, 3);
    this.thumbScene.add(thumbDir);

    // Orientation HUD (Top Right Gizmo)
    this.hudScene = new THREE.Scene();
    // Use Orthographic for clear axes without perspective distortion
    this.hudCamera = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.1, 100);
    
    // Rounded Box
    const cubeGeo = new RoundedBoxGeometry(1.2, 1.2, 1.2, 4, 0.15);
    const cubeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15, depthTest: false, depthWrite: false });
    this.hudCube = new THREE.Mesh(cubeGeo, cubeMat);
    const edgesGeo = new THREE.EdgesGeometry(cubeGeo);
    const edgesMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });
    const edges = new THREE.LineSegments(edgesGeo, edgesMat);
    this.hudCube.add(edges);
    
    // XYZ Arrows & Labels
    const createLabel = (text, color) => {
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.font = 'Bold 40px Arial';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 32, 32);
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(0.5, 0.5, 1);
      return sprite;
    };

    const addAxis = (dir, colorHex, labelText) => {
      const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(0,0,0), 1.0, colorHex, 0.25, 0.15);
      arrow.line.material.depthTest = false;
      arrow.cone.material.depthTest = false;
      this.hudCube.add(arrow);
      const label = createLabel(labelText, '#' + colorHex.toString(16).padStart(6, '0'));
      label.position.copy(dir).multiplyScalar(1.25);
      this.hudCube.add(label);
    };

    addAxis(new THREE.Vector3(1, 0, 0), 0xff3333, 'X');
    addAxis(new THREE.Vector3(0, 1, 0), 0x33ff33, 'Y');
    addAxis(new THREE.Vector3(0, 0, 1), 0x3333ff, 'Z');

    this.hudScene.add(this.hudCube);

    // Resize
    window.addEventListener('resize', () => this.onResize());

    // Start loop
    this.animate();

    // Default theme
    this.setSkyTheme('light');
  }

  setSkyTheme(theme) {
    if (theme === 'light') {
      this.scene.background = new THREE.Color(0x87CEEB);
      this.scene.fog = null;
      if (this.ambientLight) this.ambientLight.intensity = 1.4;
      if (this.dirLight) this.dirLight.intensity = 2.2;
      if (this.hemiLight) this.hemiLight.intensity = 1.0;
      
      if (this.gridMat) this.gridMat.color.setHex(0xa9b6c2);
      if (this.groundPlaneMat) this.groundPlaneMat.color.setHex(0xcfd6df);
    } else {
      this.scene.background = new THREE.Color(0x0d1117);
      this.scene.fog = null;
      if (this.ambientLight) this.ambientLight.intensity = 1.0;
      if (this.dirLight) this.dirLight.intensity = 1.5;
      if (this.hemiLight) this.hemiLight.intensity = 0.6;
      
      if (this.gridMat) this.gridMat.color.setHex(0x30363d);
      if (this.groundPlaneMat) this.groundPlaneMat.color.setHex(0x1a2332);
    }
  }

  setGridSize(w, h) {
    this.gridW = w;
    this.gridH = h;
    this.buildGrid();
    this.controls.target.set((w * this.tileSize) / 2, 0, (h * this.tileSize) / 2);
    this.controls.update();
    this.camera.position.set((w * this.tileSize) / 2, Math.max(w, h) * 1.2, (h * this.tileSize) / 2 + Math.max(w, h) * 0.6);
  }

  buildGrid() {
    // Clear old grid
    while (this.gridGroup.children.length) {
      this.gridGroup.remove(this.gridGroup.children[0]);
    }

    const w = this.gridW;
    const h = this.gridH;
    const ts = this.tileSize;

    // Grid lines
    if (!this.gridMat) {
      this.gridMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.4 });
    }
    for (let i = 0; i <= w; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(i * ts, 0.01, 0),
        new THREE.Vector3(i * ts, 0.01, h * ts)
      ]);
      this.gridGroup.add(new THREE.Line(geo, this.gridMat));
    }
    for (let j = 0; j <= h; j++) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.01, j * ts),
        new THREE.Vector3(w * ts, 0.01, j * ts)
      ]);
      this.gridGroup.add(new THREE.Line(geo, this.gridMat));
    }

    // Ground plane visual
    const planeGeo = new THREE.PlaneGeometry(w * ts, h * ts);
    if (!this.groundPlaneMat) {
      this.groundPlaneMat = new THREE.MeshStandardMaterial({ roughness: 1 });
    }
    const plane = new THREE.Mesh(planeGeo, this.groundPlaneMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set((w * ts) / 2, -0.5, (h * ts) / 2);
    plane.receiveShadow = true;
    this.groundPlaneMesh = plane;
    this.gridGroup.add(plane);
    
    // Re-apply current theme
    const themeSelect = document.getElementById('sky-theme-select');
    this.setSkyTheme(themeSelect ? themeSelect.value : 'light');
  }

  /** Convert screen coords to grid cell {x, z, object3d} or null */
  screenToGrid(mouseX, mouseY) {
    const rect = this.viewportEl.getBoundingClientRect();
    const ndcX = ((mouseX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((mouseY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    
    let hitPoint = null;
    let hitObject = null;
    
    // 1. First, try to intersect actual 3D meshes (exclude indicators/ghosts)
    const objectsToTest = this.scene.children.filter(c => c !== this.hoverIndicator && c !== this.ghostObject && !c.isLight && !c.userData.isGizmo);
    const intersects = this.raycaster.intersectObjects(objectsToTest, true);
    
    if (intersects.length > 0) {
      hitPoint = intersects[0].point;
      // Walk up the tree to find the root object that was added to the scene
      let obj = intersects[0].object;
      while (obj.parent && obj.parent !== this.scene && obj.parent !== this.gridGroup) {
        obj = obj.parent;
      }
      hitObject = obj;
    } else {
      // 2. Fallback to mathematical ground plane
      const intersectVec = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.groundPlane, intersectVec)) {
        hitPoint = intersectVec;
      }
    }
    
    if (hitPoint) {
      const gx = Math.floor(hitPoint.x / this.tileSize);
      const gz = Math.floor(hitPoint.z / this.tileSize);
      if (gx >= 0 && gx < this.gridW && gz >= 0 && gz < this.gridH) {
        return { x: gx, z: gz, object3d: hitObject };
      }
    }
    return null;
  }

  /** Get world center position for a grid cell */
  gridToWorld(gx, gz) {
    return new THREE.Vector3(
      gx * this.tileSize + this.tileSize / 2,
      0,
      gz * this.tileSize + this.tileSize / 2
    );
  }

  /** Load a GLB model (cached). Returns promise of Object3D. */
  async loadModel(filename, fileHandle, url = null) {
    if (this.modelCache[filename]) return this.modelCache[filename].clone();
    if (this.loadingFiles[filename]) return this.loadingFiles[filename].then(m => m.clone());

    this.loadingFiles[filename] = new Promise(async (resolve, reject) => {
      try {
        let loadUrl = url;
        let blobUrl = null;
        let manager = new THREE.LoadingManager();
        
        // If it's a local file via FileSystem API
        if (!url && fileHandle) {
          const file = await fileHandle.getFile();
          blobUrl = URL.createObjectURL(file);
          loadUrl = blobUrl;
          
          // Setup manager to resolve external textures (like colormap.png)
          manager.setURLModifier((u) => {
            const texName = u.split('/').pop();
            if (this.textureUrls && this.textureUrls[texName]) {
              return this.textureUrls[texName];
            }
            if (u.startsWith('blob:')) return u;
            return u;
          });
        }

        const loader = new GLTFLoader(manager);
        
        loader.load(loadUrl, (gltf) => {
          if (blobUrl) URL.revokeObjectURL(blobUrl);
          const model = gltf.scene;
          model.traverse(c => {
            if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }
          });
          this.modelCache[filename] = model;
          delete this.loadingFiles[filename];
          resolve(model.clone());
        }, undefined, (err) => {
          URL.revokeObjectURL(blobUrl);
          reject(err);
        });
      } catch (e) {
        reject(e);
      }
    });

    return this.loadingFiles[filename].then(m => m.clone());
  }

  /** Render a thumbnail for a model. Returns base64 data URL. */
  async renderThumbnail(filename, fileHandle, url = null) {
    const model = await this.loadModel(filename, fileHandle, url);

    // Clear thumb scene objects (keep lights)
    const toRemove = [];
    this.thumbScene.traverse(c => {
      if (c.isMesh || c.isGroup) toRemove.push(c);
    });
    // Only remove non-light objects
    this.thumbScene.children.forEach(c => {
      if (!c.isLight) this.thumbScene.remove(c);
    });

    // Scale model to fit
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = 2 / maxDim;
    model.scale.multiplyScalar(scale);
    model.position.sub(center.multiplyScalar(scale));

    this.thumbScene.add(model);

    // Position camera
    this.thumbCamera.position.set(2, 2.5, 3);
    this.thumbCamera.lookAt(0, 0, 0);

    this.thumbRenderer.render(this.thumbScene, this.thumbCamera);
    const dataUrl = this.thumbRenderer.domElement.toDataURL('image/png');

    this.thumbScene.remove(model);
    return dataUrl;
  }

  /** Update hover indicator */
  showHoverAt(gx, gz, colorHex = 0xffffff) {
    const pos = this.gridToWorld(gx, gz);
    this.hoverIndicator.position.set(pos.x, 0.02, pos.z);
    this.hoverIndicator.scale.set(1, 1, 1);
    this.hoverIndicator.material.color.setHex(colorHex);
    this.hoverIndicator.visible = true;
  }
  
  showAreaHover(x1, z1, x2, z2, colorHex = 0xffffff) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minZ = Math.min(z1, z2);
    const maxZ = Math.max(z1, z2);

    const posMin = this.gridToWorld(minX, minZ);
    const posMax = this.gridToWorld(maxX, maxZ);

    const cx = (posMin.x + posMax.x) / 2;
    const cz = (posMin.z + posMax.z) / 2;
    const w = (maxX - minX + 1);
    const h = (maxZ - minZ + 1);

    this.hoverIndicator.position.set(cx, 0.02, cz);
    this.hoverIndicator.scale.set(w, h, 1);
    this.hoverIndicator.material.color.setHex(colorHex);
    this.hoverIndicator.visible = true;
  }

  hideHover() {
    this.hoverIndicator.visible = false;
  }

  /** Set/clear ghost */
  setGhost(object3d, gx, gz, rotY, yOffset = 0) {
    this.clearGhost();
    if (!object3d) return;
    this.ghostObject = object3d.clone();
    this.ghostObject.traverse(c => {
      if (c.isMesh) {
        c.material = c.material.clone();
        c.material.transparent = true;
        c.material.opacity = 0.4;
      }
    });
    const pos = this.gridToWorld(gx, gz);
    this.ghostObject.position.copy(pos);
    this.ghostObject.position.y = yOffset;
    this.ghostObject.rotation.y = rotY || 0;
    this.scene.add(this.ghostObject);
  }
  clearGhost() {
    if (this.ghostObject) {
      this.scene.remove(this.ghostObject);
      this.ghostObject = null;
    }
  }

  setObjectHighlight(object3d, colorHex) {
    this.clearObjectHighlight();
    if (!object3d) return;
    this.highlightedObject = object3d;
    this.highlightedObject.traverse(c => {
      if (c.isMesh && c.material) {
        if (c.userData.originalEmissive === undefined) {
          c.userData.originalEmissive = c.material.emissive ? c.material.emissive.getHex() : 0x000000;
        }
        if (this.selectedHighlightObject === this.highlightedObject) return;
        
        if (c.material.emissive) {
          c.material.emissive.setHex(colorHex);
          c.material.emissiveIntensity = 0.6;
        }
      }
    });
  }

  clearObjectHighlight() {
    if (this.highlightedObject) {
      if (this.highlightedObject !== this.selectedHighlightObject) {
        this.highlightedObject.traverse(c => {
          if (c.isMesh && c.material && c.userData.originalEmissive !== undefined) {
            if (c.material.emissive) {
              c.material.emissive.setHex(c.userData.originalEmissive);
              c.material.emissiveIntensity = 0;
            }
          }
        });
      }
      this.highlightedObject = null;
    }
  }

  setSelectionHighlight(object3d, colorHex = 0x58a6ff) {
    this.clearSelectionHighlight();
    if (!object3d) return;
    this.selectedHighlightObject = object3d;
    this.selectedHighlightObject.traverse(c => {
      if (c.isMesh && c.material) {
        if (c.userData.originalEmissive === undefined) {
          c.userData.originalEmissive = c.material.emissive ? c.material.emissive.getHex() : 0x000000;
        }
        if (c.material.emissive) {
          c.material.emissive.setHex(colorHex);
          c.material.emissiveIntensity = 0.8;
        }
      }
    });
  }

  clearSelectionHighlight() {
    if (this.selectedHighlightObject) {
      this.selectedHighlightObject.traverse(c => {
        if (c.isMesh && c.material && c.userData.originalEmissive !== undefined) {
          if (c.material.emissive) {
            c.material.emissive.setHex(c.userData.originalEmissive);
            c.material.emissiveIntensity = 0;
          }
        }
      });
      this.selectedHighlightObject = null;
    }
  }

  onResize() {
    const w = this.viewportEl.clientWidth;
    const h = this.viewportEl.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  updateKeyboardPan() {
    const moveSpeed = 0.6;
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 0.0001) return;
    forward.normalize();

    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const moveDir = new THREE.Vector3();

    if (this.keysPressed['KeyW']) moveDir.add(forward);
    if (this.keysPressed['KeyS']) moveDir.sub(forward);
    if (this.keysPressed['KeyD']) moveDir.add(right);
    if (this.keysPressed['KeyA']) moveDir.sub(right);

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize().multiplyScalar(moveSpeed);
      this.camera.position.add(moveDir);
      this.controls.target.add(moveDir);
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.updateKeyboardPan();
    this.controls.update();
    
    const w = this.viewportEl.clientWidth;
    const h = this.viewportEl.clientHeight;

    // Manually clear and render main scene
    this.renderer.autoClear = false;
    this.renderer.clear();
    this.renderer.setViewport(0, 0, w, h);
    this.renderer.render(this.scene, this.camera);

    // Update HUD Camera to match orbit angle
    this.hudCamera.position.copy(this.camera.position).sub(this.controls.target).normalize().multiplyScalar(5);
    this.hudCamera.lookAt(0, 0, 0);

    // Render HUD in Top Right
    const hudSize = 120;
    this.renderer.setViewport(w - hudSize - 20, h - hudSize - 20, hudSize, hudSize);
    this.renderer.render(this.hudScene, this.hudCamera);
  }
}
