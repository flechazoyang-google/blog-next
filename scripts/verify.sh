#!/usr/bin/env bash
#
# 本地全量校验（没有 CI 时用这个）。
# 与 .github/workflows/ci.yml 等价：类型检查 -> 测试 -> 构建。
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== 1/3 类型检查 =="
node node_modules/typescript/bin/tsc --noEmit

echo "== 2/3 测试 =="
npm test

echo "== 3/3 构建 =="
npm run build

echo "全部通过。"
