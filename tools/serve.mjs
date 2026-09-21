// Zero-dependency static server, including byte-range playback for local videos.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.vtt': 'text/vtt; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = resolve(ROOT, `.${p === '/' ? '/index.html' : p}`);
    if (!file.startsWith(resolve(ROOT) + sep) || p.split('/').some(s=>s.startsWith('.'))) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    const s = await stat(file).catch(() => null);
    if (!s || !s.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    const headers = {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes',
    };
    let start=0, end=s.size-1, status=200;
    if (req.headers.range && req.method === 'GET') {
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (m && (m[1] || m[2])) {
        start = m[1] ? Number(m[1]) : Math.max(0,s.size-Number(m[2]));
        end = m[1] && m[2] ? Math.min(end,Number(m[2])) : end;
      } else start=s.size;
      if (start > end || start >= s.size || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
        res.writeHead(416, { ...headers, 'Content-Range': `bytes */${s.size}` }); res.end(); return;
      }
      status=206; headers['Content-Range']=`bytes ${start}-${end}/${s.size}`;
    }
    headers['Content-Length'] = Math.max(0,end-start+1);
    res.writeHead(status,headers);
    if (req.method === 'HEAD' || !s.size) { res.end(); return; }
    const stream=createReadStream(file,{start,end});
    stream.on('error',()=>res.destroy());
    res.on('close',()=>stream.destroy());
    stream.pipe(res);
  } catch {
    if (!res.headersSent) res.writeHead(400);
    res.end('Bad request');
  }
}).listen(PORT, '0.0.0.0', () => console.log(`VECTOR ZERO running on http://0.0.0.0:${PORT}`));
