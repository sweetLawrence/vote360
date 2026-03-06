// Hardcoded estimated costs (KES) per asset type and region.
// These are the values written to physical_assets.estimated_cost,
// which the Reconciliation Engine sums to compute total_physical_spend.

export type AssetType = 'billboard' | 'rally' | 'chopper' | 'convoy';
export type Region = 'CBD' | 'Town' | 'Rural';

const COST_TABLE: Record<AssetType, Record<Region, number>> = {
  billboard: { CBD: 500_000,   Town: 150_000,   Rural: 80_000   },
  rally:     { CBD: 3_000_000, Town: 1_500_000,  Rural: 800_000  },
  chopper:   { CBD: 250_000,   Town: 250_000,    Rural: 250_000  },
  convoy:    { CBD: 120_000,   Town: 120_000,    Rural: 120_000  },
};

export const VALID_ASSET_TYPES: AssetType[] = ['billboard', 'rally', 'chopper', 'convoy'];

export function getEstimatedCost(assetType: AssetType, region: Region): number {
  return COST_TABLE[assetType][region];
}

// Derive region from a free-text location string.
// CBD → CBD, anything with "town" → Town, everything else → Rural.
// If no location provided, default to Town.
export function deriveRegion(location: string | undefined): Region {
  if (!location) return 'Town';
  if (/cbd/i.test(location)) return 'CBD';
  if (/town/i.test(location)) return 'Town';
  return 'Rural';
}
