/**
 * AssetBrowser — handles kit scanning, catalog building,
 * asset grid rendering, pagination, and thumbnail loading.
 */
export default class AssetBrowser {
  constructor(app, onSelectAsset) {
    this.app = app;
    this.onSelectAsset = onSelectAsset;
    this.kitFileHandles = {};   // filename -> FileSystemFileHandle
    this.catalog = [];          // { filename, category, displayName, fileHandle, thumbnail }
    this.currentPage = 1;
    this.itemsPerPage = 30;
    this.currentLayerFilter = 'props'; // 'props' or 'ground'

    const assetPanel = document.getElementById('asset-panel');
    if (assetPanel) {
      new ResizeObserver(() => {
        if (this.lastTotalPages) {
          this.renderPagination(this.lastTotalPages, this.lastFilterCat, this.lastSearchText);
        }
      }).observe(assetPanel);
    }
  }

  // ---- Kit Scanning ----

  async scanKitFolder(dirHandle, prefix = '') {
    for await (const [name, handle] of dirHandle.entries()) {
      const fullPath = prefix + name;
      if (handle.kind === 'directory') {
        await this.scanKitFolder(handle, fullPath + '/');
      } else if (handle.kind === 'file') {
        this.kitFileHandles[fullPath] = handle;
      }
    }
  }

  async loadDefaultModels() {
    try {
      const res = await fetch('/models/catalog.json');
      const files = await res.json();
      
      const gltfPaths = files.filter(p => p.endsWith('.glb') || p.endsWith('.gltf')).sort();
      
      const newItems = gltfPaths.map(fullPath => {
        const baseName = fullPath.split('/').pop().replace(/\.(glb|gltf)$/, '');
        const category = baseName.split('_')[0];
        return { 
          filename: fullPath, 
          category, 
          displayName: baseName, 
          fileHandle: null, 
          url: `/models/${fullPath}`,
          thumbnail: null 
        };
      });
      
      this.catalog = this.catalog.concat(newItems);
      this.renderCategoryFilter();
      this.renderAssetGrid();
    } catch (e) {
      console.warn("Could not load default models:", e);
    }
  }

  buildCatalog() {
    const gltfPaths = Object.keys(this.kitFileHandles)
      .filter(p => p.endsWith('.glb') || p.endsWith('.gltf'))
      .sort();
      
    const newItems = gltfPaths.map(fullPath => {
      const baseName = fullPath.split('/').pop().replace(/\.(glb|gltf)$/, '');
      const category = baseName.split('_')[0];
      return { filename: fullPath, category, displayName: baseName, fileHandle: this.kitFileHandles[fullPath], url: null, thumbnail: null };
    });
    
    // Merge without duplicates
    for (const item of newItems) {
       if (!this.catalog.find(a => a.filename === item.filename)) {
          this.catalog.push(item);
       }
    }
  }

  async prepareTextures() {
    this.textureUrls = {};
    for (const [fullPath, handle] of Object.entries(this.kitFileHandles)) {
      if (fullPath.endsWith('.png') || fullPath.endsWith('.jpg') || fullPath.endsWith('.jpeg')) {
        const file = await handle.getFile();
        this.textureUrls[fullPath.split('/').pop()] = URL.createObjectURL(file);
      }
    }
    this.app.textureUrls = this.textureUrls; // Make available to App loader
  }

  // ---- UI Rendering ----

  setLayerFilter(layer) {
    this.currentLayerFilter = layer;
    this.currentPage = 1;
    this.renderCategoryFilter();
    this.renderAssetGrid(document.getElementById('category-filter').value, document.getElementById('asset-search').value);
  }

  _isGroundAsset(filename) {
    const fn = filename.toLowerCase();
    return fn.includes('floor') || fn.includes('ground') || fn.includes('path') || 
           fn.includes('water') || fn.includes('dirt') || fn.includes('grass') || 
           fn.includes('road') || fn.includes('tile');
  }

  renderCategoryFilter() {
    const container = document.getElementById('category-filter');
    const filteredCatalog = this.catalog.filter(a => {
      const isGround = this._isGroundAsset(a.filename);
      return this.currentLayerFilter === 'ground' ? isGround : !isGround;
    });

    const categories = ['all', ...new Set(filteredCatalog.map(a => a.category))];

    container.innerHTML = categories.map(cat =>
      `<option value="${cat}">${cat === 'all' ? 'All Categories' : cat}</option>`
    ).join('');

    container.addEventListener('change', (e) => {
      this.currentPage = 1;
      const searchText = document.getElementById('asset-search').value;
      this.renderAssetGrid(e.target.value, searchText);
    });
  }

