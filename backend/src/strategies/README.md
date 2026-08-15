# Strategies module

This is the single source of truth for CAT PRO strategy identity,
registration, controllers, attribution contracts, central #2-#8 PAPER
admission/runtime services, and strategy read models.

Registered implementations:

1. `cross-exchange-arbitrage`
2. `cross-exchange-market-making`
3. `triangular-arbitrage`
4. `spot-perpetual-basis-arbitrage`
5. `funding-rate-arbitrage`
6. `perpetual-perpetual-arbitrage`
7. `dynamic-market-making`
8. `statistical-arbitrage`

`config/ActualStrategyCatalog.ts` is the canonical eight-strategy identity,
numbering, source-directory, PAPER-path and derivative-evidence contract.
`bootstrap/StrategyBootstrap.ts` registers those eight controllers exactly
once. `hedge-inventory-management` is an internal shared recovery evidence
producer and is deliberately not a ninth registered trading strategy.

The `automation` module remains a separate cross-cutting scheduler,
qualification and Strategy #1 SHADOW/PAPER infrastructure boundary. It must
not contain a second `strategies` tree or controller implementation. Strategy
#1 cross-module orchestration stays under `../workflows/cross-exchange-arbitrage`.

No strategy controller grants PAPER or LIVE authority. Guarded PAPER services
remain confirmation-, evidence-, risk- and accounting-gated; LIVE remains a
separate fail-closed execution boundary.
