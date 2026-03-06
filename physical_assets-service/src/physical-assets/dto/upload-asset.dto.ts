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
}