  renderAssetGrid(filterCat = 'all', searchText = '') {
    const container = document.getElementById('asset-grid');
    const filtered = this.catalog.filter(a => {
      const isGround = this._isGroundAsset(a.filename);
      if (this.currentLayerFilter === 'ground' && !isGround) return false;
      if (this.currentLayerFilter === 'props' && isGround) return false;
      
      if (filterCat !== 'all' && a.category !== filterCat) return false;
      if (searchText && !a.filename.toLowerCase().includes(searchText.toLowerCase())) return false;
      return true;
    });

    const totalPages = Math.ceil(filtered.length / this.itemsPerPage) || 1;
    if (this.currentPage > totalPages) this.currentPage = totalPages;

    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const pageItems = filtered.slice(startIndex, startIndex + this.itemsPerPage);

    container.innerHTML = pageItems.map((a, i) => `
      <div class="asset-card group flex flex-col items-center bg-white rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] border border-gray-100 cursor-pointer hover:border-blue-300 hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)] transform hover:-translate-y-1 transition-all overflow-hidden" data-filename="${a.filename}" title="${a.displayName}" style="animation-delay:${Math.min(i * 15, 250)}ms">
        <div class="asset-thumb-box w-full aspect-square bg-slate-50 flex items-center justify-center overflow-hidden relative">
          <div class="absolute inset-0 bg-gradient-to-t from-slate-100/50 to-transparent pointer-events-none"></div>
          ${a.thumbnail ? `<img class="w-full h-full object-contain p-2 group-hover:scale-110 transition-transform duration-300" src="${a.thumbnail}" alt="${a.displayName}" />` : `<div class="thumb-loading text-xs text-gray-400"><i class="fas fa-spinner fa-spin"></i></div>`}
        </div>
        <div class="w-full border-t border-gray-100 bg-white p-1.5 flex items-center justify-center">
          <span class="asset-name text-[0.65rem] truncate w-full text-center text-slate-600 group-hover:text-blue-700 font-semibold transition-colors">${a.displayName}</span>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.asset-card').forEach(card => {
      card.addEventListener('click', () => {
        container.querySelectorAll('.asset-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        const asset = this.catalog.find(a => a.filename === card.dataset.filename);
        this.onSelectAsset(asset);
      });
    });

    this.renderPagination(totalPages, filterCat, searchText);
    this.loadThumbnailsForPage(pageItems);
  }

  renderPagination(totalPages, filterCat, searchText) {
    this.lastTotalPages = totalPages;
    this.lastFilterCat = filterCat;
    this.lastSearchText = searchText;

    const container = document.getElementById('pagination-controls');
    if (totalPages <= 1) { container.innerHTML = ''; return; }

    const cw = container.clientWidth || 250;
    let maxVisible = 1;
    if (cw > 400) maxVisible = 5;
    else if (cw > 300) maxVisible = 3;

    let html = `<button class="page-btn px-2.5 py-1 text-xs font-semibold rounded-md border border-gray-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm transition-all" ${this.currentPage === 1 ? 'disabled' : ''} data-page="${this.currentPage - 1}"><i class="fas fa-chevron-left"></i></button>`;

    let startPage = this.currentPage - Math.floor(maxVisible / 2);
    let endPage = startPage + maxVisible - 1;

    if (startPage < 1) {
      startPage = 1;
      endPage = Math.min(totalPages, startPage + maxVisible - 1);
    }
    if (endPage > totalPages) {
      endPage = totalPages;
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    if (startPage > 1) {
      html += `<button class="page-btn px-2.5 py-1 text-xs font-semibold rounded-md border border-gray-200 text-slate-600 hover:bg-slate-50 shadow-sm transition-all" data-page="1">1</button>`;
      if (startPage > 2) html += `<span class="px-1 text-slate-400 font-bold">...</span>`;
    }

    for (let i = startPage; i <= endPage; i++) {
      if (this.currentPage === i) {
        html += `<button class="page-btn px-2.5 py-1 text-xs font-bold rounded-md border border-blue-600 bg-blue-600 text-white shadow-sm ring-1 ring-blue-600/30 transform scale-105" data-page="${i}">${i}</button>`;
      } else {
        html += `<button class="page-btn px-2.5 py-1 text-xs font-semibold rounded-md border border-gray-200 text-slate-600 hover:bg-slate-50 shadow-sm transition-all" data-page="${i}">${i}</button>`;
      }
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) html += `<span class="px-1 text-slate-400 font-bold">...</span>`;
      html += `<button class="page-btn px-2.5 py-1 text-xs font-semibold rounded-md border border-gray-200 text-slate-600 hover:bg-slate-50 shadow-sm transition-all" data-page="${totalPages}">${totalPages}</button>`;
    }

    html += `<button class="page-btn px-2.5 py-1 text-xs font-semibold rounded-md border border-gray-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm transition-all" ${this.currentPage === totalPages ? 'disabled' : ''} data-page="${this.currentPage + 1}"><i class="fas fa-chevron-right"></i></button>`;

    container.innerHTML = html;
    container.querySelectorAll('.page-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        this.currentPage = parseInt(btn.dataset.page);
        this.renderAssetGrid(filterCat, searchText);
      });
    });
  }

  async loadThumbnailsForPage(items) {
    const itemsToLoad = items.filter(a => !a.thumbnail);
    if (itemsToLoad.length === 0) return;

    const batchSize = 5;
    for (let i = 0; i < itemsToLoad.length; i += batchSize) {
      const batch = itemsToLoad.slice(i, i + batchSize);
      await Promise.all(batch.map(async (item) => {
        try {
          item.thumbnail = await this.app.renderThumbnail(item.filename, item.fileHandle, item.url);
          const allCards = document.querySelectorAll('.asset-card');
          for (const c of allCards) {
            if (c.dataset.filename === item.filename) {
              const box = c.querySelector('.asset-thumb-box');
              if (box) box.innerHTML = `<img src="${item.thumbnail}" alt="${item.displayName}" />`;
              break;
            }
          }
        } catch (e) {
          console.warn('Thumbnail failed:', item.filename, e);
        }
      }));
    }
  }

  setupSearch() {
    document.getElementById('asset-search').addEventListener('input', (e) => {
      this.currentPage = 1;
      const activeCat = document.getElementById('category-filter').value || 'all';
      this.renderAssetGrid(activeCat, e.target.value);
    });
  }
}
