export default class DockingManager {
  constructor() {
    this.panels = [];
    this.docks = {
      left: document.getElementById('dock-left'),
      right: document.getElementById('dock-right')
    };
    this.draggingPanel = null;
    this.dragOffset = { x: 0, y: 0 };
    
    // Create drop zone overlays
    this.overlayLeft = this._createOverlay('left');
    this.overlayRight = this._createOverlay('right');
    
    this.activeDropZone = null;
  }

  _createOverlay(side) {
    const el = document.createElement('div');
    el.className = `fixed top-0 bottom-0 w-64 bg-blue-500/20 border-2 border-blue-400 border-dashed z-40 hidden transition-opacity pointer-events-none`;
    if (side === 'left') {
      el.style.left = '0';
    } else {
      el.style.right = '0';
    }
    document.body.appendChild(el);
    return el;
  }

  init() {
    const panelEls = document.querySelectorAll('.dockable-panel');
    panelEls.forEach(panel => {
      const handle = panel.querySelector('.dock-handle');
      if (!handle) return;
      
      // Keep track of original styles that shouldn't be overridden when docked
      panel.dataset.baseClass = panel.className;
      
      handle.addEventListener('mousedown', (e) => this._onDragStart(e, panel));

      // Inject floating resizer
      const resizer = document.createElement('div');
      resizer.className = 'floating-resizer';
      panel.appendChild(resizer);
      resizer.addEventListener('mousedown', (e) => this._onResizeStart(e, panel));
    });

    document.addEventListener('mousemove', (e) => {
      if (this.resizingPanel) this._onResizeMove(e);
      else this._onDragMove(e);
    });
    
    document.addEventListener('mouseup', (e) => {
      if (this.resizingPanel) this._onResizeEnd(e);
      else this._onDragEnd(e);
    });
  }

