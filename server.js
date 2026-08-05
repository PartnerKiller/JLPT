const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8085;
const HOST = '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf'
};

const server = http.createServer((req, res) => {
  // Strip query parameters (e.g. ?v=2.0) to prevent disk lookup errors (ENOENT)
  const cleanUrl = req.url.split('?')[0];

  // Decode URL to handle Japanese characters or spaces in file names
  let decodedUrl;
  try {
    decodedUrl = decodeURIComponent(cleanUrl);
  } catch (e) {
    decodedUrl = cleanUrl;
  }

  // Set default page
  let relativePath = decodedUrl === '/' ? 'index.html' : decodedUrl;
  let filePath = path.join(PUBLIC_DIR, relativePath);

  // If the path points to a directory, safely default to index.html to prevent EISDIR errors
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }
  } catch (e) {
    // Let nonexistent files fall through to ENOENT handler
  }

  // Security check: Prevent Directory Traversal Attacks
  const relative = path.relative(PUBLIC_DIR, filePath);
  const isSafe = relative && !relative.startsWith('..') && !path.isAbsolute(relative);
  if (!isSafe && filePath !== path.join(PUBLIC_DIR, 'index.html')) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden: Access denied.');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // For Single Page Apps (SPA) or simple pages, return index.html if file doesn't exist
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, content2) => {
          if (err2) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 Not Found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content2, 'utf-8');
          }
        });
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`500 Internal Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': `${contentType}; charset=utf-8` });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Server is running at http://localhost:${PORT}/`);
  console.log(`Serving static files from: ${PUBLIC_DIR}`);
});
