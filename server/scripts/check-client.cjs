// Cek sintaks semua <script> block di index.html tanpa mengeksekusi.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)];
let ok = true;
blocks.forEach((m, i) => {
  try {
    // wrap jadi function body utk validasi sintaks doang
    new Function(m[1]);
    console.log('script block', i, 'OK');
  } catch (e) {
    ok = false;
    console.log('script block', i, 'SYNTAX ERROR:', e.message);
  }
});
console.log(ok ? 'ALL SCRIPTS OK' : 'ADA ERROR SINTAKS');
process.exit(ok ? 0 : 1);
