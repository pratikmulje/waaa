import sys
import json
import re
from collections import Counter


# --------------------------------------------------
# Keyword categories
# --------------------------------------------------

TOPIC_KEYWORDS = {
    "exam": [
        "exam", "test", "viva", "practical",
        "assessment", "internal", "midsem", "endsem"
    ],

    "assignment": [
        "assignment", "submission", "submit",
        "project", "mini project", "report"
    ],

    "meeting": [
        "meeting", "call", "meet", "appointment"
    ],

    "college": [
        "college", "lecture", "class", "lab",
        "professor", "sir", "madam"
    ],

    "fees": [
        "fees", "fee", "payment", "scholarship"
    ],

    "event": [
        "event", "workshop", "seminar",
        "hackathon", "competition"
    ],

    "form": [
        "form", "google form", "registration",
        "register", "fill"
    ],

    "placement": [
        "placement", "internship", "job",
        "resume", "interview", "company"
    ]
}


# --------------------------------------------------
# Helpers
# --------------------------------------------------

def normalize(text):
    return re.sub(r"\s+", " ", text.lower()).strip()


def detect_topics(messages):

    topic_scores = Counter()

    for message in messages:

        text = normalize(message.get("text", ""))

        for topic, keywords in TOPIC_KEYWORDS.items():

            for keyword in keywords:

                if keyword in text:
                    topic_scores[topic] += 1

    return [
        {
            "topic": topic,
            "mentions": count
        }
        for topic, count
        in topic_scores.most_common()
    ]


# --------------------------------------------------
# Deadline detection
# --------------------------------------------------

def detect_deadlines(messages):

    deadlines = []

    patterns = [
        r"\bby tomorrow\b",
        r"\btomorrow\b",
        r"\btoday\b",
        r"\btonight\b",
        r"\bby monday\b",
        r"\bby tuesday\b",
        r"\bby wednesday\b",
        r"\bby thursday\b",
        r"\bby friday\b",
        r"\bby saturday\b",
        r"\bby sunday\b",
        r"\bdeadline\b",
        r"\bdue\b"
    ]

    for message in messages:

        text = message.get("text", "")

        for pattern in patterns:

            if re.search(pattern, text, re.IGNORECASE):

                deadlines.append({
                    "text": text,
                    "matched": pattern
                })

                break

    return deadlines


# --------------------------------------------------
# Task detection
# --------------------------------------------------

def detect_tasks(messages):

    tasks = []

    patterns = [
        r"\bsubmit\b",
        r"\bsend\b",
        r"\bfill\b",
        r"\bcomplete\b",
        r"\bregister\b",
        r"\bupload\b",
        r"\bdownload\b",
        r"\battend\b",
        r"\bbring\b",
        r"\bprepare\b"
    ]

    for message in messages:

        text = message.get("text", "")

        for pattern in patterns:

            if re.search(pattern, text, re.IGNORECASE):

                tasks.append({
                    "text": text,
                    "action": pattern.replace(r"\b", "")
                })

                break

    return tasks


# --------------------------------------------------
# Important keywords
# --------------------------------------------------

def extract_keywords(messages):

    words = []

    stop_words = {
        "the", "is", "a", "an", "and", "or",
        "to", "of", "in", "on", "for", "with",
        "this", "that", "are", "was", "be",
        "you", "your", "we", "they", "it",
        "i", "me", "my", "please"
    }

    for message in messages:

        text = normalize(message.get("text", ""))

        tokens = re.findall(
            r"\b[a-zA-Z][a-zA-Z0-9]+\b",
            text
        )

        for token in tokens:

            if (
                len(token) > 3
                and token not in stop_words
            ):
                words.append(token)

    counter = Counter(words)

    return [
        {
            "keyword": word,
            "count": count
        }
        for word, count
        in counter.most_common(15)
    ]


# --------------------------------------------------
# Main analysis
# --------------------------------------------------

def analyze(messages):

    if not isinstance(messages, list):
        return {
            "error": "messages must be a list"
        }

    topics = detect_topics(messages)

    deadlines = detect_deadlines(messages)

    tasks = detect_tasks(messages)

    keywords = extract_keywords(messages)

    return {
        "messageCount": len(messages),

        "topics": topics,

        "deadlines": deadlines,

        "tasks": tasks,

        "keywords": keywords
    }


# --------------------------------------------------
# CLI
# --------------------------------------------------

if __name__ == "__main__":

    try:

        input_data = sys.stdin.read()

        messages = json.loads(input_data)

        result = analyze(messages)

        print(
            json.dumps(
                result,
                ensure_ascii=False
            )
        )

    except Exception as error:

        print(
            json.dumps({
                "error": str(error)
            })
        )