const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const MAX_SIGNAL_AGE_MS = 14 * 24 * 60 * 60 * 1000;
// Minimum number of "unclaimed proxy" signals required to label a profile as likely unclaimed
const UNCLAIMED_SIGNAL_THRESHOLD = 3;

export const LOCAL_PROFILE_SIGNAL_FILTERS = [
  "incomplete_profile", "likely_unclaimed", "incorrect_information",
  "missing_website", "missing_phone", "missing_hours", "few_photos",
  "missing_description", "recent_complaints"
] as const;
export type LocalProfileSignalFilter = typeof LOCAL_PROFILE_SIGNAL_FILTERS[number];

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

const INCORRECT_INFO_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "review reports incorrect business hours", pattern: /(?:hours?|open|clos(?:e|ed|ing)).{0,45}(?:wrong|incorrect|inaccurate|outdated|not updated)|(?:wrong|incorrect|inaccurate|outdated).{0,45}(?:hours?|open|clos(?:e|ed|ing))/i },
  { label: "review reports an incorrect address", pattern: /(?:address|location|map pin).{0,45}(?:wrong|incorrect|inaccurate|outdated)|(?:wrong|incorrect|inaccurate|outdated).{0,45}(?:address|location|map pin)/i },
  { label: "review reports an incorrect phone number", pattern: /(?:phone|number).{0,45}(?:wrong|incorrect|disconnected|out of service|doesn'?t work)|(?:wrong|incorrect|disconnected).{0,45}(?:phone|number)/i },
  { label: "review reports incorrect website information", pattern: /(?:website|site|online).{0,45}(?:wrong|incorrect|inaccurate|outdated|broken)|(?:wrong|incorrect|inaccurate|outdated|broken).{0,45}(?:website|site)/i }
];

type PlacesScanInput = {
  location: string;
  category: string;
  maxResults?: number;
  unclaimedOnly?: boolean; // When true, only return businesses with 3+ missing owner-controlled fields
  signalFilters?: LocalProfileSignalFilter[];
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
  hasDescription: boolean;
  likelyUnclaimed: boolean;      // true when 3+ owner-controlled fields are missing
  unclaimedSignalCount: number;
  profileSignals: LocalProfileSignalFilter[];
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
  const unclaimedOnly = Boolean(input.unclaimedOnly);
  const requestedFilters = Array.from(new Set(
    (Array.isArray(input.signalFilters) ? input.signalFilters : [])
      .filter((value): value is LocalProfileSignalFilter => LOCAL_PROFILE_SIGNAL_FILTERS.includes(value as LocalProfileSignalFilter))
  ));
  if (unclaimedOnly && !requestedFilters.includes("likely_unclaimed")) requestedFilters.push("likely_unclaimed");
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
        "places.primaryTypeDisplayName",
        "places.editorialSummary"   // owner-written description — absent on unclaimed profiles
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
          const incorrectInfoSignals = INCORRECT_INFO_PATTERNS.filter(item => item.pattern.test(text)).map(item => item.label);
          return {
            text,
            publishedAt: review.publishTime,
            authorName: review.authorAttribution?.displayName || "Google reviewer",
            authorUri: review.authorAttribution?.uri || null,
            signals: [...signals, ...incorrectInfoSignals],
            incorrectInfoSignals
          };
        })
        .filter((review: any) => review.text && review.signals.length > 0);

      const photoCount = Array.isArray(place.photos) ? place.photos.length : 0;
      const reviewCount = Number(place.userRatingCount) || 0;
      const hasDescription = Boolean(place.editorialSummary?.text?.trim());

      // Count how many owner-controlled profile fields are missing (proxy for unclaimed status)
      const missingWebsite  = !place.websiteUri;
      const missingPhone    = !place.nationalPhoneNumber;
      const missingHours    = !place.regularOpeningHours?.periods?.length;
      const missingPhotos   = photoCount <= 2;
      const missingDesc     = !hasDescription;
      const unclaimedSignalCount = [missingWebsite, missingPhone, missingHours, missingPhotos, missingDesc].filter(Boolean).length;
      const likelyUnclaimed = unclaimedSignalCount >= UNCLAIMED_SIGNAL_THRESHOLD;
      const hasIncorrectInformationEvidence = recentEvidence.some((review: any) => review.incorrectInfoSignals.length > 0);
      const profileSignals: LocalProfileSignalFilter[] = [];
      if (unclaimedSignalCount > 0) profileSignals.push("incomplete_profile");
      if (likelyUnclaimed) profileSignals.push("likely_unclaimed");
      if (hasIncorrectInformationEvidence) profileSignals.push("incorrect_information");
      if (missingWebsite) profileSignals.push("missing_website");
      if (missingPhone) profileSignals.push("missing_phone");
      if (missingHours) profileSignals.push("missing_hours");
      if (missingPhotos) profileSignals.push("few_photos");
      if (missingDesc) profileSignals.push("missing_description");
      if (recentEvidence.length > 0) profileSignals.push("recent_complaints");

      const reasons: string[] = [];
      let score = 20;
      if (missingWebsite)  { reasons.push("No website listed"); score += 18; }
      if (missingPhone)    { reasons.push("No phone number listed"); score += 8; }
      if (missingHours)    { reasons.push("No detailed business hours"); score += 10; }
      if (missingPhotos)   { reasons.push(`${photoCount} profile photos (low)`); score += 12; }
      if (missingDesc)     { reasons.push("No owner description"); score += 12; }
      if (likelyUnclaimed) { reasons.push(`Possible unclaimed profile (${unclaimedSignalCount}/5 owner-managed fields missing; proxy only)`); score += 15; }
      if (hasIncorrectInformationEvidence) { reasons.push("Recent review reports incorrect profile information"); score += 20; }
      if (recentEvidence.length > 0) { reasons.push(`${recentEvidence.length} complaint signal within 14 days`); score += 28; }
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
        hasDescription,
        likelyUnclaimed,
        unclaimedSignalCount,
        profileSignals,
        opportunityScore: clamp(score, 0, 100),
        reasons,
        recentEvidence
      };
    })
    .filter((place: LocalBusinessSignal) => {
      if (place.opportunityScore < 35) return false;
      if (requestedFilters.length === 0) return true;
      return requestedFilters.some(filter => place.profileSignals.includes(filter));
    })
    .sort((a: LocalBusinessSignal, b: LocalBusinessSignal) => b.opportunityScore - a.opportunityScore);
}
