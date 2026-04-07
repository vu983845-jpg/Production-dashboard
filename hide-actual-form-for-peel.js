// hide-actual-form-for-peel.js
const fs = require('fs');
const f = 'src/app/(protected)/input/page.tsx';
let c = fs.readFileSync(f, 'utf8');
const N = '\r\r\n';

// The main actual form card starts with this indent + class
const cardStart = '                                  <div className="rounded-xl border bg-card text-card-foreground shadow">';
// The 3-shift card comment immediately follows after two closing divs
const peelCardMarker = '                                    {/* \u2500\u2500 Peeling 3-shift breakdown card \u2500\u2500 */}';

const cardIdx = c.indexOf(cardStart);
const peelIdx = c.indexOf(peelCardMarker);

if (cardIdx < 0) { console.error('cardStart not found'); process.exit(1); }
if (peelIdx < 0) { console.error('peelCardMarker not found'); process.exit(1); }

// The content between cardStart and peelCardMarker is the main form card + 2 closing divs + blank line
// We need to find the exact substring to wrap
const cardContent = c.substring(cardIdx, peelIdx);
// Last ~80 chars should be something like: </div>\r\r\n                                    </div>\r\r\n\r\r\n
console.log('Card content last 120 chars:', JSON.stringify(cardContent.slice(-120)));

// Wrap the card (excluding the trailing blank line + the two outer closing divs)
// Find the last </div> that closes the bg-card div itself — it's the closing of the card
// The structure ends: </Form></div></div> then blank line before peel card
// Let's find "</div>" + N + "                                    </div>" + N + N  as the end boundary
const cardInnerEnd = '</div>' + N + '                                    </div>' + N + N;
const cardInnerEndIdx = cardContent.lastIndexOf(cardInnerEnd);
console.log('cardInnerEnd at offset:', cardInnerEndIdx);

if (cardInnerEndIdx < 0) {
  console.error('Could not find card inner end');
  process.exit(1);
}

// Split: card div itself (to wrap) vs the closing outer divs (keep outside)
const justCard = c.substring(cardIdx, cardIdx + cardInnerEndIdx + '</div>'.length + N.length);
const afterCard = c.substring(cardIdx + cardInnerEndIdx + '</div>'.length + N.length, peelIdx);
console.log('afterCard:', JSON.stringify(afterCard));

// Build the replacement: wrap justCard with PEEL_MC exclusion
const wrapped = '                                {departments.find(d => d.id === selectedDept)?.code !== \'PEEL_MC\' && (' + N +
  justCard.replace(/^/gm, '  ').trimEnd() + N +
  '                                )}' + N + N +
  afterCard;

// Replace original span
const original = c.substring(cardIdx, peelIdx);
if (!c.includes(original)) { console.error('Cannot find original span to replace'); process.exit(1); }

c = c.substring(0, cardIdx) + wrapped + c.substring(peelIdx);
fs.writeFileSync(f, c, 'utf8');
console.log('Done! File length:', c.length);
