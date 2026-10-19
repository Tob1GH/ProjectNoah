// Zero-dependency mock backend so the UI runs out of the box.
// Replace it with your real API: keep the same routes and JSON shapes (see README.md).
import http from 'node:http';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const PORT = process.env.PORT || 4000;
const day = 86400000;
const ago = (d) => new Date(Date.now() - d * day).toISOString();
const ahead = (d) => new Date(Date.now() + d * day).toISOString();

const books = [
  ['The Left Hand of Darkness', 'Ursula K. Le Guin', 'Fiction', 1969, 3, 2],
  ['A Pattern Language', 'Christopher Alexander', 'Architecture', 1977, 2, 0],
  ['The Design of Everyday Things', 'Don Norman', 'Design', 1988, 4, 3],
  ['Braiding Sweetgrass', 'Robin Wall Kimmerer', 'Nature', 2013, 3, 1],
  ['Gödel, Escher, Bach', 'Douglas Hofstadter', 'Science', 1979, 2, 2],
  ['The Dispossessed', 'Ursula K. Le Guin', 'Fiction', 1974, 2, 0],
  ['Thinking in Systems', 'Donella Meadows', 'Science', 2008, 3, 3],
  ['The Elements of Typographic Style', 'Robert Bringhurst', 'Design', 1992, 2, 1],
  ['Silent Spring', 'Rachel Carson', 'Nature', 1962, 2, 2],
  ['Invisible Cities', 'Italo Calvino', 'Fiction', 1972, 3, 3],
  ['Towards a New Architecture', 'Le Corbusier', 'Architecture', 1923, 1, 1],
  ['The Soul of a New Machine', 'Tracy Kidder', 'Technology', 1981, 2, 2],
  ['The Mythical Man-Month', 'Frederick Brooks', 'Technology', 1975, 3, 2],
  ['Cosmos', 'Carl Sagan', 'Science', 1980, 4, 4],
].map(([title, author, category, year, copiesTotal, copiesAvailable], i) => ({
  id: `b${i + 1}`, title, author, category, year, copiesTotal, copiesAvailable,
}));

const loans = [
  { id: 'l1', bookId: 'b2', member: 'Priya Nair', borrowedAt: ago(30), dueAt: ago(6), status: 'overdue' },
  { id: 'l2', bookId: 'b6', member: 'Tomás Ortega', borrowedAt: ago(12), dueAt: ahead(2), status: 'active' },
  { id: 'l3', bookId: 'b4', member: 'Mei Chen', borrowedAt: ago(8), dueAt: ahead(6), status: 'active' },
  { id: 'l4', bookId: 'b8', member: 'Alex Rivera', borrowedAt: ago(5), dueAt: ahead(9), status: 'active' },
  { id: 'l5', bookId: 'b1', member: 'Sam Okafor', borrowedAt: ago(40), dueAt: ago(26), returnedAt: ago(27), status: 'returned' },
  { id: 'l6', bookId: 'b13', member: 'Lena Fischer', borrowedAt: ago(20), dueAt: ahead(1), status: 'active' },
].map((l) => ({ ...l, bookTitle: books.find((b) => b.id === l.bookId).title }));

const assets = [
  ['Annual report 2025', 'document', 'pdf', 4200000, ['report', 'finance'], 'Governance'],
  ['Reading room floor plan', 'image', 'png', 2800000, ['architecture', 'plans'], 'Facilities'],
  ['Author talk: Kimmerer', 'video', 'mp4', 412000000, ['event', 'talk'], 'Events'],
  ['Oral history: Mrs Alvarez', 'audio', 'mp3', 38000000, ['archive', 'oral-history'], 'Archive'],
  ['Spring reading list', 'document', 'docx', 380000, ['marketing'], 'Marketing'],
  ['Atrium photo, north light', 'image', 'jpg', 5100000, ['photo', 'building'], 'Facilities'],
  ['Catalogue export, Q3', 'document', 'xlsx', 910000, ['catalogue'], 'Operations'],
  ['Summer reading poster', 'image', 'png', 7600000, ['poster', 'marketing'], 'Marketing'],
  ['Digitisation guide', 'document', 'pdf', 1900000, ['howto', 'archive'], 'Archive'],
  ['Open day highlights', 'video', 'mov', 220000000, ['event'], 'Events'],
].map(([title, type, format, sizeBytes, tags, collection], i) => ({
  id: `a${i + 1}`, title, type, format, sizeBytes, tags, collection,
  owner: ['Alex Rivera', 'Priya Nair', 'Mei Chen'][i % 3], createdAt: ago(i * 3 + 1),
  url: '#', thumbnailUrl: null,
}));

