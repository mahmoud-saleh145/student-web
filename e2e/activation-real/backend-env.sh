# Environment for running the REAL backend code against throwaway local
# containers, for the activation portal's real-backend tests. Source it:
#
#   . e2e/activation-real/backend-env.sh
#
# Nothing here is, or resembles, a production value, and every address is on
# this machine. The backend checkout must NOT have a `.env` file next to it (a
# `.env` would be read as well, and the shared one is production-shaped).
#
# Containers (once):
#   docker run -d --rm --name actportal-pg -e POSTGRES_USER=edu -e POSTGRES_PASSWORD=edu \
#     -e POSTGRES_DB=edu_activation_test --tmpfs /var/lib/postgresql/data \
#     -p 127.0.0.1:55433:5432 postgres:16-alpine
#   docker run -d --rm --name actportal-redis -p 127.0.0.1:56380:6379 redis:7-alpine
#   docker exec actportal-pg psql -U edu -d postgres -c "CREATE DATABASE edu_portal_it_test"

export NODE_ENV=development
export PORT=4720
export DATABASE_URL='postgresql://edu:edu@127.0.0.1:55433/edu_portal_it_test'
export DIRECT_URL="$DATABASE_URL"
export REDIS_URL='redis://127.0.0.1:56380/1'
export REDIS_PREFIX='actportal-it'
export BACKEND_URL="http://127.0.0.1:${PORT}/api/v1"

export JWT_ACCESS_SECRET='fixture-access-secret-at-least-32-characters-long'
export JWT_REFRESH_SECRET='fixture-refresh-secret-at-least-32-characters-long'
export JWT_PLAYBACK_SECRET='fixture-playback-secret-at-least-32-characters!!'
export HLS_KEY_ROOT='fixture-hls-key-root-at-least-32-characters-long'
export MEDIA_SIGNING_KEY='fixture-media-signing-key-at-least-32-chars!!'
export MEDIA_CDN_BASE_URL='https://media.example.test/'
export ARGON_MEMORY_COST=8192
export ARGON_TIME_COST=2

export RUN_WORKERS=false
export ENABLE_SWAGGER=false
export LIBRARY_STOREFRONT_ENABLED=true
export LOG_PRETTY=false
