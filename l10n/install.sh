#!/bin/sh
#
# install.sh — runs cognitio-modules, the command that adds, removes and
# upgrades a project's site modules, with every argument given to it:
#
#   sh install.sh init | list | add <package>[@<version>] | remove <package>
#   sh install.sh upgrade [--yes] | install | path <package> | check | --help
#   sh install.sh --cwd <dir> <command> ...    against the project in <dir>
#
# It runs the copy of the command the project vendors, the one
# cognitio-modules.json beside this file names, and needs no credential for
# that. When there is no such copy yet (the first `init`), or it is missing, it
# first downloads the command from the host, with the credential curl reads
# from ~/.netrc:
#
#   machine tooling.cognitio.it login <username> password <password>
#
# and checks the archive's sha256 against the lockfile, or against the host's
# index when the lockfile names no version. It needs sh, curl, tar and Node.js.
#
# The credential goes over https alone, and only to the host the lockfile maps
# @cognitio to (https://tooling.cognitio.it when there is no lockfile): every
# URL, whether the lockfile or the index names it, passes `sendable` before curl
# runs, and any other is refused with nothing sent. Plain http is allowed to a
# loopback host alone (127.0.0.1, ::1, localhost). A redirect is not followed.
#
# Written by cognitio-modules, which replaces this file when it upgrades itself.

set -eu

DEFAULT_HOST=https://tooling.cognitio.it

say() { printf 'install.sh: %s\n' "$1" >&2; }
fail() { say "$1"; exit 1; }

command -v node >/dev/null 2>&1 || fail "node is not on PATH: install Node.js 20 or later"
command -v tar >/dev/null 2>&1 || fail "tar is not on PATH"

root=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)

# The host of @cognitio, then the vendored command's archive, URL and sha256 as
# the lockfile names them (each "-" when it names none).
info=$(node -e '
  const fs = require("fs");
  const [file, host] = process.argv.slice(1);
  let lock = {};
  if (fs.existsSync(file)) lock = JSON.parse(fs.readFileSync(file, "utf8"));
  const pinned = (lock.modules || {})["@cognitio/modules"];
  const out = [(lock.scopes || {})["@cognitio"] || host];
  out.push(pinned ? `vendor/cognitio-modules-${pinned.version}.tgz` : "-", pinned ? pinned.url : "-", pinned ? pinned.sha256 : "-");
  process.stdout.write(out.join(" ") + "\n");
' "$root/cognitio-modules.json" "$DEFAULT_HOST") || fail "$root/cognitio-modules.json could not be read"
read -r host archive url sha <<EOF
$info
EOF

sha256_of() {
  node -e 'process.stdout.write(require("crypto").createHash("sha256").update(require("fs").readFileSync(process.argv[1])).digest("hex"))' "$1"
}

# sendable <url>: true when the URL may receive the credential: it is on $host
# (the same scheme, host name and port), carries no user name or password of its
# own, and is https, or plain http to a loopback host. The one place this script
# decides it; fetch asks it before curl runs.
sendable() {
  node -e '
    const [url, host] = process.argv.slice(1);
    let target, home;
    try { target = new URL(url); home = new URL(host); } catch { process.exit(1); }
    const loopback = ["127.0.0.1", "[::1]", "localhost"].includes(target.hostname);
    const ok = target.origin === home.origin && !target.username && !target.password
      && (target.protocol === "https:" || (target.protocol === "http:" && loopback));
    process.exit(ok ? 0 : 1);
  ' "$1" "$host"
}

# fetch <url> <file> <what it serves>: the URL's bytes into <file>, or a message
# naming what to do about the status. A URL sendable refuses is refused before
# curl runs; a redirect is not followed.
fetch() {
  sendable "$1" \
    || fail "$1 is refused and nothing is sent to it: the credential goes over https alone (plain http to a loopback host only), and only to $host, the host @cognitio maps to"
  command -v curl >/dev/null 2>&1 || fail "curl is not on PATH"
  status=$(curl --silent --show-error --netrc-optional --output "$2" --write-out '%{http_code}' "$1") \
    || fail "could not reach $1"
  hostport=${1#*://}
  hostport=${hostport%%/*}
  case "$hostport" in
    \[*) hostname="${hostport%%]*}]" ;;
    *) hostname=${hostport%%:*} ;;
  esac
  publication=${1#*://*/}
  publication=${publication%%/*}
  case "$status" in
    200) ;;
    401) fail "$1 answered 401: no credential for $hostname in ~/.netrc, or one the host does not know" ;;
    403) fail "$1 answered 403: the credential in ~/.netrc is not allowed the publication $publication" ;;
    404) fail "$1 answered 404: $3 is not published" ;;
    *) fail "$1 answered $status" ;;
  esac
}

work=$(mktemp -d "${TMPDIR:-/tmp}/cognitio-modules.XXXXXX")
trap 'rm -rf "$work"' EXIT
trap 'exit 130' INT TERM

if [ "$archive" != "-" ] && [ -f "$root/$archive" ] && [ "$(sha256_of "$root/$archive")" = "$sha" ]; then
  tgz="$root/$archive"
else
  if [ "$url" = "-" ]; then
    fetch "$host/modules/index.json" "$work/index.json" modules
    newest=$(node -e '
      const index = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
      const last = index.versions[index.versions.length - 1];
      if (index.name !== "@cognitio/modules" || !last || !/^[0-9a-f]{64}$/.test(last.sha256)) process.exit(1);
      process.stdout.write(`${last.version} ${last.url} ${last.sha256}\n`);
    ' "$work/index.json") || fail "$host/modules/index.json is not the index of @cognitio/modules"
    read -r version url sha <<EOF
$newest
EOF
  else
    version=${archive#vendor/cognitio-modules-}
    version=${version%.tgz}
  fi
  fetch "$url" "$work/command.tgz" "modules $version"
  got=$(sha256_of "$work/command.tgz")
  [ "$got" = "$sha" ] || fail "$url has sha256 $got, not $sha: the archive is refused"
  tgz="$work/command.tgz"
  say "running @cognitio/modules $version from $url"
fi

mkdir "$work/unpacked"
tar -xzf "$tgz" -C "$work/unpacked" || fail "$tgz is not a gzipped tar archive"
set +e
node "$work/unpacked/package/bin/cognitio-modules.mjs" "$@"
RC=$?
exit $RC
