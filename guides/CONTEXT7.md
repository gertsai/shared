# Context7 and machine-readable distribution

The [file retrieval map](INDEX.md) and [AI consumer guide](AI-CONSUMER-GUIDE.md)
work without an external service. The root [llms.txt](../llms.txt) advertises
those entry points without copying their content.

## Current state

The repository has a [Context7 parsing configuration](../context7.json), with
**disallow:true** intentionally preventing parsing until the public corpus and
external indexing are explicitly accepted. No submission, ownership claim,
API-key configuration or successful Context7 indexing is claimed here.

This opt-in boundary is deliberate: navigation/link checks do not establish
that every historical package example is correct for every installed version.
Resolve the remaining semantic example issues and review the intended corpus
before enabling an external index. Public repository visibility is not a
reason to ingest private maintainer context or personal local files.

## What each file does

- llms.txt is a discovery proposal: short source links, not API truth or a
  registration mechanism. Its raw main URLs become current only after merge;
  use the actual branch/ref while reviewing unpublished changes.
- context7.json controls GitHub repository parsing. Its folders limit the
  candidate corpus; root Markdown may still be included. Explicitly exclude
  maintainer/history files, not only directories.
- INDEX.md is the human-and-model-readable task router. Do not add a parallel
  JSON navigation database unless an actual consumer needs one.

Context7's documented GitHub parser targets English documentation. Predominantly
non-English pages may be skipped. The English AI/install summary complements
our detailed Russian consumer guide; a Russian-only guide does not establish
Context7 coverage. Raw TypeScript templates are not a substitute for Markdown
examples: source extensions cannot be forced through includeExtensions.

## Separate enabling procedure

1. Review the English guides and selected package READMEs against the source ref
   and installed-version semantics. Check the allowlist/exclusions and all
   consumer links; do not include logs, credentials, local setup or evidence dumps.
2. With owner approval for external indexing, remove/change disallow:true in a
   reviewed change and merge the chosen documentation/configuration to main.
   Do not add private API tokens or fake ownership fields to the repository.
3. Submit the public repository through [Add Library](https://context7.com/add-library).
   Configuration alone does not submit or register it. Confirm parsing completes,
   record the actual library ID and inspect the included documents.
4. Ask concrete install, timeout, public-import and storage questions. Check that
   answers cite the intended documents and do not mistake main for an installed
   release or invent an unsupported export. Compare with direct file retrieval.
5. Verify refresh/version behavior before relying on it. Public-library refresh
   is request-driven and may serve older material during background updates.
   This monorepo has independent package tags, not one shared version; do not
   configure a fictional global v1.0 tag.

Use the existing documentation source if Context7 has no suitable result.
Successful external retrieval is a separate acceptance result, not inferred
from JSON validity, a library URL or a green package CI run.

## Primary references

- [Adding libraries](https://context7.com/docs/adding-libraries.md)
- [Library owners and parsing](https://context7.com/docs/library-owners.md)
- [Configuration JSON Schema](https://context7.com/schema/context7.json)
- [Refresh behavior](https://context7.com/docs/library-updates.md)
- [llms.txt proposal](https://llmstxt.org/)

No vector database, embedding installation or custom MCP server is required
for the reviewed files-first workflow. The repository has about two thousand
tracked files; measure retrieval quality/latency before adding another index.
