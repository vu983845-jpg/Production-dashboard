/**
 * Deep analysis of V-NET main app.js (4.5MB) for API endpoint patterns
 * Focus: find the exact real-time data fetching URL patterns
 */

async function main() {
    console.log("Fetching V-NET main app.js...");
    const res = await fetch("https://asean.v-iec.com/js/app.56f44c59.js");
    const js = await res.text();
    console.log(`Size: ${js.length} bytes`);

    // Search for request patterns with URL strings
    const requestPatterns = [
        /url:\s*["']([^"']+)["']/g,
        /request\(\{[^}]*url:\s*["']([^"']+)["']/g,
    ];

    const urls = new Set();
    for (const pattern of requestPatterns) {
        let m;
        while ((m = pattern.exec(js)) !== null) {
            urls.add(m[1]);
        }
    }

    console.log(`\n=== ALL API URLs found (${urls.size}) ===`);
    const sorted = [...urls].sort();
    sorted.forEach(u => console.log(`  ${u}`));

    // Search for realTime, realData, tagValue, pointValue patterns
    console.log("\n=== REAL-TIME related patterns ===");
    const rtPatterns = [
        /["']([^"']*(?:realTime|realData|tagValue|pointValue|getRealTime|getTagVal|pointData|currentValue|liveData)[^"']*)["']/gi,
    ];
    const rtUrls = new Set();
    for (const p of rtPatterns) {
        let m;
        while ((m = p.exec(js)) !== null) {
            if (m[1].length < 200) rtUrls.add(m[1]);
        }
    }
    console.log(`Found ${rtUrls.size} patterns:`);
    [...rtUrls].sort().forEach(u => console.log(`  ${u}`));

    // Search for "boxId" near "request" patterns
    console.log("\n=== Context around 'boxId' in request calls ===");
    const boxIdIdx = [];
    let idx = 0;
    while ((idx = js.indexOf("boxId", idx)) !== -1) {
        // Check if there's a 'request' or 'url:' within 200 chars before
        const before = js.substring(Math.max(0, idx - 200), idx);
        if (before.includes("request(") || before.includes("url:")) {
            const context = js.substring(Math.max(0, idx - 100), Math.min(js.length, idx + 100));
            // Extract the URL
            const urlMatch = context.match(/url:\s*["']([^"']+)["']/);
            if (urlMatch) {
                console.log(`  URL: ${urlMatch[1]}`);
            }
        }
        idx++;
    }

    // Search for specific "device/detail" or "box/" patterns
    console.log("\n=== Device/Box API patterns ===");
    const devicePatterns = js.match(/["'](?:device|box|tag|point|group)\/[a-zA-Z\/]+["']/gi) || [];
    const uniqueDevice = [...new Set(devicePatterns)].sort();
    console.log(`Found ${uniqueDevice.length}:`);
    uniqueDevice.forEach(u => console.log(`  ${u}`));

    // Most important: search for the THIRD_DOMAIN_NAME usage and how requests are routed
    console.log("\n=== THIRD_DOMAIN_NAME / thirdDomainName patterns ===");
    const thirdIdx = js.indexOf("thirdDomainName");
    if (thirdIdx !== -1) {
        console.log("  Context:", js.substring(Math.max(0, thirdIdx - 100), Math.min(js.length, thirdIdx + 200)));
    }
    const third2 = js.indexOf("THIRD_DOMAIN_NAME");
    if (third2 !== -1) {
        console.log("  THIRD_DOMAIN_NAME context:", js.substring(Math.max(0, third2 - 50), Math.min(js.length, third2 + 300)));
    }

    // Search for axios/http baseURL configuration
    console.log("\n=== Base URL / axios config ===");
    const baseUrlPatterns = js.match(/baseURL[^,;]{0,200}/g) || [];
    baseUrlPatterns.forEach(p => console.log(`  ${p}`));

    // Search specifically for how real data tab fetches data
    console.log("\n=== realData component patterns ===");
    const rdIdx = js.indexOf("realData");
    if (rdIdx !== -1) {
        // Find nearby "url:" patterns
        const chunk = js.substring(Math.max(0, rdIdx - 500), Math.min(js.length, rdIdx + 2000));
        const urlsInChunk = chunk.match(/url:\s*["'][^"']+["']/g) || [];
        urlsInChunk.forEach(u => console.log(`  ${u}`));
    }
}

main();
