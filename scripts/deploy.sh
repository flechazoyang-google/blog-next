#!/usr/bin/env bash
#
# 原子部署（2026-10-23 重写，修「假成功」）
#
# ── 此前的问题 ───────────────────────────────────────────────
# 旧版建 releases/<戳>/ 并把 current 软链指过去，但 systemd 写的是
#   WorkingDirectory=/opt/blog
# 而 /opt/blog 是一个装着扁平文件的真目录，不是指向 current 的软链。
# 于是脚本跑完显示成功，restart 之后跑的仍是旧文件 ——「假装成功」。
# 实测 /opt/blog/current 与 /opt/blog/releases 从来就没被创建过。
#
# ── 现在的做法 ───────────────────────────────────────────────
#   /opt/blog/
#     ├── deploy.sh                  ← 本脚本（固定位置，不随版本滚动）
#     ├── current -> releases/<戳>   ← systemd 的 WorkingDirectory
#     ├── releases/<戳>/             ← 每次部署一个完整产物
#     └── shared/native/             ← Linux 原生模块（跨版本复用）
#
# systemd 必须 WorkingDirectory=/opt/blog/current；本脚本会前置校验，不一致直接拒绝。
#
# 软链为什么安全：应用所有数据路径都走环境变量
# （DATA_DIR=/var/lib/blog、UPLOAD_DIR=/var/www/blog-images），
# process.cwd() 只是兜底，cwd 指到 releases/<戳> 不影响数据。
#
# 原生模块：better-sqlite3 是平台相关二进制，构建机是 Windows，产物里那份不能用
# （invalid ELF header）。Linux 版放 shared/native/，每次部署拷进新 release。
#
# 用法：
#   sudo /opt/blog/deploy.sh /tmp/blog-dist.tar.gz   # 部署
#   sudo /opt/blog/deploy.sh --rollback              # 回滚到上一版
#   sudo /opt/blog/deploy.sh --list                  # 看现有版本
set -euo pipefail

ROOT=/opt/blog
RELEASES="$ROOT/releases"
CURRENT="$ROOT/current"
SHARED="$ROOT/shared/native"
KEEP=3
HEALTH=http://127.0.0.1:8090/api/healthz

log() { printf '%s %s\n' "$(date '+%F %T')" "$*"; }
die() { log "!! $*"; exit 1; }

# 探活：等到真正起来为止（最多 20s）
wait_healthy() {
  for _ in $(seq 1 20); do
    if curl -fsS -o /dev/null "$HEALTH" 2>/dev/null; then return 0; fi
    sleep 1
  done
  return 1
}

case "${1:-}" in
  --list)
    log "现有版本（新→旧）："
    ls -1dt "$RELEASES"/*/ 2>/dev/null | sed 's|^|  |' || echo "  （无）"
    printf '当前指向: %s\n' "$(readlink -f "$CURRENT" 2>/dev/null || echo '未设置')"
    exit 0
    ;;
  --rollback)
    PREV="$(ls -1dt "$RELEASES"/*/ 2>/dev/null | sed -n 2p)"
    [ -n "$PREV" ] || die "没有上一版可回滚"
    log "回滚到 ${PREV%/}"
    ln -sfn "${PREV%/}" "$CURRENT"
    systemctl restart blog
    if wait_healthy; then
      log "回滚成功"
      curl -fsS "$HEALTH" || true
      echo
      exit 0
    fi
    die "回滚后仍探活失败，需人工介入"
    ;;
esac

ARCHIVE="${1:?用法: deploy.sh <dist.tar.gz> | --rollback | --list}"
[ -f "$ARCHIVE" ] || die "归档不存在：$ARCHIVE"

STAMP="$(date +%Y%m%d-%H%M%S)"
NEW="$RELEASES/$STAMP"

log "部署开始：$ARCHIVE → $NEW"

