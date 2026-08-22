// 브랜드분석팀이 쓰는 실제 숫자 — 대표가 직접 입력한 값만 씁니다. 없으면 미연동으로 표시.
// (서버 DB가 아니라 이 브라우저에만 저장됩니다 — 로컬 1인 사용을 가정한 가벼운 저장소예요.)

export type BrandMetrics = { saves: number; reach: number; sales: number; updatedAt: string };

const KEY = "chiko_brand_metrics";

export function loadBrandMetrics(): BrandMetrics | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BrandMetrics>;
    if (typeof parsed.saves !== "number" || typeof parsed.reach !== "number" || typeof parsed.sales !== "number") {
      return null;
    }
    return { saves: parsed.saves, reach: parsed.reach, sales: parsed.sales, updatedAt: parsed.updatedAt ?? "" };
  } catch {
    return null;
  }
}

export function saveBrandMetrics(metrics: Omit<BrandMetrics, "updatedAt">) {
  if (typeof localStorage === "undefined") return;
  const withStamp: BrandMetrics = { ...metrics, updatedAt: new Date().toISOString() };
  localStorage.setItem(KEY, JSON.stringify(withStamp));
}

export function brandReportFromMetrics(): string {
  const metrics = loadBrandMetrics();
  if (!metrics) {
    return "이번 주 숫자가 아직 입력 안 돼서, 추측 대신 미연동으로 남겨둘게요. 대시보드의 '이번 주 숫자' 칸에 입력해주시면 다음부터 진짜 분석해드려요.";
  }
  const rate = metrics.reach > 0 ? ((metrics.saves / metrics.reach) * 100).toFixed(1) : "0.0";
  return `이번 주 저장 ${metrics.saves} · 도달 ${metrics.reach} · 판매 ${metrics.sales}건 — 저장률 ${rate}%예요. 입력해주신 실제 숫자로 본 거예요.`;
}
