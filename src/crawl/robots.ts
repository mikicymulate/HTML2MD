/**
 * A small, dependency-free `robots.txt` parser and matcher.
 *
 * It implements the widely-supported subset of the Robots Exclusion Protocol: grouped
 * `User-agent` blocks, `Allow`/`Disallow` rules, `*` wildcards, and `$` end-anchors, with
 * longest-match-wins and Allow winning ties. It deliberately ignores `Crawl-delay`,
 * `Sitemap`, and other non-path directives.
 *
 * The crawler fails *open*: a missing, unreachable, or unparseable robots.txt allows all.
 */

interface Rule {
  allow: boolean;
  path: string;
}

interface Group {
  agents: string[];
  rules: Rule[];
}

export interface RobotsRules {
  /** Whether `pathAndQuery` (e.g. "/docs?x=1") may be fetched by the crawler's user-agent. */
  isAllowed(pathAndQuery: string): boolean;
}

/** A permissive ruleset that allows every path. */
export const ALLOW_ALL: RobotsRules = { isAllowed: () => true };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Translate a robots path pattern (`*` wildcard, trailing `$` anchor) into a `RegExp`. */
function patternToRegExp(pattern: string): RegExp {
  let anchored: boolean = false;
  let body: string = pattern;
  if (body.endsWith('$')) {
    anchored = true;
    body = body.slice(0, -1);
  }
  const source: string = body.split('*').map(escapeRegExp).join('.*');
  return new RegExp('^' + source + (anchored ? '$' : ''));
}

/**
 * Parse robots.txt text and return a matcher scoped to `userAgent`. The most specific
 * matching `User-agent` group wins (a named token beats `*`); if none match, everything is
 * allowed.
 */
export function parseRobots(txt: string, userAgent: string): RobotsRules {
  const groups: Group[] = [];
  let current: Group | null = null;
  // True while we are still inside a group's `User-agent` block (before its first rule).
  let collectingAgents: boolean = false;

  for (const rawLine of txt.split(/\r?\n/)) {
    const line: string = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const colon: number = line.indexOf(':');
    if (colon === -1) continue;
    const field: string = line.slice(0, colon).trim().toLowerCase();
    const value: string = line.slice(colon + 1).trim();

    if (field === 'user-agent') {
      if (!current || !collectingAgents) {
        current = { agents: [], rules: [] };
        groups.push(current);
        collectingAgents = true;
      }
      current.agents.push(value.toLowerCase());
    } else if (field === 'allow' || field === 'disallow') {
      if (!current) {
        current = { agents: ['*'], rules: [] };
        groups.push(current);
      }
      collectingAgents = false;
      current.rules.push({ allow: field === 'allow', path: value });
    }
    // Other directives (crawl-delay, sitemap, host, …) are ignored.
  }

  // Pick the most specific applicable group. A named token that our UA contains beats `*`.
  const ua: string = userAgent.toLowerCase();
  let best: Group | null = null;
  let bestScore: number = -1;
  for (const group of groups) {
    for (const token of group.agents) {
      let score: number = -1;
      if (token === '*') score = 0;
      else if (token && ua.includes(token)) score = token.length;
      if (score > bestScore) {
        bestScore = score;
        best = group;
      }
    }
  }

  if (!best || best.rules.length === 0) return ALLOW_ALL;

  const compiled: Array<{ allow: boolean; length: number; re: RegExp }> = best.rules
    // An empty `Disallow:` imposes no constraint; drop empty paths entirely.
    .filter((r) => r.path !== '')
    .map((r) => ({ allow: r.allow, length: r.path.length, re: patternToRegExp(r.path) }));

  return {
    isAllowed(pathAndQuery: string): boolean {
      let matchAllow: boolean = true;
      let matchLength: number = -1;
      for (const rule of compiled) {
        if (!rule.re.test(pathAndQuery)) continue;
        // Longest match wins; on a tie, Allow wins.
        if (rule.length > matchLength || (rule.length === matchLength && rule.allow)) {
          matchLength = rule.length;
          matchAllow = rule.allow;
        }
      }
      return matchLength === -1 ? true : matchAllow;
    },
  };
}

/**
 * Fetch and parse `<origin>/robots.txt`. Any network error, non-OK status, or timeout
 * resolves to {@link ALLOW_ALL} (fail open).
 */
export async function fetchRobots(
  origin: string,
  userAgent: string,
  timeoutMs: number,
): Promise<RobotsRules> {
  try {
    const res: Response = await fetch(new URL('/robots.txt', origin), {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': userAgent },
    });
    if (!res.ok) return ALLOW_ALL;
    return parseRobots(await res.text(), userAgent);
  } catch {
    return ALLOW_ALL;
  }
}
