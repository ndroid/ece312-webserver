#!/usr/bin/env bash
set -euo pipefail

# install.sh - simple installer to deploy the systemd unit and nginx site for the ece312 webserver
# Usage:
#   sudo ./deploy/install.sh [--workdir /abs/path/to/repo] [--user www-data] [--no-nginx] [--no-service]
# Examples:
#   sudo ./deploy/install.sh
#   ./deploy/install.sh --workdir "$PWD" --user $(whoami)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVICE_SRC="$REPO_ROOT/deploy/ece312-webserver.service"
NGINX_SRC="$REPO_ROOT/deploy/nginx/ece312.conf"

WORKDIR="${REPO_ROOT}"
RUN_USER="www-data"
DO_NGINX=1
DO_SERVICE=1
DRY_RUN=0

print_usage(){
  cat <<EOF
Usage: $0 [options]

Options:
  --workdir DIR     Absolute path to the repository (sets WorkingDirectory in the service)
  --user USER       System user to run the service as (defaults to www-data)
  --no-nginx        Do not install nginx config
  --no-service      Do not install systemd service
  --dry-run         Print actions but don't execute
  -h|--help         Show this help

Notes:
- This script will run commands requiring root. Run it with sudo or it will invoke sudo where needed.
- It will prompt before overwriting existing files.
EOF
}

# parse args
while [[ ${#} -gt 0 ]]; do
  case "$1" in
    --workdir)
      WORKDIR="$2"; shift 2;;
    --user)
      RUN_USER="$2"; shift 2;;
    --no-nginx)
      DO_NGINX=0; shift;;
    --no-service)
      DO_SERVICE=0; shift;;
    --dry-run)
      DRY_RUN=1; shift;;
    -h|--help)
      print_usage; exit 0;;
    *)
      echo "Unknown arg: $1"; print_usage; exit 1;;
  esac
done

# helpers
run_cmd(){
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "DRY RUN: $*"
  else
    echo "+ $*"
    eval "$@"
  fi
}

sudo_cmd(){
  if [[ $(id -u) -eq 0 ]]; then
    run_cmd "$@"
  else
    run_cmd sudo "$@"
  fi
}

confirm_overwrite(){
  local target="$1"
  if [[ -e "$target" ]]; then
    read -r -p "File $target exists; overwrite? [y/N] " resp
    case "$resp" in
      [Yy]*) return 0;;
      *) echo "Skipping $target"; return 1;;
    esac
  fi
  return 0
}

# Ensure service file exists
if [[ $DO_SERVICE -eq 1 ]]; then
  if [[ ! -f "$SERVICE_SRC" ]]; then
    echo "Service template not found at $SERVICE_SRC" >&2
    exit 1
  fi
fi

if [[ $DO_NGINX -eq 1 ]]; then
  if [[ ! -f "$NGINX_SRC" ]]; then
    echo "nginx config not found at $NGINX_SRC" >&2
    exit 1
  fi
fi

# Resolve absolute WORKDIR
WORKDIR_ABS="$(cd "$WORKDIR" && pwd)"

echo "Using WORKDIR: $WORKDIR_ABS"
echo "Service will run as user: $RUN_USER"

# Install systemd service
if [[ $DO_SERVICE -eq 1 ]]; then
  TARGET_SERVICE_PATH="/etc/systemd/system/ece312-webserver.service"
  echo "\nInstalling systemd service to $TARGET_SERVICE_PATH"

  if confirm_overwrite "$TARGET_SERVICE_PATH"; then
    # Create a temporary customized service file
    TMP_SERVICE="$(mktemp)"
    sed "s|WorkingDirectory=/path/to/ece312/webserver|WorkingDirectory=${WORKDIR_ABS}|" "$SERVICE_SRC" \
      | sed "s|User=www-data|User=${RUN_USER}|" > "$TMP_SERVICE"

    sudo_cmd cp "$TMP_SERVICE" "$TARGET_SERVICE_PATH"
    sudo_cmd chown root:root "$TARGET_SERVICE_PATH"
    sudo_cmd chmod 644 "$TARGET_SERVICE_PATH"
    rm -f "$TMP_SERVICE"

    sudo_cmd systemctl daemon-reload
    sudo_cmd systemctl enable --now ece312-webserver.service || true
    echo "Systemd service installed and started (if possible). Check: sudo journalctl -u ece312-webserver -f"
  fi
fi

# Install nginx config
if [[ $DO_NGINX -eq 1 ]]; then
  TARGET_AVAILABLE="/etc/nginx/sites-available/ece312.conf"
  TARGET_ENABLED="/etc/nginx/sites-enabled/ece312.conf"

  echo "\nInstalling nginx config to $TARGET_AVAILABLE"
  if confirm_overwrite "$TARGET_AVAILABLE"; then
    sudo_cmd cp "$NGINX_SRC" "$TARGET_AVAILABLE"
    sudo_cmd chown root:root "$TARGET_AVAILABLE"
    sudo_cmd chmod 644 "$TARGET_AVAILABLE"

    if [[ -e "$TARGET_ENABLED" ]]; then
      echo "nginx site already enabled: $TARGET_ENABLED"
    else
      sudo_cmd ln -s "$TARGET_AVAILABLE" "$TARGET_ENABLED"
    fi

    echo "Testing nginx config"
    sudo_cmd nginx -t && sudo_cmd systemctl reload nginx || echo "nginx test or reload failed; please inspect /var/log/nginx/error.log"
  fi
fi

echo "\nInstall complete."
echo "If you changed the service WorkingDirectory or user, verify the service with: sudo systemctl status ece312-webserver"

exit 0
