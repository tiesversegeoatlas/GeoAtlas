def classify_event(text):

    text = text.lower()

    if "earthquake" in text:
        return "Earthquake"

    if "flood" in text:
        return "Flood"

    if "wildfire" in text:
        return "Wildfire"

    if "cyclone" in text:
        return "Cyclone"

    return "Other"
