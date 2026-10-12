#!/usr/bin/env bash
# Publish a clean, single-commit snapshot of HEAD to the public repo
# (github.com/zahnno/chatty-books). History stays private; the snapshot is
# scanned with gitleaks before anything is pushed.
set -euo pipefail

PUBLIC_REPO="${PUBLIC_REPO:-https://github.com/zahnno/chatty-books.git}"
EXCLUDE=(
  marketing
  mobile/store-assets/APP_REVIEW_REPLY.txt
  mobile/store-assets/APP_REVIEW_RESPONSE.md
  mobile/dapp-store/REVIEW_REPLY.txt
)

root="$(git rev-parse --show-toplevel)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

git -C "$root" archive HEAD | tar -x -C "$work"
for path in "${EXCLUDE[@]}"; do rm -rf "${work:?}/$path"; done

gitleaks detect --no-git --source "$work" --redact

cd "$work"
git init -q -b main
git add -A
git -c user.name="$(git -C "$root" log -1 --format=%an)" \
    -c user.email="$(git -C "$root" log -1 --format=%ae)" \
    commit -q -m "Chatty Books snapshot ($(git -C "$root" rev-parse --short HEAD))"
git push -f "$PUBLIC_REPO" main
