from __future__ import annotations

import json
import os
import sys

from app.headless_search import LocalHeadlessNewsSearcher


def main() -> None:
    protocol = os.fdopen(os.dup(sys.stdout.fileno()), "w", encoding="utf-8", buffering=1)
    with open(os.devnull, "w", encoding="utf-8") as devnull:
        os.dup2(devnull.fileno(), sys.stdout.fileno())
        os.dup2(devnull.fileno(), sys.stderr.fileno())
    searcher = LocalHeadlessNewsSearcher()
    try:
        for line in sys.stdin:
            try:
                payload = json.loads(line)
                if payload.get("command") == "close":
                    break
                if payload.get("command") == "scrape_source":
                    results = searcher.scrape_source(
                        str(payload.get("url") or ""),
                        int(payload.get("limit") or 10),
                    )
                    response = {"results": [result.__dict__ for result in results], "error": None}
                else:
                    result = searcher.search(
                        str(payload.get("title") or ""),
                        payload.get("canonical_url"),
                    )
                    response = {
                        "result": result.__dict__ if result else None,
                        "error": None,
                    }
            except Exception as exc:
                response = {"result": None, "error": str(exc)}
            protocol.write(json.dumps(response, ensure_ascii=False) + "\n")
            protocol.flush()
    finally:
        searcher.close()
        protocol.close()


if __name__ == "__main__":
    main()
