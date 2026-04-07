import type { createServiceQueries } from '../queries/services.js';

/**
 * A price mention extracted from email text.
 */
export interface PriceMention {
  amount: number;        // Amount in won (원)
  unit: string;          // e.g., "건당", "월", ""
  originalText: string;  // The original matched text
  serviceName?: string;  // Associated service name (inferred from proximity)
}

/**
 * Result of price validation against service DB.
 */
export interface PriceValidationResult {
  valid: boolean;
  mismatches: string[];
  warnings: string[];
}

/**
 * Extract price mentions from Korean text.
 * Supports formats: "650,000원", "300만원", "1.5억", "500만", "500원"
 *
 * @param text - Text to extract prices from
 * @returns Array of PriceMention objects with amounts in won (원)
 */
export function extractPricesFromText(text: string): PriceMention[] {
  const mentions: Array<PriceMention & { _position: number }> = [];

  // Pattern 1: 억 amounts (e.g., "1.5억", "2억")
  const eokPattern = /(\d+(?:\.\d+)?)\s*억/g;
  let match: RegExpExecArray | null;

  match = eokPattern.exec(text);
  while (match !== null) {
    const amount = parseFloat(match[1]) * 100000000;
    mentions.push({
      amount,
      unit: '',
      originalText: match[0],
      _position: match.index,
    });
    match = eokPattern.exec(text);
  }

  // Pattern 2: 만원 or 만 amounts (e.g., "300만원", "500만")
  const manPattern = /(\d+(?:\.\d+)?)\s*만\s*원?/g;

  match = manPattern.exec(text);
  while (match !== null) {
    const amount = parseFloat(match[1]) * 10000;
    mentions.push({
      amount,
      unit: '',
      originalText: match[0],
      _position: match.index,
    });
    match = manPattern.exec(text);
  }

  // Pattern 3: Comma-separated won amounts (e.g., "650,000원", "1,000,000원")
  const commaWonPattern = /(\d{1,3}(?:,\d{3})+)\s*원/g;

  match = commaWonPattern.exec(text);
  while (match !== null) {
    const amount = parseInt(match[1].replace(/,/g, ''), 10);
    mentions.push({
      amount,
      unit: '',
      originalText: match[0],
      _position: match.index,
    });
    match = commaWonPattern.exec(text);
  }

  // Pattern 4: Simple won amounts without commas (e.g., "500원")
  // Only match if not already captured by comma pattern
  const simpleWonPattern = /(?<!\d,)(?<!\d)(\d{1,6})\s*원/g;

  match = simpleWonPattern.exec(text);
  while (match !== null) {
    const amount = parseInt(match[1], 10);
    // Avoid duplicates from comma pattern
    const isDuplicate = mentions.some(m => m.originalText.includes(match![1] + '원') || m.originalText.includes(match![1] + ' 원'));
    if (!isDuplicate) {
      mentions.push({
        amount,
        unit: '',
        originalText: match[0],
        _position: match.index,
      });
    }
    match = simpleWonPattern.exec(text);
  }

  // Sort by position in original text and strip internal _position field
  mentions.sort((a, b) => a._position - b._position);
  return mentions.map(({ _position, ...rest }) => rest);
}

/**
 * Validate prices in email text against service DB.
 * Associates prices with nearby service names and compares against base prices.
 *
 * @param emailText - Email content containing prices
 * @param serviceQueries - Service query functions (DI)
 * @returns PriceValidationResult with mismatches if any
 */
export function validatePrices(
  emailText: string,
  serviceQueries: ReturnType<typeof createServiceQueries>,
): PriceValidationResult {
  const priceMentions = extractPricesFromText(emailText);
  const mismatches: string[] = [];
  const warnings: string[] = [];

  if (priceMentions.length === 0) {
    return { valid: true, mismatches: [], warnings: [] };
  }

  // Try to associate each price with a service by text proximity
  for (const mention of priceMentions) {
    // Find the service name closest to this price mention in the text
    const associatedService = findAssociatedService(emailText, mention.originalText, serviceQueries);

    if (associatedService) {
      mention.serviceName = associatedService.name;

      // Compare with DB base price
      if (associatedService.basePrice !== null && associatedService.basePrice !== undefined) {
        if (mention.amount !== associatedService.basePrice) {
          mismatches.push(
            `⚠️ 단가 확인 필요: ${associatedService.name} 이메일 ${mention.amount.toLocaleString()}원 vs DB ${associatedService.basePrice.toLocaleString()}원`
          );
        }
      }
    }
  }

  return {
    valid: mismatches.length === 0,
    mismatches,
    warnings,
  };
}

/**
 * Find a service name that appears near the given price text in the email.
 * Uses simple text proximity: looks for service names within a window around the price.
 */
function findAssociatedService(
  emailText: string,
  priceText: string,
  serviceQueries: ReturnType<typeof createServiceQueries>,
): { name: string; basePrice: number | null } | null {
  const priceIndex = emailText.indexOf(priceText);
  if (priceIndex === -1) return null;

  // Look in a window of 50 chars before the price
  const windowStart = Math.max(0, priceIndex - 50);
  const window = emailText.substring(windowStart, priceIndex + priceText.length);

  // Known service names to search for
  const knownServices = [
    '카페 바이럴', '커뮤니티 바이럴', '카페 모니터링',
    'meGA 드랍', 'Wave 드랍', 'UGC 인플루언서',
    '블로그 체험단', '인스타 채널 대행', '퍼포먼스 DA',
    '라이브 커머스', '유튜브 크리에이터', '트위터 체험단',
    'KOL/KOC', '웹예능 PPL', 'BTL', '수출바우처',
    'OSMU', '파워페이지 확산',
  ];

  for (const serviceName of knownServices) {
    if (window.includes(serviceName)) {
      const service = serviceQueries.getServiceByName(serviceName);
      if (service) {
        return { name: service.name, basePrice: service.basePrice };
      }
    }
  }

  return null;
}
