from __future__ import annotations

import os
import re
import base64
import json
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import parse_qs, quote_plus, urlparse

from app.config import get_settings
from app.feed_utils import strip_text


@dataclass
class HeadlessSearchResult:
    title: str | None = None
    summary: str | None = None
    body: str | None = None
    image_url: str | None = None
    url: str | None = None
    published_at: str | None = None
    location_text: str | None = None


class HeadlessNewsSearcher:
    """One reusable browser per ingestion job, used only after direct extraction fails."""

    def __init__(self) -> None:
        self.settings = get_settings()
        self._process: subprocess.Popen[str] | None = None

    def __enter__(self) -> "HeadlessNewsSearcher":
        return self

    def __exit__(self, *_args) -> None:
        self.close()

    def search(self, title: str, canonical_url: str | None = None) -> HeadlessSearchResult | None:
        if not self.settings.headless_search_enabled or not title.strip():
            return None
        process = self._ensure_process()
        request = json.dumps({"title": title, "canonical_url": canonical_url}, ensure_ascii=False)
        assert process.stdin is not None
        assert process.stdout is not None
        process.stdin.write(request + "\n")
        process.stdin.flush()
        response = process.stdout.readline()
        if not response:
            error = process.stderr.read() if process.stderr else ""
            raise RuntimeError(error.strip() or "Headless search worker stopped unexpectedly.")
        payload = json.loads(response)
        if payload.get("error"):
            raise RuntimeError(payload["error"])
        result = payload.get("result")
        return HeadlessSearchResult(**result) if result else None

    def scrape_source(self, url: str, limit: int | None = None) -> list[HeadlessSearchResult]:
        if not self.settings.headless_search_enabled:
            return []
        process = self._ensure_process()
        request = json.dumps(
            {
                "command": "scrape_source",
                "url": url,
                "limit": limit or self.settings.url_scrape_max_articles,
            },
            ensure_ascii=False,
        )
        assert process.stdin is not None
        assert process.stdout is not None
        process.stdin.write(request + "\n")
        process.stdin.flush()
        response = process.stdout.readline()
        if not response:
            error = process.stderr.read() if process.stderr else ""
            raise RuntimeError(error.strip() or "Headless scraping worker stopped unexpectedly.")
        payload = json.loads(response)
        if payload.get("error"):
            raise RuntimeError(payload["error"])
        return [HeadlessSearchResult(**item) for item in payload.get("results") or []]

    def close(self) -> None:
        if self._process is None:
            return
        if self._process.poll() is None:
            try:
                assert self._process.stdin is not None
                self._process.stdin.write(json.dumps({"command": "close"}) + "\n")
                self._process.stdin.flush()
                self._process.wait(timeout=3)
            except Exception:
                self._process.terminate()
        self._process = None

    def _ensure_process(self) -> subprocess.Popen[str]:
        if self._process is not None and self._process.poll() is None:
            return self._process
        self._process = subprocess.Popen(
            [sys.executable, "-m", "app.headless_search_worker"],
            cwd=str(Path(__file__).resolve().parents[1]),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            bufsize=1,
        )
        return self._process


