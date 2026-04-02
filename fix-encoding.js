// Fix double-encoded UTF-8 using Windows-1252 mapping
// File bytes are: UTF-8 encoding of Windows-1252 interpretation of original UTF-8 bytes
// Fix: read raw bytes, decode as win1252 text (gets back original UTF-8 byte values as a string),
//      then re-encode as UTF-8

const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

const FILES_TO_FIX = [
  'src/app/(protected)/input/page.tsx',
];

FILES_TO_FIX.forEach(filePath => {
  const fullPath = path.join(__dirname, filePath);

  if (!fs.existsSync(fullPath)) {
    console.log(`Not found: ${filePath}`);
    return;
  }

  // Read raw bytes
  const rawBytes = fs.readFileSync(fullPath);

  // Strip BOM if present
  let startOffset = 0;
  if (rawBytes[0] === 0xEF && rawBytes[1] === 0xBB && rawBytes[2] === 0xBF) {
    startOffset = 3;
    console.log('BOM detected, stripping...');
  }
  const contentBytes = rawBytes.slice(startOffset);

  // Decode as UTF-8 (gives us the garbled string with Windows-1252 chars)
  const garbledUtf8 = contentBytes.toString('utf8');

  // Each character in garbledUtf8 corresponds to a Windows-1252 char value
  // We need to re-encode it AS Windows-1252 bytes to recover the original UTF-8 bytes
  const originalBytes = iconv.encode(garbledUtf8, 'win1252');

  // Now decode those bytes as UTF-8 to get the correct Vietnamese text
  const fixed = iconv.decode(originalBytes, 'utf8');

  if (fixed === garbledUtf8) {
    console.log(`Already OK: ${filePath}`);
    return;
  }

  // Backup
  fs.writeFileSync(fullPath + '.bak2', rawBytes);
  console.log(`Backup saved: ${filePath}.bak2`);

  // Write fixed (no BOM)
  fs.writeFileSync(fullPath, fixed, 'utf8');
  console.log(`Fixed: ${filePath}`);

  // Show sample diff
  const origLines = garbledUtf8.split('\n');
  const fixedLines = fixed.split('\n');
  let shown = 0;
  for (let i = 0; i < origLines.length && shown < 5; i++) {
    if (origLines[i] !== fixedLines[i]) {
      console.log(`Line ${i+1} BEFORE: ${origLines[i].trim().slice(0, 80)}`);
      console.log(`Line ${i+1} AFTER:  ${fixedLines[i].trim().slice(0, 80)}`);
      shown++;
    }
  }
});
