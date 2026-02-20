import asyncio
import logging
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup
from markdownify import markdownify as md
from playwright.async_api import async_playwright

logger = logging.getLogger(__name__)


@dataclass
class ScrapeResult:
    url: str
    markdown: str
    child_urls: list[str] = field(default_factory=list)
    error: str | None = None


async def scrape_page(url: str) -> ScrapeResult:
    """Scrape a single page and return its content as Markdown."""
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                )
            )
            page = await context.new_page()

            await page.goto(url, wait_until="networkidle", timeout=30000)
            html = await page.content()
            await browser.close()

        soup = BeautifulSoup(html, "html.parser")

        # Remove noise: nav, footer, scripts, styles
        for tag in soup(["script", "style", "nav", "footer", "aside"]):
            tag.decompose()

        # Try to find the main content area
        main = (
            soup.find("main")
            or soup.find("article")
            or soup.find(id="content")
            or soup.find(class_="content")
            or soup.body
        )

        raw_html = str(main) if main else str(soup)

        # Convert to Markdown (much cheaper for LLM tokens)
        markdown = md(raw_html, heading_style="ATX", bullets="-")

        # Extract internal links for recursive scraping
        base_domain = urlparse(url).netloc
        child_urls = []
        for a in soup.find_all("a", href=True):
            href = urljoin(url, a["href"])
            parsed = urlparse(href)
            # Only follow links on the same domain, ignore anchors
            if parsed.netloc == base_domain and parsed.fragment == "":
                clean = href.split("?")[0]  # strip query params
                if clean != url and clean not in child_urls:
                    child_urls.append(clean)

        logger.info(f"Scraped {url}: {len(markdown)} chars, {len(child_urls)} links found")
        return ScrapeResult(url=url, markdown=markdown, child_urls=child_urls)

    except Exception as e:
        logger.error(f"Failed to scrape {url}: {e}")
        return ScrapeResult(url=url, markdown="", error=str(e))


async def scrape_docs(base_url: str, max_pages: int = 10) -> list[ScrapeResult]:
    """
    Recursively scrape documentation pages up to max_pages.
    Uses BFS (breadth-first) to prioritize top-level pages.
    """
    visited = set()
    queue = [base_url]
    results = []

    while queue and len(visited) < max_pages:
        # Process up to 3 pages concurrently
        batch = queue[:3]
        queue = queue[3:]

        tasks = [scrape_page(url) for url in batch if url not in visited]
        batch_results = await asyncio.gather(*tasks)

        for result in batch_results:
            visited.add(result.url)
            if not result.error:
                results.append(result)
                # Add new child URLs to queue
                for child in result.child_urls:
                    if child not in visited and child not in queue:
                        queue.append(child)

    logger.info(f"Scraping complete: {len(results)} pages scraped")
    return results