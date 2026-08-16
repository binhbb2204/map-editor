/**
 * HotkeyManager — registers global keyboard shortcuts for the editor.
 */
export default class HotkeyManager {
  constructor(placement, toolManager, { onUpdateMinimap, onUpdateStatusBar, onUpdatePropertyPanel, onSave }) {
    this.placement = placement;
    this.toolManager = toolManager;
    this._onUpdateMinimap = onUpdateMinimap;
    this._onUpdateStatusBar = onUpdateStatusBar;
    this._onUpdatePropertyPanel = onUpdatePropertyPanel;
    this._onSave = onSave;
  }

  setup() {
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;

      switch (e.key.toLowerCase()) {
        case 'v': this.toolManager.setTool('select'); break;
        case 'b': this.toolManager.setTool('place'); break;
        case 'p': this.toolManager.setTool('paint'); break;
        case 'e': this.toolManager.setTool('erase'); break;

        case '1': this.toolManager.setTransformTool('t-select'); break;
        case '2': this.toolManager.setTransformTool('t-move'); break;
        case '3': this.toolManager.setTransformTool('t-rotate'); break;

        case 'm': {
          const overlay = document.getElementById('large-minimap-overlay');
          overlay.classList.toggle('hidden');
          if (!overlay.classList.contains('hidden')) this._onUpdateMinimap();
          break;
        }

        case 'r': {
          const delta = e.shiftKey ? -90 : 90;
          this.toolManager.currentRotation = (this.toolManager.currentRotation + delta + 360) % 360;
          if (this.placement.selectedCell) {
            this.placement.rotateSelected(delta);
            this._onUpdatePropertyPanel();
          }
          this.toolManager.updateGhostRotation();
          break;
        }

        case 'delete':
        case 'backspace':
          if (this.placement.selectedCell) {
            const { layer, x, z } = this.placement.selectedCell;
            this.placement.removeAsset(layer, x, z);
            this.placement.clearSelection();
            this._onUpdatePropertyPanel();
            this._onUpdateStatusBar();
            this._onUpdateMinimap();
          }
          break;

        case 'z':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this.placement.undo().then(() => {
              this._onUpdateStatusBar();
              this._onUpdateMinimap();
              if (this.placement.selectedCell) {
                const { layer, x, z } = this.placement.selectedCell;
                if (!this.placement.getCell(layer, x, z)) this.placement.clearSelection();
                this._onUpdatePropertyPanel();
              }
            });
          }
          break;

        case 'y':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this.placement.redo().then(() => {
              this._onUpdateStatusBar();
              this._onUpdateMinimap();
              if (this.placement.selectedCell) {
                const { layer, x, z } = this.placement.selectedCell;
                if (!this.placement.getCell(layer, x, z)) this.placement.clearSelection();
                this._onUpdatePropertyPanel();
              }
            });
          }
          break;

        case 's':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this._onSave();
          }
          break;
      }
    });
  }
}
