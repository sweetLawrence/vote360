export type RiskLevel = 'GREEN' | 'AMBER' | 'RED';

export interface CandidateListItem {
  id: number;
  name: string;
  party: string;
  position: string;
  constituency: string;
  integrity: {
    score: number;
    risk_level: RiskLevel;
    risk_label: string;
  };
  financial_summary: {
    total_physical_spend: number;
    total_digital_spend: number;
    total_estimated_spend: number;
    total_reported_income: number;
    spending_gap: number;
    spending_gap_ratio: number | null;
  };
  updated_at: string;
}

export interface CandidateSummary {
  candidate: {
    id: number;
    name: string;
    party: string;
    position: string;
    constituency: string;
  };
  integrity: {
    score: number;
    risk_level: RiskLevel;
    classification: string;
  };
  financial_summary: {
    total_physical_spend: number;
    total_digital_spend: number;
    total_estimated_spend: number;
    total_reported_income: number;
    spending_gap: number;
    spending_gap_ratio: number | null;
    unreported_percentage: number;
  };
  donor_risk: {
    avg_donor_risk: number;
  };
  updated_at: string;
}

export interface DigitalSpendResponse {
  candidate_id: number;
  total_spend: number;
  platforms: Record<string, number>;
  records: DigitalRecord[];
}

export interface DigitalRecord {
  id: number;
  platform: string;
  spend_amount: number;
  period_start: string;
  period_end: string;
  created_at: string;
}

export interface DonorsResponse {
  candidate_id: number;
  donors: Donor[];
  risk_summary: Record<string, number>;
}

export interface Donor {
  id: number;
  donor_name: string;
  donation_amount: number;
  risk_score: 'HIGH' | 'MEDIUM' | 'LOW';
  donation_percentage: number;
  company_age_days: number | null;
  registration_date: string | null;
  created_at: string;
}

export interface PhysicalAssetsResponse {
  candidate_id: number;
  total_estimated_spend: number;
  asset_count: number;
  assets: PhysicalAsset[];
}

export interface PhysicalAsset {
  id: number;
  asset_type: string;
  image_url: string | null;
  estimated_cost: number;
  region: string;
  confidence_score: number | null;
  ai_analysis: { reasoning?: string; crowd_estimate?: number } | null;
  location_lat: number | null;
  location_lng: number | null;
  created_at: string;
}
