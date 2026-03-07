// Fields parsed from multipart/form-data.
// All text fields arrive as strings — numeric fields are parsed in the service.
export class UploadAssetDto {
  candidate_name: string;
  asset_type: string;
  location?: string;
  source?: string;
  uploaded_by?: string;
  // Sent as strings from multipart form-data
  location_lat?: string;
  location_lng?: string;
  /** AI-estimated cost override from the bot. If provided, skips COST_TABLE lookup. */
  estimated_cost?: string;
  /** For rallies: approximate date/time of the event. */
  event_date?: string;
  /** Full AI analysis JSON serialised as a string — stored in physical_assets.ai_analysis. */
  ai_analysis?: string;
  /** AI confidence in the estimate 0.0–1.0, serialised as a string from multipart. */
  confidence_score?: string;
}
