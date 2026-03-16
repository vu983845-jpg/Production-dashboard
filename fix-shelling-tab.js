const fs = require('fs');
const filePath = 'src/app/(protected)/input/page.tsx';
let content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// The structure should be:
// Line ~1384: </TabsContent>   (end of shelling-energy)
// Line ~1385: {(role==='admin'...) && (   <-- condition open - THIS IS MISSING/WRONG
// Line ~1386: <TabsContent value="shelling-lines">
// ... shelling lines content ...
// Line ~1468: </TabsContent>
// Line ~1469: )}   <-- condition close
// Line ~1470: </Tabs>

// Looking at actual structure:
// 1384: </TabsContent>  (end of shelling-energy)
// 1385: {(...SHELL...) && (   <-- first condition open (no closing)
// 1386: <TabsContent value="shelling-lines">  (first copy)
// ...first copy content...
// 1469: </TabsContent>
// 1470: )}  <-- this closes the Shelling Energy TabsContent condition? 
// 1471: <TabsContent value="shelling-lines"> (second copy)
// ...second copy content...
// 1553: </TabsContent>
// 1554: )}
// 1555: </Tabs>

// We need to DELETE lines 1385-1469 (the first improperly wrapped copy)
// And keep lines 1471 onwards (but ensure it has proper condition wrapper)

// Actually let's look more carefully at what structure is between 1469-1480
console.log('Lines 1465-1480:');
lines.slice(1464, 1480).forEach((l, i) => console.log(`${1465+i}: ${l}`));
console.log('\nLines 1550-1560:');
lines.slice(1549, 1560).forEach((l, i) => console.log(`${1550+i}: ${l}`));
