/**
 * MapIO — handles saving and loading map JSON files.
 */
export default class MapIO {
  constructor(placement, assetBrowser, { onUpdateStatusBar, onUpdateMinimap, onNotify }) {
    this.placement = placement;
    this.assetBrowser = assetBrowser;
    this._onUpdateStatusBar = onUpdateStatusBar;
    this._onUpdateMinimap = onUpdateMinimap;
    this._onNotify = onNotify;
    this.currentFileHandle = null;
  }

  async save() {
    const mapName = document.getElementById('map-name-input').value.trim() || 'arena_map';
    const data = this.placement.exportJSON(mapName);
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });

    try {
      const expectedFilename = `${mapName}.json`;
      if (!this.currentFileHandle || this.currentFileHandle.name !== expectedFilename) {
        this.currentFileHandle = await window.showSaveFilePicker({
          suggestedName: expectedFilename,
          types: [{ description: 'Map JSON', accept: { 'application/json': ['.json'] } }]
        });
      }
      const writable = await this.currentFileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      this._onNotify('Map saved successfully!');
    } catch (e) {
      if (e.name !== 'AbortError') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${mapName}.json`; a.click();
        URL.revokeObjectURL(url);
        this._onNotify('Map downloaded!');
      }
    }
  }

  async load(app, startEditorFn) {
    try {
      const [fileHandle] = await window.showOpenFilePicker({
        types: [{ description: 'Map JSON', accept: { 'application/json': ['.json'] } }]
      });
      const file = await fileHandle.getFile();
      const text = await file.text();
      const data = JSON.parse(text);

      const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
      await this.assetBrowser.scanKitFolder(dirHandle);
      startEditorFn();

      await this.placement.importJSON(data, this.assetBrowser.kitFileHandles);

      this.currentFileHandle = fileHandle;
      const baseName = fileHandle.name.replace('.json', '');
      document.getElementById('map-name-input').value = baseName;

      this._onUpdateStatusBar();
      this._onUpdateMinimap();
      this._onNotify('Map loaded successfully!');
    } catch (e) {
      if (e.name !== 'AbortError') console.error(e);
    }
  }
}
