import asyncio
import math
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx
from dotenv import load_dotenv
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes

load_dotenv()

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
CHANNEL_ID = os.getenv("TELEGRAM_CHANNEL_ID", "").strip()
TZ = ZoneInfo(os.getenv("TIMEZONE", "Europe/Riga"))
SEND_TIME = os.getenv("DAILY_SEND_TIME", "09:05")
SCAN_HOURS = int(os.getenv("SCAN_HOURS", "24"))
MIN_ODDS = float(os.getenv("MIN_ODDS", "1.40"))
MIN_PROB = float(os.getenv("MIN_PROBABILITY", "62"))
MIN_EDGE = float(os.getenv("MIN_EDGE", "0.03"))
MAX_PICKS = int(os.getenv("MAX_PICKS", "5"))
DB_PATH = os.getenv("DB_PATH", "data/vika_predictions.sqlite3")

# ESPN's public scoreboard endpoints are used as the no-paid-key baseline.
SOCCER_PATHS = {
    "Англия · АПЛ": "soccer/eng.1",
    "Испания · Ла Лига": "soccer/esp.1",
    "Италия · Серия A": "soccer/ita.1",
    "Германия · Бундеслига": "soccer/ger.1",
    "Франция · Лига 1": "soccer/fra.1",
    "Нидерланды · Эредивизи": "soccer/ned.1",
    "Португалия · Примейра": "soccer/por.1",
    "Турция · Суперлига": "soccer/tur.1",
    "ЛЧ": "soccer/uefa.champions",
    "ЛЕ": "soccer/uefa.europa",
}

BASE = "https://site.api.espn.com/apis/site/v2/sports"


def db():
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.execute("""CREATE TABLE IF NOT EXISTS picks(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT UNIQUE,
        league TEXT,
        kickoff TEXT,
        home TEXT,
        away TEXT,
        selection TEXT,
        odds REAL,
        probability REAL,
        fair REAL,
        edge REAL,
        status TEXT DEFAULT 'OPEN',
        result TEXT,
        created_at TEXT
    )""")
    con.commit()
    return con


def poisson(k, lam):
    return math.exp(-lam) * (lam ** k) / math.factorial(k)


def implied_probability(odds):
    return 1.0 / odds if odds and odds > 1 else 0.0


def moneyline_to_decimal(value):
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    if n > 1:
        return n
    if n >= 100:
        return 1 + n / 100
    if n <= -100:
        return 1 + 100 / abs(n)
    return None


def extract_odds(event):
    comp = (event.get("competitions") or [{}])[0]
    odds = (comp.get("odds") or event.get("odds") or [])
    if not odds:
        return {}
    o = odds[0] or {}
    out = {}
    # ESPN has used slightly different structures over time.
    ml = o.get("moneyline") or {}
    for key, aliases in {
        "home": [ml.get("home"), o.get("homeOdds"), (o.get("homeTeamOdds") or {}).get("moneyLine")],
        "away": [ml.get("away"), o.get("awayOdds"), (o.get("awayTeamOdds") or {}).get("moneyLine")],
        "draw": [ml.get("draw"), o.get("drawOdds")],
    }.items():
        for v in aliases:
            d = moneyline_to_decimal(v)
            if d:
                out[key] = d
                break
    return out


async def get_json(client, url, params=None):
    try:
        r = await client.get(url, params=params, timeout=15)
        r.raise_for_status()
        return r.json()
    except Exception:
        return {}


async def standings(client, path):
    data = await get_json(client, f"{BASE}/{path}/standings")
    ranks = {}
    def walk(x):
        if isinstance(x, list):
            for y in x:
                walk(y)
        elif isinstance(x, dict):
            team = x.get("team")
            if team and team.get("id"):
                rank = x.get("rank") or x.get("seed")
                try:
                    rank = float(rank)
                except (TypeError, ValueError):
                    rank = None
                if rank:
                    ranks[str(team["id"])] = rank
            for key in ("children", "entries", "standings", "groups"):
                walk(x.get(key))
    walk(data)
    return ranks


async def events_for_path(client, path, date):
    data = await get_json(client, f"{BASE}/{path}/scoreboard", {"dates": date})
    return data.get("events") or []


