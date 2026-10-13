#!/usr/bin/env bash
# tools/push-to-github.sh — ilk kez GitHub'a yükleme (git komut satırıyla).
#
#   bash tools/push-to-github.sh <github-kullanıcı-adı> <depo-adı>
#
# Önkoşul: GitHub'da boş bir public repo açılmış olmalı (README eklemeden).
# Not: git push sırasında parola değil, Personal Access Token istenir:
#      GitHub → Settings → Developer settings → Personal access tokens → Fine-grained
#      → yalnızca bu depo için "Contents: Read and write" izni yeter.
set -euo pipefail

[ $# -ge 2 ] || { echo "kullanım: bash tools/push-to-github.sh <kullanıcı> <depo>"; exit 1; }
USER_NAME="$1"; REPO="$2"
cd "$(dirname "${BASH_SOURCE[0]}")/.."

git rev-parse --git-dir >/dev/null 2>&1 || git init -q
git config user.name  "${GIT_AUTHOR_NAME:-$(git config --global user.name  || echo 'Chiptune Console')}"
git config user.email "${GIT_AUTHOR_EMAIL:-$(git config --global user.email || echo 'dev@localhost')}"
git add -A
git commit -q -m "CHIPTUNE CONSOLE v1.0" || echo "(değişiklik yok / zaten commit edilmiş)"
git branch -M main
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/${USER_NAME}/${REPO}.git"
echo "→ origin: $(git remote get-url origin)"
git push -u origin main
echo
echo "Yayınlamak için: GitHub → depo → Settings → Pages → Source: Deploy from a branch → main / (root) → Save"
echo "Adres: https://${USER_NAME}.github.io/${REPO}/"
