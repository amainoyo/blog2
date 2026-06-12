const express = require('express');
const path = require('path');
const multer = require('multer');
const matter = require('gray-matter');
const { User, Post, Comment, generateSlug, CATEGORIES } = require('../database');
const { requireAdmin, requireVip } = require('../middleware/auth');

const router = express.Router();

const importStorage = multer.memoryStorage();
const importUpload = multer({
    storage: importStorage,
    fileFilter: (req, file, cb) => {
        const ok = file.mimetype === 'text/markdown'
                || file.mimetype === 'text/x-markdown'
                || file.mimetype === 'text/plain'
                || file.originalname.toLowerCase().endsWith('.md');
        cb(ok ? null : new Error('仅支持 .md 文件: ' + file.originalname), ok);
    },
    limits: { fileSize: 5 * 1024 * 1024, files: 20 }
});

function parseTagList(input) {
    if (!input) return [];
    if (Array.isArray(input)) {
        return input.flatMap(v => String(v).split(/[,，\s]+/))
            .map(t => t.trim()).filter(t => t.length > 0);
    }
    return String(input)
        .split(/[,，\s]+/)
        .map(t => t.trim())
        .filter(t => t.length > 0);
}

async function importOneFile(file, authorId) {
    const raw = file.buffer.toString('utf8');
    let parsed;
    try {
        parsed = matter(raw);
    } catch (e) {
        throw new Error('YAML 解析失败: ' + e.message);
    }
    const fm = parsed.data || {};
    const body = parsed.content || '';
    const titleSource = fm.title || path.basename(file.originalname, path.extname(file.originalname));
    const title = String(titleSource).trim();
    if (!title) throw new Error('标题为空');

    const status = fm.status === 'draft' ? 'draft' : 'published';
    const validCategory = CATEGORIES.find(c => c.slug === fm.category)
        ? fm.category : 'uncategorized';
    const slug = generateSlug(title);

    const post = await Post.create(title, slug, body, authorId, status, validCategory);
    await Post.setTags(post.id, parseTagList(fm.tags));
    return post;
}

router.get('/admin', requireAdmin, async (req, res) => {
    const userCount = await User.count();
    const postCount = await Post.count();
    const commentCount = await Comment.countAll();
    res.render('admin/dashboard', {
        user: req.user,
        userCount,
        postCount,
        commentCount
    });
});

router.get('/admin/users', requireAdmin, async (req, res) => {
    const users = await User.findAll();
    res.render('admin/users', { user: req.user, users });
});

router.post('/admin/users/:id/role', requireAdmin, async (req, res) => {
    const { role } = req.body;
    if (role === 'admin' || role === 'vip' || role === 'user') {
        await User.updateRole(req.params.id, role);
    }
    res.redirect('/admin/users');
});

router.post('/admin/users/:id/delete', requireAdmin, async (req, res) => {
    const user = await User.findById(req.params.id);
    if (user && user.id !== req.user.id) {
        await User.delete(user.id);
    }
    res.redirect('/admin/users');
});

router.get('/admin/posts', requireAdmin, async (req, res) => {
    const posts = await Post.findAllAdmin();
    res.render('admin/posts', { user: req.user, posts, pageTitle: '文章管理', backUrl: '/admin', backText: '返回后台' });
});

router.get('/admin/my-posts', requireVip, async (req, res) => {
    const posts = await Post.findAllAdmin({ authorId: req.user.id });
    const backUrl = req.user.role === 'admin' ? '/admin' : '/';
    res.render('admin/posts', { user: req.user, posts, pageTitle: '我的文章', backUrl, backText: '返回' });
});

router.post('/admin/posts/:id/delete', requireAdmin, async (req, res) => {
    await Post.delete(req.params.id);
    res.redirect('/admin/posts');
});

router.get('/admin/comments', requireAdmin, async (req, res) => {
    const comments = await Comment.findAll();
    res.render('admin/comments', { user: req.user, comments });
});

router.post('/admin/comments/:id/delete', requireAdmin, async (req, res) => {
    await Comment.delete(req.params.id);
    res.redirect('/admin/comments');
});

router.get('/admin/import', requireAdmin, (req, res) => {
    res.render('admin/import', {
        user: req.user,
        results: null,
        categories: CATEGORIES,
        error: null
    });
});

router.post('/admin/import', requireAdmin, (req, res) => {
    importUpload.array('files', 20)(req, res, async (err) => {
        if (err) {
            return res.status(400).render('admin/import', {
                user: req.user,
                results: null,
                categories: CATEGORIES,
                error: err.message
            });
        }
        if (!req.files || req.files.length === 0) {
            return res.status(400).render('admin/import', {
                user: req.user,
                results: null,
                categories: CATEGORIES,
                error: '未选择任何文件'
            });
        }

        const results = [];
        for (const file of req.files) {
            try {
                const post = await importOneFile(file, req.user.id);
                results.push({
                    name: file.originalname,
                    ok: true,
                    id: post.id,
                    title: post.title,
                    slug: post.slug,
                    category: post.category
                });
            } catch (e) {
                results.push({
                    name: file.originalname,
                    ok: false,
                    error: e.message
                });
            }
        }

        const successCount = results.filter(r => r.ok).length;
        const failCount = results.length - successCount;

        res.render('admin/import', {
            user: req.user,
            results,
            categories: CATEGORIES,
            successCount,
            failCount,
            totalCount: results.length,
            error: null
        });
    });
});

module.exports = router;