def model_event(event, league, ranks):
    comp = (event.get("competitions") or [{}])[0]
    teams = comp.get("competitors") or []
    home = next((x for x in teams if x.get("homeAway") == "home"), None)
    away = next((x for x in teams if x.get("homeAway") == "away"), None)
    if not home or not away:
        return None
    if event.get("status", {}).get("type", {}).get("state") != "pre":
        return None
    hname = (home.get("team") or {}).get("displayName") or (home.get("team") or {}).get("name")
    aname = (away.get("team") or {}).get("displayName") or (away.get("team") or {}).get("name")
    hr = home.get("rank") or ranks.get(str((home.get("team") or {}).get("id")), 10)
    ar = away.get("rank") or ranks.get(str((away.get("team") or {}).get("id")), 10)
    try:
        hr, ar = float(hr), float(ar)
    except (TypeError, ValueError):
        hr, ar = 10.0, 10.0

    # Transparent baseline model: rank strength + home advantage, converted to 1X2.
    # It is deliberately conservative and is not presented as a guaranteed outcome.
    strength = (ar - hr) / 20.0
    home_p = 0.47 + strength * 0.16
    away_p = 0.29 - strength * 0.13
    draw_p = 1.0 - home_p - away_p
    home_p = max(0.08, min(0.82, home_p))
    away_p = max(0.08, min(0.72, away_p))
    draw_p = max(0.10, 1 - home_p - away_p)
    total = home_p + draw_p + away_p
    home_p, draw_p, away_p = home_p / total, draw_p / total, away_p / total

    odds = extract_odds(event)
    candidates = [
        ("home", hname, home_p, odds.get("home")),
        ("draw", "Ничья", draw_p, odds.get("draw")),
        ("away", aname, away_p, odds.get("away")),
    ]
    candidates = [x for x in candidates if x[3] and x[3] >= MIN_ODDS]
    if not candidates:
        return None
    key, selection, prob, odd = max(candidates, key=lambda x: x[2])
    fair = 1.0 / prob
    edge = prob * odd - 1.0
    if prob * 100 < MIN_PROB or edge < MIN_EDGE:
        return None
    return {
        "event_id": str(event.get("id")), "league": league,
        "kickoff": event.get("date"), "home": hname, "away": aname,
        "selection_key": key, "selection": selection, "odds": odd,
        "probability": prob * 100, "fair": fair, "edge": edge * 100,
    }


