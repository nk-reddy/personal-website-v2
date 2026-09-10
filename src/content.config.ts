import { defineCollection, z } from "astro:content";
import { file } from "astro/loaders";

const reading = defineCollection({
  loader: file("./src/content/reading.yaml"),
  schema: z.object({
    planned: z.array(z.object({ title: z.string(), author: z.string().optional(), url: z.string().url().optional() })).default([]),
    inProgress: z.array(z.object({ title: z.string(), author: z.string().optional(), url: z.string().url().optional() })).default([]),
    read: z.array(z.object({ title: z.string(), author: z.string().optional(), year: z.number().int(), url: z.string().url().optional() })).default([])
  })
});

export const collections = { reading };
