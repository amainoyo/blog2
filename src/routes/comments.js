const express = require('express');
const { body, validationResult } = require('express-validator');
const { Comment, Post } = require('../database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/posts/:postId/comments',
    requireAuth,
    body('content').trim().isLength({ min: 1, max: 2000 }).withMessage('评论内容需1-2000字'),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            if (req.xhr) {
                return res.json({ success: false, error: { message: errors.array()[0].msg } });
            }
            return res.redirect(`/post/${req.body.slug}`);
        }

        const post = await Post.findById(req.params.postId);
        if (!post) {
            return res.status(404).json({ success: false, error: { message: '文章不存在' } });
        }

        const { content, parentId } = req.body;
        const comment = await Comment.create(post.id, req.user.id, content, parentId || null);

        if (req.xhr) {
            return res.json({
                success: true,
                data: {
                    ...comment,
                    author_username: req.user.username
                }
            });
        }

        res.redirect(`/post/${post.slug}`);
    }
);

router.post('/comments/:id/delete', requireAuth, async (req, res) => {
    const comment = await Comment.findById(req.params.id);
    if (comment && (comment.author_id === req.user.id || req.user.role === 'admin')) {
        await Comment.delete(comment.id);
    }
    const post = await Post.findById(comment.post_id);
    res.redirect(post ? `/post/${post.slug}` : '/');
});

router.post('/comments/:id/update', requireAuth, async (req, res) => {
    const comment = await Comment.findById(req.params.id);
    if (!comment) {
        return res.redirect('/');
    }
    if (comment.author_id !== req.user.id && req.user.role !== 'admin') {
        return res.redirect('/');
    }
    const { content } = req.body;
    if (content && content.trim().length > 0 && content.trim().length <= 2000) {
        await Comment.update(comment.id, content.trim());
    }
    const post = await Post.findById(comment.post_id);
    res.redirect(post ? `/post/${post.slug}` : '/');
});

module.exports = router;