const { User } = require('../database');

function requireRole(...allowedRoles) {
    return async (req, res, next) => {
        if (!req.session.userId) {
            if (req.xhr || req.path.startsWith('/api/')) {
                return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: '请先登录' } });
            }
            return res.redirect('/login');
        }
        req.user = await User.findById(req.session.userId);
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.redirect('/');
        }
        next();
    };
}

const requireAuth = requireRole('admin', 'vip', 'user');
const requireAdmin = requireRole('admin');
const requireVip = requireRole('admin', 'vip');

async function optionalAuth(req, res, next) {
    if (req.session.userId) {
        try {
            req.user = await User.findById(req.session.userId);
        } catch (e) {
            req.user = null;
        }
    }
    next();
}

module.exports = { requireAuth, requireAdmin, requireVip, optionalAuth };