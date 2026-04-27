/** Convert a category display name to a URL-safe slug. */
export function categorySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, "")        // smart apostrophes
    .replace(/[^a-z0-9]+/g, "-") // non-alphanumeric → dash
    .replace(/^-+|-+$/g, "");    // trim leading/trailing dashes
}

/** Reverse: given all known categories, find the one matching a slug. */
export function slugToCategory(slug: string, all: string[]): string | undefined {
  return all.find((c) => categorySlug(c) === slug);
}

// Icon map for the category grid on the homepage
export const CATEGORY_ICONS: Record<string, string> = {
  "Business":                             "trending_up",
  "Farm Policy":                          "gavel",
  "Cowboy Talk":                          "record_voice_over",
  "Beef Maps":                            "map",
  "I Am Texas Slim Foundation 501(c)(3)": "volunteer_activism",
  "Health":                               "favorite",
  "Culture":                              "theater_comedy",
  "Texas Slim's Community Newsletter":    "mail",
  "Video":                                "play_circle",
  "Climate":                              "eco",
  "News":                                 "newspaper",
  "JBS":                                  "warning",
  "Events":                               "event",
  "Hurricane Helene":                     "storm",
  "Beef News Radar":                      "rss_feed",
};
