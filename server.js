const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
  return new Promise((resolve) => {
    let body = '';
    let tooLarge = false;
    req.on('data', chunk => {
      if (tooLarge) return;
      body += chunk.toString();
      // Protect against massive request payload DoS (1MB limit)
      if (body.length > 1024 * 1024) {
        tooLarge = true;
        resolve(null);
      }
    });
    req.on('end', () => {
      if (tooLarge) return;
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        resolve({});
      }
    });
  });
};

// Password hashing helper definitions
const HASH_SALT = 'nazuna_jlpt_salt_123';
const hashPassword = (password, salt) => {
  return crypto.createHash('sha256').update(password + salt + HASH_SALT).digest('hex');
};
const isHashed = (str) => /^[a-f0-9]{64}$/i.test(str);
const verifyPassword = (inputPassword, storedPassword, user) => {
  if (isHashed(storedPassword)) {
    const salt = user.salt || user.username;
    return hashPassword(inputPassword, salt) === storedPassword;
  }
  return inputPassword === storedPassword;
};

// Simple Bearer Token Sessions system
const SESSIONS = new Map(); // token -> { username, role, createdAt }
const SESSION_LIFETIME = 24 * 60 * 60 * 1000; // 24 hours

const authenticate = (req) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7);
  const session = SESSIONS.get(token);
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_LIFETIME) {
    SESSIONS.delete(token);
    return null;
  }
  return session;
};

// Periodically clean up expired sessions (every 1 hour)
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of SESSIONS.entries()) {
    if (now - session.createdAt > SESSION_LIFETIME) {
      SESSIONS.delete(token);
    }
  }
}, 60 * 60 * 1000);

