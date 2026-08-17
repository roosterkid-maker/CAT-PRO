# Workflows module

Workflows are application-level use cases that compose pure strategy logic,
generic automation infrastructure, and guarded trading/accounting services.
They exist to prevent either `strategies` or `automation` from becoming a
duplicate all-purpose implementation tree.

`cross-exchange-arbitrage` owns the Strategy #1 unified SHADOW/PAPER
orchestrator and PAPER runtime-acceptance evidence. It does not own another
strategy controller and it cannot authorize LIVE submission.