  _onResizeStart(e, panel) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    this.resizingPanel = panel;
    const rect = panel.getBoundingClientRect();
    this.resizeStart = {
      w: rect.width,
      h: rect.height,
      x: e.clientX,
      y: e.clientY
    };
    document.body.style.cursor = 'se-resize';
  }

  _onResizeMove(e) {
    if (!this.resizingPanel) return;
    const dx = e.clientX - this.resizeStart.x;
    const dy = e.clientY - this.resizeStart.y;
    
    const newW = Math.max(200, this.resizeStart.w + dx);
    const newH = Math.max(200, this.resizeStart.h + dy);
    
    this.resizingPanel.style.width = newW + 'px';
    this.resizingPanel.style.height = newH + 'px';
  }

  _onResizeEnd(e) {
    if (!this.resizingPanel) return;
    this.resizingPanel = null;
    document.body.style.cursor = '';
    // trigger app resize just in case child canvas needs it
    if (window.app && window.app.onResize) window.app.onResize();
  }

  _onDragStart(e, panel) {
    // Only drag on left click and if not clicking a button/input inside the handle
    if (e.button !== 0 || e.target.closest('button, input, select')) return;
    
    e.preventDefault();
    this.draggingPanel = panel;
    
    const rect = panel.getBoundingClientRect();
    this.dragOffset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };

    // If it was docked, we make it floating!
    if (!panel.classList.contains('floating')) {
      const w = rect.width;
      const h = rect.height;
      
      // Move to body
      document.body.appendChild(panel);
      
      panel.classList.add('floating', 'z-50', 'shadow-2xl', 'ring-1', 'ring-black/10', 'bg-white/95', 'backdrop-blur-md');
      // Enforce position fixed using inline styles to override Tailwind conflicts
      panel.style.position = 'fixed';
      // Remove dock-specific sizing
      panel.classList.remove('flex-1');
      
      panel.style.width = w + 'px';
      panel.style.height = h + 'px';
      panel.style.minHeight = '200px';
    }

    panel.style.margin = '0';
    panel.style.left = '0px';
    panel.style.top = '0px';
    panel.style.transform = `translate3d(${e.clientX - this.dragOffset.x}px, ${e.clientY - this.dragOffset.y}px, 0)`;
    
    // Add grabbing cursor
    document.body.style.cursor = 'grabbing';
    panel.querySelector('.dock-handle').style.cursor = 'grabbing';
    
    this._updateEmptyDocks();
  }

  _onDragMove(e) {
    if (!this.draggingPanel) return;

    // Move the floating panel using hardware acceleration
    this.draggingPanel.style.transform = `translate3d(${e.clientX - this.dragOffset.x}px, ${e.clientY - this.dragOffset.y}px, 0)`;

    // Check drop zones (within 100px of edges)
    const threshold = 150;
    this.activeDropZone = null;
    
    if (e.clientX < threshold) {
      this.activeDropZone = 'left';
      this.overlayLeft.classList.remove('hidden');
      this.overlayRight.classList.add('hidden');
    } else if (e.clientX > window.innerWidth - threshold) {
      this.activeDropZone = 'right';
      this.overlayRight.classList.remove('hidden');
      this.overlayLeft.classList.add('hidden');
    } else {
      this.overlayLeft.classList.add('hidden');
      this.overlayRight.classList.add('hidden');
    }
  }

  _onDragEnd(e) {
    if (!this.draggingPanel) return;
    
    document.body.style.cursor = 'default';
    this.draggingPanel.querySelector('.dock-handle').style.cursor = 'grab';

    if (this.activeDropZone) {
      // Dock it!
      const dock = this.docks[this.activeDropZone];
      dock.appendChild(this.draggingPanel);
      
      this.draggingPanel.classList.remove('floating', 'z-50', 'shadow-2xl', 'ring-1', 'ring-black/10', 'bg-white/95', 'backdrop-blur-md');
      this.draggingPanel.style.position = '';
      this.draggingPanel.style.left = '';
      this.draggingPanel.style.top = '';
      this.draggingPanel.style.transform = '';
      this.draggingPanel.style.margin = '';
      this.draggingPanel.style.width = '100%'; // Let container handle width
      
      // If it's the only child or we want it to expand, we can add flex-1 back
      // But actually, Minimap is fixed height, Properties is flex-1. 
      // Toolbox is flex-1. 
      // We can restore original flex behavior by reading a data attribute, or just let CSS handle it.
      if (this.draggingPanel.id === 'asset-panel' || this.draggingPanel.id === 'property-panel') {
         this.draggingPanel.classList.add('flex-1');
         this.draggingPanel.style.height = '';
      } else {
         this.draggingPanel.style.height = '220px'; // Minimap
      }
      
    } else {
      // Leave floating, but ensure it doesn't go off-screen completely
      const rect = this.draggingPanel.getBoundingClientRect();
      const newX = Math.max(0, rect.left);
      const newY = Math.max(0, rect.top);
      this.draggingPanel.style.transform = `translate3d(${newX}px, ${newY}px, 0)`;
    }

    this.draggingPanel = null;
    this.activeDropZone = null;
    this.overlayLeft.classList.add('hidden');
    this.overlayRight.classList.add('hidden');
    
    this._updateEmptyDocks();
  }
  
  _updateEmptyDocks() {
    // Hide wrapper if dock is empty to save space and remove pointer events
    const leftWrapper = document.getElementById('dock-left-wrapper');
    if (this.docks.left) {
      const leftPanels = this.docks.left.querySelectorAll('.dockable-panel');
      if (leftPanels.length === 0) {
        if (leftWrapper) leftWrapper.style.display = 'none';
      } else {
        if (leftWrapper) leftWrapper.style.display = 'flex';
      }
    }
    
    const rightWrapper = document.getElementById('dock-right-wrapper');
    if (this.docks.right) {
      const rightPanels = this.docks.right.querySelectorAll('.dockable-panel');
      if (rightPanels.length === 0) {
        if (rightWrapper) rightWrapper.style.display = 'none';
      } else {
        if (rightWrapper) rightWrapper.style.display = 'flex';
      }
      
      const resizerMinimap = document.getElementById('resizer-minimap');
      if (resizerMinimap) {
        resizerMinimap.style.display = rightPanels.length <= 1 ? 'none' : 'block';
      }
    }
  }
}
