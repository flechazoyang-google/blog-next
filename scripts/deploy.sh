#!/usr/bin/env bash
#
# 原子部署（P2-3）。取代 README 里那段人肉流程：
#   原流程 = 停服 -> rm -rf /opt/blog/{app,.next,node_modules,public,scripts} -> cp -a
#           -> 手工拷 Linux 版 better_sqlite3.node -> 服务器上 npm install --no-save
# 问题：中途失败即半新半旧；回滚要重跑一遍；依赖靠联网补装，漏一步就 500。
#
# 新流程：releases/<sha>/ + current 软链，失败自动切回上一版。
#
# 用法（在服务器上）：
#   sudo /opt/blog/scripts/deploy.sh /tmp/blog-dist.tar.gz
set -euo pipefail

ARCHIVE="${1:?用法: deploy.sh <dist.tar.gz>}"
ROOT=/opt/blog
RELEASES="$ROOT/releases"
CURRENT="$ROOT/current"
KEEP=5
SHA="$(date +%Y%m%d-%H%M%S)"
NEW="$RELEASES/$SHA"

log() { printf '%s %s\n' "$(date '+%F %T')" "$*"; }

log "部署开始：$ARCHIVE"

# 1) 迁移前先做一致性快照（复用现有备份脚本的在线快照能力）
if [ -x /usr/local/bin/blog-backup ]; then
  log "部署前备份…"
  /usr/local/bin/blog-backup >/dev/null 2>&1 || { log "!! 备份失败，中止部署"; exit 1; }
fi

# 2) 解包到新 release 目录
mkdir -p "$NEW"
tar xzf "$ARCHIVE" -C "$NEW"
[ -f "$NEW/server.js" ] || { log "!! 产物缺少 server.js"; exit 1; }

# 3) 原生模块自检：早失败胜过起来了才 500
if ! sudo -u blog /usr/bin/node -e "require('better-sqlite3')" 2>/dev/null; then
  # 在 release 目录内自检（node_modules 在那里）
  ( cd "$NEW" && sudo -u blog /usr/bin/node -e "require('better-sqlite3')" ) || {
    log "!! better-sqlite3 原生模块不可用（跨平台编译问题？）"; exit 1;
  }
fi

# 4) 切换软链（原子操作）
PREV="$(readlink -f "$CURRENT" 2>/dev/null || true)"
ln -sfn "$NEW" "$CURRENT"
chown -R blog:blog "$NEW"

# 5) 重启 + 探活
systemctl restart blog
sleep 2
OK=0
for i in $(seq 1 15); do
  if curl -fsS -o /dev/null "http://127.0.0.1:8090/api/healthz"; then OK=1; break; fi
  sleep 1
done

if [ "$OK" -ne 1 ]; then
  log "!! 探活失败，回滚"
  if [ -n "$PREV" ] && [ -d "$PREV" ]; then
    ln -sfn "$PREV" "$CURRENT"
    systemctl restart blog
    log "已回滚到 $PREV"
  else
    log "!! 没有可回滚的上一版"
  fi
  exit 1
fi

log "部署成功：$NEW"
curl -fsS "http://127.0.0.1:8090/api/healthz" || true
echo

# 6) 清理旧 release（保留最近 KEEP 个）
ls -1dt "$RELEASES"/*/ 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r d; do
  [ "$d" = "$NEW/" ] && continue
  log "清理旧版本：$d"
  rm -rf "$d"
done
