# Etsy 店铺后台管理系统

香港 Etsy 网店 · 深圳运营中心

## 功能模块

### 1. 订单管理
- 对接 Etsy API 自动同步订单
- 订单列表展示（含客户上传的图片预览）
- 订单详情查看（商品明细、图片、供应商处理记录、物流信息）
- 订单状态流转：待处理 → 已确认 → 生产中 → 已完成

### 2. 供应商管理
- 管理员：确认订单并分配给供应商，可重新分配
- 供应商：接单 → 开始生产 → 完成生产（反馈生产备注）
- 供应商可拒绝接单（订单退回待处理池）
- 供应商生产统计看板

### 3. 物流管理
- 为已完成生产的订单创建物流记录
- 物流状态跟踪：待发货 → 已打包 → 已揽收 → 运输中 → 已签收
- 物流商、运单号管理

### 4. 账号权限
- 管理员账号：完整权限，可创建管理账号
- 供应商账号：仅查看分配给自己的订单和任务

### 5. Etsy API 对接
- 支持 Etsy API Key 配置
- 一键同步订单（含商品图片）
- 自动获取客户上传的设计图

## 技术栈

- **后端**: Node.js + Express + SQLite (better-sqlite3)
- **前端**: React + TypeScript + Ant Design 5
- **认证**: JWT + bcrypt

## 快速开始

### 1. 安装依赖

```bash
# 安装根目录依赖
cd etsy-admin
npm install

# 安装服务端依赖
cd server && npm install

# 安装客户端依赖
cd ../client && npm install
```

### 2. 配置 Etsy API（可选）

编辑 `server/.env` 文件：
```
ETSY_API_KEY=你的EtsyAPI密钥
ETSY_SHOP_ID=你的店铺ID
```

### 3. 启动服务

```bash
# 启动后端（端口 3001）
cd server && npm start

# 启动前端（端口 3000，新开终端）
cd client && npm start
```

或者使用根目录命令同时启动：
```bash
cd etsy-admin
npm run dev
```

### 4. 访问系统

打开浏览器访问：http://localhost:3000

### 测试账号

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 管理员 | admin | admin123 |
| 供应商A | supplier1 | supplier123 |
| 供应商B | supplier2 | supplier123 |
| 供应商C | supplier3 | supplier123 |

## 项目结构

```
etsy-admin/
├── server/                    # 后端服务
│   ├── index.js              # 入口文件
│   ├── db.js                 # 数据库初始化
│   ├── middleware/auth.js    # JWT 认证中间件
│   ├── routes/
│   │   ├── auth.js           # 登录/用户管理
│   │   ├── orders.js         # 订单管理
│   │   ├── suppliers.js      # 供应商任务
│   │   ├── logistics.js      # 物流管理
│   │   └── etsy.js           # Etsy API 对接
│   └── .env                  # 环境变量
├── client/                    # 前端应用
│   ├── src/
│   │   ├── api/index.ts     # API 接口封装
│   │   ├── context/         # 认证上下文
│   │   ├── components/      # 公共组件
│   │   └── pages/           # 页面组件
│   └── package.json
├── package.json
└── README.md
```

## 开发说明

- 数据库自动在 `server/etsy_admin.db` 创建，首次启动会初始化演示数据
- 前端开发时通过 `proxy` 配置代理到后端 3001 端口
- 生产部署时通过 `npm run build` 构建前端，后端会自动提供静态文件（设置 NODE_ENV=production）
