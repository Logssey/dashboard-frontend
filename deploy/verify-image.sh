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
  location = /oauth2/authorization/github { default_type text/plain; return 200 'syntheticGithubStart'; }
  location = /login/oauth2/code/github { default_type text/plain; return 200 'syntheticGithubCallback'; }
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
  logssey-secret-frontend:ci >/dev/null
# Test inside the private network rather than requesting a public port on an internal bridge.
task_base=http://127.0.0.1:8080
for task_attempt in $(seq 1 20); do
  if docker exec "$task_frontend" wget -qO- "$task_base/healthz" > "$task_dir/ready"; then break; fi
  if [ "$task_attempt" = 20 ]; then echo FRONTEND_NOT_READY; exit 1; fi
  sleep 1
done
grep -Fx ready "$task_dir/ready"
docker exec "$task_frontend" wget -qO- "$task_base/login" | grep -q '<div id="root">'
docker exec "$task_frontend" wget -qO- "$task_base/secrets/cases/1?origin=PRODUCTION" | grep -q '<div id="root">'
docker exec "$task_frontend" wget -qO- "$task_base/api/v1/auth/me" | grep -Fx '{"syntheticRouteCheck":true}'
docker exec "$task_frontend" wget -qO- "$task_base/oauth2/authorization/github" | grep -Fx 'syntheticGithubStart'
docker exec "$task_frontend" wget -qO- "$task_base/login/oauth2/code/github?code=x&state=y" | grep -Fx 'syntheticGithubCallback'
docker exec "$task_frontend" wget -qO- "$task_base/login?error=github" | grep -q '<div id="root">'
docker exec "$task_frontend" wget -S -O /dev/null "$task_base/internal/v1/runtime" > "$task_dir/blocked" 2>&1 || true
grep -q '404 Not Found' "$task_dir/blocked"
echo 'ISOLATED_FRONTEND_IMAGE_PASSED'
