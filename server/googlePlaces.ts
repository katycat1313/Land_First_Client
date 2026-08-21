const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const MAX_SIGNAL_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export const LOCAL_BUSINESS_CATEGORIES = [
  "HVAC contractor",
  "plumber",
  "roofer",
  "landscaper",
  "electrician",
  "real estate agency",
  "property management company",
  "marketing agency",
  "recruiting agency"
] as const;

const COMPLAINT_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "missed or unanswered calls", pattern: /didn'?t answer|never answer|unanswered call|no one answered|voicemail|couldn'?t reach/i },
  { label: "slow response or follow-up", pattern: /slow to respond|no response|never responded|didn'?t respond|follow[- ]?up|called back|reply/i },
  { label: "scheduling friction", pattern: /schedul|appointment|reschedul|no[- ]?show|late arrival/i },
  { label: "quote or estimate delays", pattern: /quote|estimate|proposal|pricing.*wait|wait.*pricing/i },
  { label: "communication breakdown", pattern: /communication|kept me informed|never heard|left .* message/i }
];

type PlacesScanInput = {
  location: string;
  category: string;
  maxResults?: number;
};

export type LocalBusinessSignal = {
  placeId: string;
  name: string;
  category: string;
  address: string;
  mapsUrl: string;
  websiteUrl: string | null;
  phone: string | null;
  rating: number | null;
  reviewCount: number;
  photoCount: number;
  hasHours: boolean;
  opportunityScore: number;
  reasons: string[];
  recentEvidence: Array<{
    text: string;
    publishedAt: string;
    authorName: string;
    authorUri: string | null;
    signals: string[];
  }>;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export async function scanGooglePlaces(input: PlacesScanInput): Promise<LocalBusinessSignal[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API;
  if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY is not configured.");

  const location = String(input.location || "").trim();
  const category = String(input.category || "").trim();
  if (location.length < 2) throw new Error("A city, state, or service area is required.");
  if (!LOCAL_BUSINESS_CATEGORIES.includes(category as any)) throw new Error("Choose an approved small-business category.");

  const maxResultCount = clamp(Number(input.maxResults) || 10, 1, 20);
  const response = await fetch(PLACES_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.googleMapsUri",
        "places.websiteUri",
        "places.nationalPhoneNumber",
        "places.rating",
        "places.userRatingCount",
        "places.photos",
        "places.regularOpeningHours",
        "places.reviews",
        "places.businessStatus",
        "places.primaryTypeDisplayName"
      ].join(",")
    },
    body: JSON.stringify({
      textQuery: `${category} in ${location}`,
      maxResultCount,
      languageCode: "en",
      regionCode: "US"
    })
  });

  const body = await response.text();
  if (!response.ok) throw new Error(`Google Places error (${response.status}): ${body.slice(0, 500)}`);
  const data = JSON.parse(body);
  const cutoff = Date.now() - MAX_SIGNAL_AGE_MS;

  return (Array.isArray(data.places) ? data.places : [])
    .filter((place: any) => place.businessStatus === "OPERATIONAL")
    .map((place: any): LocalBusinessSignal => {
      const recentEvidence = (Array.isArray(place.reviews) ? place.reviews : [])
        .filter((review: any) => {
          const published = Date.parse(review.publishTime || "");
          return Number.isFinite(published) && published >= cutoff && published <= Date.now();
        })
        .map((review: any) => {
          const text = String(review.originalText?.text || review.text?.text || "").trim();
          const signals = COMPLAINT_PATTERNS.filter(item => item.pattern.test(text)).map(item => item.label);
          return {
            text,
            publishedAt: review.publishTime,
            authorName: review.authorAttribution?.displayName || "Google reviewer",
            authorUri: review.authorAttribution?.uri || null,
            signals
          };
        })
        .filter((review: any) => review.text && review.signals.length > 0);

      const photoCount = Array.isArray(place.photos) ? place.photos.length : 0;
      const reviewCount = Number(place.userRatingCount) || 0;
      const reasons: string[] = [];
      let score = 20;
      if (!place.websiteUri) { reasons.push("No website listed"); score += 18; }
      if (!place.nationalPhoneNumber) { reasons.push("No phone number listed"); score += 8; }
      if (!place.regularOpeningHours?.periods?.length) { reasons.push("No detailed business hours"); score += 10; }
      if (photoCount <= 2) { reasons.push(`${photoCount} useful profile photos returned`); score += 12; }
      if (recentEvidence.length > 0) { reasons.push(`${recentEvidence.length} relevant complaint signal within 14 days`); score += 28; }
      if (reviewCount >= 10) { reasons.push("Established customer activity"); score += 8; }
      if (reviewCount < 5) score -= 12;

      return {
        placeId: place.id,
        name: place.displayName?.text || "Unnamed business",
        category: place.primaryTypeDisplayName?.text || category,
        address: place.formattedAddress || "",
        mapsUrl: place.googleMapsUri || `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(place.id)}`,
        websiteUrl: place.websiteUri || null,
        phone: place.nationalPhoneNumber || null,
        rating: Number.isFinite(Number(place.rating)) ? Number(place.rating) : null,
        reviewCount,
        photoCount,
        hasHours: Boolean(place.regularOpeningHours?.periods?.length),
        opportunityScore: clamp(score, 0, 100),
        reasons,
        recentEvidence
      };
    })
    .filter((place: LocalBusinessSignal) => place.opportunityScore >= 35)
    .sort((a: LocalBusinessSignal, b: LocalBusinessSignal) => b.opportunityScore - a.opportunityScore);
}
