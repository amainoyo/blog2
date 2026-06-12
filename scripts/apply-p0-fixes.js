// scripts/apply-p0-fixes.js
// One-shot P0 security fix. Run with: node scripts/apply-p0-fixes.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const GBK = 'gb18030';
const TEXT_EXT = new Set(['.hbs','.js','.css','.md','.json','.txt','.html','.ps1']);
const EXCLUDE_DIRS = new Set(['node_modules','.git','uploads','.claude','.codex','.agents']);
const EXCLUDE_FILES = new Set(['database.sqlite','package-lock.json','reencode-utf8.js','apply-p0-fixes.js']);
const BAK = path.join(ROOT, '.gbk-bak');
if (!fs.existsSync(BAK)) fs.mkdirSync(BAK, { recursive: true });

function readBytes(p) { return fs.readFileSync(p); }
function writeBytes(p, b) { fs.writeFileSync(p, b); }
function readUtf8(p) { return readBytes(p).toString('utf8'); }
function writeUtf8(p, s) { writeBytes(p, Buffer.from(s, 'utf8')); }
function readGbk(p) { return new TextDecoder('gb18030').decode(readBytes(p)); }
function backup(p) {
  const rel = p.substring(ROOT.length).replace(/^[\\/]+/, '').replace(/[\\/]/g, '__');
  writeBytes(path.join(BAK, rel + '.bak'), readBytes(p));
}
function isText(p) { return TEXT_EXT.has(path.extname(p).toLowerCase()); }
function* walk(dir) {
  let es; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of es) {
    if (EXCLUDE_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile()) yield p;
  }
}

const targets = [];
for (const d of ['views','src','public','scripts']) {
  const p = path.join(ROOT, d);
  if (fs.existsSync(p)) for (const f of walk(p)) targets.push(f);
}
for (const n of ['.gitignore','README.md','CLAUDE.md','AGENTS.md']) {
  const p = path.join(ROOT, n);
  if (fs.existsSync(p)) targets.push(p);
}

let rw = 0, sk = 0;
const GBK_DEC = new TextDecoder('gb18030', { fatal: false });
for (const f of targets) {
  if (!isText(f) || EXCLUDE_FILES.has(path.basename(f))) { sk++; continue; }
  const b = readBytes(f);
  // must contain at least one high byte (0x80-0xFF) to be a candidate
  let hasHigh = false;
  for (let i = 0; i < b.length; i++) { if (b[i] >= 0x80) { hasHigh = true; break; } }
  if (!hasHigh) { sk++; continue; }
  const decoded = GBK_DEC.decode(b);
  // GBK decode never produces U+FFFD for valid GBK byte pairs; if we see replacement chars, it's likely not GBK
  if (decoded.includes('\uFFFD')) { sk++; continue; }
  // Sanity: at least one CJK ideograph or fullwidth char
  if (!/[\u4e00-\u9fff\uff00-\uffef]/.test(decoded)) { sk++; continue; }
  backup(f);
  writeUtf8(f, decoded);
  rw++;
}
console.log('[1/8] reencoded: ' + rw + ', skipped: ' + sk);

