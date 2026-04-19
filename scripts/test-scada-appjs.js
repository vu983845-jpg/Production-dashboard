/**
 * Fetch the SCADA app.js bundle and extract WebSocket + API patterns
 */
async function main() {
    const baseUrl = "https://web.asean.v-iec.com";
    const jsFiles = [
        "/js/app.ef2b889d.js",
    ];
    
    for (const jsFile of jsFiles) {
        const url = `${baseUrl}${jsFile}`;
        console.log(`Fetching ${url}...`);
        const res = await fetch(url);
        const text = await res.text();
        console.log(`Size: ${text.length} bytes`);
        
        // 1. WebSocket patterns
        const wsPatterns = text.match(/(?:new WebSocket|WebSocket\(|wss?:\/\/|\.onmessage\s*=|socket\.on|io\(|io\.connect)[^\n;]{0,300}/gi) || [];
        console.log(`\n=== WebSocket Patterns (${wsPatterns.length}) ===`);
        wsPatterns.slice(0, 20).forEach(p => console.log(`  ${p.substring(0, 300)}`));
        
        // 2. API endpoint patterns 
        const apiPatterns = text.match(/["'](?:\/api\/|\/m[0-9]\/|getRealTime|getTagList|tagGroup|realTimeData|getHistoryData|deviceDetail)[^\s"']{0,100}["']/gi) || [];
        console.log(`\n=== API Endpoints (${apiPatterns.length}) ===`);
        [...new Set(apiPatterns)].slice(0, 30).forEach(p => console.log(`  ${p}`));
        
        // 3. Look for MQTT patterns (V-NET might use MQTT)
        const mqttPatterns = text.match(/(?:mqtt|MQTT|mosquitto|subscribe|publish|topic)[^\n;]{0,200}/gi) || [];
        console.log(`\n=== MQTT Patterns (${mqttPatterns.length}) ===`);
        mqttPatterns.slice(0, 10).forEach(p => console.log(`  ${p.substring(0, 200)}`));
        
        // 4. Look for fetch/axios/http patterns with realtime
        const httpPatterns = text.match(/(?:axios|fetch|http|request|ajax)[\s\S]{0,50}(?:realtime|real_time|tag|device|data)/gi) || [];
        console.log(`\n=== HTTP+Data Patterns (${httpPatterns.length}) ===`);
        [...new Set(httpPatterns)].slice(0, 15).forEach(p => console.log(`  ${p.substring(0, 200)}`));
        
        // 5. Look for how tag values are fetched
        const tagFetchPatterns = text.match(/(?:tagValue|tagData|realTimeValue|currentValue|getValue)[^\n;]{0,200}/gi) || [];
        console.log(`\n=== Tag Value Patterns (${tagFetchPatterns.length}) ===`);
        tagFetchPatterns.slice(0, 15).forEach(p => console.log(`  ${p.substring(0, 200)}`));

        // 6. Search for "boxId" related code to understand how it queries data
        const boxIdPatterns = text.match(/boxId[^\n;]{0,150}/gi) || [];
        console.log(`\n=== boxId Patterns (${boxIdPatterns.length}) ===`);
        [...new Set(boxIdPatterns)].slice(0, 15).forEach(p => console.log(`  ${p.substring(0, 200)}`));
        
        // 7. Search for wcommon
        const wcommonPatterns = text.match(/wcommon[^\n;]{0,200}/gi) || [];
        console.log(`\n=== wcommon Patterns (${wcommonPatterns.length}) ===`);
        wcommonPatterns.slice(0, 10).forEach(p => console.log(`  ${p.substring(0, 200)}`));
    }
    
    // Also try the main V-NET platform JS to find the real-time data endpoint
    console.log("\n\n========== V-NET MAIN PLATFORM JS ==========");
    try {
        // Get the config.js first
        const configRes = await fetch(`https://asean.v-iec.com/config.js`);
        const configText = await configRes.text();
        console.log("\nconfig.js content:");
        console.log(configText.substring(0, 2000));
    } catch (err) {
        console.log(`Error: ${err.message}`);
    }
}

main();
