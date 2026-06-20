def calculate_risk(category):

    scores = {
        "Armed Conflict": 90,
        "Cyber Attack": 70,
        "Natural Disaster": 75,
        "Civil Unrest": 60,
        "General Event": 40
    }

    score = scores.get(category, 40)

    if score >= 80:
        level = "High"
    elif score >= 60:
        level = "Medium"
    else:
        level = "Low"

    return score, level