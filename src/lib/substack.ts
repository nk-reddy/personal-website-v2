import { XMLParser } from "fast-xml-parser";
import sanitizeHtml from "sanitize-html";

const FEED_URL = "https://reddynk.substack.com/feed";

export type SubstackPost = {
  title: string;
  description: string;
  link: string;
  slug: string;
  publishedAt: Date;
  content: string;
  image?: string;
};

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function postSlug(link: string): string {
  return new URL(link).pathname.split("/").filter(Boolean).at(-1) ?? "";
}

function cleanContent(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "strong", "em", "b", "i", "a", "img", "figure", "figcaption", "pre", "code", "hr", "table", "thead", "tbody", "tr", "th", "td", "sup", "sub"],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "width", "height"],
      th: ["colspan", "rowspan"],
      td: ["colspan", "rowspan"]
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" })
    }
  });
}

export async function getSubstackPosts(): Promise<SubstackPost[]> {
  const response = await fetch(FEED_URL);
  if (!response.ok) throw new Error(`Substack feed returned ${response.status}`);

  const feed = new XMLParser({ ignoreAttributes: false }).parse(await response.text());
  const items = feed?.rss?.channel?.item;
  const rawPosts = Array.isArray(items) ? items : items ? [items] : [];

  return rawPosts.map((item: Record<string, unknown>) => {
    const link = asText(item.link);
    const enclosure = item.enclosure as Record<string, unknown> | undefined;
    return {
      title: asText(item.title),
      description: asText(item.description),
      link,
      slug: postSlug(link),
      publishedAt: new Date(asText(item.pubDate)),
      content: cleanContent(asText(item["content:encoded"])),
      image: typeof enclosure?.["@_url"] === "string" ? enclosure["@_url"] : undefined
    };
  }).filter((post) => post.slug && post.title && !Number.isNaN(post.publishedAt.valueOf()));
}

export function cacheFor(Astro: { response: { headers: Headers } }): void {
  Astro.response.headers.set("Cache-Control", "public, s-maxage=900, stale-while-revalidate=86400");
}
