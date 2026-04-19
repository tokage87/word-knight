// Repacks Tiny Swords UI 9-slice sources (paper.png, button-blue.png,
// button-red.png) from "9 tiles with gaps" to a packed 9-slice where the
// tiles are adjacent with no transparent gutter, so CSS border-image can
// slice them cleanly. Also repacks bar-base.png (1x3 layout).
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const UI_DIR = path.resolve(__dirname, '..', 'public', 'assets', 'ui');

function loadPng(file) {
  return PNG.sync.read(fs.readFileSync(file));
}
function savePng(png, file) {
  fs.writeFileSync(file, PNG.sync.write(png));
}

function idx(png, x, y) {
  return (png.width * y + x) * 4;
}
function alpha(png, x, y) {
  return png.data[idx(png, x, y) + 3];
}

// Find tile bboxes for a grid of `rows` x `cols` by scanning non-transparent
// pixels, then bucketing by row/col centroids.
function findTiles(png, rows, cols) {
  const visited = new Uint8Array(png.width * png.height);
  const tiles = [];
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const v = y * png.width + x;
      if (visited[v]) continue;
      if (alpha(png, x, y) < 8) continue;
      // flood fill
      const stack = [[x, y]];
      let minX = x, maxX = x, minY = y, maxY = y;
      let count = 0;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        if (cx < 0 || cy < 0 || cx >= png.width || cy >= png.height) continue;
        const cv = cy * png.width + cx;
        if (visited[cv]) continue;
        if (alpha(png, cx, cy) < 8) continue;
        visited[cv] = 1;
        count++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        stack.push([cx + 1, cy]);
        stack.push([cx - 1, cy]);
        stack.push([cx, cy + 1]);
        stack.push([cx, cy - 1]);
      }
      if (count < 20) continue;
      tiles.push({ minX, maxX, minY, maxY, count });
    }
  }
  // Some tiles with dotted edges may split into several small blobs;
  // merge overlapping/nearby blobs.
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < tiles.length; i++) {
      for (let j = i + 1; j < tiles.length; j++) {
        const a = tiles[i], b = tiles[j];
        const overlapX = a.maxX + 4 >= b.minX && b.maxX + 4 >= a.minX;
        const overlapY = a.maxY + 4 >= b.minY && b.maxY + 4 >= a.minY;
        if (overlapX && overlapY) {
          tiles[i] = {
            minX: Math.min(a.minX, b.minX),
            maxX: Math.max(a.maxX, b.maxX),
            minY: Math.min(a.minY, b.minY),
            maxY: Math.max(a.maxY, b.maxY),
            count: a.count + b.count,
          };
          tiles.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  if (tiles.length !== rows * cols) {
    console.warn(`expected ${rows * cols} tiles, found ${tiles.length}`);
  }
  // Bucket by row/col using sorted centroids
  const byRow = [];
  tiles.sort((a, b) => (a.minY + a.maxY) - (b.minY + b.maxY));
  const rowSize = Math.ceil(tiles.length / rows);
  for (let r = 0; r < rows; r++) {
    byRow.push(tiles.slice(r * rowSize, (r + 1) * rowSize).sort((a, b) => (a.minX + a.maxX) - (b.minX + b.maxX)));
  }
  return byRow;
}

function copyRect(src, sx, sy, sw, sh, dst, dx, dy) {
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const si = idx(src, sx + x, sy + y);
      const di = idx(dst, dx + x, dy + y);
      dst.data[di] = src.data[si];
      dst.data[di + 1] = src.data[si + 1];
      dst.data[di + 2] = src.data[si + 2];
      dst.data[di + 3] = src.data[si + 3];
    }
  }
}

function repack9(inFile, outFile) {
  const src = loadPng(inFile);
  const grid = findTiles(src, 3, 3);
  // Use the max width/height across each row/col so the packed image is rectangular.
  const colW = [0, 0, 0];
  const rowH = [0, 0, 0];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const t = grid[r][c];
    const w = t.maxX - t.minX + 1;
    const h = t.maxY - t.minY + 1;
    if (w > colW[c]) colW[c] = w;
    if (h > rowH[r]) rowH[r] = h;
  }
  const outW = colW[0] + colW[1] + colW[2];
  const outH = rowH[0] + rowH[1] + rowH[2];
  const out = new PNG({ width: outW, height: outH });
  out.data.fill(0);
  let dy = 0;
  for (let r = 0; r < 3; r++) {
    let dx = 0;
    for (let c = 0; c < 3; c++) {
      const t = grid[r][c];
      const tw = t.maxX - t.minX + 1;
      const th = t.maxY - t.minY + 1;
      // Center smaller tiles within their cell (shouldn't matter for 9-slice if max is consistent).
      const padX = Math.floor((colW[c] - tw) / 2);
      const padY = Math.floor((rowH[r] - th) / 2);
      copyRect(src, t.minX, t.minY, tw, th, out, dx + padX, dy + padY);
      dx += colW[c];
    }
    dy += rowH[r];
  }
  savePng(out, outFile);
  console.log(`${path.basename(outFile)}: packed ${outW}x${outH}, cols=${colW}, rows=${rowH}`);
  return { colW, rowH };
}

function repack1x3(inFile, outFile) {
  const src = loadPng(inFile);
  const grid = findTiles(src, 1, 3);
  const tiles = grid[0];
  const rowH = Math.max(...tiles.map((t) => t.maxY - t.minY + 1));
  const colW = tiles.map((t) => t.maxX - t.minX + 1);
  const outW = colW.reduce((a, b) => a + b, 0);
  const out = new PNG({ width: outW, height: rowH });
  out.data.fill(0);
  let dx = 0;
  for (let c = 0; c < 3; c++) {
    const t = tiles[c];
    const tw = t.maxX - t.minX + 1;
    const th = t.maxY - t.minY + 1;
    const padY = Math.floor((rowH - th) / 2);
    copyRect(src, t.minX, t.minY, tw, th, out, dx, padY);
    dx += colW[c];
  }
  savePng(out, outFile);
  console.log(`${path.basename(outFile)}: packed ${outW}x${rowH}, cols=${colW}, rowH=${rowH}`);
  return { colW, rowH };
}

repack9(path.join(UI_DIR, 'paper.png'),         path.join(UI_DIR, 'paper-9s.png'));
repack9(path.join(UI_DIR, 'paper-special.png'), path.join(UI_DIR, 'paper-special-9s.png'));
repack9(path.join(UI_DIR, 'button-blue.png'),   path.join(UI_DIR, 'button-blue-9s.png'));
repack9(path.join(UI_DIR, 'button-red.png'),    path.join(UI_DIR, 'button-red-9s.png'));
repack1x3(path.join(UI_DIR, 'bar-base.png'),    path.join(UI_DIR, 'bar-base-9s.png'));
