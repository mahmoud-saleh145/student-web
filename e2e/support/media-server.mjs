// A stand-in for the media gate and the backend, for the browser tests.
//
//   /media/doc.pdf      a real one-page PDF, served with CORS — what a signed
//                       ticket URL points at in these tests
//   /media/refused.pdf  403, the gate refusing an expired or revoked ticket
//   /media/missing.pdf  404, the object is not in storage
//   /media/cut.pdf      the download starts and the connection drops part-way
//   /media/partial.pdf  206 with a whole-file Content-Range for a plain GET:
//                       what the deployed gate answered before its fix
//   /media/big.pdf      a 300 KB PDF advertising `Accept-Ranges: bytes`, which
//                       would tempt pdf.js into range requests
//   /api/v1/*           503: the browser's API calls are answered by the
//                       tests' own route handlers, so the server-side proxy
//                       should never get here; if it does, the test sees a
//                       server error instead of a silent success.
//
// Every request is counted so a test can assert which URLs were fetched.
import { createServer } from 'node:http';

const PORT = Number(process.env.MEDIA_PORT ?? 4613);
const hits = [];

function blankPdf(padBytes = 0) {
  // One blank 300x400 page. Offsets are computed, so the xref is valid and
  // pdf.js opens it without repair. `padBytes` adds a comment block before the
  // objects, to make a document large enough for pdf.js to consider ranges.
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << >> /Contents 4 0 R >>',
    '<< /Length 0 >>\nstream\n\nendstream',
  ];
  let body = '%PDF-1.4\n';
  for (let written = 0; written < padBytes; written += 80) body += `%${'p'.repeat(78)}\n`;
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(body));
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

const PDF = blankPdf();
const BIG_PDF = blankPdf(300_000);
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  if (url.pathname === '/__hits') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
    res.end(JSON.stringify(hits));
    return;
  }
  if (url.pathname === '/__reset') {
    hits.length = 0;
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  hits.push(`${req.method} ${url.pathname}${url.search}${req.headers.range ? ` range=${req.headers.range}` : ''}`);

  if (url.pathname === '/media/missing.pdf') {
    res.writeHead(404, { 'access-control-allow-origin': '*', 'x-deny-reason': 'not_found' });
    res.end();
    return;
  }
  if (url.pathname === '/media/cut.pdf') {
    // Promise the whole file, send part of it, then drop the connection.
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': BIG_PDF.length, ...CORS });
    res.write(BIG_PDF.subarray(0, 4096));
    setTimeout(() => res.destroy(), 50);
    return;
  }
  if (url.pathname === '/media/partial.pdf') {
    res.writeHead(206, {
      'Content-Type': 'application/pdf',
      'Content-Length': PDF.length,
      'Content-Range': `bytes 0-${PDF.length - 1}/${PDF.length}`,
      ...CORS,
    });
    res.end(PDF);
    return;
  }
  if (url.pathname === '/media/big.pdf') {
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
    if (range) {
      const start = Number(range[1]);
      const end = range[2] ? Math.min(Number(range[2]), BIG_PDF.length - 1) : BIG_PDF.length - 1;
      res.writeHead(206, {
        'Content-Type': 'application/pdf',
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${BIG_PDF.length}`,
        'Accept-Ranges': 'bytes',
        ...CORS,
      });
      res.end(BIG_PDF.subarray(start, end + 1));
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': BIG_PDF.length,
      'Accept-Ranges': 'bytes',
      ...CORS,
    });
    res.end(BIG_PDF);
    return;
  }

  if (url.pathname === '/media/doc.pdf') {
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': PDF.length, ...CORS });
    res.end(req.method === 'HEAD' ? undefined : PDF);
    return;
  }
  if (url.pathname === '/media/unverifiable.pdf') {
    // 503, the gate unable to verify a ticket: the API was unreachable.
    res.writeHead(503, { 'access-control-allow-origin': '*', 'x-deny-reason': 'ticket_unverifiable' });
    res.end();
    return;
  }
  if (url.pathname === '/media/refused.pdf') {
    res.writeHead(403, { 'Content-Type': 'text/plain', ...CORS });
    res.end('ticket_expired');
    return;
  }
  res.writeHead(503, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: false, error: { code: 'SERVER_ERROR', message: 'stub' } }));
}).listen(PORT, '127.0.0.1');
