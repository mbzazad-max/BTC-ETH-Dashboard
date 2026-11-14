/* The page must be the original Bitcoin Dashboard artifact, with only the fixed edits in tools/page.js (SOL and BNB, 14 Nov 2026).
   1. reference/index.original.html must match reference/PAGE_SHA256SUMS (the published artifact page, 13 Nov 2026).
   2. public/index.html must be exactly: reference/artifact_wrapper.html (the head that claude.ai's artifact host puts around
      every page: UTF-8, mobile viewport, "hidden" really hides) + that file with the tools/page.js edits + the two added
      script tags (shim.js before d3, cloud.js at the end).
   usage: node tools/check_page.js [--write]   (exit 1 on any difference; --write rebuilds public/index.html) */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const ref = fs.readFileSync(path.join(ROOT, 'reference/index.original.html'));
const want = fs.readFileSync(path.join(ROOT, 'reference/PAGE_SHA256SUMS'), 'utf8').trim().split(/\s+/)[0];
const got = crypto.createHash('sha256').update(ref).digest('hex');
if (got !== want) { console.error('reference/index.original.html changed: ' + got + ' != ' + want); process.exit(1); }
const pub = () => fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
const D3 = '<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>';
const WRAP = fs.readFileSync(path.join(ROOT, 'reference/artifact_wrapper.html'), 'utf8');
const expected = WRAP + require('./page.js').edit(ref.toString('utf8')).replace(D3, '<script src="shim.js"></script>\n' + D3) + '\n<script src="cloud.js"></script>\n';
if (process.argv.includes('--write')) { fs.writeFileSync(path.join(ROOT, 'public/index.html'), expected); console.log('public/index.html written'); process.exit(0); }
if (pub() !== expected) { console.error('public/index.html is not the original page plus shim.js and cloud.js'); process.exit(1); }
console.log('Page = original artifact + tools/page.js edits (SOL, BNB) + shim.js + cloud.js: ' + got);
