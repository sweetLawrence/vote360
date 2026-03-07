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

// ── CBD-tier: Nairobi prime commercial + major city CBDs ──────────────────────
// High-density commercial zones where campaign costs are highest.
const CBD_PATTERN = new RegExp(
  [
    // Explicit CBD references
    '\\bcbd\\b', 'city cent(re|er)', 'central business',
    // Nairobi prime/upmarket zones
    'upper.?hill', 'westlands', 'kilimani', 'parklands', 'gigiri',
    'lavington', 'hurlingham', 'adams arcade', 'yaya', 'prestige',
    'riverside', 'museum hill', 'hill.?top', 'hill.?crest',
    'nairobi cent', 'nairobi cbd', 'nairobi city',
    // Major city CBDs
    'mombasa cbd', 'mombasa cent', 'kisumu cbd', 'kisumu cent',
    'nakuru cbd', 'nakuru cent', 'eldoret cbd', 'eldoret cent',
  ].join('|'),
  'i',
);

// ── Town-tier: county/sub-county HQs and major urban areas ───────────────────
// Substantial urban areas outside prime CBD zones.
const TOWN_PATTERN = new RegExp(
  [
    // Nairobi — suburbs, estates, satellites (not CBD-tier)
    'nairobi', 'kasarani', 'embakasi', 'langata', 'lang.?ata',
    'dagoretti', 'ruaraka', 'kibra', 'mathare', 'starehe', 'kamkunji',
    'makadara', 'eastleigh', 'buruburu', 'donholm', 'umoja', 'kayole',
    'komarock', 'githurai', 'roysambu', 'zimmerman', 'kahawa',
    'kawangware', 'kangemi', 'kabete', 'kikuyu', 'rongai', 'ngong',
    'athi.?river', 'kitengela', 'syokimau', 'mlolongo', 'ruiru', 'juja',
    'thika', 'gatundu', 'kiambu', 'limuru', 'tigoni',
    // Coast
    'mombasa', 'malindi', 'kilifi', 'kwale', 'diani', 'nyali',
    'bamburi', 'shanzu', 'likoni', 'voi', 'taveta', 'mariakani',
    'ukunda', 'msambweni', 'shimba', 'lamu',
    // Rift Valley
    'nakuru', 'naivasha', 'gilgil', 'molo', 'njoro', 'subukia',
    'eldoret', 'eldama', 'iten', 'kapenguria', 'kitale', 'webuye',
    'eldas', 'kabarnet', 'marigat', 'ravine', 'bahati', 'ol.?kalou',
    'kinangop', 'nyahururu', 'rumuruti', 'nanyuki', 'nyeri',
    // Western
    'kakamega', 'mumias', 'butere', 'khwisero', 'ikolomani',
    'vihiga', 'hamisi', 'sabatia', 'emuhaya', 'mbale',
    'bungoma', 'kimilili', 'mount elgon',
    // Nyanza
    'kisumu', 'siaya', 'bondo', 'ugenya', 'gem', 'nyando',
    'homa.?bay', 'homabay', 'ndhiwa', 'mbita', 'suba', 'oyugis',
    'migori', 'rongo', 'awendo', 'suna', 'uriri',
    'kisii', 'nyamira', 'ogembo', 'keroka', 'gucha', 'manga',
    // Eastern
    'meru', 'nkubu', 'chuka', 'maara', 'imenti', 'tigania',
    'embu', 'runyenjes', 'mbeere', 'siakago',
    'kitui', 'mwingi', 'mutomo', 'zombe', 'ikutha',
    'machakos', 'kathiani', 'mavoko', 'yatta', 'masinga',
    'makueni', 'wote', 'kibwezi', 'makindu', 'mtito',
    // North Eastern
    'garissa', 'dadaab', 'fafi', 'ijara',
    'wajir', 'habaswein', 'tarbaj',
    'mandera', 'banissa', 'lafey',
    // Central
    'muranga', 'murang.?a', 'kangema', 'mathioya', 'kigumo', 'kandara',
    'kirinyaga', 'kerugoya', 'sagana', 'mwea', 'gichugu',
    'nyandarua', 'ol.?joro', 'ndaragwa',
    // Isiolo / Marsabit / Samburu / Turkana / Pokot
    'isiolo', 'merti', 'garbatula',
    'marsabit', 'moyale', 'north horr', 'saku', 'laisamis',
    'samburu', 'maralal', 'wamba', 'baragoi',
    'lodwar', 'turkana', 'loima', 'kakuma', 'lokichogio',
    'kapenguria', 'pokot', 'sigor',
    // Kajiado
    'kajiado', 'loitoktok', 'magadi', 'mashuru', 'namanga',
    // Town keyword catch-all
    '\\btown\\b', 'township', 'market cent',
  ].join('|'),
  'i',
);

/**
 * Classify a free-text Kenyan location string into CBD / Town / Rural.
 *
 * CBD   → Nairobi prime commercial + major city CBDs (highest costs)
 * Town  → County/sub-county HQs and substantial urban areas
 * Rural → Villages, wards, rural constituencies and unrecognised locations
 *
 * If no location is provided the default is Town (mid-tier neutral).
 */
export function deriveRegion(location: string | undefined): Region {
  if (!location) return 'Town';
  if (CBD_PATTERN.test(location)) return 'CBD';
  if (TOWN_PATTERN.test(location)) return 'Town';
  return 'Rural';
}
