## Google Cloud Logging

To enable Google Cloud Logging, you need to set `LOGGER_GOOGLE` to `1` and set `GOOGLE_APPLICATION_CREDENTIALS` to the path of your Google Cloud credentials file.
Optionally, you can set `LOGGER_GOOGLE__SEVERITY` to the severity of logging (defaults to `info`).

```dotenv
LOGGER_GOOGLE=1
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
LOGGER_GOOGLE__SEVERITY=info
```

## Full dotenv example

```dotenv
# Name of a namespace (e.g. development, production, etc.); Required
MOLECULER_NAMESPACE=development
# Name of a service (e.g. invites, users, etc.); Required
MOLECULER_NODE_NAME=service-name
# Name of a node (e.g. invites-1); Optional; If not set, MOLECULER_NODE_NAME + Random numbers will be used.
MOLECULER_NODE_ID=service-name-1

# Origins allowed for CORS; Optional
ALLOWED_ORIGINS=none

# Type of Transport; Optional; Default: 'Nats'
TRANSPORT_TYPE=Nats# Redis | Nats | Local
# Params for NATS Transporter
TRANSPORT_NATS_URL=nats://0.0.0.0:4222
TRANSPORT_NATS_USERNAME=
TRANSPORT_NATS_PASSWORD=
# Params for Redis Transporter
TRANSPORT_REDIS_HOST=localhost
TRANSPORT_REDIS_PORT=6379
TRANSPORT_REDIS_CLUSTER_NAME=default

# Type of Cacher; Optional; Default: 'Memory'
CACHER_TYPE=Redis# Redis | Memory

# Params for Redis Cacher
CACHER_REDIS_HOST=localhost
CACHER_REDIS_PORT=6379
CACHER_REDIS_CLUSTER_NAME=default

# Enable Redis cluster
REDIS_CLUSTER=1

# Healthcheck params
HEALTHCHECK_ENABLED=1
HEALTHCHECK_READY_PATH=/ready
HEALTHCHECK_LIVE_PATH=/live
HEALTHCHECK_PORT=3344

# Enable logger in Google Cloud
LOGGER_GOOGLE=
# Severity of logging in Google Cloud
LOGGER_GOOGLE__SEVERITY=info
# Path to Google Cloud credentials file
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json

# Enable logger in Console
LOGGER_CONSOLE=1
# Severity of logging in Console
LOGGER_CONSOLE__SEVERITY=1
# Log depth for objects
LOG_DEPTH: 4
```
