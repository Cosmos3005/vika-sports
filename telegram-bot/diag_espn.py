import asyncio
import httpx
from datetime import datetime
from zoneinfo import ZoneInfo

BASE = "https://site.api.espn.com/apis/site/v2/sports"
PATHS = {
    "АПЛ": "soccer/eng.1",
    "Ла Лига": "soccer/esp.1",
    "Серия A": "soccer/ita.1",
    "Бундеслига": "soccer/ger.1",
    "Лига 1": "soccer/fra.1",
    "Эредивизи": "soccer/ned.1",
    "Примейра": "soccer/por.1",
    "Суперлига Турция": "soccer/tur.1",
    "ЛЧ": "soccer/uefa.champions",
    "ЛЕ": "soccer/uefa.europa",
}


def odds_values(event):
    comp = (event.get("competitions") or [{}])[0]
    odds = comp.get("odds") or event.get("odds") or []
    if not odds:
        return []
    o = odds[0] or {}
    ml = o.get("moneyline") or {}
    vals = [ml.get("home"), ml.get("draw"), ml.get("away"), o.get("homeOdds"), o.get("drawOdds"), o.get("awayOdds")]
    return [v for v in vals if v is not None]


async def main():
    date = datetime.now(ZoneInfo("Europe/Riga")).strftime("%Y%m%d")
    print("DATE:", date)
    print("ESPN DATA DIAGNOSTIC")
    print("=" * 70)
    async with httpx.AsyncClient(headers={"User-Agent": "VikaSports-Diagnostic/1.0"}, timeout=20) as client:
        total_events = 0
        total_pregame = 0
        total_with_odds = 0
        for name, path in PATHS.items():
            url = f"{BASE}/{path}/scoreboard"
            try:
                r = await client.get(url, params={"dates": date})
                print(f"\n{name:18} HTTP={r.status_code} BYTES={len(r.content)}")
                r.raise_for_status()
                data = r.json()
                events = data.get("events") or []
                pre = [e for e in events if e.get("status", {}).get("type", {}).get("state") == "pre"]
                with_odds = [e for e in events if odds_values(e)]
                total_events += len(events)
                total_pregame += len(pre)
                total_with_odds += len(with_odds)
                print(f"  events={len(events)} pregame={len(pre)} with_odds={len(with_odds)}")
                for e in pre[:3]:
                    comp = (e.get("competitions") or [{}])[0]
                    teams = comp.get("competitors") or []
                    names = [((x.get("team") or {}).get("displayName") or "?") for x in teams]
                    print("  PRE:", " vs ".join(names), "ODDS:", odds_values(e) or "NONE")
            except Exception as exc:
                print(f"  ERROR: {type(exc).__name__}: {exc}")
        print("\n" + "=" * 70)
        print(f"TOTAL events={total_events} pregame={total_pregame} with_odds={total_with_odds}")
        if total_events == 0:
            print("RESULT: ESPN returned no events. Source/date/league endpoints need investigation.")
        elif total_pregame == 0:
            print("RESULT: ESPN returned events, but no pregame events for the selected leagues/date.")
        elif total_with_odds == 0:
            print("RESULT: ESPN returned matches, but no odds. This is why Vika currently produces no picks.")
        else:
            print("RESULT: ESPN is returning matches and odds. The problem is inside Vika's parsing/filter/model stage.")


if __name__ == "__main__":
    asyncio.run(main())
