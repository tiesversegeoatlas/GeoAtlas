def remove_duplicate_events(events):
    seen = set()
    unique_events = []

    for event in events:
        identifier = (
            event.title,
            event.source,
            event.country
        )

        if identifier not in seen:
            seen.add(identifier)
            unique_events.append(event)

    return unique_events
