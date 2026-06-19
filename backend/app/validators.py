SUPPORTED_SEVERITIES = [
    "low",
    "medium",
    "high"
]


def validate_severity(severity):

    return severity.lower() in SUPPORTED_SEVERITIES
