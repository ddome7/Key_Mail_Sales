/**
 * Market research result types with Zod schema validation.
 * Used by the research pipeline to structure company investigation results.
 */

import { z } from 'zod';

export const MarketResearchResultSchema = z.object({
  companyName: z.string(),
  verified: z.boolean(),
  industry: z.string().optional(),
  mainProducts: z.array(z.string()),
  companySize: z.string().optional(),
  marketingActivity: z.object({
    instagram: z.string().optional(),
    blog: z.string().optional(),
    youtube: z.string().optional(),
    advertising: z.string().optional(),
    other: z.string().optional(),
  }),
  websiteUrl: z.string().optional(),
  recentNews: z.array(z.string()).optional(),
  rawNotes: z.string(),
  researchedAt: z.string(),
});

export type MarketResearchResult = z.infer<typeof MarketResearchResultSchema>;
