import type {
  CandidateListItem,
  CandidateSummary,
  DigitalSpendResponse,
  DonorsResponse,
  PhysicalAssetsResponse,
} from '../types';

const BASE = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api/v1`
  : '/api/v1';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  getCandidates:     ()   => get<CandidateListItem[]>('/candidates'),
  getCandidateSummary: (id: number) => get<CandidateSummary>(`/candidates/${id}/summary`),
  getDigitalSpend:   (id: number) => get<DigitalSpendResponse>(`/digital/${id}`),
  getDonors:         (id: number) => get<DonorsResponse>(`/donors/${id}`),
  getPhysicalAssets: (id: number) => get<PhysicalAssetsResponse>(`/physical/${id}`),
};
