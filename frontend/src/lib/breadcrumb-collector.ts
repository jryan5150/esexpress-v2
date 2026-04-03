// frontend/src/lib/breadcrumb-collector.ts

interface BreadcrumbEntry {
  type: "navigation" | "click" | "scroll";
  timestamp: string;
  url: string;
  [key: string]: unknown;
}

interface SessionSummary {
  pageCount: number;
  totalDuration: number;
  pagesVisited: string[];
}

const MAX_BREADCRUMBS = 50;

class BreadcrumbCollector {
  private breadcrumbs: BreadcrumbEntry[] = [];
  private pageCount = 0;
  private startTime = Date.now();
  private pagesVisited = new Set<string>();
  private lastUrl: string | null = null;
  private maxScroll = 0;
  private bound = false;

  init(): void {
    if (this.bound) return;
    this.bound = true;
    document.addEventListener("click", this.handleClick, {
      capture: true,
      passive: true,
    });
    window.addEventListener("scroll", this.handleScroll, { passive: true });
    this.trackNavigation(window.location.pathname);
  }

  destroy(): void {
    if (!this.bound) return;
    this.bound = false;
    document.removeEventListener("click", this.handleClick, {
      capture: true,
    } as EventListenerOptions);
    window.removeEventListener("scroll", this.handleScroll);
  }

  trackRouteChange(pathname: string): void {
    if (this.maxScroll > 0 && this.lastUrl) {
      this.push({
        type: "scroll",
        url: this.lastUrl,
        scrollDepth: this.maxScroll,
      });
    }
    this.maxScroll = 0;
    this.trackNavigation(pathname);
  }

  private trackNavigation(pathname: string): void {
    this.pageCount++;
    this.pagesVisited.add(pathname);
    this.lastUrl = pathname;
    this.push({ type: "navigation", url: pathname });
  }

  private handleClick = (e: MouseEvent): void => {
    const el = (e.target as HTMLElement).closest<HTMLElement>(
      'button, a, [role="button"], [data-click-track]',
    );
    if (!el) return;

    const label =
      el.getAttribute("aria-label") ||
      el.textContent?.trim().slice(0, 80) ||
      el.tagName.toLowerCase();

    this.push({
      type: "click",
      target: el.tagName.toLowerCase(),
      label,
      url: window.location.pathname,
    });
  };

  private handleScroll = (): void => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const docHeight = Math.max(
      document.documentElement.scrollHeight - window.innerHeight,
      1,
    );
    const depth = Math.min(Math.round((scrollTop / docHeight) * 100), 100);
    if (depth > this.maxScroll) this.maxScroll = depth;
  };

  private push(entry: Omit<BreadcrumbEntry, "timestamp">): void {
    this.breadcrumbs.push({
      ...entry,
      timestamp: new Date().toISOString(),
    } as BreadcrumbEntry);
    if (this.breadcrumbs.length > MAX_BREADCRUMBS) {
      this.breadcrumbs.shift();
    }
  }

  getBreadcrumbs(n = MAX_BREADCRUMBS): BreadcrumbEntry[] {
    return this.breadcrumbs.slice(-n);
  }

  getSessionSummary(): SessionSummary {
    return {
      pageCount: this.pageCount,
      totalDuration: Math.round((Date.now() - this.startTime) / 1000),
      pagesVisited: [...this.pagesVisited],
    };
  }
}

const collector = new BreadcrumbCollector();
export default collector;
