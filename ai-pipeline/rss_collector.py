import feedparser

RSS_FEEDS = [
    "https://feeds.bbci.co.uk/news/world/rss.xml"
]

def fetch_articles():
    articles = []

    for feed_url in RSS_FEEDS:
        feed = feedparser.parse(feed_url)

        for entry in feed.entries[:10]:
            articles.append({
                "title": entry.get("title", ""),
                "summary": entry.get("summary", ""),
                "link": entry.get("link", "")
            })

    return articles