#!/usr/bin/env bash
#
# 清空博客页面的 nginx 缓存。
#
# 为什么是"删目录"而不是 proxy_cache_purge：
#   本机 nginx 1.24（Ubuntu 官方包）**没有**编译 ngx_cache_purge 这个第三方模块，
#   所以用最朴素也最可靠的办法：删掉缓存目录，nginx 会自动重建。
#   代价是清空后每个页面各有一次回源，实测单页回源约 18ms，可忽略。
#
# 触发方式：
#   1) 手动：sudo /opt/blog/scripts/purge-cache.sh
#   2) 自动：后台保存文章时应用 touch /var/lib/blog/.purge-hint，
#      systemd 的 blog-purge.path 监听到后调用本脚本（见 deploy/blog-purge.path）
set -euo pipefail

CACHE_DIR="${CACHE_DIR:-/var/cache/nginx/blog}"

if [ ! -d "$CACHE_DIR" ]; then
  echo "缓存目录不存在，无需清理：$CACHE_DIR"
  exit 0
fi

BEFORE=$(find "$CACHE_DIR" -type f 2>/dev/null | wc -l)
rm -rf "${CACHE_DIR:?}"/*
mkdir -p "$CACHE_DIR"
chown -R www-data:www-data "$CACHE_DIR" 2>/dev/null || true
echo "$(date '+%F %T') 已清理 $BEFORE 个缓存文件"
