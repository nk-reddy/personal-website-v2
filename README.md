used codex to make personal website

# Personal Website

An Astro site hosted on Vercel. Writing is mirrored from [Nikhil Reddy on Substack](https://reddynk.substack.com/); Substack is the only publishing interface.

## Publish an article

Write and publish in Substack. The Writing pages and `/rss.xml` read Substack's public feed directly and cache the result for up to 15 minutes. No local Markdown file, commit, or Vercel deployment is needed for a new article.

## Update reading

Edit `src/content/reading.yaml`. Each item is a title with optional author, URL, and (for finished books) year. The reading page groups completed books by year.

## Develop locally

```sh
npm install
npm run dev
```

Run `npm run build` before pushing when you want to verify the production build.
