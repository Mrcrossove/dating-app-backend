# 伴合 Dating App 部署指南

## 🚀 快速部署步骤

### 1. 安装 PostgreSQL

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**CentOS/RHEL:**
```bash
sudo yum install postgresql-server postgresql-contrib
sudo postgresql-setup initdb
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 2. 创建数据库

```bash
# 切换到 postgres 用户
sudo -u postgres psql

# 创建数据库
CREATE DATABASE dating_app WITH ENCODING 'UTF8';

# 创建用户（可选）
CREATE USER dating_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE dating_app TO dating_user;

# 退出
\q
```

### 3. 初始化数据库表

```bash
# 可选：仅初始化扩展（uuid-ossp）
sudo -u postgres psql -d dating_app -f init-db.sql
```

本项目默认在启动时通过 Sequelize `sync()` 自动创建/补齐表结构（适合快速部署/演示环境）。

### 4. 配置后端环境变量

编辑 `.env` 文件：

```bash
# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_NAME=dating_app
DB_USER=postgres
DB_PASSWORD=your_password

# JWT 密钥（随机生成强密码）
JWT_SECRET=your_random_secret_key_here

# 微信配置（从微信公众平台获取）
WECHAT_APP_ID=your_wechat_appid
WECHAT_APP_SECRET=your_wechat_secret
```

### 5. 安装依赖并启动

```bash
# 安装依赖
npm install

# 编译 TypeScript
npm run build

# 启动服务
npm start

# 或使用 PM2 守护进程
npm install -g pm2
pm2 start dist/app.js --name "dating-api"
pm2 startup
pm2 save
```

### 6. 配置 Nginx 反向代理

```nginx
server {
    listen 80;
    server_name api.yourapp.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourapp.com;

    ssl_certificate /path/to/your/certificate.pem;
    ssl_certificate_key /path/to/your/private.key;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 7. 配置小程序

在 `app.js` 中修改 API 地址：

```javascript
const baseURL = 'https://api.yourapp.com/api';
```

在微信公众平台配置服务器域名：
- request合法域名: `https://api.yourapp.com`
- uploadFile合法域名: `https://api.yourapp.com`

## 📋 环境变量说明

| 变量名 | 必填 | 说明 |
|--------|------|------|
| NODE_ENV | 是 | 生产环境设置为 `production` |
| PORT | 否 | 服务端口，默认 3002 |
| DB_HOST | 是 | 数据库主机地址 |
| DB_PORT | 否 | 数据库端口，默认 5432 |
| DB_NAME | 是 | 数据库名称 |
| DB_USER | 是 | 数据库用户名 |
| DB_PASSWORD | 是 | 数据库密码 |
| JWT_SECRET | 是 | JWT 签名密钥 |
| WECHAT_APP_ID | 是 | 微信小程序 AppID |
| WECHAT_APP_SECRET | 是 | 微信小程序 AppSecret |
| OSS_* | 否 | 阿里云 OSS 配置（直传存储：`OSS_REGION/OSS_BUCKET/OSS_ACCESS_KEY_ID/OSS_ACCESS_KEY_SECRET`，可选 `OSS_CDN_DOMAIN`） |

## 🔧 常见问题

### 数据库连接失败
- 检查 PostgreSQL 服务是否运行: `sudo systemctl status postgresql`
- 检查防火墙是否开放 5432 端口
- 检查 `.env` 中的数据库配置是否正确

### 微信登录失败
- 检查 AppID 和 AppSecret 是否正确
- 检查小程序后台的服务器域名是否配置
- 检查域名是否备案

### 图片上传失败
- 检查 uploads 目录权限: `chmod 755 uploads`
- 或使用阿里云 OSS 存储

## 📞 技术支持

如有问题，请检查：
1. 后端服务日志: `pm2 logs dating-api`
2. Nginx 错误日志: `/var/log/nginx/error.log`
3. PostgreSQL 日志: `/var/log/postgresql/`