# 0) systemd 必须指向 current，否则部署等于白做
WD="$(systemctl show blog -p WorkingDirectory --value)"
if [ "$WD" != "$CURRENT" ]; then
  die "systemd WorkingDirectory=$WD，但本脚本要求 $CURRENT。
     请先执行：sed -i 's|^WorkingDirectory=.*|WorkingDirectory=$CURRENT|' /etc/systemd/system/blog.service
               systemctl daemon-reload
     否则部署会假装成功（跑完仍是旧文件）。"
fi

# 1) 部署前备份（失败即中止）
if [ -x /usr/local/bin/blog-backup ]; then
  log "部署前备份…"
  /usr/local/bin/blog-backup >/dev/null 2>&1 || die "备份失败，中止部署"
fi

# 2) 解包到新版本目录
mkdir -p "$NEW"
tar xzf "$ARCHIVE" -C "$NEW"
[ -f "$NEW/server.js" ] || { rm -rf "$NEW"; die "产物缺少 server.js"; }

# 3) 原生模块：从 shared 拷入
if [ ! -f "$SHARED/better_sqlite3.node" ]; then
  log "shared 里没有原生模块，尝试引导一次…"
  BOOT=/root/blog-stage/build-native/node_modules/better-sqlite3/build/Release/better_sqlite3.node
  if [ -f "$BOOT" ]; then
    mkdir -p "$SHARED"
    cp "$BOOT" "$SHARED/better_sqlite3.node"
    log "已从 $BOOT 引导到 $SHARED"
  else
    rm -rf "$NEW"
    die "找不到 Linux 版 better_sqlite3.node，请在构建机交叉编译后放到 $SHARED/"
  fi
fi

PATCHED=0
for d in "$NEW/node_modules/better-sqlite3" "$NEW"/.next/node_modules/better-sqlite3-*; do
  if [ -d "$d" ]; then
    mkdir -p "$d/build/Release"
    cp "$SHARED/better_sqlite3.node" "$d/build/Release/better_sqlite3.node"
    PATCHED=$((PATCHED + 1))
  fi
done
[ "$PATCHED" -gt 0 ] || { rm -rf "$NEW"; die "产物里没有 better-sqlite3 目录，打包可能不完整"; }
log "原生模块已替换 $PATCHED 处"

# 4) 权限 + 自检（早失败胜过起来才 500）
chown -R blog:blog "$NEW"
if ! ( cd "$NEW" && sudo -u blog /usr/bin/node -e "require('better-sqlite3')" ) 2>/dev/null; then
  rm -rf "$NEW"
  die "better-sqlite3 加载失败（原生模块与架构不匹配？）"
fi
log "原生模块自检通过"

# 5) 原子切换软链
PREV="$(readlink -f "$CURRENT" 2>/dev/null || true)"
ln -sfn "$NEW" "$CURRENT"
log "current -> $NEW"

# 6) 重启 + 探活，失败自动回滚
systemctl restart blog

if ! wait_healthy; then
  log "探活失败，自动回滚"
  if [ -n "$PREV" ] && [ -d "$PREV" ]; then
    ln -sfn "$PREV" "$CURRENT"
    systemctl restart blog
    if wait_healthy; then
      log "已回滚到 $PREV"
    else
      log "!! 回滚后仍不健康，需人工介入"
      systemctl status blog --no-pager -l | head -15 || true
    fi
  else
    log "!! 没有上一版可回滚，需人工介入"
  fi
  exit 1
fi

# 7) 成功：清理旧版本（保留最近 KEEP 个，且不动当前版）
log "部署成功"
curl -fsS "$HEALTH" || true
echo

ls -1dt "$RELEASES"/*/ 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r d; do
  [ "$(readlink -f "$d")" = "$(readlink -f "$CURRENT")" ] && continue
  log "清理旧版本：$d"
  rm -rf "$d"
done

log "完成。当前版本：$(basename "$(readlink -f "$CURRENT")")"
