const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { renderMarkdown } = require('./utils/markdown');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const CATEGORIES = [
    { slug: 'tech', name: 'tech' },
    { slug: 'life', name: 'life' },
    { slug: 'thoughts', name: 'thoughts' },
    { slug: 'essays', name: 'essays' }
];
const UNCATEGORIZED = { slug: 'uncategorized', name: 'uncategorized' };

async function initDb() {
    await pool.query(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT DEFAULT 'user', avatar TEXT, bio TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS posts (id SERIAL PRIMARY KEY, title TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, content TEXT NOT NULL, excerpt TEXT, author_id INTEGER NOT NULL REFERENCES users(id), status TEXT DEFAULT 'published', view_count INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await pool.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'uncategorized'`);
    await pool.query(`CREATE TABLE IF NOT EXISTS tags (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, slug TEXT UNIQUE NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS post_tags (post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY (post_id, tag_id))`);
    await pool.query(`CREATE TABLE IF NOT EXISTS comments (id SERIAL PRIMARY KEY, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, author_id INTEGER NOT NULL REFERENCES users(id), parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE, content TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);

    // Optional initial admin from env (set BOTH ADMIN_USERNAME and ADMIN_PASSWORD)
    if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
        const exists = await pool.query('SELECT id FROM users WHERE username = $1', [process.env.ADMIN_USERNAME]);
        if (exists.rows.length === 0) {
            const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10);
            await pool.query('INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4)', [process.env.ADMIN_USERNAME, process.env.ADMIN_USERNAME + '@blog.local', hash, 'admin']);
            console.warn('[init] Created initial admin from env: ' + process.env.ADMIN_USERNAME + ' - please change the password immediately.');
        }
    }
    return pool;
}

function tagSlugify(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        || 'tag';
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}
function sanitizeComment(raw) {
    const DOMPurify = require('isomorphic-dompurify');
    return DOMPurify.sanitize(escapeHtml(raw), { ALLOWED_TAGS: ['br','p','strong','em','code','blockquote'], ALLOWED_ATTR: [] });
}

const User = {
    async create(username, email, password) {
        const password_hash = bcrypt.hashSync(password, 10);
        const result = await pool.query('INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING *', [username, email, password_hash]);
        return result.rows[0];
    },
    async findById(id) {
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
        return result.rows[0] || null;
    },
    async findByUsername(username) {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        return result.rows[0] || null;
    },
    async findByEmail(email) {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        return result.rows[0] || null;
    },
    verifyPassword(password, hash) {
        return bcrypt.compareSync(password, hash);
    },
    async findAll() {
        const result = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
        return result.rows;
    },
    async count() {
        const result = await pool.query('SELECT COUNT(*) as count FROM users');
        return parseInt(result.rows[0].count);
    },
    async updateRole(id, role) {
        await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
    },
    async delete(id) {
        await pool.query('DELETE FROM users WHERE id = $1', [id]);
    },
    async updatePassword(id, newPassword) {
        const password_hash = bcrypt.hashSync(newPassword, 10);
        await pool.query('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [password_hash, id]);
    }
};

const Tag = {
    async findOrCreate(name) {
        const slug = tagSlugify(name);
        let result = await pool.query('SELECT * FROM tags WHERE slug = $1', [slug]);
        if (result.rows.length > 0) return result.rows[0];
        result = await pool.query('INSERT INTO tags (name, slug) VALUES ($1, $2) RETURNING *', [name, slug]);
        return result.rows[0];
    }
};

const Post = {
    async create(title, slug, content, authorId, status = 'published', category = 'uncategorized') {
        const stripped = content.replace(/<[^>]+>/g, '').replace(/[#*`>\-\[\]]/g, '');
        const excerpt = stripped.slice(0, 200) + '...';
        const result = await pool.query('INSERT INTO posts (title, slug, content, excerpt, author_id, status, category) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *', [title, slug, content, excerpt, authorId, status, category]);
        return this.findById(result.rows[0].id);
    },

    async findById(id) {
        const result = await pool.query('SELECT posts.*, users.username as author_username FROM posts JOIN users ON posts.author_id = users.id WHERE posts.id = $1', [id]);
        if (result.rows.length === 0) return null;
        const post = result.rows[0];
        post.tags = await this.getTags(post.id);
        return post;
    },

    async findBySlug(slug) {
        const result = await pool.query('SELECT posts.*, users.username as author_username FROM posts JOIN users ON posts.author_id = users.id WHERE posts.slug = $1', [slug]);
        if (result.rows.length === 0) return null;
        const post = result.rows[0];
        post.html = renderMarkdown(post.content);
        post.tags = await this.getTags(post.id);
        return post;
    },

    async findAll(limit = 20, offset = 0, category = null) {
        const params = [limit, offset];
        let categoryFilter = '';
        if (category) {
            params.push(category);
            categoryFilter = ' AND posts.category = $3';
        }
        const result = await pool.query('SELECT posts.*, users.username as author_username FROM posts JOIN users ON posts.author_id = users.id WHERE posts.status = \'published\'' + categoryFilter + ' ORDER BY created_at DESC LIMIT $1 OFFSET $2', params);
        return await Promise.all(result.rows.map(async post => {
            post.html = renderMarkdown(post.content);
            post.tags = await this.getTags(post.id);
            return post;
        }));
    },

    async count(category = null) {
        if (category) {
            const r = await pool.query('SELECT COUNT(*) as count FROM posts WHERE status = \'published\' AND category = $1', [category]);
            return parseInt(r.rows[0].count);
        }
        const r = await pool.query('SELECT COUNT(*) as count FROM posts WHERE status = \'published\'');
        return parseInt(r.rows[0].count);
    },

    async search(query, limit = 20, offset = 0, category = null) {
        const params = ['%' + query + '%', '%' + query + '%', '%' + query + '%', limit, offset];
        let cat = '';
        if (category) { params.push(category); cat = ' AND posts.category = $6'; }
        const r = await pool.query('SELECT posts.*, users.username as author_username FROM posts JOIN users ON posts.author_id = users.id WHERE posts.status = \'published\' AND (posts.title ILIKE $1 OR posts.content ILIKE $2 OR users.username ILIKE $3)' + cat + ' ORDER BY created_at DESC LIMIT $4 OFFSET $5', params);
        return await Promise.all(r.rows.map(async post => {
            post.html = renderMarkdown(post.content);
            post.tags = await this.getTags(post.id);
            return post;
        }));
    },

    async countSearch(query, category = null) {
        const params = ['%' + query + '%', '%' + query + '%', '%' + query + '%'];
        let cat = '';
        if (category) { params.push(category); cat = ' AND posts.category = $4'; }
        const r = await pool.query('SELECT COUNT(*)::int as count FROM posts JOIN users ON posts.author_id = users.id WHERE posts.status = \'published\' AND (posts.title ILIKE $1 OR posts.content ILIKE $2 OR users.username ILIKE $3)' + cat, params);
        return r.rows[0].count;
    },

    async update(id, title, slug, content, status, category) {
        const stripped = content.replace(/<[^>]+>/g, '').replace(/[#*`>\-\[\]]/g, '');
        const excerpt = stripped.slice(0, 200) + '...';
        await pool.query('UPDATE posts SET title = $1, slug = $2, content = $3, excerpt = $4, status = $5, category = $6, updated_at = CURRENT_TIMESTAMP WHERE id = $7', [title, slug, content, excerpt, status, category, id]);
    },

    async delete(id) {
        await pool.query('DELETE FROM posts WHERE id = $1', [id]);
    },

    async incrementViewCount(id) {
        await pool.query('UPDATE posts SET view_count = view_count + 1 WHERE id = $1', [id]);
    },

    async findAllAdmin({ authorId = null } = {}) {
        const params = [];
        let where = '';
        if (authorId) { params.push(authorId); where = 'WHERE posts.author_id = $1'; }
        const result = await pool.query('SELECT posts.*, users.username as author_username FROM posts JOIN users ON posts.author_id = users.id ' + where + ' ORDER BY created_at DESC', params);
        return result.rows;
    },

    async getTags(postId) {
        const result = await pool.query('SELECT tags.id, tags.name, tags.slug FROM tags JOIN post_tags ON tags.id = post_tags.tag_id WHERE post_tags.post_id = $1 ORDER BY tags.name ASC', [postId]);
        return result.rows;
    },

    async getTagBySlug(slug) {
        const result = await pool.query('SELECT * FROM tags WHERE slug = $1', [slug]);
        return result.rows[0] || null;
    },

    async findByTag(tagSlug, limit = 20, offset = 0) {
        const result = await pool.query('SELECT posts.*, users.username as author_username FROM posts JOIN users ON posts.author_id = users.id JOIN post_tags ON posts.id = post_tags.post_id JOIN tags ON post_tags.tag_id = tags.id WHERE tags.slug = $1 AND posts.status = \'published\' ORDER BY posts.created_at DESC LIMIT $2 OFFSET $3', [tagSlug, limit, offset]);
        return await Promise.all(result.rows.map(async post => {
            post.html = renderMarkdown(post.content);
            post.tags = await this.getTags(post.id);
            return post;
        }));
    },

    async countByTag(tagSlug) {
        const result = await pool.query('SELECT COUNT(*)::int as count FROM posts JOIN post_tags ON posts.id = post_tags.post_id JOIN tags ON post_tags.tag_id = tags.id WHERE tags.slug = $1 AND posts.status = \'published\'', [tagSlug]);
        return result.rows[0].count;
    },

    async setTags(postId, tagNames) {
        await pool.query('DELETE FROM post_tags WHERE post_id = $1', [postId]);
        if (!tagNames || tagNames.length === 0) return;
        for (const name of tagNames) {
            const tag = await Tag.findOrCreate(name);
            if (tag) {
                await pool.query('INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [postId, tag.id]);
            }
        }
    }
};

const Comment = {
    async create(postId, authorId, content, parentId = null) {
        const result = await pool.query('INSERT INTO comments (post_id, author_id, content, parent_id) VALUES ($1, $2, $3, $4) RETURNING *', [postId, authorId, content, parentId]);
        return this.findById(result.rows[0].id);
    },

    async findById(id) {
        const result = await pool.query('SELECT comments.*, users.username as author_username FROM comments JOIN users ON comments.author_id = users.id WHERE comments.id = $1', [id]);
        return result.rows[0] || null;
    },

    async findByPost(postId) {
        const result = await pool.query('SELECT comments.*, users.username as author_username FROM comments JOIN users ON comments.author_id = users.id WHERE post_id = $1 ORDER BY created_at ASC', [postId]);
        for (const c of result.rows) { c.safeHtml = sanitizeComment(c.content); }
        return result.rows;
    },

    async delete(id) {
        await pool.query('DELETE FROM comments WHERE id = $1', [id]);
    },

    async update(id, content) {
        await pool.query('UPDATE comments SET content = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [content, id]);
    },

    async findAll() {
        const result = await pool.query('SELECT comments.*, users.username as author_username, posts.title as post_title, posts.slug as post_slug FROM comments JOIN users ON comments.author_id = users.id JOIN posts ON comments.post_id = posts.id ORDER BY comments.created_at DESC');
        return result.rows;
    },

    async countAll() {
        const result = await pool.query('SELECT COUNT(*) as count FROM comments');
        return parseInt(result.rows[0].count);
    }
};

function generateSlug(title) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        + '-' + Date.now().toString(36);
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/\//g, '-');
}

module.exports = { initDb, User, Post, Comment, Tag, generateSlug, formatDate, CATEGORIES, UNCATEGORIZED, pool };
