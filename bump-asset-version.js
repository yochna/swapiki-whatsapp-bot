// Gives every script/stylesheet URL in index.html a fresh ?v= tag so browsers
// and Cloudflare stop using the copies cached while profile subdomains were
// answering script requests with HTML. Plain node, UTF-8 in and out (no BOM),
// so it cannot mangle the file's encoding. Run from the project folder:
//   node bump-asset-version.js
const fs = require('fs');
const FILE = 'index.html';
const TAG = process.argv[2] || '20261027s';
const before = fs.readFileSync(FILE, 'utf8');
let n = 0;
const after = before.replace(/((?:src|href)="\/?(?:vendor|dist)\/[^"?]+\?v=)\d{8}[a-z](?=")/g, (m, head) => { n++; return head + TAG; });
fs.writeFileSync(FILE, after, 'utf8');
console.log(`Updated ${n} asset URLs in ${FILE} to ?v=${TAG}`);
