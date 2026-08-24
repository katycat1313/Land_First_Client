import React, { useState } from "react";

interface DeepProspectCardProps {
  prospect: any;
  onSaveToCRM?: (prospect: any) => void;
}

export default function DeepProspectCard({ prospect, onSaveToCRM }: DeepProspectCardProps) {
  const [pitchCopied, setPitchCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleCopyPitch = async () => {
    await navigator.clipboard.writeText(prospect.pitch || "");
    setPitchCopied(true);
    setTimeout(() => setPitchCopied(false), 2000);
  };

  const handleSave = () => {
    onSaveToCRM?.(prospect);
    setSaved(true);
  };

  const urgencyColor = prospect.urgencyScore >= 75
    ? "#ef4444"
    : prospect.urgencyScore >= 50
    ? "#f59e0b"
    : "#6b7280";

  const enrichmentBadges = prospect.enrichmentSource || [];

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(15,20,40,0.97) 0%, rgba(20,28,55,0.97) 100%)",
      border: "1px solid rgba(99,102,241,0.25)",
      borderRadius: 14,
      padding: "20px 22px",
      marginBottom: 16,
      position: "relative",
      boxShadow: "0 4px 24px rgba(0,0,0,0.4)"
    }}>
      {/* Urgency badge */}
      <div style={{
        position: "absolute", top: 14, right: 14,
        background: urgencyColor + "22",
        border: `1px solid ${urgencyColor}55`,
        borderRadius: 20, padding: "3px 10px",
        fontSize: 11, color: urgencyColor, fontWeight: 700, letterSpacing: 0.5
      }}>
        🔥 {prospect.urgencyScore ?? 0} URGENCY
      </div>

      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", marginBottom: 3 }}>
          🏢 {prospect.name || prospect.businessName}
        </div>
        <div style={{ fontSize: 12, color: "#94a3b8" }}>
          {prospect.category} · {prospect.address}
        </div>
        {!prospect.websiteUrl && (
          <div style={{ display: "inline-block", marginTop: 7, padding: "3px 8px", borderRadius: 12, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)", color: "#fbbf24", fontSize: 10, fontWeight: 800 }}>
            🌐 NO WEBSITE LISTED ON GOOGLE
          </div>
        )}
        {prospect.websiteSearchStatus === "found" && (
          <div style={{ marginTop: 7, color: "#67e8f9", fontSize: 11, fontWeight: 700 }}>Website found outside Google — profile-linking opportunity</div>
        )}
        {prospect.websiteSearchStatus === "not_found" && (
          <div style={{ marginTop: 7, color: "#fca5a5", fontSize: 11, fontWeight: 700 }}>Independent web search found no credible official site</div>
        )}
        {(prospect.websiteSearchStatus === "inconclusive" || prospect.websiteSearchStatus === "not_run") && (
          <div style={{ marginTop: 7, color: "#cbd5e1", fontSize: 11 }}>Website search {prospect.websiteSearchStatus === "not_run" ? "not run" : "needs manual verification"}</div>
        )}
        {prospect.websiteSearchEvidence && (
          <div style={{ marginTop: 3, color: "#64748b", fontSize: 10 }}>{prospect.websiteSearchEvidence}</div>
        )}
      </div>

      {/* Contact grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10,
        marginBottom: 14
      }}>
        {/* Phone */}
        <div style={{
          background: "rgba(99,102,241,0.08)",
          border: "1px solid rgba(99,102,241,0.2)",
          borderRadius: 8, padding: "10px 12px"
        }}>
          <div style={{ fontSize: 10, color: "#6366f1", fontWeight: 700, marginBottom: 4, letterSpacing: 0.8 }}>
            📞 BUSINESS PHONE
          </div>
          {prospect.phone ? (
            <a href={`tel:${prospect.phone}`} style={{
              color: "#a5b4fc", fontSize: 14, fontWeight: 600,
              textDecoration: "none", display: "block"
            }}>
              {prospect.phone}
            </a>
          ) : (
            <span style={{ color: "#475569", fontSize: 13 }}>Not listed</span>
          )}
        </div>

        {/* Owner */}
        <div style={{
          background: "rgba(16,185,129,0.08)",
          border: "1px solid rgba(16,185,129,0.2)",
          borderRadius: 8, padding: "10px 12px"
        }}>
          <div style={{ fontSize: 10, color: "#10b981", fontWeight: 700, marginBottom: 4, letterSpacing: 0.8 }}>
            👤 DECISION MAKER
          </div>
          {prospect.ownerName ? (
            <div>
              <div style={{ color: "#6ee7b7", fontSize: 14, fontWeight: 600 }}>
                {prospect.ownerName}
              </div>
              {prospect.ownerLinkedIn && (
                <a href={prospect.ownerLinkedIn} target="_blank" rel="noopener noreferrer"
                  style={{ color: "#3b82f6", fontSize: 11, textDecoration: "none" }}>
                  LinkedIn →
                </a>
              )}
            </div>
          ) : (
            <span style={{ color: "#475569", fontSize: 13 }}>Not found</span>
          )}
        </div>

        {/* Email */}
        <div style={{
          background: "rgba(245,158,11,0.08)",
          border: "1px solid rgba(245,158,11,0.2)",
          borderRadius: 8, padding: "10px 12px"
        }}>
          <div style={{ fontSize: 10, color: "#f59e0b", fontWeight: 700, marginBottom: 4, letterSpacing: 0.8 }}>
            📧 EMAIL
          </div>
          {prospect.ownerEmail ? (
            <a href={`mailto:${prospect.ownerEmail}`} style={{
              color: "#fcd34d", fontSize: 12, fontWeight: 600,
              textDecoration: "none", wordBreak: "break-all"
            }}>
              {prospect.ownerEmail}
            </a>
          ) : (
            <span style={{ color: "#475569", fontSize: 13 }}>Not found</span>
          )}
        </div>

        {/* Profile signals */}
        <div style={{
          background: "rgba(239,68,68,0.08)",
          border: "1px solid rgba(239,68,68,0.2)",
          borderRadius: 8, padding: "10px 12px"
        }}>
          <div style={{ fontSize: 10, color: "#ef4444", fontWeight: 700, marginBottom: 4, letterSpacing: 0.8 }}>
            ⭐ GOOGLE PROFILE
          </div>
          <div style={{ color: "#fca5a5", fontSize: 13, fontWeight: 600 }}>
            {prospect.rating ? `${prospect.rating} ★` : "No rating"} · {prospect.reviewCount ?? 0} reviews
          </div>
          {prospect.likelyUnclaimed && (
            <div style={{ fontSize: 10, color: "#ef4444", marginTop: 3 }}>⚠️ Likely unclaimed</div>
          )}
        </div>
      </div>

      {/* Pain summary */}
      {prospect.painSummary && (
        <div style={{
          background: "rgba(239,68,68,0.06)",
          border: "1px solid rgba(239,68,68,0.15)",
          borderRadius: 8, padding: "10px 12px", marginBottom: 10
        }}>
          <div style={{ fontSize: 10, color: "#ef4444", fontWeight: 700, marginBottom: 5, letterSpacing: 0.8 }}>
            🔥 PROBLEM DETECTED
          </div>
          <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.5 }}>
            {prospect.painSummary}
          </div>
        </div>
      )}

      {/* Our solution */}
      {prospect.ourSolution && (
        <div style={{
          background: "rgba(16,185,129,0.06)",
          border: "1px solid rgba(16,185,129,0.15)",
          borderRadius: 8, padding: "10px 12px", marginBottom: 10
        }}>
          <div style={{ fontSize: 10, color: "#10b981", fontWeight: 700, marginBottom: 5, letterSpacing: 0.8 }}>
            💡 OUR SOLUTION
          </div>
          <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.5 }}>
            {prospect.ourSolution}
          </div>
          {prospect.estimatedDealValue > 0 && (
            <div style={{ marginTop: 6, fontSize: 12, color: "#6ee7b7", fontWeight: 600 }}>
              💰 Est. value: ${prospect.estimatedDealValue.toLocaleString()}/yr
            </div>
          )}
        </div>
      )}

      {/* Pitch */}
      {prospect.pitch && (
        <div style={{
          background: "rgba(99,102,241,0.06)",
          border: "1px solid rgba(99,102,241,0.2)",
          borderRadius: 8, padding: "10px 12px", marginBottom: 14
        }}>
          <div style={{ fontSize: 10, color: "#818cf8", fontWeight: 700, marginBottom: 6, letterSpacing: 0.8 }}>
            📣 READY-TO-SEND PITCH
          </div>
          <div style={{ fontSize: 13, color: "#e2e8f0", lineHeight: 1.6, fontStyle: "italic" }}>
            "{prospect.pitch}"
          </div>
        </div>
      )}

      {/* Enrichment source badges */}
      {enrichmentBadges.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {enrichmentBadges.map((src: string) => (
            <span key={src} style={{
              background: "rgba(148,163,184,0.1)",
              border: "1px solid rgba(148,163,184,0.2)",
              borderRadius: 12, padding: "2px 8px",
              fontSize: 10, color: "#94a3b8"
            }}>
              ✓ {src}
            </span>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {prospect.phone && (
          <a href={`tel:${prospect.phone}`} style={{
            background: "linear-gradient(135deg, #10b981, #059669)",
            color: "#fff", border: "none", borderRadius: 8,
            padding: "8px 14px", fontSize: 12, fontWeight: 700,
            textDecoration: "none", cursor: "pointer"
          }}>
            📞 Call Now
          </a>
        )}

        <button onClick={handleCopyPitch} style={{
          background: pitchCopied
            ? "linear-gradient(135deg, #6366f1, #4f46e5)"
            : "rgba(99,102,241,0.15)",
          color: pitchCopied ? "#fff" : "#a5b4fc",
          border: "1px solid rgba(99,102,241,0.3)",
          borderRadius: 8, padding: "8px 14px",
          fontSize: 12, fontWeight: 700, cursor: "pointer"
        }}>
          {pitchCopied ? "✓ Copied!" : "📋 Copy Pitch"}
        </button>

        <a href={prospect.mapsUrl} target="_blank" rel="noopener noreferrer" style={{
          background: "rgba(255,255,255,0.05)",
          color: "#94a3b8", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8, padding: "8px 14px",
          fontSize: 12, fontWeight: 600, textDecoration: "none"
        }}>
          🗺️ Maps
        </a>

        {prospect.websiteUrl && (
          <a href={prospect.websiteUrl} target="_blank" rel="noopener noreferrer" style={{
            background: "rgba(255,255,255,0.05)",
            color: "#94a3b8", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8, padding: "8px 14px",
            fontSize: 12, fontWeight: 600, textDecoration: "none"
          }}>
            🌐 Website
          </a>
        )}

        {prospect.discoveredWebsiteUrl && (
          <a href={prospect.discoveredWebsiteUrl} target="_blank" rel="noopener noreferrer" style={{
            background: "rgba(6,182,212,0.08)",
            color: "#67e8f9", border: "1px solid rgba(6,182,212,0.25)",
            borderRadius: 8, padding: "8px 14px",
            fontSize: 12, fontWeight: 600, textDecoration: "none"
          }}>
            🔎 Check Found Site
          </a>
        )}

        {!saved ? (
          <button onClick={handleSave} style={{
            background: "rgba(245,158,11,0.12)",
            color: "#fbbf24", border: "1px solid rgba(245,158,11,0.25)",
            borderRadius: 8, padding: "8px 14px",
            fontSize: 12, fontWeight: 700, cursor: "pointer"
          }}>
            ⭐ Save to CRM
          </button>
        ) : (
          <span style={{
            color: "#34d399", fontSize: 12, fontWeight: 700,
            display: "flex", alignItems: "center", gap: 4
          }}>
            ✓ Saved
          </span>
        )}
      </div>
    </div>
  );
}
