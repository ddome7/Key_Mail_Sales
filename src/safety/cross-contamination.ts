import type { createClientQueries } from '../queries/clients.js';

/**
 * Client context for email composition.
 * Contains only the target client's data -- never multiple clients.
 */
export interface ClientContext {
  clientId: number;
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  industry: string | null;
  budgetTier: number | null;
  preferredServices: string[] | null;
  communicationStyle: string | null;
  notes: string | null;
  stage: string | null;
}

/**
 * Result of cross-contamination validation.
 */
export interface ContaminationResult {
  safe: boolean;
  contaminations: string[];
}

/**
 * Load context for a single client.
 * Returns null if client not found.
 *
 * IMPORTANT: This function structurally prevents cross-contamination
 * by only loading one client's data via the single-client query pattern (D-04).
 */
export function loadClientContext(
  companyName: string,
  clientQueries: ReturnType<typeof createClientQueries>,
): ClientContext | null {
  const client = clientQueries.getClient(companyName);
  if (!client) return null;

  return {
    clientId: client.id,
    companyName: client.companyName,
    contactName: client.contactName,
    contactEmail: client.contactEmail,
    contactPhone: client.contactPhone,
    industry: client.industry,
    budgetTier: client.budgetTier,
    preferredServices: client.preferredServices,
    communicationStyle: client.communicationStyle,
    notes: client.notes,
    stage: client.stage,
  };
}

/**
 * Validate that email text does not contain references to other companies.
 *
 * @param emailText - The email content to check
 * @param targetCompany - The intended recipient company
 * @param allKnownCompanies - List of all known company names (passed by caller)
 * @returns ContaminationResult with safe=false if other companies are mentioned
 */
export function validateNoContamination(
  emailText: string,
  targetCompany: string,
  allKnownCompanies: string[],
): ContaminationResult {
  const contaminations: string[] = [];

  for (const company of allKnownCompanies) {
    // Skip the target company -- it's expected to be in the email
    if (company === targetCompany) continue;

    // Check if this other company's name appears in the email
    if (emailText.includes(company)) {
      contaminations.push(company);
    }
  }

  return {
    safe: contaminations.length === 0,
    contaminations,
  };
}
