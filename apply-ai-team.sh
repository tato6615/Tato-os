#!/usr/bin/env bash
# ใช้: วาง ai-team.patch ไว้ในโฟลเดอร์ repo (Tato-os) แล้วรัน: bash apply-ai-team.sh
# ทำตามกฎใน HANDOFF: pull --rebase ก่อน, ผูก commit กับผลเทสต์, ไม่ push จนกว่าจะยืนยัน
set -euo pipefail

PATCH="${1:-ai-team.patch}"
[ -f package.json ] && grep -q '"tato-coffee-doi-wiang"' package.json || { echo "ต้องรันในโฟลเดอร์ Tato-os"; exit 1; }
[ -f "$PATCH" ] || { echo "ไม่พบไฟล์ $PATCH ในโฟลเดอร์นี้"; exit 1; }

echo "== 1) เช็กสถานะ git"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "มีไฟล์ที่ยังไม่ได้ commit ในโฟลเดอร์นี้ ให้ commit หรือ stash ก่อน"; git status -sb; exit 1
fi
git pull --rebase origin main

echo "== 2) ตรวจ patch ว่า apply ได้"
git apply --check "$PATCH"
git apply "$PATCH"
git status -sb

echo "== 3) ติดตั้งและเทสต์ (ต้องผ่านทั้งหมดถึงจะไปต่อ)"
[ -d node_modules ] || npm ci
npm test
npm run lint

echo "== 4) commit"
git add functions/api/ai-team.js tests/ai-team.test.mjs public/system/index.html
git commit -m "AI Team: 8 roles on real data, recommend-only, no PII to model"

echo
read -r -p "push ขึ้น main ตอนนี้ไหม? พิมพ์ yes เพื่อยืนยัน: " ans
if [ "$ans" = "yes" ]; then
  git pull --rebase origin main
  git push origin HEAD:main
  echo "push แล้ว รอ Cloudflare Pages deploy ให้เสร็จ"
else
  echo "ยังไม่ push (commit อยู่ในเครื่องแล้ว สั่ง git push origin HEAD:main เองเมื่อพร้อม)"
fi

echo
echo "== ขั้นต่อไป (ทำในหน้า Cloudflare ไม่ใช่ terminal)"
echo "Pages > Settings > Bindings > Workers AI ตั้งชื่อ AI (Production + Preview) แล้ว Retry deployment"
