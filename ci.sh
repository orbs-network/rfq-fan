#!/bin/bash

# Variables
GITHUB_REPO="https://api.github.com/repos/orbs-network/rfq-fan/releases/latest"
WORK_DIR="$HOME/rfq-fan-stg"
LOG_FILE="$WORK_DIR/ci.log"
LATEST_RELEASE_FILE="$WORK_DIR/latest_release.txt"

# Create WORK_DIR and log file if not exist
touch "$LOG_FILE"

# Logging function
log_action() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
}

# Log the release check
log_action "checking new release"

# Fetch the latest release tag from GitHub
latest_release=$(curl -s "$GITHUB_REPO" | jq -r .tag_name)

# Check if latest_release.txt exists
if [ -f "$LATEST_RELEASE_FILE" ]; then
    previous_release=$(cat "$LATEST_RELEASE_FILE")
else
    previous_release=""
fi

# Compare releases
if [ "$latest_release" != "$previous_release" ]; then
    # Log new release
    log_action "new release: $latest_release"

    # Save the new release tag
    echo "$latest_release" > "$LATEST_RELEASE_FILE"

    # Change to working directory and restart PM2
    cd "$WORK_DIR"
    npm run pm2-restart

    # Log the PM2 restart
    log_action "pm2 restarted"
else
    log_action "no new release"
fi
