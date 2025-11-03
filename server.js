const http = require('http');
const fs = require('fs');
const path = require('path');

// Default port for development. Use PORT env var to override (e.g., PORT=80 to bind to privileged port).
const PORT = parseInt(process.env.PORT || '8080', 10);
// Max upload size for POST/PUT in bytes (default 1MB). Can be overridden with env MAX_UPLOAD_BYTES.
const MAX_UPLOAD_BYTES = parseInt(process.env.MAX_UPLOAD_BYTES || String(1 * 1024 * 1024), 10);
const RES_DIR = path.join(__dirname, 'resources');
const POSTS_DIR = path.join(__dirname, 'posts');

// Ensure posts and resources directories exist
if (!fs.existsSync(RES_DIR)) fs.mkdirSync(RES_DIR, { recursive: true });
if (!fs.existsSync(POSTS_DIR)) fs.mkdirSync(POSTS_DIR, { recursive: true });

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

// Minimal mime-type map (extend as needed)
const MIME = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.pdf': 'application/pdf'
};

function mimeTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME[ext] || 'application/octet-stream';
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (req.method === 'GET') {
    // Serve files from resources/
    const safePath = path.normalize(urlPath).replace(/^\/+/, '');
    const filePath = path.join(RES_DIR, safePath);

    // Prevent path escaping
    if (!filePath.startsWith(RES_DIR)) {
      sendJSON(res, 400, { error: 'Invalid path' });
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        // Not in resources; try posts/ as a fallback
        const postsPath = path.join(POSTS_DIR, safePath);
        if (!postsPath.startsWith(POSTS_DIR)) {
          sendJSON(res, 400, { error: 'Invalid path' });
          return;
        }

        fs.stat(postsPath, (pErr, pStats) => {
          if (pErr || !pStats.isFile()) {
            sendJSON(res, 404, { error: 'Not found' });
            return;
          }

          const type = mimeTypeFor(postsPath);
          const headers = { 'Content-Type': type };
          if (type.startsWith('text/') || type === 'application/json' || type === 'text/markdown') {
            headers['Content-Type'] = headers['Content-Type'] + '; charset=utf-8';
          }
          const stream = fs.createReadStream(postsPath);
          res.writeHead(200, headers);
          stream.pipe(res);
        });
        return;
      }

      const type = mimeTypeFor(filePath);
      // Add charset for text types
      const headers = { 'Content-Type': type };
      if (type.startsWith('text/') || type === 'application/json' || type === 'text/markdown') {
        headers['Content-Type'] = headers['Content-Type'] + '; charset=utf-8';
      }

      const stream = fs.createReadStream(filePath);
      res.writeHead(200, headers);
      stream.pipe(res);
    });
    return;
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    // Expect URL like /my-post.md -> write to posts/my-post.md
    const safePath = path.normalize(urlPath).replace(/^\/+/, '');
    if (!safePath) {
      sendJSON(res, 400, { error: 'Missing target filename in URL' });
      return;
    }

    const destPath = path.join(POSTS_DIR, safePath);
    if (!destPath.startsWith(POSTS_DIR)) {
      sendJSON(res, 400, { error: 'Invalid path' });
      return;
    }

    // Restrict allowed extensions for uploaded posts
    const allowed = new Set(['.txt', '.md', '.json']);
    const ext = path.extname(destPath).toLowerCase();
    if (!allowed.has(ext)) {
      sendJSON(res, 415, { error: 'Unsupported media type. Allowed: .txt, .md, .json' });
      return;
    }

    // Validate Content-Type header: require presence and that it matches the file extension
    const ct = req.headers['content-type'];
    if (!ct) {
      sendJSON(res, 400, { error: 'Missing Content-Type header' });
      return;
    }
    const media = ct.split(';')[0].trim().toLowerCase();
    const allowedTypes = {
      '.md': new Set(['text/markdown', 'text/plain', 'text/x-markdown']),
      '.txt': new Set(['text/plain']),
      '.json': new Set(['application/json'])
    };
    const allowedForExt = allowedTypes[ext] || new Set();
    if (!allowedForExt.has(media)) {
      sendJSON(res, 415, { error: `Content-Type '${media}' not allowed for extension '${ext}'` });
      return;
    }

    // If Content-Length header is present, pre-check it to reject large uploads early
    const cl = req.headers['content-length'];
    if (cl) {
      const parsed = parseInt(cl, 10);
      if (!Number.isNaN(parsed) && parsed > MAX_UPLOAD_BYTES) {
        sendJSON(res, 413, { error: 'Payload too large (Content-Length)' });
        return;
      }
    }

    // Collect body with size limit
    let received = 0;
    let chunks = [];
    req.on('data', (chunk) => {
      const len = chunk.length || Buffer.byteLength(chunk);
      received += len;
      if (received > MAX_UPLOAD_BYTES) {
        sendJSON(res, 413, { error: 'Payload too large' });
        // Destroy the connection to stop further data
        req.destroy();
        return;
      }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      // Write (overwrite) file
      fs.mkdir(path.dirname(destPath), { recursive: true }, (mkErr) => {
        if (mkErr) {
          sendJSON(res, 500, { error: 'Failed to create directories' });
          return;
        }

        fs.writeFile(destPath, body, 'utf8', (wErr) => {
          if (wErr) {
            sendJSON(res, 500, { error: 'Failed to write file' });
            return;
          }

          const code = req.method === 'POST' ? 201 : 200;
          sendJSON(res, code, { success: true, path: path.relative(__dirname, destPath) });
        });
      });
    });

    req.on('error', () => sendJSON(res, 400, { error: 'Request error' }));
    return;
  }

  // Method not allowed
  res.writeHead(405, { 'Allow': 'GET, POST, PUT' });
  res.end();
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
