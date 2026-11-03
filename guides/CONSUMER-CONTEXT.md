# Consumer project context template

Copy this structure into the consuming project's own instructions and fill the
project facts before implementation. It does not install tools or override that
project's policies. Do not include credential values or personal machine paths.

## Project facts to provide

- Task and expected observable behavior.
- Repository/ref and relevant project instructions.
- Runtime, module format, framework and package manager.
- Exact installed @gertsai package versions and required peers, from manifest/lockfile.
- Registry and credential **variable name only**, plus whether read access is available.
- Relevant existing implementation and test paths.
- Authorized verification commands and any infrastructure prerequisites.
- Out-of-scope actions and data that must not leave the project.

## Prompt to adapt

> Implement the requested integration using the smallest necessary @gertsai
> package set. First inspect this project's conventions and installed versions.
> Use the shared [AI consumer guide](AI-CONSUMER-GUIDE.md) and
> [task map](INDEX.md), then the selected version's README/public exports.
>
> Before editing, identify public imports, peers, required application-local
> helpers, source ref and expected behavior. Repository HEAD is not automatically
> the installed release. Report conflicting examples rather than inventing APIs.
>
> Use this project's existing patterns. Do not add workspace/file/link overrides,
> deep package imports or test-only authentication to ordinary registry consumption.
> Treat templates as examples requiring the documented local glue.
>
> Preserve authentication and tenant boundaries. Do not disclose credentials,
> publish packages, migrate databases, start infrastructure, weaken authorization
> or perform destructive cleanup without task-specific authorization.
>
> Run the checks authorized by the task and report actual commands/results,
> installed versions, changed files, skipped checks and remaining prerequisites.
> Never report an unrun check as passing. Source/workspace verification is not
> proof that a registry tarball was installed or executed.

## Acceptance record

A complete record identifies the selected package versions and docs ref, public
imports, expected and observed behavior, actual command exit codes, and any
failed/skipped/not-run checks. Keep secret values out of the record. The
consumer's own lockfile is the record of installed dependency resolution.