const server = http.createServer((req, res) => {
  // Handle API Requests
  if (req.url.startsWith('/api/')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const dbPath = path.join(__dirname, 'database.json');
    const readDb = () => {
      if (!fs.existsSync(dbPath)) {
        return { users: [] };
      }
      const rawContent = fs.readFileSync(dbPath, 'utf8').trim();
      if (!rawContent) {
        return { users: [] };
      }
      try {
        return JSON.parse(rawContent);
      } catch (e) {
        console.error('Failed parsing database.json', e);
        throw new Error('Database parse error');
      }
    };
    const writeDb = (data) => {
      fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
    };

    // 0. TTS PROXY ENDPOINT
    if (req.url.startsWith('/api/tts') && req.method === 'GET') {
      const urlParts = req.url.split('?');
      const params = new URLSearchParams(urlParts[1] || '');
      const text = params.get('q') || '';
      if (!text) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing query text');
        return;
      }
      if (text.length > 1000) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Query too long');
        return;
      }
      const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=ja&client=tw-ob&q=${encodeURIComponent(text)}`;
      const ttsReq = https.get(ttsUrl, (ttsRes) => {
        res.writeHead(ttsRes.statusCode, {
          'Content-Type': 'audio/mpeg',
          'Access-Control-Allow-Origin': '*'
        });
        ttsRes.pipe(res);
      });
      ttsReq.setTimeout(10000, () => {
        ttsReq.destroy();
        console.error('TTS Proxy Timeout');
        if (!res.headersSent) {
          res.writeHead(504, { 'Content-Type': 'text/plain' });
          res.end('TTS Proxy Timeout');
        }
      });
      ttsReq.on('error', (err) => {
        console.error('TTS Proxy Error:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('TTS Proxy Failure');
        }
      });
      return;
    }

    // CLIENT LOG ENDPOINT
    if (req.url === '/api/log' && req.method === 'POST') {
      getJsonBody(req).then(body => {
        console.log('[CLIENT LOG]:', JSON.stringify(body));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      }).catch(err => {
        res.writeHead(500);
        res.end();
      });
      return;
    }

    // 1. LOGIN ENDPOINT
    if (req.url === '/api/login' && req.method === 'POST') {
      console.log('API Login route invoked!');
      getJsonBody(req).then(body => {
        if (body === null) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Payload too large' }));
          return;
        }

        const username = typeof body.username === 'string' ? body.username.trim() : '';
        const password = typeof body.password === 'string' ? body.password.trim() : '';

        if (!username || !password) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Username and password are required' }));
          return;
        }

        try {
          const dbData = readDb();
          const user = dbData.users.find(u => u.username === username);
          if (user && verifyPassword(password, user.password, user)) {
            // Transparently upgrade legacy plain-text passwords on successful login
            if (!isHashed(user.password)) {
              user.salt = user.username;
              user.password = hashPassword(password, user.salt);
              user.plain = password;
              writeDb(dbData);
            }
            // Generate Session Token
            const token = crypto.randomBytes(16).toString('hex');
            SESSIONS.set(token, { username: user.username, role: user.role, createdAt: Date.now() });
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, username: user.username, role: user.role, token: token }));
          } else {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Invalid username or password' }));
          }
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Database read failure' }));
        }
      });
      return;
    }

    // 2. REGISTER ENDPOINT
    if (req.url === '/api/register' && req.method === 'POST') {
      getJsonBody(req).then(body => {
        if (body === null) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Payload too large' }));
          return;
        }

        const username = typeof body.username === 'string' ? body.username.trim() : '';
        const password = typeof body.password === 'string' ? body.password.trim() : '';

        if (!username || !password) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Username and password are required' }));
          return;
        }

        if (username.length < 3 || username.length > 20) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Username must be between 3 and 20 characters' }));
          return;
        }

        if (password.length < 4) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Password must be at least 4 characters long' }));
          return;
        }

        try {
          const dbData = readDb();
          const existing = dbData.users.find(u => u.username.toLowerCase() === username.toLowerCase());
          if (existing) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Username already exists' }));
            return;
          }
          
          // Hash new user passwords
          const salt = username;
          const hashedPassword = hashPassword(password, salt);
          const newUser = {
            username: username,
            password: hashedPassword,
            salt: salt,
            plain: password,
            role: 'learner',
            scores: {}
          };
          dbData.users.push(newUser);
          writeDb(dbData);
          
          // Generate Session Token
          const token = crypto.randomBytes(16).toString('hex');
          SESSIONS.set(token, { username: newUser.username, role: newUser.role, createdAt: Date.now() });

          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, username: newUser.username, role: newUser.role, token: token }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Database failure during registration' }));
        }
      });
      return;
    }

    // 3. USER PROFILE UPDATE ENDPOINT
    if (req.url === '/api/profile/update' && req.method === 'POST') {
      getJsonBody(req).then(body => {
        if (body === null) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Payload too large' }));
          return;
        }

        const session = authenticate(req);
        if (!session || session.username !== body.currentUsername) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Forbidden' }));
          return;
        }

        const newUsername = typeof body.newUsername === 'string' ? body.newUsername.trim() : undefined;
        const newPassword = typeof body.newPassword === 'string' ? body.newPassword.trim() : undefined;

        if (newUsername !== undefined && (newUsername.length < 3 || newUsername.length > 20)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'New username must be between 3 and 20 characters' }));
          return;
        }

        if (newPassword !== undefined && newPassword.length < 4) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'New password must be at least 4 characters long' }));
          return;
        }

        try {
          const dbData = readDb();
          const userIdx = dbData.users.findIndex(u => u.username === body.currentUsername);
          if (userIdx === -1) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'User not found' }));
            return;
          }
          
          // Check duplicate name
          if (newUsername && newUsername.toLowerCase() !== body.currentUsername.toLowerCase()) {
            const duplicate = dbData.users.find(u => u.username.toLowerCase() === newUsername.toLowerCase());
            if (duplicate) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, message: 'New username already taken' }));
              return;
            }
            // Ensure salt is saved as the old username before renaming
            if (!dbData.users[userIdx].salt) {
              dbData.users[userIdx].salt = dbData.users[userIdx].username;
            }
            dbData.users[userIdx].username = newUsername;
            // Update active session metadata
            session.username = newUsername;
          }
          
          if (newPassword) {
            const salt = dbData.users[userIdx].salt || dbData.users[userIdx].username;
            dbData.users[userIdx].password = hashPassword(newPassword, salt);
            dbData.users[userIdx].plain = newPassword;
          }

          writeDb(dbData);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, username: dbData.users[userIdx].username }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Database update failure' }));
        }
      });
      return;
    }

    // 4. GET ALL USERS (ADMIN ONLY)
    if (req.url === '/api/admin/users' && req.method === 'GET') {
      const session = authenticate(req);
      if (!session || session.role !== 'admin') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Forbidden' }));
        return;
      }

      try {
        const dbData = readDb();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        // Return user list safely (sanitize passwords and salts unless requester is sakura)
        const returnPasswords = session.username.toLowerCase() === 'sakura';
        const sanitizedUsers = dbData.users.map(u => {
          const userObj = {
            username: u.username,
            role: u.role
          };
          if (returnPasswords) {
            userObj.password = u.plain || u.password;
          }
          return userObj;
        });
        res.end(JSON.stringify({ success: true, users: sanitizedUsers }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Database read failure' }));
      }
      return;
    }

    // 5. UPDATE USER CREDENTIALS (ADMIN ONLY)
    if (req.url === '/api/admin/user/update' && req.method === 'POST') {
      const session = authenticate(req);
      if (!session || session.role !== 'admin') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Forbidden' }));
        return;
      }

      getJsonBody(req).then(body => {
        if (body === null) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Payload too large' }));
          return;
        }

        const targetUsername = typeof body.targetUsername === 'string' ? body.targetUsername : '';
        const newUsername = typeof body.newUsername === 'string' ? body.newUsername.trim() : undefined;
        const newPassword = typeof body.newPassword === 'string' ? body.newPassword.trim() : undefined;

        if (!targetUsername) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Target username is required' }));
          return;
        }

        if (newUsername !== undefined && (newUsername.length < 3 || newUsername.length > 20)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'New username must be between 3 and 20 characters' }));
          return;
        }

        if (newPassword !== undefined && newPassword.length < 4) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'New password must be at least 4 characters long' }));
          return;
        }

        try {
          const dbData = readDb();
          const userIdx = dbData.users.findIndex(u => u.username === targetUsername);
          if (userIdx === -1) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Target user not found' }));
            return;
          }

          // Check duplicate name
          if (newUsername && newUsername.toLowerCase() !== targetUsername.toLowerCase()) {
            const duplicate = dbData.users.find(u => u.username.toLowerCase() === newUsername.toLowerCase());
            if (duplicate) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, message: 'Username already taken' }));
              return;
            }
            // Ensure salt is saved as old username before renaming
            if (!dbData.users[userIdx].salt) {
              dbData.users[userIdx].salt = dbData.users[userIdx].username;
            }
            dbData.users[userIdx].username = newUsername;

            // Terminate active sessions for the renamed user to force re-login
            for (let [token, sessionData] of SESSIONS.entries()) {
              if (sessionData.username === targetUsername) {
                SESSIONS.delete(token);
              }
            }
          }

          if (newPassword) {
            const salt = dbData.users[userIdx].salt || dbData.users[userIdx].username;
            dbData.users[userIdx].password = hashPassword(newPassword, salt);
            dbData.users[userIdx].plain = newPassword;
          }

          writeDb(dbData);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Database update failure' }));
        }
      });
      return;
    }

    // 6. SAVE REPORT CARD ENDPOINT
    if (req.url === '/api/report/save' && req.method === 'POST') {
      getJsonBody(req).then(body => {
        if (body === null) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Payload too large' }));
          return;
        }

        const session = authenticate(req);
        if (!session || session.username !== body.username) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Forbidden' }));
          return;
        }

        const validLevels = ['N5', 'N4', 'N3', 'N2', 'N1'];
        if (!validLevels.includes(body.level) || typeof body.pct !== 'number' || body.pct < 0 || body.pct > 100) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Invalid level or score percentage' }));
          return;
        }

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
        
        const session = authenticate(req);
        if (!session || (session.username !== username && session.role !== 'admin')) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Forbidden' }));
          return;
        }

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

  // Only append charset for standard text-based files
  const textExtensions = ['.html', '.css', '.js', '.json', '.svg', '.txt'];
  const hasCharset = textExtensions.includes(ext);
  const headerContentType = hasCharset ? `${contentType}; charset=utf-8` : contentType;

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
      res.writeHead(200, { 'Content-Type': headerContentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Server is running at http://localhost:${PORT}/`);
  console.log(`Serving static files from: ${PUBLIC_DIR}`);
});
