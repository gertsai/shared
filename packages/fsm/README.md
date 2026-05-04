<div align="center">

# @gertsai/fsm

### Typed finite state machines, zero runtime weight

A generic, zero-dependency FSM library with strong TypeScript generics. Unifies the queue, ETL, and task-manager state patterns from across the monorepo behind one immutable, snapshot-friendly primitive — terminal-state violations and unknown states are caught at construction, not in production.

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-000.svg?style=flat-square)](LICENSE)
[![npm](https://img.shields.io/npm/v/@gertsai/fsm?style=flat-square&color=orange)](https://www.npmjs.com/package/@gertsai/fsm)
[![types](https://img.shields.io/npm/types/@gertsai/fsm?style=flat-square)](https://www.npmjs.com/package/@gertsai/fsm)

</div>

---

## Why @gertsai/fsm

- **Zero dependencies.** No runtime, no peer deps. Drop-in for any TypeScript project on Node 22+.
- **Generics that mean it.** `StateMachine<S>` carries the literal-union state type through every method, error, and snapshot.
- **Fail loud at build, not at 3am.** Terminal states with outgoing edges, unknown targets, and bad initial states throw at construction.
- **Two transition styles.** `transitionTo` throws on invalid moves; `tryTransitionTo` returns a discriminated union for graceful flows.
- **Serializable by design.** Snapshot the state and history, store it, restore it later — the FSM definition stays in code.

## Install

```bash
npm install @gertsai/fsm
# or
pnpm add @gertsai/fsm
```

## Quickstart

```ts
import { StateMachine, InvalidTransitionError } from '@gertsai/fsm';

type JobState = 'pending' | 'running' | 'succeeded' | 'failed';

const machine = new StateMachine<JobState>({
  initialState: 'pending',
  transitions: {
    pending: ['running'],
    running: ['succeeded', 'failed'],
    succeeded: [],
    failed: ['pending'], // retry
  },
  terminalStates: ['succeeded'],
  categories: { active: ['pending', 'running'] },
});

machine.onStateChange((from, to) => console.log(`${from} → ${to}`));

machine.transitionTo('running');                // OK
machine.isInCategory('active');                 // true

const result = machine.tryTransitionTo('pending');
if (!result.success) console.log(result.validTargets); // ['succeeded', 'failed']
```

## What you get

| | |
|:---|:---|
| **Typed `StateMachine<S>`** | Literal-union states flow through `transitionTo`, snapshots, handlers, and errors. |
| **Validated topology** | `createTransitionMap` enforces known states + bans outgoing edges from terminal states. |
| **Throw or try** | `transitionTo` throws `InvalidTransitionError`; `tryTransitionTo` returns `TransitionSuccess \| TransitionFailure`. |
| **History + snapshots** | Every transition is recorded with timestamp and frozen context. `snapshot()` / `restore()` round-trip cleanly. |
| **Subscribers** | `onStateChange` returns an unsubscribe handle. Handler exceptions are swallowed — they cannot break the machine. |
| **Category predicates** | Group states once in config, query via `isInCategory('active')` or generate predicates with `createStatePredicates`. |
| **Multi-instance store** | `InMemoryStateMachineStore` manages a pool of machines (one per job/task) sharing one config. |

## API surface

| Export | Kind | Purpose |
|:---|:---|:---|
| `StateMachine<S>` | class | Main FSM with state, history, handlers, categories, snapshots |
| `InMemoryStateMachineStore<S>` | class | Keyed pool of machines sharing one config |
| `createTransitionMap` | fn | Build + validate an immutable `TransitionMap` from a `Record` |
| `createTransitionMapFromConfig` | fn | Same, accepting either `Record` or `Map` transitions |
| `isValidTransition` | fn | Pure check against a `TransitionMap` |
| `getValidTransitions` | fn | Outgoing edges from a state |
| `isTerminalState` / `isKnownState` | fn | Topology queries |
| `assertValidTransition` | fn | Throw-on-invalid guard for non-class flows |
| `createStatePredicate` / `createStatePredicates` | fn | Build typed `(state) => boolean` checks from sets or category records |
| `InvalidTransitionError<S>` | error | Carries `from`, `to`, `validTargets`, frozen `context` |
| `UnknownStateError<S>` | error | State not in transition map; carries `knownStates` |
| `TerminalStateViolationError<S>` | error | Terminal state declared with outgoing transitions |
| `StateMachineConfig<S>` | type | Config: `initialState`, `transitions`, `terminalStates`, `categories?` |
| `TransitionMap<S>` | type | Compiled, immutable FSM topology |
| `TransitionResult<S>` | type | Discriminated union: `TransitionSuccess \| TransitionFailure` |
| `StateTransitionRecord<S>` | type | History entry: `{ from, to, timestamp, context? }` |
| `StateMachineSnapshot<S>` | type | Serializable `{ state, history, createdAt }` |
| `StateChangeHandler<S>` | type | `(from, to, context?) => void` |
| `StateValue` | type | Base constraint (`string`) for state literals |

Full JSDoc on every export — your editor has the rest.

## Status

- Version: **0.1.0** (pre-1.0 — minor bumps may include breaking changes)
- Node: >= 22 LTS
- TypeScript: strict-mode compatible, ESM + CJS dual export
- Tests: **201+** passing across `state-machine`, `store`, `transition-map`, `utils`, `errors`
- Tier 1 package — no internal dependencies
- Part of [@gertsai/shared](https://github.com/gertsai/shared) monorepo

## License

[Apache-2.0](./LICENSE) (c) gerts.ai
