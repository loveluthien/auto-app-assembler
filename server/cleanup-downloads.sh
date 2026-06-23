#!/bin/bash
# Deletes files in the app-assembler downloads directory.
# Intended to be run via crontab, e.g. daily at 2 AM:
#   0 2 * * * /path/to/cleanup-downloads.sh >> /tmp/cleanup-downloads.log 2>&1

DOWNLOADS_DIR="/scratch/app-assembler-downloads"
MAX_AGE_DAYS=30  # Delete files older than this many days

if [ ! -d "$DOWNLOADS_DIR" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') ERROR: Downloads directory not found: $DOWNLOADS_DIR"
    exit 1
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') Cleaning files older than ${MAX_AGE_DAYS} days in $DOWNLOADS_DIR"

find "$DOWNLOADS_DIR" -maxdepth 1 -type f -mtime +${MAX_AGE_DAYS} -print -delete

echo "$(date '+%Y-%m-%d %H:%M:%S') Done."
