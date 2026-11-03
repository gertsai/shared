# Reference applications

Use these applications to inspect composition patterns, not as permission to
start infrastructure or copy development credentials into production.

| Entry point | Purpose |
|---|---|
| [Backend and full-stack setup](m9s-example/README.md) | Moleculer service composition, authentication, storage and operational prerequisites |
| [API contract snapshot](m9s-example-api-types/README.md) | Hand-aligned contract shared with the frontend; read its update instructions |
| [Web application](m9s-example-web/README.md) | Frontend setup and API consumption |
| [Database migrations](m9s-example/migrations/README.md) | Migration entry point and database prerequisites |
| [OpenFGA setup](m9s-example/openfga/README.md) | Authorization model and bootstrap requirements |

Read the selected application's own commands and environment requirements. A
passing mock-mode test is not evidence that PostgreSQL, Redis, OpenFGA or Ollama
was exercised. The API snapshot is not automatically generated from arbitrary
backend changes.

For a small standalone package integration, use the [AI consumer guide](../guides/AI-CONSUMER-GUIDE.md)
instead of deploying this whole stack. [Application patterns](../guides/BUILDING-APPS.md)
and the [package catalog](../packages/INDEX.md) provide narrower entry points.
