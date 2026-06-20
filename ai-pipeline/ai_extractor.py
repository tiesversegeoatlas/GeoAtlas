def extract_event(article):

    text = (
        article["title"] + " " +
        article["summary"]
    ).lower()

    category = "General Event"
    country = "Unknown"
    location = "Unknown"

    if any(word in text for word in [
        "war",
        "military",
        "missile",
        "troops",
        "army",
        "border"
    ]):
        category = "Armed Conflict"

    elif any(word in text for word in [
        "cyber",
        "hack",
        "malware",
        "ransomware"
    ]):
        category = "Cyber Attack"

    elif any(word in text for word in [
        "earthquake",
        "flood",
        "storm",
        "cyclone",
        "wildfire"
    ]):
        category = "Natural Disaster"

    elif any(word in text for word in [
        "protest",
        "riot",
        "demonstration"
    ]):
        category = "Civil Unrest"

    countries = [
        "india",
        "china",
        "russia",
        "ukraine",
        "israel",
        "iran",
        "usa",
        "japan"
    ]

    for c in countries:
        if c in text:
            country = c.title()
            break

    return {
        "country": country,
        "location": location,
        "category": category,
        "summary": article["summary"][:200]
    }