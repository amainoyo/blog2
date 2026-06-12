if (!process.env.SESSION_SECRET) {
    console.error('FATAL: SESSION_SECRET is required');
    process.exit(1);
}

const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const handlebars = require('handlebars');
const { initDb, User, Post, Comment, generateSlug, formatDate } = require('./database');

const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');
const commentRoutes = require('./routes/comments');
const adminRoutes = require('./routes/admin');

async function startApp() {
    await initDb();

    handlebars.registerHelper('eq', (a, b) => String(a) === String(b));
    handlebars.registerHelper('escape', (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]));
    handlebars.registerHelper('ifCond', (a, b) => String(a) === String(b));
    handlebars.registerHelper('or', (a, b) => a || b);
    handlebars.registerHelper('add', (a, b) => a + b);
    handlebars.registerHelper('sub', (a, b) => a - b);
    handlebars.registerHelper('gt', (a, b) => Number(a) > Number(b));
    handlebars.registerHelper('formatDate', (date) => formatDate(date));
    handlebars.registerHelper('substring', (str, start, end) => str.substring(start, end));
    handlebars.registerHelper('not', (a) => !a);
    handlebars.registerHelper('and', (...args) => args.every(Boolean));

    const app = express();

    app.set('view engine', 'hbs');
    app.set('views', path.join(__dirname, '..', 'views'));

    // 娉ㄥ唽 partials
    const partialsDir = path.join(__dirname, '..', 'views', 'partials');
    fs.readdirSync(partialsDir).forEach(file => {
        if (file.endsWith('.hbs')) {
            const name = file.replace('.hbs', '');
            const partialPath = path.join(partialsDir, file);
            const partialContent = fs.readFileSync(partialPath, 'utf8');
            handlebars.registerPartial(name, partialContent);
        }
    });

    app.engine('hbs', (filePath, options, callback) => {
        const filePathStr = typeof filePath === 'string' ? filePath : filePath.path;
        fs.readFile(filePathStr, 'utf8', (err, content) => {
            if (err) return callback(err);
            const template = handlebars.compile(content);
            const output = template(options);
            callback(null, output);
        });
    });

    app.use(express.static(path.join(__dirname, '..', 'public'), {
        setHeaders: (res, path) => {
            // 寮哄埗鎵€鏈夎祫婧愪娇鐢� HTTPS
            if (process.env.NODE_ENV === 'production') {
                res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
            }
        }
    }));
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());

    app.use(session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 7 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production'
        }
    }));

    app.use((req, res, next) => {
        res.locals.user = req.user || null;
        next();
    });

    app.use('/', authRoutes);
    app.use('/', postRoutes);
    app.use('/', commentRoutes);
    app.use('/', adminRoutes);

    app.use((req, res) => {
        res.status(404).render('404', { user: req.user || null });
    });

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`鍗氬宸插惎鍔�: http://localhost:${PORT}`);
    });
}

startApp().catch(console.error);