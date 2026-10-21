# 部署说明

## 服务器前置

```bash
# 创建用户与目录
useradd --system --home /opt/blog --shell /usr/sbin/nologin blog
mkdir -p /opt/blog /var/lib/blog/images
chown -R blog:blog /opt/blog /var/lib/blog
```

## 首次部署

```bash
cd /opt/blog
# 上传 standalone 产物（.next/standalone/* + .next/static + public）
# 结构应为：
#   /opt/blog/server.js
#   /opt/blog/.next/
#   /opt/blog/public/
#   /opt/blog/node_modules/

# 初始化数据库（交互式设置密码）
sudo -u blog DATA_DIR=/var/lib/blog node scripts/init-db.mjs
```

## systemd

```bash
cp deploy/blog.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now blog
systemctl status blog
```

## Nginx

```bash
cp deploy/nginx-blog.conf /etc/nginx/sites-available/blog
ln -sf /etc/nginx/sites-available/blog /etc/nginx/sites-enabled/blog
# 证书沿用原有：/etc/letsencrypt/live/blog.yghsite.cn/
nginx -t && systemctl reload nginx
```

## 备份

```bash
# /etc/cron.d/blog-backup
0 4 * * * root sqlite3 /var/lib/blog/blog.db ".backup '/root/blog-backups/blog-$(date +\%Y\%m\%d).db'" && rclone copy /root/blog-backups jianguoyun:blog-backups/ --max-age 30d
```
