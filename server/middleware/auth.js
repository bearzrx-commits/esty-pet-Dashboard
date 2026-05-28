const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'etsy-admin-secret-key-2024';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未授权，请先登录' });
  }
  try {
    const token = authHeader.split(' ')[1];
    req.user = verifyToken(token);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token 无效或已过期' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: '仅管理员可执行此操作' });
  }
  next();
}

function requireSupplier(req, res, next) {
  if (req.user?.role !== 'supplier') {
    return res.status(403).json({ error: '仅供应商可执行此操作' });
  }
  next();
}

module.exports = { generateToken, verifyToken, authenticate, requireAdmin, requireSupplier };
