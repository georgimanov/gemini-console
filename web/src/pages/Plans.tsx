import { useEffect, useState } from "react";
import { api, type PlanRecord, type PlanSummary } from "../lib/api.js";

export function Plans() {
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [selected, setSelected] = useState<PlanSummary | null>(null);
  const [detail, setDetail] = useState<PlanRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .plans()
      .then(setPlans)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  async function openPlan(plan: PlanSummary) {
    setSelected(plan);
    setDetail(null);
    try {
      const record = await api.plan(plan.personaId, plan.date);
      setDetail(record);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (selected) {
    return (
      <div className="plans-page">
        <button className="btn btn--ghost" onClick={() => setSelected(null)} style={{ alignSelf: "flex-start" }}>
          ← Back
        </button>
        <div className="plan-detail">
          <div>
            <div className="plan-card__title">{selected.personaTitle}</div>
            <div className="plan-card__meta">{selected.date}</div>
          </div>
          {error && <div className="error-banner">{error}</div>}
          {!detail && !error && <div className="empty-state">Loading…</div>}
          {detail?.versions
            .slice()
            .reverse()
            .map((v) => (
              <div key={v.version} className="plan-version">
                <div className="plan-card__meta" style={{ marginBottom: 8 }}>
                  Version {v.version} · {new Date(v.savedAt).toLocaleString()}
                </div>
                {v.content}
              </div>
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className="plans-page">
      {error && <div className="error-banner">{error}</div>}
      {loading && <div className="empty-state">Loading…</div>}
      {!loading && plans.length === 0 && <div className="empty-state">No plans saved yet.</div>}
      {plans.map((plan) => (
        <button key={`${plan.personaId}-${plan.date}`} className="plan-card" onClick={() => openPlan(plan)}>
          <span className="plan-card__title">{plan.personaTitle}</span>
          <span className="plan-card__meta">
            {plan.date} · v{plan.latestVersion} · updated {new Date(plan.updatedAt).toLocaleString()}
          </span>
        </button>
      ))}
    </div>
  );
}