async def scan_day():
    today = datetime.now(TZ).date()
    dates = [today + timedelta(days=i) for i in range(max(1, SCAN_HOURS // 24 + 1))]
    rows = []
    async with httpx.AsyncClient(headers={"User-Agent": "VikaSports/1.0"}) as client:
        for league, path in SOCCER_PATHS.items():
            ranks = await standings(client, path)
            for d in dates:
                events = await events_for_path(client, path, d.strftime("%Y%m%d"))
                for event in events:
                    pick = model_event(event, league, ranks)
                    if pick:
                        rows.append(pick)
    # Deduplicate and keep the strongest edges first.
    unique = {x["event_id"]: x for x in rows}
    return sorted(unique.values(), key=lambda x: (x["edge"], x["probability"]), reverse=True)[:MAX_PICKS]


def save_picks(rows):
    con = db()
    for p in rows:
        con.execute("""INSERT OR IGNORE INTO picks
        (event_id,league,kickoff,home,away,selection,odds,probability,fair,edge,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)""", (
            p["event_id"], p["league"], p["kickoff"], p["home"], p["away"],
            p["selection"], p["odds"], p["probability"], p["fair"], p["edge"],
            datetime.now(timezone.utc).isoformat(),
        ))
    con.commit(); con.close()


def format_digest(rows):
    now = datetime.now(TZ).strftime("%d.%m.%Y")
    if not rows:
        return (f"🧠 VIKA DAILY | {now}\n\n"
                "Сегодня Vika не нашла событие, которое одновременно проходит фильтр модели и имеет доступную актуальную линию.\n\n"
                "Лучше пропуск, чем выдуманный прогноз. Следующая проверка будет автоматически.")
    parts = [f"🧠 VIKA DAILY | {now}", "", f"Нашла {len(rows)} события, прошедших автоматический фильтр:", ""]
    for i, p in enumerate(rows, 1):
        k = datetime.fromisoformat(p["kickoff"].replace("Z", "+00:00")).astimezone(TZ).strftime("%H:%M")
        parts.append(f"{i}. ⚽ {p['home']} vs {p['away']}")
        parts.append(f"   {p['league']} · {k}")
        parts.append(f"   ВЫБОР: {p['selection']} · КФ {p['odds']:.2f}")
        parts.append(f"   Вероятность: {p['probability']:.1f}% · Fair: {p['fair']:.2f} · Edge: +{p['edge']:.1f}%")
        parts.append("")
    parts.append("Линия берётся только при наличии реальной котировки. Модель не гарантирует результат.")
    return "\n".join(parts)


async def daily_job(context: ContextTypes.DEFAULT_TYPE):
    rows = await scan_day()
    save_picks(rows)
    if CHANNEL_ID:
        await context.bot.send_message(chat_id=CHANNEL_ID, text=format_digest(rows))


async def resolve_results(context: ContextTypes.DEFAULT_TYPE):
    con = db()
    open_rows = con.execute("SELECT event_id,home,away,selection,status FROM picks WHERE status='OPEN'").fetchall()
    if not open_rows:
        con.close(); return
    async with httpx.AsyncClient() as client:
        for event_id, home, away, selection, status in open_rows:
            found = None
            for path in SOCCER_PATHS.values():
                data = await get_json(client, f"{BASE}/{path}/summary", {"event": event_id})
                if data.get("header"):
                    found = data; break
            if not found:
                continue
            comps = (found.get("header", {}).get("competitions") or [])
            if not comps:
                continue
            teams = comps[0].get("competitors") or []
            hs = next((x for x in teams if x.get("homeAway") == "home"), None)
            aw = next((x for x in teams if x.get("homeAway") == "away"), None)
            if not hs or not aw:
                continue
            state = ((found.get("header") or {}).get("competitions") or [{}])[0].get("status", {}).get("type", {}).get("state")
            if state != "post":
                continue
            try:
                hg, ag = int(hs.get("score")), int(aw.get("score"))
            except (TypeError, ValueError):
                continue
            actual = "home" if hg > ag else "away" if ag > hg else "draw"
            result = "WIN" if actual == ("home" if selection == home else "away" if selection == away else "draw") else "LOSS"
            con.execute("UPDATE picks SET status='CLOSED',result=? WHERE event_id=?", (result, event_id))
    con.commit(); con.close()


def schedule_time(app):
    hour, minute = map(int, SEND_TIME.split(":", 1))
    app.job_queue.run_daily(daily_job, time=__import__('datetime').time(hour=hour, minute=minute, tzinfo=TZ), name="vika-daily")
    app.job_queue.run_repeating(resolve_results, interval=1800, first=120, name="vika-results")


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Привет! Я Vika. /today — прогнозы на сегодня, /status — статистика бота.")


async def cmd_today(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("🔎 Сканирую сегодняшнюю линию и прогоняю фильтр…")
    rows = await scan_day()
    save_picks(rows)
    await update.message.reply_text(format_digest(rows))


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    con = db()
    total, wins, losses, open_count = con.execute("SELECT COUNT(*),SUM(result='WIN'),SUM(result='LOSS'),SUM(status='OPEN') FROM picks").fetchone()
    con.close()
    wins = wins or 0; losses = losses or 0
    closed = wins + losses
    hit = (wins / closed * 100) if closed else 0
    await update.message.reply_text(f"📊 Vika status\nСигналов: {total}\nWIN: {wins}\nLOSS: {losses}\nОткрытых: {open_count}\nПроходимость: {hit:.1f}%")


async def error_handler(update, context):
    print("Vika error:", repr(context.error))


def main():
    if not TOKEN:
        raise SystemExit("TELEGRAM_BOT_TOKEN is empty")
    app = Application.builder().token(TOKEN).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("today", cmd_today))
    app.add_handler(CommandHandler("status", cmd_status))
    app.add_error_handler(error_handler)
    schedule_time(app)
    print(f"Vika Daily started. Daily send: {SEND_TIME} {TZ}. Channel: {CHANNEL_ID or 'disabled'}")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
