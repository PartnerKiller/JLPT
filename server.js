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

const getJsonBody = (req) => {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        resolve({});
      }
    });
  });
};

const server = http.createServer((req, res) => {
  // Handle API Requests
  if (req.url.startsWith('/api/')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const dbPath = path.join(__dirname, 'database.json');
    const readDb = () => {
      try {
        if (!fs.existsSync(dbPath)) {
          return { users: [] };
        }
        return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      } catch (e) {
        console.error('CRITICAL: Failed to read user database!', e);
        throw new Error('Database read failure');
      }
    };
    const writeDb = (data) => {
      fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
    };

    // 1. LOGIN ENDPOINT
    if (req.url === '/api/login' && req.method === 'POST') {
      console.log('API Login route invoked!');
      getJsonBody(req).then(body => {
        console.log('Parsed login body:', body);
        try {
          const dbData = readDb();
          console.log('Found users list:', dbData.users);
          const user = dbData.users.find(u => u.username === body.username && u.password === body.password);
          if (user) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, username: user.username, role: user.role }));
          } else {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Invalid username or password' }));
          }
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Database read failure' }));
        }
      });
      return;
    }

    // 2. REGISTER ENDPOINT
    if (req.url === '/api/register' && req.method === 'POST') {
      getJsonBody(req).then(body => {
        try {
          const dbData = readDb();
          const existing = dbData.users.find(u => u.username === body.username);
          if (existing) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Username already exists' }));
            return;
          }
          const newUser = {
            username: body.username,
            password: body.password,
            role: 'learner',
            scores: {}
          };
          dbData.users.push(newUser);
          writeDb(dbData);
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, username: newUser.username, role: newUser.role }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Database write failure' }));
        }
      });
      return;
    }

    // 3. USER PROFILE UPDATE ENDPOINT
    if (req.url === '/api/profile/update' && req.method === 'POST') {
      getJsonBody(req).then(body => {
        try {
          const dbData = readDb();
          const userIdx = dbData.users.findIndex(u => u.username === body.currentUsername);
          if (userIdx === -1) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'User not found' }));
            return;
          }
          
          // Check duplicate name
          if (body.newUsername && body.newUsername !== body.currentUsername) {
            const duplicate = dbData.users.find(u => u.username === body.newUsername);
            if (duplicate) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, message: 'New username already taken' }));
              return;
            }
            dbData.users[userIdx].username = body.newUsername;
          }
          
          if (body.newPassword) {
            dbData.users[userIdx].password = body.newPassword;
          }

          writeDb(dbData);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, username: dbData.users[userIdx].username }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Database write failure' }));
        }
      });
      return;
    }

    // 4. GET ALL USERS (ADMIN ONLY)
    if (req.url === '/api/admin/users' && req.method === 'GET') {
      try {
        const authUser = req.headers['x-auth-user'];
        const authRole = req.headers['x-auth-role'];
        const dbData = readDb();
        const adminUser = dbData.users.find(u => u.username === authUser && u.role === 'admin');
        if (!adminUser || authRole !== 'admin') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Forbidden: Admin access required' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, users: dbData.users }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Database read failure' }));
      }
      return;
    }

    // 5. UPDATE USER CREDENTIALS (ADMIN ONLY)
    if (req.url === '/api/admin/user/update' && req.method === 'POST') {
      try {
        const authUser = req.headers['x-auth-user'];
        const authRole = req.headers['x-auth-role'];
        const dbData = readDb();
        const adminUser = dbData.users.find(u => u.username === authUser && u.role === 'admin');
        if (!adminUser || authRole !== 'admin') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Forbidden: Admin access required' }));
          return;
        }

        getJsonBody(req).then(body => {
          const userIdx = dbData.users.findIndex(u => u.username === body.targetUsername);
          if (userIdx === -1) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Target user not found' }));
            return;
          }

          // Check duplicate name
          if (body.newUsername && body.newUsername !== body.targetUsername) {
            const duplicate = dbData.users.find(u => u.username === body.newUsername);
            if (duplicate) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, message: 'Username already taken' }));
              return;
            }
            dbData.users[userIdx].username = body.newUsername;
          }

          if (body.newPassword) {
            dbData.users[userIdx].password = body.newPassword;
          }

          writeDb(dbData);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        });
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Database write failure' }));
      }
      return;
    }

    // 6. SAVE REPORT CARD ENDPOINT
    if (req.url === '/api/report/save' && req.method === 'POST') {
      getJsonBody(req).then(body => {
        try {
          const dbData = readDb();
          const userIdx = dbData.users.findIndex(u => u.username === body.username);
          if (userIdx !== -1) {
            if (!dbData.users[userIdx].scores) {
              dbData.users[userIdx].scores = {};
            }
            // Save highest percentage score
            const prevPct = dbData.users[userIdx].scores[body.level] || 0;
            if (body.pct >= prevPct) {
              dbData.users[userIdx].scores[body.level] = body.pct;
            }
            writeDb(dbData);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'User not found' }));
          }
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Database write failure' }));
        }
      });
      return;
    }

    // 7. GET REPORT CARD ENDPOINT
    if (req.url.startsWith('/api/report/get') && req.method === 'GET') {
      try {
        const urlParts = req.url.split('?');
        const params = new URLSearchParams(urlParts[1] || '');
        const username = params.get('username');
        const dbData = readDb();
        const user = dbData.users.find(u => u.username === username);
        if (user) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, scores: user.scores || {} }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'User not found' }));
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Database read failure' }));
      }
      return;
    }

    // Unrecognized API
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: 'Endpoint not found' }));
    return;
  }

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
