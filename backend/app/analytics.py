from collections import Counter

def generate_event_stats(events):

    countries = Counter()
    severities = Counter()
    event_types = Counter()

    for event in events:
        countries[event.country] += 1
        severities[event.severity] += 1
        event_types[event.event_type] += 1

    return {
        "countries": countries,
        "severities": severities,
        "event_types": event_types
    }
