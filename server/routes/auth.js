const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { generateToken, authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// 登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '请输入用户名和密码' });
    }

    const user = await db.queryOne('users', { where: { username, active: 1 } });
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const token = generateToken(user);
    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role, name: user.name }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取当前用户信息
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await db.queryOne('users', { where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: '用户不存在' });
    const { password, ...userInfo } = user;
    res.json(userInfo);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取用户列表（管理员）
router.get('/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const users = await db.queryAll('users', {
      orderBy: { col: 'created_at', asc: false }
    });
    res.json(users.map(({ password, ...u }) => u));
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// 创建用户（管理员）
router.post('/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const { username, password, role, name, phone, company } = req.body;
    if (!username || !password || !role || !name) {
      return res.status(400).json({ error: '缺少必填字段' });
    }

    const existing = await db.queryOne('users', { where: { username } });
    if (existing) {
      return res.status(400).json({ error: '用户名已存在' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await db.insert('users', {
      id: 'u-' + uuidv4().slice(0, 8),
      username,
      password: hashedPassword,
      role,
      name,
      phone: phone || '',
      company: company || '',
    });

    const { password: _, ...userInfo } = newUser[0];
    res.json(userInfo);
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: '创建用户失败' });
  }
});

// 更新用户（管理员）
router.put('/users/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, company, active } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (company !== undefined) updates.company = company;
    if (active !== undefined) updates.active = active;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: '没有要更新的字段' });
    }

    const updated = await db.update('users', id, updates);
    if (!updated || updated.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }
    const { password, ...userInfo } = updated[0];
    res.json(userInfo);
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: '更新用户失败' });
  }
});

module.exports = router;
