const express = require('express');
const { body, validationResult } = require('express-validator');
const { User } = require('../database');

const router = express.Router();

router.get('/login', (req, res) => {
    if (req.session.userId) return res.redirect('/');
    res.render('login', { user: null, error: null });
});

router.get('/register', (req, res) => {
    if (req.session.userId) return res.redirect('/');
    res.render('register', { user: null, error: null });
});

router.post('/login',
    body('username').trim().notEmpty().withMessage('鐢ㄦ埛鍚嶄笉鑳戒负绌�'),
    body('password').notEmpty().withMessage('瀵嗙爜涓嶈兘涓虹┖'),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.render('login', { user: null, error: errors.array()[0].msg });
        }

        const { username, password } = req.body;
        const user = await User.findByUsername(username);

        if (!user || !User.verifyPassword(password, user.password_hash)) {
            return res.render('login', { user: null, error: '鐢ㄦ埛鍚嶆垨瀵嗙爜閿欒' });
        }

        req.session.userId = user.id;
        res.redirect('/');
    }
);

router.post('/register',
    body('username').trim().isLength({ min: 3, max: 12 }).withMessage('鐢ㄦ埛鍚嶉渶3-12涓瓧绗�'),
    body('email').isEmail().withMessage('璇疯緭鍏ユ湁鏁堥偖绠�'),
    body('password').isLength({ min: 6 }).withMessage('瀵嗙爜鑷冲皯6浣�'),
    body('confirmPassword').custom((value, { req }) => value === req.body.password).withMessage('涓ゆ瀵嗙爜涓嶄竴鑷�'),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.render('register', { user: null, error: errors.array()[0].msg });
        }

        const { username, email, password } = req.body;

        if (await User.findByUsername(username)) {
            return res.render('register', { user: null, error: '鐢ㄦ埛鍚嶅凡瀛樺湪' });
        }

        if (await User.findByEmail(email)) {
            return res.render('register', { user: null, error: '閭宸茶娉ㄥ唽' });
        }

        const user = await User.create(username, email, password);
        req.session.userId = user.id;
        res.redirect('/');
    }
);

router.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

router.get('/settings', (req, res) => {
    res.render('settings', { user: req.user, error: null, success: null });
});

router.post('/settings/password',
    body('oldPassword').notEmpty().withMessage('璇疯緭鍏ュ師瀵嗙爜'),
    body('newPassword').isLength({ min: 6 }).withMessage('鏂板瘑鐮佽嚦灏�6浣�'),
    body('confirmPassword').custom((value, { req }) => value === req.body.newPassword).withMessage('涓ゆ瀵嗙爜涓嶄竴鑷�'),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.render('settings', { user: req.user, error: errors.array()[0].msg, success: null });
        }

        const { oldPassword, newPassword } = req.body;
        const user = await User.findById(req.session.userId);

        if (!User.verifyPassword(oldPassword, user.password_hash)) {
            return res.render('settings', { user: req.user, error: '鍘熷瘑鐮侀敊璇�', success: null });
        }

        await User.updatePassword(req.session.userId, newPassword);
        req.session.regenerate((err) => {
            if (err) return next(err);
            req.session.save((err2) => {
                if (err2) return next(err2);
                res.redirect('/login');
            });
        });
    }
);

module.exports = router;
