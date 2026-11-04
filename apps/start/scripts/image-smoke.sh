#!/usr/bin/env bash
# Container smoke test of the Start production image (Refs #64).
# Usage: scripts/image-smoke.sh <image> ; SMOKE_PORT overrides the host port.
# Uses placeholder credentials only: no real service is contacted and the
# readiness probe is expected to report Appwrite as unavailable.
set -euo pipefail

image="${1:?usage: image-smoke.sh <image>}"
port="${SMOKE_PORT:-3999}"
name="nfe-start-smoke-$$"
envfile="$(mktemp)"
base="http://127.0.0.1:${port}"
canonical_host="nfe-foot.example"
placeholder="placeholder-secret-value"

cleanup() {
	docker rm -f "$name" >/dev/null 2>&1 || true
	rm -f "$envfile"
}
trap cleanup EXIT

fail() {
	echo "SMOKE FAIL: $*" >&2
	echo "--- container logs ---" >&2
	docker logs "$name" 2>&1 | tail -40 >&2 || true
	exit 1
}

{
	echo "START_APP_ORIGIN=https://${canonical_host}"
	echo "START_APPWRITE_ENDPOINT=https://appwrite.invalid/v1"
	echo "START_APPWRITE_PROJECT=smoke-project"
	echo "START_APPWRITE_DATABASE=smoke-database"
	for key in SESSION FEED_READER PROFILE_WRITER FOLLOW_WRITER INTERACTION_WRITER \
		POST_TEXT_WRITER MESSAGING_WRITER MODERATION_READER MODERATION_WRITER \
		NOTIFICATION_WRITER LIFECYCLE_WRITER ACCOUNT_LIFECYCLE_WRITER MEDIA_READER MEDIA_WRITER; do
		echo "START_APPWRITE_${key}_KEY=${placeholder}-${key}"
	done
	echo "B2_APPLICATION_KEY_ID=${placeholder}-b2-id"
	echo "B2_APPLICATION_KEY=${placeholder}-b2-key"
	echo "B2_BUCKET_NAME=smoke-bucket"
	echo "B2_REGION=eu-central-003"
	echo "B2_ENDPOINT=https://s3.eu-central-003.backblazeb2.com"
	echo "START_MEDIA_PREFIX=media/"
} >"$envfile"

echo "1. boot without configuration must fail listing names only"
set +e
output="$(docker run --rm "$image" 2>&1)"
status=$?
set -e
[ "$status" -ne 0 ] || fail "container started without configuration"
echo "$output" | grep -q "missing: START_APP_ORIGIN" || fail "missing variable names not reported: $output"

echo "2. start container"
docker run -d --name "$name" --env-file "$envfile" -p "127.0.0.1:${port}:3000" "$image" >/dev/null

echo "3. /healthz answers 200"
for _ in $(seq 1 60); do
	if curl -fsS -o /dev/null "${base}/healthz" 2>/dev/null; then break; fi
	sleep 0.5
done
curl -fsS "${base}/healthz" | grep -q '"status":"ok"' || fail "/healthz not ok"

echo "4. /readyz reports the unreachable Appwrite without leaking configuration"
ready_status="$(curl -s -o /tmp/nfe-readyz.$$ -w '%{http_code}' "${base}/readyz")"
[ "$ready_status" = "503" ] || fail "/readyz expected 503, got ${ready_status}"
grep -q '"appwrite":"unavailable"' /tmp/nfe-readyz.$$ || fail "/readyz body unexpected"
grep -q "$placeholder" /tmp/nfe-readyz.$$ && fail "/readyz leaks configuration"
rm -f /tmp/nfe-readyz.$$

echo "5. alias host redirects to the canonical origin (308)"
redirect="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' \
	-H "x-forwarded-proto: https" -H "x-forwarded-host: www.${canonical_host}" "${base}/fr")"
[ "$redirect" = "308 https://${canonical_host}/fr" ] || fail "canonical redirect: ${redirect}"

echo "6. SSR page renders on the canonical host"
page_status="$(curl -s -o /tmp/nfe-page.$$ -w '%{http_code}' \
	-H "x-forwarded-proto: https" -H "x-forwarded-host: ${canonical_host}" "${base}/fr")"
[ "$page_status" = "200" ] || fail "/fr expected 200, got ${page_status}"
grep -qi "<html" /tmp/nfe-page.$$ || fail "/fr is not an HTML document"
grep -q "$placeholder" /tmp/nfe-page.$$ && fail "/fr leaks configuration"
stylesheets="$(grep -oE 'href="/assets/[^"]+\.css"' /tmp/nfe-page.$$ | cut -d'"' -f2 | sort -u)"
[ -n "$stylesheets" ] || fail "/fr links no stylesheet"
for href in $stylesheets; do
	css_status="$(curl -s -o /dev/null -w '%{http_code}' -H "x-forwarded-host: ${canonical_host}" "${base}${href}")"
	[ "$css_status" = "200" ] || fail "SSR stylesheet ${href} answers ${css_status}"
done
rm -f /tmp/nfe-page.$$

echo "7. hashed assets are immutable"
asset="$(docker exec "$name" sh -c 'ls dist/client/assets | grep "\.js$" | head -n 1')"
[ -n "$asset" ] || fail "no client asset found"
cache="$(curl -s -o /dev/null -w '%{http_code} %header{cache-control}' \
	-H "x-forwarded-host: ${canonical_host}" "${base}/assets/${asset}")"
[ "$cache" = "200 public, max-age=31536000, immutable" ] || fail "asset headers: ${cache}"

echo "8. runtime is unprivileged and carries no env file or sources"
[ "$(docker exec "$name" id -u)" != "0" ] || fail "container runs as root"
docker exec "$name" sh -c 'test ! -e /app/.env && test ! -e /app/src && test ! -e /app/vite.config.ts' \
	|| fail "unexpected files in the image"
docker exec "$name" sh -c 'command -v ffmpeg >/dev/null && command -v ffprobe >/dev/null' \
	|| fail "ffmpeg/ffprobe missing"

echo "9. SIGTERM drains and exits 0"
docker stop -t 15 "$name" >/dev/null
exit_code="$(docker inspect -f '{{.State.ExitCode}}' "$name")"
[ "$exit_code" = "0" ] || fail "exit code after SIGTERM: ${exit_code}"
docker logs "$name" 2>&1 | grep -q "$placeholder" && fail "container logs leak configuration"

echo "SMOKE OK: ${image}"
