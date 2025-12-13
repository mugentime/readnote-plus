const http = require('http');
const fs = require('fs');
const path = require('path');
const Redis = require('ioredis');

const PORT = process.env.PORT || 3000;
const REDIS_URL = process.env.REDIS_URL;

// Initialize Redis client
let redis = null;
if (REDIS_URL) {
    redis = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        lazyConnect: true
    });

    redis.on('connect', () => console.log('Redis connected'));
    redis.on('error', (err) => console.error('Redis error:', err.message));

    redis.connect().catch(err => {
        console.error('Redis connection failed:', err.message);
        redis = null;
    });
} else {
    console.log('No REDIS_URL provided, running without cloud storage');
}

const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// Parse JSON body
async function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                reject(e);
            }
        });
        req.on('error', reject);
    });
}

// Send JSON response
function sendJson(res, data, status = 200) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(data));
}

// API Routes
async function handleApi(req, res) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = url.pathname;

    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
    }

    // Check Redis availability
    if (!redis) {
        sendJson(res, { error: 'Cloud storage not available' }, 503);
        return;
    }

    try {
        // GET /api/books - List all books (metadata only)
        if (pathname === '/api/books' && req.method === 'GET') {
            const keys = await redis.keys('book:*:meta');
            const books = [];

            for (const key of keys) {
                const meta = await redis.get(key);
                if (meta) {
                    books.push(JSON.parse(meta));
                }
            }

            sendJson(res, { books });
            return;
        }

        // GET /api/books/:id - Get full book data
        if (pathname.match(/^\/api\/books\/[^/]+$/) && req.method === 'GET') {
            const bookId = pathname.split('/').pop();
            const meta = await redis.get(`book:${bookId}:meta`);
            const data = await redis.get(`book:${bookId}:data`);

            if (!meta) {
                sendJson(res, { error: 'Book not found' }, 404);
                return;
            }

            sendJson(res, {
                ...JSON.parse(meta),
                rawData: data // Base64 encoded
            });
            return;
        }

        // POST /api/books - Save a book
        if (pathname === '/api/books' && req.method === 'POST') {
            const body = await parseBody(req);
            const { id, name, type, size, metadata, rawData, content, chapters } = body;

            if (!id || !name) {
                sendJson(res, { error: 'Missing required fields' }, 400);
                return;
            }

            // Store metadata separately (smaller, for listing)
            const metaData = {
                id,
                name,
                type,
                size,
                metadata,
                savedAt: new Date().toISOString()
            };

            await redis.set(`book:${id}:meta`, JSON.stringify(metaData));

            // Store raw data if provided (Base64)
            if (rawData) {
                await redis.set(`book:${id}:data`, rawData);
            }

            // Store content/chapters for quick access
            if (content || chapters) {
                await redis.set(`book:${id}:content`, JSON.stringify({ content, chapters }));
            }

            sendJson(res, { success: true, id });
            return;
        }

        // DELETE /api/books/:id - Delete a book
        if (pathname.match(/^\/api\/books\/[^/]+$/) && req.method === 'DELETE') {
            const bookId = pathname.split('/').pop();

            await redis.del(`book:${bookId}:meta`);
            await redis.del(`book:${bookId}:data`);
            await redis.del(`book:${bookId}:content`);

            sendJson(res, { success: true });
            return;
        }

        // GET /api/progress - Get reading progress
        if (pathname === '/api/progress' && req.method === 'GET') {
            const progress = await redis.get('user:progress');
            sendJson(res, { progress: progress ? JSON.parse(progress) : {} });
            return;
        }

        // POST /api/progress - Save reading progress
        if (pathname === '/api/progress' && req.method === 'POST') {
            const body = await parseBody(req);
            await redis.set('user:progress', JSON.stringify(body.progress || {}));
            sendJson(res, { success: true });
            return;
        }

        // GET /api/notes - Get all notes
        if (pathname === '/api/notes' && req.method === 'GET') {
            const notes = await redis.get('user:notes');
            sendJson(res, { notes: notes ? JSON.parse(notes) : {} });
            return;
        }

        // POST /api/notes - Save notes
        if (pathname === '/api/notes' && req.method === 'POST') {
            const body = await parseBody(req);
            await redis.set('user:notes', JSON.stringify(body.notes || {}));
            sendJson(res, { success: true });
            return;
        }

        // GET /api/status - Check Redis status
        if (pathname === '/api/status' && req.method === 'GET') {
            const ping = await redis.ping();
            sendJson(res, { redis: ping === 'PONG' ? 'connected' : 'error' });
            return;
        }

        sendJson(res, { error: 'Not found' }, 404);

    } catch (err) {
        console.error('API error:', err);
        sendJson(res, { error: err.message }, 500);
    }
}

// Main server
const server = http.createServer(async (req, res) => {
    // Handle API routes
    if (req.url.startsWith('/api/')) {
        await handleApi(req, res);
        return;
    }

    // Serve static files
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    let filePath = (urlPath === '/' || urlPath === '') ? '/ReadNote Plus.html' : urlPath;
    filePath = path.join(__dirname, filePath);

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // Serve main page for any route (SPA behavior)
                fs.readFile(path.join(__dirname, 'ReadNote Plus.html'), (err, content) => {
                    if (err) {
                        res.writeHead(500);
                        res.end('Server Error');
                    } else {
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(content);
                    }
                });
            } else {
                res.writeHead(500);
                res.end('Server Error');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
});

server.listen(PORT, () => {
    console.log(`ReadNote Plus running on port ${PORT}`);
    console.log(`Redis: ${REDIS_URL ? 'configured' : 'not configured'}`);
});