class LocalHeadlessNewsSearcher:
    """Runs inside the helper process so Playwright owns its main event loop."""

    def __init__(self) -> None:
        self.settings = get_settings()
        self._playwright = None
        self._browser = None
        self._page = None

    def search(self, title: str, canonical_url: str | None = None) -> HeadlessSearchResult | None:
        if not self.settings.headless_search_enabled or not title.strip():
            return None
        page = self._ensure_page()
        timeout_ms = self.settings.headless_search_timeout_seconds * 1000
        query = f'"{title.strip()}"'
        page.goto(
            f"{self.settings.headless_search_url}?q={quote_plus(query)}",
            wait_until="domcontentloaded",
            timeout=timeout_ms,
        )
        results = page.locator("li.b_algo")
        result_count = min(results.count(), 5)
        best = None
        best_score = 0.0
        for index in range(result_count):
            result = results.nth(index)
            link = result.locator("h2 a")
            if link.count() != 1:
                continue
            result_title = strip_text(link.inner_text()) or ""
            href = link.get_attribute("href")
            snippet_locator = result.locator(".b_caption p")
            snippet = strip_text(snippet_locator.inner_text()) if snippet_locator.count() else None
            score = _title_similarity(title, result_title)
            if canonical_url and canonical_url in (href or ""):
                score += 1
            if score > best_score:
                image = result.locator("img")
                best = {
                    "title": result_title,
                    "href": href,
                    "summary": snippet,
                    "image_url": (
                        image.get_attribute("src")
                        or image.get_attribute("data-src")
                        if image.count()
                        else None
                    ),
                }
                best_score = score
        if not best or best_score < 0.35 or not best["href"]:
            return None

        target_url = _unwrap_bing_url(best["href"])
        try:
            page.goto(target_url, wait_until="domcontentloaded", timeout=timeout_ms)
            page.wait_for_timeout(500)
            rendered = page.evaluate(
                """() => {
                    const meta = (name) =>
                      document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.content || null;
                    const jsonScripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
                    let article = null;
                    for (const script of jsonScripts) {
                      try {
                        const parsed = JSON.parse(script.textContent || "null");
                        const queue = Array.isArray(parsed) ? parsed : [parsed];
                        for (const value of queue) {
                          const nodes = Array.isArray(value?.['@graph']) ? value['@graph'] : [value];
                          article = nodes.find((node) => {
                            const type = node?.['@type'];
                            const types = Array.isArray(type) ? type : [type];
                            return types.some((entry) => ['Article', 'NewsArticle', 'ReportageNewsArticle'].includes(entry));
                          }) || article;
                        }
                      } catch {}
                    }
                    const paragraphs = [...document.querySelectorAll('article p, main p')]
                      .map((node) => node.innerText.trim())
                      .filter((text) => text.length >= 40)
                      .slice(0, 80);
                    const imageValue = article?.image;
                    const image = typeof imageValue === 'string'
                      ? imageValue
                      : Array.isArray(imageValue)
                        ? (typeof imageValue[0] === 'string' ? imageValue[0] : imageValue[0]?.url)
                        : imageValue?.url || imageValue?.contentUrl;
                    return {
                      title: article?.headline || meta('og:title') || meta('twitter:title') || document.title,
                      summary: article?.description || meta('og:description') || meta('description'),
                      body: article?.articleBody || paragraphs.join('\\n\\n'),
                      image_url: image || meta('og:image') || meta('twitter:image'),
                      url: location.href,
                      published_at: article?.datePublished || meta('article:published_time') || null,
                      location_text: article?.contentLocation?.name || article?.locationCreated?.name || article?.dateline || null,
                    };
                }"""
            )
        except Exception:
            rendered = {}
        image_url = rendered.get("image_url") or best["image_url"]
        if not image_url:
            image_url = self._search_image(title)
        return HeadlessSearchResult(
            title=strip_text(rendered.get("title")) or best["title"],
            summary=strip_text(rendered.get("summary")) or best["summary"],
            body=strip_text(rendered.get("body")) or best["summary"],
            image_url=image_url,
            url=rendered.get("url") or target_url,
            published_at=rendered.get("published_at"),
            location_text=strip_text(rendered.get("location_text")),
        )

    def scrape_source(self, url: str, limit: int) -> list[HeadlessSearchResult]:
        page = self._ensure_page()
        timeout_ms = self.settings.headless_search_timeout_seconds * 1000
        page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
        page.wait_for_timeout(700)
        links = page.evaluate(
            """({limit}) => {
                const baseHost = location.hostname.replace(/^www\\./, '');
                const blocked = /\\b(login|sign-in|subscribe|privacy|terms|contact|about|advertis|weather|sports-scores|crossword|video|podcast)\\b/i;
                const datePath = /\\/(?:20\\d{2})\\/(?:0?[1-9]|1[0-2])\\//;
                const seen = new Set();
                return [...document.querySelectorAll('a[href]')]
                  .map((anchor) => {
                    let parsed;
                    try { parsed = new URL(anchor.href, location.href); } catch { return null; }
                    const text = (anchor.innerText || anchor.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ');
                    const path = parsed.pathname;
                    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
                    if (parsed.hostname.replace(/^www\\./, '') !== baseHost) return null;
                    if (text.length < 18 || text.length > 220 || blocked.test(text + ' ' + path)) return null;
                    if (path === '/' || path.split('/').filter(Boolean).length < 2) return null;
                    const canonical = parsed.origin + path.replace(/\\/$/, '');
                    if (seen.has(canonical)) return null;
                    seen.add(canonical);
                    let score = Math.min(text.length / 30, 4);
                    if (datePath.test(path)) score += 4;
                    if (/\\b(news|story|article|world|local|politics|business)\\b/i.test(path)) score += 2;
                    if (anchor.closest('article, [class*="story"], [class*="article"], main')) score += 2;
                    return {url: canonical, title: text, score};
                  })
                  .filter(Boolean)
                  .sort((left, right) => right.score - left.score)
                  .slice(0, Math.max(limit * 3, limit));
            }""",
            {"limit": limit},
        )
        results: list[HeadlessSearchResult] = []
        seen_urls: set[str] = set()
        for link in links:
            if len(results) >= limit:
                break
            article = self._extract_rendered_article(link["url"])
            if not article or not article.url or article.url in seen_urls:
                continue
            if not article.title:
                article.title = strip_text(link.get("title"))
            if not article.body and not article.summary:
                continue
            seen_urls.add(article.url)
            results.append(article)
        return results

    def close(self) -> None:
        if self._browser is not None:
            self._browser.close()
        if self._playwright is not None:
            self._playwright.stop()
        self._page = None
        self._browser = None
        self._playwright = None

    def _ensure_page(self):
        if self._page is not None:
            return self._page
        from playwright.sync_api import sync_playwright

        self._playwright = sync_playwright().start()
        executable = self.settings.headless_browser_executable or _find_browser_executable()
        launch_options = {
            "headless": True,
            "args": [
                "--disable-background-networking",
                "--disable-extensions",
                "--disable-gpu",
                "--disable-sync",
                "--no-first-run",
            ],
        }
        if executable:
            launch_options["executable_path"] = executable
        self._browser = self._playwright.chromium.launch(**launch_options)
        context = self._browser.new_context(
            user_agent=self.settings.user_agent,
            viewport={"width": 1100, "height": 720},
            java_script_enabled=True,
        )
        context.route(
            re.compile(r".*\.(?:woff2?|ttf|mp4|webm|avi|mov)(?:\?.*)?$", re.IGNORECASE),
            lambda route: route.abort(),
        )
        self._page = context.new_page()
        self._page.set_default_timeout(self.settings.headless_search_timeout_seconds * 1000)
        return self._page

    def _search_image(self, title: str) -> str | None:
        page = self._ensure_page()
        timeout_ms = self.settings.headless_search_timeout_seconds * 1000
        try:
            page.goto(
                f"https://www.bing.com/images/search?q={quote_plus(title)}",
                wait_until="domcontentloaded",
                timeout=timeout_ms,
            )
            cards = page.locator("a.iusc")
            if not cards.count():
                return None
            metadata = cards.nth(0).get_attribute("m")
            if not metadata:
                return None
            value = json.loads(metadata)
            return value.get("murl") or value.get("turl")
        except Exception:
            return None

    def _extract_rendered_article(self, url: str) -> HeadlessSearchResult | None:
        page = self._ensure_page()
        timeout_ms = self.settings.headless_search_timeout_seconds * 1000
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            page.wait_for_timeout(350)
            value = page.evaluate(
                """() => {
                    const meta = (name) =>
                      document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.content || null;
                    let article = null;
                    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
                      try {
                        const parsed = JSON.parse(script.textContent || 'null');
                        const roots = Array.isArray(parsed) ? parsed : [parsed];
                        for (const root of roots) {
                          const nodes = Array.isArray(root?.['@graph']) ? root['@graph'] : [root];
                          article = nodes.find((node) => {
                            const rawType = node?.['@type'];
                            const types = Array.isArray(rawType) ? rawType : [rawType];
                            return types.some((type) => ['Article','NewsArticle','ReportageNewsArticle'].includes(type));
                          }) || article;
                        }
                      } catch {}
                    }
                    const paragraphs = [...document.querySelectorAll('article p, main p')]
                      .map((node) => node.innerText.trim())
                      .filter((text) => text.length >= 40)
                      .slice(0, 80);
                    const imageValue = article?.image;
                    const image = typeof imageValue === 'string'
                      ? imageValue
                      : Array.isArray(imageValue)
                        ? (typeof imageValue[0] === 'string' ? imageValue[0] : imageValue[0]?.url)
                        : imageValue?.url || imageValue?.contentUrl;
                    return {
                      title: article?.headline || meta('og:title') || document.querySelector('h1')?.innerText || document.title,
                      summary: article?.description || meta('og:description') || meta('description'),
                      body: article?.articleBody || paragraphs.join('\\n\\n'),
                      image_url: image || meta('og:image') || meta('twitter:image'),
                      url: meta('og:url') || location.href,
                      published_at: article?.datePublished || meta('article:published_time') || null,
                      location_text: article?.contentLocation?.name || article?.locationCreated?.name || article?.dateline || null,
                    };
                }"""
            )
            return HeadlessSearchResult(
                title=strip_text(value.get("title")),
                summary=strip_text(value.get("summary")),
                body=strip_text(value.get("body")),
                image_url=value.get("image_url"),
                url=value.get("url") or url,
                published_at=value.get("published_at"),
                location_text=strip_text(value.get("location_text")),
            )
        except Exception:
            return None


