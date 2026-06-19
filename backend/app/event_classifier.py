from __future__ import annotations

EVENT_TYPE_KEYWORDS = {
    "earthquake": ("earthquake", "aftershock", "seismic"),
    "flood": ("flood", "flooding", "inundation"),
    "wildfire": ("wildfire", "bushfire", "forest fire"),
    "cyclone": ("cyclone", "hurricane", "typhoon"),
}


def classify_event_types(text: str) -> list[str]:
    lowered = text.lower()
    return [
        event_type
        for event_type, keywords in EVENT_TYPE_KEYWORDS.items()
        if any(keyword in lowered for keyword in keywords)
    ]
