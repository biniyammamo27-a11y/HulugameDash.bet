const jwt = require('jsonwebtoken');
const config = require('./config');

// 1. ለተጫዋቾች API (የብር ማስገቢያ፣ ማውጫ እና መወራረጃ)
function requireUser(req, res, next) {
    let token = null;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token || token === 'null' || token === 'undefined') {
        return res.status(401).json({ success: false, message: "⚠️ እባክዎ መጀመሪያ ይግቡ!" });
    }

    try {
        const decoded = jwt.verify(token, config.JWT_SECRET);
        if (!decoded || !decoded.phone) {
            return res.status(401).json({ success: false, message: "⚠️ የመግቢያ ጊዜዎ አልፏል! እንደገና ይግቡ።" });
        }
        req.userPhone = decoded.phone;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: "⚠️ የመግቢያ ጊዜዎ አልፏል! እንደገና ይግቡ።" });
    }
}

// 2. ለአድሚን API (ዲፖዚት ማጽደቂያ፣ ዊዝድሮው መክፈያ፣ Keno እና Aviator መቆጣጠሪያ)
function requireAdmin(req, res, next) {
    let token = null;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.adminToken) {
        token = req.cookies.adminToken;
    }

    if (!token || token === 'null' || token === 'undefined') {
        return res.status(401).json({ success: false, message: "❌ የአድሚን ፍቃድ የለዎትም! እባክዎ እንደገና ይግቡ።" });
    }

    try {
        const decoded = jwt.verify(token, config.JWT_SECRET);
        if (decoded && decoded.role === 'admin') {
            return next();
        }
        return res.status(403).json({ success: false, message: "❌ የአድሚን ፍቃድ የለዎትም!" });
    } catch (err) {
        return res.status(401).json({ success: false, message: "❌ ቶክን አልፏል! እባክዎ እንደገና ይግቡ።" });
    }
}

// 3. ለአድሚን ገጽ (/admin) መክፈቻ
function requireAdminPage(req, res, next) {
    return next();
}

module.exports = {
    requireUser,
    requireAdmin,
    requireAdminPage
};
