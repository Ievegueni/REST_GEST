// PM2: API (sem workers) + processo de workers BullMQ. Variáveis em /srv/restgest/.env
module.exports = {
  apps: [
    {
      name: 'restgest-api',
      cwd: '/srv/restgest/apps/api',
      script: 'dist/server.js',
      node_args: '--env-file=../../.env',
      env: { NODE_ENV: 'production', RUN_WORKERS: 'false', HOST: '127.0.0.1', TRUST_PROXY: 'true' },
      max_memory_restart: '700M',
    },
    {
      name: 'restgest-worker',
      cwd: '/srv/restgest/apps/api',
      script: 'dist/worker.js',
      node_args: '--env-file=../../.env',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '700M',
    },
  ],
};
