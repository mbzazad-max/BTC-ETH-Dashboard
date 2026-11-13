/* The page must be the original Bitcoin Dashboard artifact, unchanged.
   1. reference/index.original.html must match reference/PAGE_SHA256SUMS (the published artifact page, 13 Nov 2026).
   2. public/index.html must be exactly: reference/artifact_wrapper.html (the head that claude.ai's artifact host puts around
      every page: UTF-8, mobile viewport, "hidden" really hides) + that file + the two added script tags
      (shim.js before d3, cloud.js at the end).
   usage: node tools/check_page.js   (exit 1 on any difference) */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const ref = fs.readFileSync(path.join(ROOT, 'reference/index.original.html'));
const want = fs.readFileSync(path.join(ROOT, 'reference/PAGE_SHA256SUMS'), 'utf8').trim().split(/\s+/)[0];
const got = crypto.createHash('sha256').update(ref).digest('hex');
if (got !== want) { console.error('reference/index.original.html changed: ' + got + ' != ' + want); process.exit(1); }
const pub = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
const D3 = '<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>';
const WRAP = fs.readFileSync(path.join(ROOT, 'reference/artifact_wrapper.html'), 'utf8');
const expected = WRAP + ref.toString('utf8').replace(D3, '<script src="shim.js"></script>\n' + D3) + '\n<script src="cloud.js"></script>\n';
if (pub !== expected) { console.error('public/index.html is not the original page plus shim.js and cloud.js'); process.exit(1); }
console.log('Page unchanged (original artifact + shim.js + cloud.js): ' + got);
