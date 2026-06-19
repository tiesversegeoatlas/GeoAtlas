def get_statistics(events):

    high = len(
        [
            e
            for e in events
            if e.severity.lower() == "high"
        ]
    )

    countries = len(
        set(
            e.country
            for e in events
        )
    )

    return {
        "total_events": len(events),
        "high_severity": high,
        "countries": countries
    }