const send = (res, code, data) => {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(data === undefined ? '' : JSON.stringify(data));
};

const readBody = (req) => new Promise((resolve) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => resolve(Buffer.concat(chunks)));
});

// Minimal multipart reader: pulls plain text fields only (the file bytes are ignored in this mock)
const field = (raw, name) => raw.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`))?.[1] ?? '';

const typeFromMime = (mime, ext) =>
  mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : (ext ? 'document' : 'document');

const matches = (text, q) => text.toLowerCase().includes(q.toLowerCase());
const page = (list, limit) => ({ items: limit ? list.slice(0, Number(limit)) : list, total: list.length });

// ---- Accounts and sessions (in memory: restarting the mock clears new accounts and sign-ins) ----
const hashPassword = (password, salt = randomBytes(16).toString('hex')) =>
  ({ salt, hash: scryptSync(password, salt, 32).toString('hex') });
const checkPassword = (password, user) =>
  timingSafeEqual(Buffer.from(hashPassword(password, user.salt).hash, 'hex'), Buffer.from(user.hash, 'hex'));

const users = [{ id: 'u1', name: 'Alex Rivera', email: 'demo@gyarados.test', ...hashPassword('demo1234') }];
const sessions = new Map(); // token -> user
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email });
const startSession = (u) => { const token = randomBytes(32).toString('hex'); sessions.set(token, u); return token; };
const readJson = async (req) => { try { return JSON.parse((await readBody(req)).toString() || '{}'); } catch { return {}; } };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname.replace(/^\/api/, '');
  const q = url.searchParams;
  if (req.method === 'OPTIONS') return send(res, 204);

  // ---- Public routes ----
  if (p === '/health') return send(res, 200, { status: 'ok', demoAccount: 'demo@gyarados.test' });
  if (p === '/auth/login' && req.method === 'POST') {
    const { email = '', password = '' } = await readJson(req);
    const user = users.find((u) => u.email === String(email).trim().toLowerCase());
    if (!user) return send(res, 401, { message: 'No account found for that email. The mock demo account is demo@gyarados.test.' });
    if (!checkPassword(String(password), user)) return send(res, 401, { message: 'That password is incorrect.' });
    return send(res, 200, { token: startSession(user), user: publicUser(user) });
  }
  if (p === '/auth/register' && req.method === 'POST') {
    const { name = '', email = '', password = '' } = await readJson(req);
    const cleanEmail = String(email).trim().toLowerCase();
    if (!String(name).trim()) return send(res, 400, { message: 'Enter your full name.' });
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) return send(res, 400, { message: 'Enter a valid email address.' });
    if (String(password).length < 8) return send(res, 400, { message: 'Choose a password with at least 8 characters.' });
    if (users.some((u) => u.email === cleanEmail)) return send(res, 409, { message: 'An account with this email already exists. Try signing in.' });
    const user = { id: `u${randomUUID().slice(0, 6)}`, name: String(name).trim(), email: cleanEmail, ...hashPassword(String(password)) };
    users.push(user);
    return send(res, 201, { token: startSession(user), user: publicUser(user) });
  }

  // ---- Everything below needs a signed-in user ----
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const me = sessions.get(token);
  if (!me) return send(res, 401, { message: 'Please sign in to continue.' });
  if (p === '/auth/me') return send(res, 200, publicUser(me));
  if (p === '/auth/logout' && req.method === 'POST') { sessions.delete(token); return send(res, 204); }

  // GET /stats
  if (p === '/stats') {
    return send(res, 200, {
      totalBooks: books.length,
      availableCopies: books.reduce((n, b) => n + b.copiesAvailable, 0),
      activeLoans: loans.filter((l) => l.status !== 'returned').length,
      overdueLoans: loans.filter((l) => l.status === 'overdue').length,
      totalAssets: assets.length,
      storageUsedMb: Math.round(assets.reduce((n, a) => n + a.sizeBytes, 0) / 1048576),
      storageQuotaMb: 1024,
    });
  }

  if (p === '/categories') return send(res, 200, [...new Set(books.map((b) => b.category))].sort());

  // GET /books?q=&category=&status=
  if (p === '/books' && req.method === 'GET') {
    let list = books.filter((b) =>
      (!q.get('q') || matches(`${b.title} ${b.author}`, q.get('q'))) &&
      (!q.get('category') || b.category === q.get('category')) &&
      (!q.get('status') || (q.get('status') === 'available' ? b.copiesAvailable > 0 : b.copiesAvailable === 0)));
    return send(res, 200, page(list, q.get('limit')));
  }

  // POST /books/:id/borrow
  let m = p.match(/^\/books\/([^/]+)\/borrow$/);
  if (m && req.method === 'POST') {
    const book = books.find((b) => b.id === m[1]);
    if (!book) return send(res, 404, { message: 'Book not found.' });
    if (book.copiesAvailable < 1) return send(res, 409, { message: 'No copies are available.' });
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    book.copiesAvailable -= 1;
    const loan = { id: `l${randomUUID().slice(0, 6)}`, bookId: book.id, bookTitle: book.title, member: me.name, borrowedAt: new Date().toISOString(), dueAt: ahead(14), status: 'active' };
    loans.unshift(loan);
    return send(res, 201, loan);
  }

  // GET /loans?status=&limit=
  if (p === '/loans' && req.method === 'GET') {
    let list = loans.filter((l) => !q.get('status') || l.status === q.get('status'));
    list = [...list].sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
    return send(res, 200, page(list, q.get('limit')));
  }

  // POST /loans/:id/return
  m = p.match(/^\/loans\/([^/]+)\/return$/);
  if (m && req.method === 'POST') {
    const loan = loans.find((l) => l.id === m[1]);
    if (!loan) return send(res, 404, { message: 'Loan not found.' });
    if (loan.status !== 'returned') {
      loan.status = 'returned';
      loan.returnedAt = new Date().toISOString();
      const book = books.find((b) => b.id === loan.bookId);
      if (book) book.copiesAvailable = Math.min(book.copiesTotal, book.copiesAvailable + 1);
    }
    return send(res, 200, loan);
  }

  // GET /assets?q=&type=&sort=recent&limit=
  if (p === '/assets' && req.method === 'GET') {
    let list = assets.filter((a) =>
      (!q.get('q') || matches(`${a.title} ${a.tags.join(' ')} ${a.collection}`, q.get('q'))) &&
      (!q.get('type') || a.type === q.get('type')));
    list = [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return send(res, 200, page(list, q.get('limit')));
  }

  // POST /assets (multipart/form-data)
  if (p === '/assets' && req.method === 'POST') {
    const raw = (await readBody(req)).toString('latin1');
    const filename = field(raw, 'filename') || 'untitled';
    const ext = filename.includes('.') ? filename.split('.').pop().toLowerCase() : 'bin';
    const asset = {
      id: `a${randomUUID().slice(0, 6)}`,
      title: field(raw, 'title') || filename,
      type: typeFromMime(field(raw, 'mime'), ext),
      format: ext,
      sizeBytes: Number(field(raw, 'size')) || 0,
      tags: field(raw, 'tags').split(',').map((t) => t.trim()).filter(Boolean),
      collection: '', owner: me.name, createdAt: new Date().toISOString(), url: '#', thumbnailUrl: null,
    };
    assets.unshift(asset);
    return send(res, 201, asset);
  }

  // DELETE /assets/:id
  m = p.match(/^\/assets\/([^/]+)$/);
  if (m && req.method === 'DELETE') {
    const i = assets.findIndex((a) => a.id === m[1]);
    if (i === -1) return send(res, 404, { message: 'File not found.' });
    assets.splice(i, 1);
    return send(res, 204);
  }

  send(res, 404, { message: 'Not found.' });
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPort ${PORT} is already in use. An older copy of the mock is probably still running.`);
    console.error('Close every terminal running "npm run mock" (trash icon in VS Code), then start it again.\n');
  } else {
    console.error(err);
  }
  process.exit(1);
});
server.listen(PORT, () => {
  console.log(`Mock API running at http://localhost:${PORT}/api`);
  console.log('Demo account:  demo@gyarados.test  /  demo1234');
});
