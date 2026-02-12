#!/bin/bash
set -e

cd /opt/polymarket-bot

echo "=== Pulling latest code ==="
git pull

echo "=== Installing dependencies ==="
npm install

echo "=== Building dashboard ==="
npm run build:dashboard

echo "=== Deleting stale hot-config (will re-seed from .env) ==="
rm -f data/hot-config.json

echo "=== Updating .env ==="
sed -i 's/^GRINDER_TRADERS=.*/GRINDER_TRADERS=0xdb27bf2ac5d428a9c63dbc914611036855a6c56e,0x13414a77a4be48988851c73dfd824d0168e70853/' .env
sed -i 's/^EVENT_TRADERS=.*/EVENT_TRADERS=0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee,0x14964aefa2cd7caff7878b3820a690a03c5aa429,0xc2e7800b5af46e6093872b177b7a5e7f0563be51,0x7744bfd749a70020d16a1fcbac1d064761c9999e/' .env
sed -i 's/^DAILY_LOSS_LIMIT=.*/DAILY_LOSS_LIMIT=5/' .env
sed -i 's/^MAX_OPEN_POSITIONS=.*/MAX_OPEN_POSITIONS=15/' .env
sed -i 's/^MAX_ORDER_SIZE_USD=.*/MAX_ORDER_SIZE_USD=5/' .env
sed -i 's/^GRINDER_MULTIPLIER=.*/GRINDER_MULTIPLIER=0.005/' .env
sed -i 's/^EVENT_MULTIPLIER=.*/EVENT_MULTIPLIER=0.008/' .env

echo "=== Restarting bot ==="
pm2 restart all

echo "=== Done! Showing logs ==="
pm2 logs --lines 40