// 2. package.json
console.log('[2/8] patching package.json...');
const pkgPath = path.join(ROOT, 'package.json');
const pkg = JSON.parse(readUtf8(pkgPath));
pkg.dependencies = pkg.dependencies || {};
if (!pkg.dependencies['isomorphic-dompurify']) pkg.dependencies['isomorphic-dompurify'] = '^2.16.0';
pkg.scripts = pkg.scripts || {};
if (!pkg.scripts.reencode) pkg.scripts.reencode = 'node scripts/reencode-utf8.js';
if (!pkg.scripts['apply-p0']) pkg.scripts['apply-p0'] = 'node scripts/apply-p0-fixes.js';
writeUtf8(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// 3. .gitignore
console.log('[3/8] patching .gitignore...');
const giPath = path.join(ROOT, '.gitignore');
let gi = readUtf8(giPath);
for (const a of ['*.gbk.bak','.gbk-bak/','src/cookies*.txt','src/fresh.txt','src/test*.txt','views/new.txt','database.sqlite']) {
  const hit = gi.split(/\r?\n/).some(l => l.trim() === a);
  if (!hit) gi += '\n' + a;
}
writeUtf8(giPath, gi);

// 4. src/app.js
console.log('[4/8] patching src/app.js...');
const appPath = path.join(ROOT, 'src', 'app.js');
let app = readGbk(appPath);
if (!app.includes('FATAL: SESSION_SECRET')) {
  app = app.replace(
    "const session = require('express-session');",
    "const session = require('express-session');\n\nif (!process.env.SESSION_SECRET) {\n    console.error('FATAL: SESSION_SECRET is required');\n    process.exit(1);\n}"
  );
}
if (app.includes('blog-secret-key-2024')) {
  const oldS = "app.use(session({\n        secret: process.env.SESSION_SECRET || 'blog-secret-key-2024',\n        resave: false,\n        saveUninitialized: false,\n        cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }\n    }));";
  const newS = "app.use(session({\n        secret: process.env.SESSION_SECRET,\n        resave: false,\n        saveUninitialized: false,\n        cookie: {\n            maxAge: 7 * 24 * 60 * 60 * 1000,\n            httpOnly: true,\n            sameSite: 'lax',\n            secure: process.env.NODE_ENV === 'production'\n        }\n    }));";
  app = app.replace(oldS, newS);
}
if (app.includes("FORCE_HTTPS === 'true'")) {
  const oldH = "if (process.env.FORCE_HTTPS === 'true') {\n                res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');\n            }";
  const newH = "if (process.env.NODE_ENV === 'production') {\n                res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');\n            }";
  app = app.replace(oldH, newH);
}
const escapeHelper = "handlebars.registerHelper('escape', (s) => String(s ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'})[c]));";
if (!app.includes("registerHelper('escape'")) {
  const anchor = "handlebars.registerHelper('eq', (a, b) => String(a) === String(b));";
  app = app.replace(anchor, anchor + '\n    ' + escapeHelper);
}
writeUtf8(appPath, app);

// 5. src/utils/markdown.js (full rewrite)
console.log('[5/8] writing src/utils/markdown.js...');
const mdPath = path.join(ROOT, 'src', 'utils', 'markdown.js');
if (fs.existsSync(mdPath)) backup(mdPath);
const mdJs = [
  "const { marked } = require('marked');",
  "const DOMPurify = require('isomorphic-dompurify');",
  "",
  "marked.setOptions({ gfm: true, breaks: true });",
  "",
  "DOMPurify.addHook('afterSanitizeAttributes', (node) => {",
  "    if (node.tagName === 'A') {",
  "        node.setAttribute('rel', 'nofollow noopener ugc');",
  "        const href = node.getAttribute('href') || '';",
  "        if (/^javascript:/i.test(href)) node.removeAttribute('href');",
  "    }",
  "});",
  "",
  "const PURIFY_CONFIG = {",
  "    ALLOWED_TAGS: ['h1','h2','h3','h4','h5','h6','p','br','hr','blockquote','ul','ol','li','strong','em','del','code','pre','a','img','table','thead','tbody','tr','th','td'],",
  "    ALLOWED_ATTR: ['href','src','alt','title','class','lang'],",
  "    FORBID_TAGS: ['script','iframe','object','embed','form','style','svg','math'],",
  "    FORBID_ATTR: ['style','onerror','onclick','onload','onmouseover','onfocus','onblur']",
  "};",
  "",
  "function renderMarkdown(content) {",
  "    const raw = marked.parse(content || '');",
  "    return DOMPurify.sanitize(raw, PURIFY_CONFIG);",
  "}",
  "",
  "function renderExcerpt(content) {",
  "    return content.replace(/[#*`>\\-\\[\\]]/g, '').slice(0, 150) + '...';",
  "}",
  "",
  "module.exports = { renderMarkdown, renderExcerpt };",
  ""
].join('\n');
writeUtf8(mdPath, mdJs);

// 6. src/database.js
console.log('[6/8] patching src/database.js...');
const dbPath = path.join(ROOT, 'src', 'database.js');
let db = readGbk(dbPath);
if (db.includes("let db;\n")) db = db.replace("let db;\n", '');
if (db.includes("    db = await pool.connect();\n")) db = db.replace("    db = await pool.connect();\n", '');
if (db.includes("'admin123'")) {
  const oldA = "    // Create admin if not exists\n    const adminExists = await pool.query(\"SELECT id FROM users WHERE username = 'admin'\");\n    if (adminExists.rows.length === 0) {\n        const hash = bcrypt.hashSync('admin123', 10);\n        await pool.query(\n            \"INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4)\",\n            ['admin', 'admin@blog.local', hash, 'admin']\n        );\n    }";
  const newA = "    // Optional initial admin from env (set BOTH ADMIN_USERNAME and ADMIN_PASSWORD)\n    if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {\n        const exists = await pool.query('SELECT id FROM users WHERE username = $1', [process.env.ADMIN_USERNAME]);\n        if (exists.rows.length === 0) {\n            const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10);\n            await pool.query(\n                'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4)',\n                [process.env.ADMIN_USERNAME, process.env.ADMIN_USERNAME + '@blog.local', hash, 'admin']\n            );\n            console.warn('[init] Created initial admin from env: ' + process.env.ADMIN_USERNAME + ' - please change the password immediately.');\n        }\n    }";
  db = db.replace(oldA, newA);
}
const oldE = "const excerpt = content.replace(/<[^>]+>/g, '').slice(0, 200).replace(/[#*`>\\-\\[\\]]/g, '') + '...';";
if (db.includes(oldE)) {
  const newE = "const stripped = content.replace(/<[^>]+>/g, '').replace(/[#*`>\\-\\[\\]]/g, '');\n        const excerpt = stripped.slice(0, 200) + '...';";
  db = db.replace(oldE, newE);
}
const helpers = "\nfunction escapeHtml(s) { return String(s ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'})[c]); }\nfunction sanitizeComment(raw) { const DOMPurify = require('isomorphic-dompurify'); return DOMPurify.sanitize(escapeHtml(raw), { ALLOWED_TAGS: ['br','p','strong','em','code','blockquote'], ALLOWED_ATTR: [] }); }\n";
if (!db.includes('function sanitizeComment')) db = db + '\n' + helpers;
const oldFBP = "    async findByPost(postId) {\n        const result = await pool.query(`\n            SELECT comments.*, users.username as author_username\n            FROM comments\n            JOIN users ON comments.author_id = users.id\n            WHERE post_id = $1\n            ORDER BY created_at ASC\n        `, [postId]);\n        return result.rows;\n    },";
const newFBP = "    async findByPost(postId) {\n        const result = await pool.query(`\n            SELECT comments.*, users.username as author_username\n            FROM comments\n            JOIN users ON comments.author_id = users.id\n            WHERE post_id = $1\n            ORDER BY created_at ASC\n        `, [postId]);\n        for (const c of result.rows) { c.safeHtml = sanitizeComment(c.content); }\n        return result.rows;\n    },";
if (db.includes('async findByPost(postId)')) db = db.replace(oldFBP, newFBP);
writeUtf8(dbPath, db);

// 7. auth.js, posts.js, post.hbs, comments.hbs
console.log('[7/8] patching auth.js, posts.js, views...');
const authPath = path.join(ROOT, 'src', 'routes', 'auth.js');
let auth = readGbk(authPath);
const oldL = "        req.session.userId = user.id;\n        res.redirect('/');\n    }\n);";
const newL = "        const _u = user;\n        req.session.regenerate((err) => {\n            if (err) return next(err);\n            req.session.userId = _u.id;\n            req.session.save((err2) => {\n                if (err2) return next(err2);\n                res.redirect('/');\n            });\n        });\n    }\n);";
if (auth.includes("req.session.userId = user.id;\n        res.redirect('/');")) auth = auth.replace(oldL, newL);
if (auth.includes('await User.updatePassword(req.session.userId, newPassword);')) {
  const needle = "await User.updatePassword(req.session.userId, newPassword);";
  const idx = auth.indexOf(needle);
  // find next `});\n` after the needle
  const tailStart = auth.indexOf('});', idx);
  if (tailStart !== -1) {
    const newBlock = "await User.updatePassword(req.session.userId, newPassword);\n        req.session.regenerate((err) => {\n            if (err) return next(err);\n            req.session.save((err2) => {\n                if (err2) return next(err2);\n                res.redirect('/login');\n            });\n        });";
    auth = auth.slice(0, idx) + newBlock + auth.slice(tailStart);
  }
}
writeUtf8(authPath, auth);

const postsPath = path.join(ROOT, 'src', 'routes', 'posts.js');
let posts = readGbk(postsPath);
const oldU = "const upload = multer({ storage });";
const newU = "const upload = multer({\n    storage,\n    limits: { fileSize: 5 * 1024 * 1024, files: 1 },\n    fileFilter: (req, file, cb) => {\n        const ok = /^image\\/(jpeg|png|gif|webp)$/i.test(file.mimetype)\n                && /\\.(jpe?g|png|gif|webp)$/i.test(file.originalname);\n        cb(ok ? null : new Error('Only jpg/png/gif/webp images up to 5MB are allowed'), ok);\n    }\n});";
posts = posts.replace(oldU, newU);
writeUtf8(postsPath, posts);

const postHbsPath = path.join(ROOT, 'views', 'post.hbs');
let postHbs = readGbk(postHbsPath);
postHbs = postHbs.replace(
  '<div class="comment-content" id="comment-content-{{id}}">{{content}}</div>',
  '<div class="comment-content" id="comment-content-{{id}}">{{{safeHtml}}}</div>'
);
writeUtf8(postHbsPath, postHbs);

const acPath = path.join(ROOT, 'views', 'admin', 'comments.hbs');
if (fs.existsSync(acPath)) {
  let ac = readGbk(acPath);
  ac = ac.replace(
    '<td class="comment-content">{{content}}</td>',
    '<td class="comment-content">{{escape content}}</td>'
  );
  writeUtf8(acPath, ac);
}

// 8. README
console.log('[8/8] appending env-vars section to README.md...');
const readmePath = path.join(ROOT, 'README.md');
let readme = readGbk(readmePath);
if (!readme.includes('## Environment Variables')) {
  const append = "\n\n## Environment Variables\n\n| Name | Required | Description |\n|------|----------|-------------|\n| DATABASE_URL | yes | PostgreSQL connection string |\n| SESSION_SECRET | yes | Long random string. App exits on startup if missing. |\n| NODE_ENV | prod | Set to production to enable HTTPS-only cookies and HSTS |\n| PORT | no | Default 3000 |\n| ADMIN_USERNAME | no | If set together with ADMIN_PASSWORD, a one-time admin is created on first boot |\n| ADMIN_PASSWORD | no | Paired with ADMIN_USERNAME. Change it after first login. |\n\nNote: This project no longer ships with a default admin / admin123 account.\n";
  writeUtf8(readmePath, readme + append);
}

console.log('');
console.log('DONE.');
console.log('  Backups in .\\.gbk-bak (review, then delete the folder).');
console.log('  Next: npm install   (adds isomorphic-dompurify)');
console.log('  Then: set SESSION_SECRET and run node src/app.js');