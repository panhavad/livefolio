#!/bin/sh
# Keeps the Livefolio deployment in sync with the branch the server checkout
# tracks: fetch, fast-forward, then rebuild and restart the app on any change.
set -u

REPO="${REPO_DIR:-/repo}"
SELF="${UPDATER_SELF:-/tmp/livefolio-update.sh}"
INTERVAL="${UPDATE_INTERVAL_SECONDS:-60}"
# Run Git as the owner of the checkout so .git never ends up owned by root.
OWNER="$(stat -c '%u:%g' "$REPO/.git")"
export HOME=/tmp

log() { printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }
git_() { su-exec "$OWNER" git -C "$REPO" "$@"; }

# SSH remotes need keys the container doesn't have, so retry public repos over HTTPS.
https_url() {
  case "$1" in
    git@*:*)
      rest=${1#git@}
      echo "https://${rest%%:*}/${rest#*:}"
      ;;
    ssh://*)
      rest=${1#ssh://}
      rest=${rest#*@}
      host=${rest%%/*}
      echo "https://${host%%:*}/${rest#*/}"
      ;;
    *) return 1 ;;
  esac
}

sync_repo() {
  if ! branch=$(git_ symbolic-ref --quiet --short HEAD); then
    log "Checkout is not on a branch; skipping update check."
    return 1
  fi
  remote=$(git_ config "branch.$branch.remote" || echo origin)
  merge_ref=$(git_ config "branch.$branch.merge" || echo "refs/heads/$branch")
  tracking="refs/remotes/$remote/${merge_ref#refs/heads/}"

  if ! git_ fetch --quiet "$remote" "+$merge_ref:$tracking" 2>/tmp/fetch.err; then
    url=$(git_ remote get-url "$remote" 2>/dev/null || true)
    if ! fallback=$(https_url "$url") || ! git_ fetch --quiet "$fallback" "+$merge_ref:$tracking" 2>>/tmp/fetch.err; then
      log "Fetching $remote/${merge_ref#refs/heads/} failed: $(tr '\n' ' ' </tmp/fetch.err)"
      return 1
    fi
  fi

  # Nothing new upstream (including when the server checkout is ahead of it).
  git_ merge-base --is-ancestor "$tracking" HEAD && return 0

  if git_ -c advice.diverging=false merge --ff-only --quiet "$tracking"; then
    log "Pulled ${tracking#refs/remotes/} at $(git_ rev-parse --short=7 HEAD)."
  else
    log "Cannot fast-forward to ${tracking#refs/remotes/}: the server checkout has local changes or commits. Resolve them in $REPO."
    return 1
  fi
}

deploy() {
  version="$(git_ log -1 --format=%cd --date=format:%Y.%m.%d)-$(git_ rev-parse --short=7 HEAD)"
  log "Deploying $version..."
  if APP_VERSION="$version" docker compose --project-directory "$REPO" up -d --build livefolio; then
    docker image prune -f --filter "label=org.opencontainers.image.title=livefolio" >/dev/null 2>&1 || true
    log "Deployed $version."
  else
    log "Deploying $version failed; the previous version keeps running. Retrying on the next check."
    return 1
  fi
}

deployed="${LAST_DEPLOYED:-}"
log "Watching $REPO for updates every ${INTERVAL}s."

while :; do
  sync_repo
  head=$(git_ rev-parse HEAD)
  if [ "$head" != "$deployed" ] && deploy; then
    deployed=$head
  fi

  latest="$REPO/deploy/updater/update.sh"
  if [ -f "$latest" ] && ! cmp -s "$latest" "$SELF"; then
    log "Updater script changed; reloading it."
    cp "$latest" "$SELF"
    LAST_DEPLOYED="$deployed" exec sh "$SELF"
  fi

  sleep "$INTERVAL"
done
