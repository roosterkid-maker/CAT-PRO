# Automation module

This module owns cross-cutting automated runtime infrastructure: scheduling,
candidate qualification, queues, guarded SHADOW/PAPER dispatch, readiness,
accounting diagnostics, and production-safety diagnostics.

It does not own strategy controllers or a second strategy tree. Strategy-
specific integration orchestration and acceptance evidence live under
`../workflows`. Automation services may invoke those workflows through their
exported service boundary.

No service in this module can authorize LIVE trading by itself.
