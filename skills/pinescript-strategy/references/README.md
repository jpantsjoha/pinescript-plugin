# pinescript-strategy — references

| Source | Use for |
|---|---|
| [Strategies](https://www.tradingview.com/pine-script-docs/concepts/strategies/) | Order semantics, broker emulator behaviour |
| [Repainting](https://www.tradingview.com/pine-script-docs/concepts/repainting/) | Which constructs repaint and why |
| [Other timeframes and data](https://www.tradingview.com/pine-script-docs/concepts/other-timeframes-and-data/) | `request.security`, `lookahead`, gaps |
| [Limitations](https://www.tradingview.com/pine-script-docs/writing/limitations/) | 40 request calls, 64 plots, loop timeouts |
| [Alerts](https://www.tradingview.com/pine-script-docs/concepts/alerts/) | `alert()`, `alert_message`, static vs dynamic |

## Broker automation

Payload schemas differ per platform — check the receiving service's docs before
assuming field names:

- [TradersPost](https://docs.traderspost.io/docs/learn/signal-sources/tradingview)
- [PickMyTrade JSON configuration](https://docs.pickmytrade.trade/docs/tradingview-json-alert-configuration/)

The scaffolds use `ticker` / `action` / `sentiment` / `quantity`, which is the
common shape, not a universal standard.
