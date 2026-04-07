// fix-peel-card-visibility.js
// Much simpler: just hide the main form card via CSS class for PEEL_MC
// This avoids JSX structural issues entirely

const fs = require('fs');
const f = 'src/app/(protected)/input/page.tsx';
let c = fs.readFileSync(f, 'utf8');
const N = '\r\r\n';

// First undo the previous broken patch: remove the bad wrapper around the card
// The bad structure shows:
//   {departments.find(...)?.code !== 'PEEL_MC' && (
//     [indented card content]
//   )}
//           </div>      << outer div that got stuck outside
// Find and fix the bad )} that was added
const badWrapper_start = '                                {departments.find(d => d.id === selectedDept)?.code !== \'PEEL_MC\' && (' + N;
const badWrapper_end = '                                )}' + N + N + '                                    </div>' + N + N;

if (c.includes(badWrapper_start)) {
  console.log('Found bad wrapper - removing it');
  
  // Find the start of the bad wrapper
  const wrapStart = c.indexOf(badWrapper_start);
  // Find the end of the bad wrapper
  const wrapEndIdx = c.indexOf(badWrapper_end, wrapStart);
  
  if (wrapEndIdx < 0) {
    console.error('Could not find bad wrapper end');
    // Try alternate
    const alt = '                                )}' + N;
    const altIdx = c.indexOf(alt, wrapStart);
    console.log('alt end at:', altIdx);
    console.log('context:', JSON.stringify(c.substring(altIdx - 10, altIdx + 100)));
    process.exit(1);
  }

  // Extract the card content between the wrapper
  const innerContent = c.substring(wrapStart + badWrapper_start.length, wrapEndIdx);
  
  // Remove 2-space indent that the regex added
  const dedented = innerContent.split(N).map(line => {
    if (line.startsWith('  ')) return line.substring(2);
    return line;
  }).join(N);
  
  // Reconstruct: replace bad wrapper with original card + outer closing div
  // The outer closing div + blank line goes after the card
  c = c.substring(0, wrapStart) + 
      dedented.trimEnd() + N +
      '                                    </div>' + N + N +
      c.substring(wrapEndIdx + badWrapper_end.length);
  
  console.log('Bad wrapper removed');
} else {
  console.log('Bad wrapper not found - file may already be clean');
}

// Now apply the simple fix: add hidden class to the form card when PEEL_MC
// Find the actual form card div (the one wrapping the Pass1/Pass2 form)
const cardMarker = '                                  <div className="rounded-xl border bg-card text-card-foreground shadow">';
const cardNewClass = '                                  <div className={`rounded-xl border bg-card text-card-foreground shadow${departments.find(d => d.id === selectedDept)?.code === \'PEEL_MC\' ? \' hidden\' : \'\'}`}>';

if (c.includes(cardMarker)) {
  c = c.replace(cardMarker, cardNewClass);
  console.log('Applied hidden class to form card for PEEL_MC');
} else {
  console.warn('cardMarker not found - checking alternate indentation');
  // Try with the 2-spaces-more indentation from the botched patch
  const cardMarker2 = '                                    <div className="rounded-xl border bg-card text-card-foreground shadow">';
  if (c.includes(cardMarker2)) {
    const cardNewClass2 = '                                    <div className={`rounded-xl border bg-card text-card-foreground shadow${departments.find(d => d.id === selectedDept)?.code === \'PEEL_MC\' ? \' hidden\' : \'\'}`}>';
    c = c.replace(cardMarker2, cardNewClass2);
    console.log('Applied with alternate indent');
  }
}

fs.writeFileSync(f, c, 'utf8');
console.log('Done. File length:', c.length);
