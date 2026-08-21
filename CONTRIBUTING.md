---
title: Contributing
description: Guidelines for contributing code, documentation, and feedback to this repository.
---

## Contributing

Thanks for contributing.

## Ways To Contribute

* Report bugs and edge cases
* Propose features and UX improvements
* Improve docs and examples
* Submit code changes with tests

## Local Setup

* Install dependencies in the app you are working on, for example `apps/client`.
* Run the app locally and verify expected behavior before opening a pull request.
* Run tests for impacted packages.

## Chat Development

Chat protocol types live in `apps/server/src/contracts.ts`. Server authorization,
history, and idempotent persistence are implemented in
`apps/server/src/realtime/chatHandlers.ts` and `apps/server/src/db/chatRepository.ts`.
Keep new chat events typed in the shared contract, derive authorship from the
authenticated socket principal, and preserve cursor ordering and
`clientMessageId` retry semantics. Update the product contract and focused
client, server, and Playwright tests when changing chat behavior.

## Branch And Pull Request Workflow

* Create a branch from `main`.
* Keep changes focused and scoped to one logical topic.
* Write Conventional Commit messages.
* Open a pull request with context, screenshots for UI changes, and test notes.

## Commit Message Rules

CI validates commit messages with commitlint. Use this format:

```text
type(scope): subject
```

Guidelines:

* Keep `subject` short and action-oriented.
* Use lowercase `type` and `scope`.
* Include a `scope` on every commit.
* Use `BREAKING CHANGE:` in the commit body or footer for breaking changes.

Common types:

* `feat`
* `fix`
* `chore`
* `docs`
* `refactor`
* `test`
* `ci`
* `perf`

Allowed scopes:

* `client`
* `server`
* `ui`
* `render`
* `interaction`
* `domain-client`
* `domain-server`
* `db`
* `jobs`
* `api`
* `deps`
* `deps-dev`
* `deps-client`
* `deps-server`
* `repo`
* `ci`
* `infra`
* `docs`
* `scripts`
* `release`

Examples:

```text
feat(ui): add canvas zoom slider
fix(db): correct snapshot query ordering
chore(ci): enforce conventional commit lint job
docs(repo): add release channel documentation
```

## Pull Request Checklist

* [ ] Change is scoped and reviewed for side effects
* [ ] Tests are added or updated where appropriate
* [ ] Documentation is updated for user-facing changes
* [ ] Lint and type checks pass

## Review Expectations

* Be constructive, specific, and respectful.
* Assume positive intent.
* Prefer actionable feedback over broad criticism.
