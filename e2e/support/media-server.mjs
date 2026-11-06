// A stand-in for the media gate and the backend, for the browser tests.
//
//   /media/doc.pdf      a real one-page PDF, served with CORS — what a signed
//                       ticket URL points at in these tests
//   /media/refused.pdf  403, the gate refusing an expired or revoked ticket
//   /api/v1/*           503: the browser's API calls are answered by the
//                       tests' own route handlers, so the server-side proxy
//                       should never get here; if it does, the test sees a
//                       server error instead of a silent success.
//
// Every request is counted so a test can assert which URLs were fetched.
import { createServer } from 'node:http';

const PORT = Number(process.env.MEDIA_PORT ?? 4613);
const hits = [];

function blankPdf() {
  // One blank 300x400 page. Offsets are computed, so the xref is valid and
  // pdf.js opens it without repair.
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << >> /Contents 4 0 R >>',
    '<< /Length 0 >>\nstream\n\nendstream',
  ];
  let body = '%PDF-1.4\n';
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
  hits.push(`${req.method} ${url.pathname}${url.search}`);

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
