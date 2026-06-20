import json
import os

from rss_collector import fetch_articles
from ai_extractor import extract_event
from risk_engine import calculate_risk

os.makedirs("output", exist_ok=True)

articles = fetch_articles()

events = []

for idx, article in enumerate(articles, start=1):

    extracted = extract_event(article)

    score, level = calculate_risk(
        extracted["category"]
    )

    event = {
        "event_id": f"EVT{idx:03d}",
        "title": article["title"],
        "country": extracted["country"],
        "location": extracted["location"],
        "category": extracted["category"],
        "risk_score": score,
        "risk_level": level,
        "verification_status": "Developing",
        "summary": extracted["summary"],
        "source": "BBC RSS",
        "source_url": article["link"]
    }

    events.append(event)

with open(
    "output/events.json",
    "w",
    encoding="utf-8"
) as f:
    json.dump(
        events,
        f,
        indent=4,
        ensure_ascii=False
    )

print(f"Pipeline Complete")
print(f"Generated {len(events)} events")