# PJ_pro 生产环境部署指南

## 目录
1. [服务器要求](#1-服务器要求)
2. [快速部署 (Docker)](#2-快速部署-docker)
3. [手动部署](#3-手动部署)
4. [HTTPS 配置](#4-https-配置)
5. [数据库管理](#5-数据库管理)
6. [监控与运维](#6-监控与运维)
7. [故障排查](#7-故障排查)

---

## 1. 服务器要求

| 资源 | 最低 | 推荐 |
|------|------|------|
| CPU | 2 核 | 4 核 |
| 内存 | 4 GB | 8 GB |
| 磁盘 | 20 GB | 50 GB SSD |
| OS | Ubuntu 20.04+ / CentOS 8+ / Debian 11+ |
| Docker | 24.0+ | 最新 stable |
| Docker Compose | 2.20+ | 最新 stable |

---

## 2. 快速部署 (Docker)

### 2.1 准备工作

```bash
# 1. 将项目上传到服务器
scp -r PJ_pro/ user@your-server:/opt/

# 2. SSH 登录
ssh user@your-server
cd /opt/PJ_pro

# 3. 创建环境变量文件
cp .env.example .env
nano .env  # 修改所有密码和密钥!

# 4. 创建 SSL 目录 (如使用 HTTPS)
mkdir -p ssl
```

### 2.2 .env 必改项

```bash
# ⚠️ 必须修改以下值，不要使用默认值!

# 生成随机 JWT 密钥:
# python -c "import secrets; print(secrets.token_hex(32))"
JWT_SECRET=<生成的64位随机字符串>

# 数据库密码
POSTGRES_PASSWORD=<强密码>

# CORS 跨域白名单 (你的域名)
CORS_ORIGINS=https://your-domain.com

# 关闭 Debug
DEBUG=false

# 其他密钥
SECRET_KEY=<另一个随机64位字符串>
```

### 2.3 构建与启动

```bash
# 使用生产配置构建镜像
docker compose -f docker-compose.prod.yml build

# 启动所有服务 (后台运行)
docker compose -f docker-compose.prod.yml up -d

# 查看日志
docker compose -f docker-compose.prod.yml logs -f

# 查看状态
docker compose -f docker-compose.prod.yml ps
```

### 2.4 运行数据库迁移

```bash
# 进入后端容器
docker exec -it pj_pro-backend-1 bash

# 运行 Alembic 迁移
cd /app
python -m alembic upgrade head
```

### 2.5 导入初始数据

```bash
docker exec -it pj_pro-backend-1 python seed.py
```

### 2.6 验证部署

```bash
# 健康检查
curl http://localhost:8000/api/health
# 返回: {"status":"ok"}

# 登录测试
curl -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"director","password":"123456"}'
```

---

## 3. 手动部署

### 3.1 后端

```bash
# Python 环境
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt

# 数据库迁移
cd backend
python -m alembic upgrade head

# 导入初始数据
python seed.py

# 启动 (生产使用 gunicorn)
gunicorn -w 4 -k uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  app.main:app

# 或使用 systemd 管理 (见下方)
```

### 3.2 Systemd 服务文件

创建 `/etc/systemd/system/pj-pro-backend.service`:

```ini
[Unit]
Description=PJ_pro Backend Service
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/PJ_pro/backend
Environment="DATABASE_URL=postgresql://..."
Environment="JWT_SECRET=<your-secret>"
Environment="DEBUG=false"
ExecStart=/opt/PJ_pro/backend/venv/bin/gunicorn \
  -w 4 -k uvicorn.workers.UvicornWorker \
  --bind 127.0.0.1:8000 app.main:app
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

启用服务:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now pj-pro-backend
```

### 3.3 前端

```bash
cd frontend

# 安装依赖
npm install

# 构建 (使用 esbuild, 避开 Rollup bug)
node build.cjs

# dist/ 目录即静态文件，部署到 nginx
sudo cp -r dist/* /var/www/html/
sudo cp nginx.prod.conf /etc/nginx/sites-available/pj-pro
sudo ln -s /etc/nginx/sites-available/pj-pro /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## 4. HTTPS 配置

### 4.1 使用 Certbot (Let's Encrypt)

```bash
# 安装 certbot
sudo apt install certbot python3-certbot-nginx -y

# 获取证书 (替换域名)
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# 自动续期
sudo certbot renew --dry-run  # 测试
# certbot 会自动安装定时任务
```

### 4.2 使用已有证书

将证书放到 `ssl/` 目录:
```bash
mkdir -p ssl
cp your-cert.pem ssl/fullchain.pem
cp your-key.pem ssl/privkey.pem
```

更新 `nginx.prod.conf` 添加 HTTPS server block (取消注释 `return 301 https://...` 并添加 443 监听)。

### 4.3 Cloudflare 代理 (简易方案)

1. 域名 DNS 指向 Cloudflare
2. 在 Cloudflare 设置 SSL/TLS 为 "Full" 或 "Flexible"
3. 不需要在服务器配置证书
4. 修改 nginx 监听 80 端口即可

---

## 5. 数据库管理

### 5.1 PostgreSQL 备份

```bash
# Docker 方式
docker exec pj_pro-db-1 pg_dump -U emr_user emr_rating > backup_$(date +%Y%m%d).sql

# 本地 PostgreSQL
pg_dump -U emr_user -h localhost emr_rating > backup_$(date +%Y%m%d).sql
```

### 5.2 定时备份 (crontab)

```bash
# 每天凌晨 3 点备份
0 3 * * * docker exec pj_pro-db-1 pg_dump -U emr_user emr_rating | gzip > /backups/emr_$(date +\%Y\%m\%d).sql.gz

# 保留最近 30 天
0 4 * * * find /backups/ -name "emr_*.sql.gz" -mtime +30 -delete
```

### 5.3 恢复数据库

```bash
# Docker 方式
docker exec -i pj_pro-db-1 psql -U emr_user emr_rating < backup.sql

# 本地 PostgreSQL
psql -U emr_user -h localhost emr_rating < backup.sql
```

### 5.4 数据库迁移

```bash
# 生成新迁移 (在代码修改后)
cd backend
python -m alembic revision --autogenerate -m "描述修改内容"

# 应用迁移
python -m alembic upgrade head

# 回滚上一个版本
python -m alembic downgrade -1

# 查看当前版本
python -m alembic current
```

---

## 6. 监控与运维

### 6.1 健康检查

Docker Compose 自动配置了健康检查:
```bash
# 容器状态
docker compose -f docker-compose.prod.yml ps

# 手动健康检查
curl http://localhost:8000/api/health
```

### 6.2 日志查看

```bash
# 所有服务日志
docker compose -f docker-compose.prod.yml logs --tail=100 -f

# 只看后端
docker compose -f docker-compose.prod.yml logs backend --tail=50

# 数据库日志
docker compose -f docker-compose.prod.yml logs db --tail=20
```

### 6.3 资源监控

```bash
# 容器资源使用
docker stats

# 磁盘空间
df -h
du -sh /opt/PJ_pro/backend/pdf_output/
```

### 6.4 更新部署

```bash
cd /opt/PJ_pro
git pull  # 或上传新代码

# 重新构建
docker compose -f docker-compose.prod.yml build

# 滚动更新 (不中断服务)
docker compose -f docker-compose.prod.yml up -d --no-deps backend
docker compose -f docker-compose.prod.yml up -d --no-deps frontend

# 运行数据库迁移
docker exec -it pj_pro-backend-1 python -m alembic upgrade head
```

---

## 7. 故障排查

### 启动失败

```bash
# 查看详细日志
docker compose -f docker-compose.prod.yml logs

# 端口被占用
sudo lsof -i :80
sudo lsof -i :8000

# 数据库连接失败
docker exec -it pj_pro-db-1 psql -U emr_user -d emr_rating
```

### 性能问题

```bash
# 检查 PostgreSQL 慢查询
docker exec -it pj_pro-db-1 psql -U emr_user -d emr_rating \
  -c "SELECT query, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"

# 检查后端响应时间
curl -w "\ntime_total: %{time_total}s\n" http://localhost:8000/api/standards/indicators
```

### 安全加固项

- [ ] 修改 `.env` 中所有默认密码
- [ ] `JWT_SECRET` 使用 `secrets.token_hex(32)` 生成
- [ ] PostgreSQL 端口不对外暴露
- [ ] 配置防火墙 (只开放 80/443)
- [ ] 开启 HTTPS
- [ ] 定期备份数据库
- [ ] 日志轮转 (logrotate)

---

## 8. 首次登录

部署完成后，初始账号:

| 角色 | 用户名 | 密码 | 说明 |
|------|--------|------|------|
| 院长 | director | 123456 | ⚠️ 立即修改 |
| 科室主任 | dept1~dept6 | 123456 | ⚠️ 立即修改 |
| 系统管理员 | admin | admin123 | ⚠️ 立即修改 |
