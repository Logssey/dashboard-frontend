#!/bin/sh
# A synthetic API stub is sufficient to test nginx routing; it never uses live credentials.
set -eu
task_prefix="logssey-frontend-ci-$$"
task_network="$task_prefix-network"
task_api="$task_prefix-api"
task_frontend="$task_prefix-frontend"
task_dir="$(mktemp -d)"
cleanup() {
  task_exit=$?
  if [ "$task_exit" != 0 ]; then
    docker logs "$task_api" 2>&1 | tail -30 || true
    docker logs "$task_frontend" 2>&1 | tail -30 || true
  fi
  docker rm -f "$task_frontend" "$task_api" >/dev/null 2>&1 || true
  docker network rm "$task_network" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM
cat > "$task_dir/stub.conf" <<'EOF'
pid /tmp/nginx.pid;
events {}
http { access_log off;
  client_body_temp_path /tmp/client_temp;
  proxy_temp_path /tmp/proxy_temp;
  fastcgi_temp_path /tmp/fastcgi_temp;
  uwsgi_temp_path /tmp/uwsgi_temp;
  scgi_temp_path /tmp/scgi_temp;
  server { listen 8080;
  location = /api/v1/auth/me { default_type application/json; return 200 '{"syntheticRouteCheck":true}'; }
  location / { return 404; }
} }
EOF
chmod 755 "$task_dir"
chmod 644 "$task_dir/stub.conf"
docker network create --internal "$task_network" >/dev/null
docker run -d --name "$task_api" --network "$task_network" --network-alias api \
  --read-only --cap-drop ALL --security-opt no-new-privileges \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m,uid=101,gid=101,mode=0700 \
  -v "$task_dir/stub.conf:/etc/nginx/nginx.conf:ro" logssey-secret-frontend:ci >/dev/null
docker run -d --name "$task_frontend" --network "$task_network" --read-only \
  --cap-drop ALL --security-opt no-new-privileges \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m,uid=101,gid=101,mode=0700 \
  -p 127.0.0.1::8080 logssey-secret-frontend:ci >/dev/null
task_port="$(docker port "$task_frontend" 8080/tcp | sed 's/.*://')"
test -n "$task_port"
task_base="http://127.0.0.1:$task_port"
curl --fail --silent --show-error --retry 15 --retry-connrefused --retry-delay 1 "$task_base/healthz" | grep -Fx ready
curl --fail --silent --show-error "$task_base/login" | grep -q '<div id="root">'
curl --fail --silent --show-error "$task_base/secrets/cases/1?origin=PRODUCTION" | grep -q '<div id="root">'
curl --fail --silent --show-error "$task_base/api/v1/auth/me" | grep -Fx '{"syntheticRouteCheck":true}'
test "$(curl --silent -o /dev/null -w '%{http_code}' "$task_base/internal/v1/runtime")" = 404
echo 'ISOLATED_FRONTEND_IMAGE_PASSED'
