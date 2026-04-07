import { z } from 'zod';
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { randomUUID } from 'crypto';

// ─── Zod Schemas ─────────────────────────────────────────

export const StageEnum = z.enum(['PROSPECT', 'LEAD', 'CLIENT', 'RETENTION', 'DORMANT']);
export type Stage = z.infer<typeof StageEnum>;

export const DealSchema = z.object({
  id: z.string(),
  companyName: z.string(),
  contactName: z.string().optional(),
  stage: StageEnum,
  lastActionDate: z.string(),          // YYYY-MM-DD
  nextActionDate: z.string().optional(),
  nextActionType: z.string().optional(),
  emailThreadId: z.string().optional(),
  notes: z.string().optional(),
});
export type Deal = z.infer<typeof DealSchema>;

export const PipelineSchema = z.object({
  version: z.literal(1),
  lastUpdated: z.string(),             // ISO 8601
  deals: z.array(DealSchema),
});
export type Pipeline = z.infer<typeof PipelineSchema>;

// ─── Default pipeline path ───────────────────────────────

const DEFAULT_PIPELINE_PATH = resolve(process.cwd(), 'state', 'pipeline.json');

// ─── Atomic Write (Pitfall 5 mitigation) ─────────────────

function atomicWrite(filePath: string, data: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const tmpPath = filePath + '.tmp';
  writeFileSync(tmpPath, data, 'utf-8');
  renameSync(tmpPath, filePath); // atomic on most filesystems
}

// ─── CRUD Functions ──────────────────────────────────────

/**
 * Load pipeline from JSON file with Zod validation.
 * Returns empty pipeline if file does not exist.
 * Throws ZodError or SyntaxError on corrupted/invalid data.
 */
export function loadPipeline(filePath: string = DEFAULT_PIPELINE_PATH): Pipeline {
  if (!existsSync(filePath)) {
    return {
      version: 1,
      lastUpdated: new Date().toISOString(),
      deals: [],
    };
  }

  const raw = readFileSync(filePath, 'utf-8');
  const json = JSON.parse(raw);
  return PipelineSchema.parse(json);
}

/**
 * Save pipeline to JSON file using atomic write pattern.
 * Validates data with Zod before saving.
 */
export function savePipeline(pipeline: Pipeline, filePath: string = DEFAULT_PIPELINE_PATH): void {
  // Validate before saving (T-01-07 mitigation)
  PipelineSchema.parse(pipeline);

  const data = JSON.stringify(pipeline, null, 2);
  atomicWrite(filePath, data);
}

/**
 * Add a new deal to the pipeline.
 * Generates UUID for the deal, saves pipeline, returns the new deal.
 */
export function addDeal(
  dealData: Omit<Deal, 'id'>,
  filePath: string = DEFAULT_PIPELINE_PATH
): Deal {
  const pipeline = loadPipeline(filePath);
  const deal: Deal = {
    id: randomUUID(),
    ...dealData,
  };

  // Validate the new deal
  DealSchema.parse(deal);

  pipeline.deals.push(deal);
  pipeline.lastUpdated = new Date().toISOString();
  savePipeline(pipeline, filePath);

  return deal;
}

/**
 * Update a deal's stage and set lastActionDate to today.
 * Throws if deal not found.
 */
export function updateDealStage(
  dealId: string,
  newStage: Stage,
  filePath: string = DEFAULT_PIPELINE_PATH
): Deal {
  const pipeline = loadPipeline(filePath);
  const dealIndex = pipeline.deals.findIndex((d) => d.id === dealId);

  if (dealIndex === -1) {
    throw new Error(`Deal not found: ${dealId}`);
  }

  const today = new Date().toISOString().split('T')[0];
  pipeline.deals[dealIndex].stage = newStage;
  pipeline.deals[dealIndex].lastActionDate = today;
  pipeline.lastUpdated = new Date().toISOString();

  savePipeline(pipeline, filePath);
  return pipeline.deals[dealIndex];
}

/**
 * Get a deal by ID.
 */
export function getDeal(
  dealId: string,
  filePath: string = DEFAULT_PIPELINE_PATH
): Deal | undefined {
  const pipeline = loadPipeline(filePath);
  return pipeline.deals.find((d) => d.id === dealId);
}

/**
 * Get a deal by company name.
 */
export function getDealByCompany(
  companyName: string,
  filePath: string = DEFAULT_PIPELINE_PATH
): Deal | undefined {
  const pipeline = loadPipeline(filePath);
  return pipeline.deals.find((d) => d.companyName === companyName);
}
