const https = require('https');
const fs = require('fs');

const url = "https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sX2E3MDU0MDQwYTc3ZjQ1NzE5ZWVkYWJiN2ZjMTc1ZGJkEgsSBxDrnZXnrw4YAZIBJAoKcHJvamVjdF9pZBIWQhQxNDI3NjIzMTIxNzk4MjU2ODA1Ng&filename=&opi=96797242";
const dest = "stitch_design.html";

https.get(url, (res) => {
  const fileStream = fs.createWriteStream(dest);
  res.pipe(fileStream);
  fileStream.on('finish', () => {
    fileStream.close();
    console.log("Download complete.");
  });
}).on('error', (err) => {
  console.error("Error: ", err.message);
});