def _find_browser_executable() -> str | None:
    candidates = [
        os.getenv("PROGRAMFILES", "") + r"\Google\Chrome\Application\chrome.exe",
        os.getenv("PROGRAMFILES(X86)", "") + r"\Microsoft\Edge\Application\msedge.exe",
        os.getenv("PROGRAMFILES", "") + r"\Microsoft\Edge\Application\msedge.exe",
    ]
    return next((str(Path(path)) for path in candidates if path and Path(path).is_file()), None)


def _unwrap_bing_url(url: str) -> str:
    parsed = urlparse(url)
    if "bing.com" not in (parsed.hostname or "").lower():
        return url
    encoded = parse_qs(parsed.query).get("u", [None])[0]
    if not encoded or not encoded.startswith("a1"):
        return url
    payload = encoded[2:]
    payload += "=" * (-len(payload) % 4)
    try:
        return base64.urlsafe_b64decode(payload).decode("utf-8")
    except (ValueError, UnicodeDecodeError):
        return url


def _title_similarity(left: str, right: str) -> float:
    stopwords = {"a", "an", "and", "at", "by", "for", "from", "in", "of", "on", "the", "to", "with"}
    left_tokens = {
        token for token in re.findall(r"[a-z0-9]+", left.lower()) if len(token) > 2 and token not in stopwords
    }
    right_tokens = {
        token for token in re.findall(r"[a-z0-9]+", right.lower()) if len(token) > 2 and token not in stopwords
    }
    if not left_tokens or not right_tokens:
        return 0.0
    return len(left_tokens & right_tokens) / len(left_tokens | right_tokens)
