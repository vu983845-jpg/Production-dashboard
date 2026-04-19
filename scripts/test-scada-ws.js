/**
 * Fetch the SCADA browse page and extract WebSocket URL + data fetch mechanism
 */
const SID = "b587a89300124115a777d6137e095372";

async function main() {
    // 1. Fetch the SCADA browse page
    console.log("=== Fetching SCADA Browse Page ===");
    const url = `https://web.asean.v-iec.com/browse?projectId=10001417&queryId=${SID}`;
    
    const res = await fetch(url, {
        headers: {
            "Cookie": `ACCESS_SID=${SID}`,
            "User-Agent": "Mozilla/5.0",
        },
    });
    const html = await res.text();
    console.log(`Status: ${res.status}, Length: ${html.length}`);
    
    // 2. Find all script src tags
    const scriptSrcs = html.match(/src="([^"]+\.js[^"]*)"/g) || [];
    console.log("\n=== Script Sources ===");
    scriptSrcs.forEach(s => console.log(`  ${s}`));
    
    // 3. Find inline scripts
    const inlineScripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
    console.log(`\n=== Inline Scripts (${inlineScripts.length}) ===`);
    inlineScripts.forEach((s, i) => {
        const content = s.replace(/<\/?script[^>]*>/gi, '').trim();
        if (content.length > 0 && content.length < 5000) {
            console.log(`\n--- Script ${i} ---`);
            console.log(content.substring(0, 2000));
        }
    });
    
    // 4. Find WebSocket URLs
    const wsUrls = html.match(/wss?:\/\/[^\s"'<>]+/g) || [];
    console.log("\n=== WebSocket URLs ===");
    wsUrls.forEach(u => console.log(`  ${u}`));
    
    // 5. Find API URLs
    const apiUrls = html.match(/https?:\/\/[^\s"'<>]*(?:api|data|realtime|tag|device)[^\s"'<>]*/gi) || [];
    console.log("\n=== API URLs ===");
    [...new Set(apiUrls)].forEach(u => console.log(`  ${u}`));
    
    // 6. Look for config objects
    const configMatches = html.match(/(?:window\.|var |const |let )[\w]+\s*=\s*[{[\"\d].{0,500}/g) || [];
    console.log("\n=== Config objects ===");
    configMatches.forEach(m => console.log(`  ${m.substring(0, 300)}`));
    
    // 7. Find any .js files and fetch the main one to find WebSocket logic
    const jsFiles = scriptSrcs.map(s => s.match(/src="([^"]+)"/)?.[1]).filter(Boolean);
    console.log("\n=== Fetching main JS bundles for WebSocket logic ===");
    
    for (const jsFile of jsFiles.slice(0, 5)) {
        const jsUrl = jsFile.startsWith('http') ? jsFile : `https://web.asean.v-iec.com${jsFile}`;
        try {
            const jsRes = await fetch(jsUrl);
            const jsText = await jsRes.text();
            
            // Search for WebSocket patterns
            const wsPatterns = jsText.match(/(?:WebSocket|wss?:\/\/|\.onmessage|\.send\(|websocket)[^\n]{0,200}/gi) || [];
            if (wsPatterns.length > 0) {
                console.log(`\n  ${jsUrl} - Found ${wsPatterns.length} WebSocket patterns:`);
                wsPatterns.slice(0, 10).forEach(p => console.log(`    ${p.substring(0, 200)}`));
            }
            
            // Search for API/fetch patterns
            const fetchPatterns = jsText.match(/(?:getRealTime|getTagList|tagGroup|\/api\/|\/m[15]\/)[^\n]{0,150}/gi) || [];
            if (fetchPatterns.length > 0) {
                console.log(`\n  ${jsUrl} - Found ${fetchPatterns.length} API patterns:`);
                [...new Set(fetchPatterns)].slice(0, 15).forEach(p => console.log(`    ${p.substring(0, 200)}`));
            }
        } catch (err) {
            console.log(`  Error fetching ${jsUrl}: ${err.message}`);
        }
    }
}

main();
