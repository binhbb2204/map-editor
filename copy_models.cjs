const fs = require('fs');
const path = require('path');

const sourceBase = path.join(__dirname, '..', 'Hackathon-AI', 'coop-arena-survivor', 'client', 'public', 'assets', 'models');
const destBase = path.join(__dirname, 'public', 'models');

if (!fs.existsSync(destBase)) {
  fs.mkdirSync(destBase, { recursive: true });
}

const kits = [
  'kenney_nature-kit',
  'kenney_survival-kit',
  'kenney_fantasy-town-kit_2.0'
];

let allModels = [];

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function scanForGLB(dir, basePath = '') {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (let entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.join(basePath, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      results = results.concat(scanForGLB(fullPath, relPath));
    } else if (entry.name.endsWith('.glb') || entry.name.endsWith('.png') || entry.name.endsWith('.jpg')) {
      results.push(relPath);
    }
  }
  return results;
}

for (const kit of kits) {
  const src = path.join(sourceBase, kit);
  const dest = path.join(destBase, kit);
  console.log(`Copying ${kit}...`);
  copyDir(src, dest);
  
  const files = scanForGLB(dest, kit);
  allModels = allModels.concat(files);
}

fs.writeFileSync(path.join(destBase, 'catalog.json'), JSON.stringify(allModels, null, 2));
console.log('Copied models and created public/models/catalog.json');
