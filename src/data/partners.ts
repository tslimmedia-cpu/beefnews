/**
 * Partner RSS feed registry.
 * Add new partners here — they'll appear in "Beef News Reads" automatically.
 */
export interface Partner {
  /** Display name of the writer / outlet */
  name: string;
  /** Short tagline shown on their card */
  tagline: string;
  /** Their site URL (for "Visit →" link) */
  site: string;
  /** RSS feed URL */
  feed: string;
  /** How many latest posts to pull */
  limit?: number;
}

export const PARTNERS: Partner[] = [
  {
    name: "Mike Callicrate",
    tagline: "No-Bull Food News — Rancher's Advocate. People's Advocate.",
    site: "https://nobull.mikecallicrate.com",
    feed: "https://nobull.mikecallicrate.com/feed/",
    limit: 2,
  },
  {
    name: "Trent Loos",
    tagline: "Loos Lips — Food Security, Community Building.",
    site: "https://trentloos.substack.com",
    feed: "https://trentloos.substack.com/feed",
    limit: 2,
  },
  {
    name: "Breeauna Sagdal",
    tagline: "Policy Journalist — The Midwesterner.",
    site: "https://midwesterner.substack.com",
    feed: "https://midwesterner.substack.com/feed",
    limit: 2,
  },
];
