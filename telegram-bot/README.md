# Vika Daily Telegram Bot

Standalone MVP for automatic daily football predictions to a Telegram channel.

## What it does

- scans today's fixtures across major European leagues and UEFA competitions;
- reads public ESPN scoreboard/standings data, so no paid Odds API is required;
- uses a conservative rank-strength model to estimate 1X2 probabilities;
- only publishes a pick when a real decimal moneyline is available and the probability/edge thresholds pass;
- saves every published pick to SQLite;
- checks finished matches and resolves WIN/LOSS automatically;
- sends the daily digest to the configured Telegram channel;
- provides `/today` and `/status` for manual checks.

This is the first production-shaped daily bot, not a claim of profitable performance. Backtest and paper-trade it before staking money.

## Windows quick start

```powershell
cd telegram-bot
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Edit `.env`:

```text
TELEGRAM_BOT_TOKEN=token_from_BotFather
TELEGRAM_CHANNEL_ID=@VikaWinss
```

Add the bot to the channel as an administrator with permission to post messages, then run:

```powershell
python bot.py
```

Test in Telegram with `/today`.

## Docker

```bash
docker build -t vika-daily .
docker run --env-file .env -v vika-data:/app/data vika-daily
```

## Important limitation

The free baseline only publishes markets for which the public ESPN feed exposes a moneyline. If no compatible quote is present, Vika skips the event instead of inventing a bookmaker price. A dedicated bookmaker/odds provider can be added later without changing the Telegram, SQLite, scheduling, or result-tracking layers.
