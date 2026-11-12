// middlewares.js
const jwt = require('jsonwebtoken');
const config = require('./config');

function requireAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ success: false, message: "⚠️ ያልተፈቀደ መግቢያ! መጀመሪያ ይግቡ" });
    
    jwt.verify(token, config.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, message: "❌ ቶክንዎ የተሳሳተ ነው!" });
        next();
    });
}

function requireAdminPage(req, res, next) {
    const token = req.cookies && req.cookies.adminToken;
    if (!token) return res.status(401).send(`<script>alert('⚠️ መጀመሪያ ይግቡ!'); window.location.href = '/';</script>`);
    
    jwt.verify(token, config.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).send(`<script>alert('❌ ቶክን አልፏል!'); window.location.href = '/';</script>`);
        next();
    });
}

function requireUser(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ success: false, message: "⚠️ እባክዎ መጀመሪያ ይግቡ!" });
    
    jwt.verify(token, config.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ success: false, message: "❌ መታወቂያዎ ትክክል አይደለም!" });
        req.userPhone = decoded.phone;
        next();
    });
}

module.exports = { requireAdmin, requireAdminPage, requireUser };
