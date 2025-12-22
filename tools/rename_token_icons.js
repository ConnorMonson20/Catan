const fs = require('fs');
const path = require('path');
const iconsDir = path.join(__dirname, '..', 'client', 'public', 'icons');
if (!fs.existsSync(iconsDir)) {
  console.error('Icons directory not found:', iconsDir);
  process.exit(1);
}
const files = fs.readdirSync(iconsDir);
console.log('Found', files.length, 'files in icons dir');
for (const f of files) {
  const full = path.join(iconsDir, f);
  if (!fs.statSync(full).isFile()) continue;
  const m = f.match(/(\d{1,2})/);
  if (!m) continue;
  const num = m[1];
  // Skip 7 (robber) if present; still handle it if file exists
  const targetName = `token_${num}_transparent.png`;
  const target = path.join(iconsDir, targetName);
  if (f === targetName) {
    console.log('Already correct:', f);
    continue;
  }
  if (fs.existsSync(target)) {
    console.log('Target exists, skipping:', targetName);
    continue;
  }
  try {
    fs.copyFileSync(full, target);
    console.log('Copied', f, '->', targetName);
  } catch (err) {
    console.error('Failed to copy', f, err);
  }
}
console.log('Done.');
