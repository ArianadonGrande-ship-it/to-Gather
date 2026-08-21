/**
 * 완료 보고 발행 — 같은 내용을 Notion(켈리 일일 브리핑)과 Slack으로 동시에 보낸다.
 *
 * 비밀값은 코드에 두지 않는다. 로컬은 `.dev.vars`, 배포는 `wrangler secret put`.
 *   NOTION_TOKEN          Notion 내부 통합 토큰 (ntn_…)
 *   NOTION_BRIEFING_DB    켈리 일일 브리핑 데이터베이스 ID
 *   SLACK_WEBHOOK_URL     보고를 받을 채널의 Incoming Webhook URL
 */

export type DayReport = {
  title: string;
  clock: string;
  phase: string;
  counts: { total: number; done: number; working: number; approval: number; blocked: number };
  highlights: string[];
  decisions: string[];
  risks: string[];
  next: string[];
  log: { time: string; text: string }[];
};

export type PublishEnv = {
  NOTION_TOKEN?: string;
  NOTION_BRIEFING_DB?: string;
  SLACK_WEBHOOK_URL?: string;
};

type TargetResult = { ok: boolean; status: "sent" | "unconfigured" | "failed"; detail?: string; url?: string };

const NOTION_VERSION = "2022-06-28";

export function integrationStatus(env: PublishEnv) {
  return {
    notion: { configured: Boolean(env.NOTION_TOKEN && env.NOTION_BRIEFING_DB), label: "Notion 저장" },
    slack: { configured: Boolean(env.SLACK_WEBHOOK_URL), label: "Slack 전송" },
    // 아래 3개는 자격증명을 받는 즉시 같은 방식으로 붙는다
    instagram: { configured: false, label: "Instagram 지표", need: "Meta 비즈니스 앱 + 장기 액세스 토큰" },
    gmail: { configured: false, label: "Gmail 읽기", need: "Google OAuth 클라이언트 + 리프레시 토큰" },
    finance: { configured: false, label: "재무 파일", need: "대표가 현황 파일 업로드" },
  };
}

function seoulDate() {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts; // YYYY-MM-DD
}

function joinLines(items: string[], fallback = "없음") {
  const text = items.filter(Boolean).join("\n");
  return text.slice(0, 1900) || fallback;
}

function richText(content: string) {
  return [{ type: "text", text: { content: content.slice(0, 1900) } }];
}

async function sendNotion(report: DayReport, env: PublishEnv): Promise<TargetResult> {
  if (!env.NOTION_TOKEN || !env.NOTION_BRIEFING_DB) {
    return { ok: false, status: "unconfigured", detail: "NOTION_TOKEN / NOTION_BRIEFING_DB 미설정" };
  }

  const body = {
    parent: { database_id: env.NOTION_BRIEFING_DB },
    properties: {
      "브리핑명": { title: richText(report.title) },
      "구분": { select: { name: "저녁 브리핑" } },
      "기준일": { date: { start: seoulDate() } },
      "상태": { select: { name: "보고 완료" } },
      "전체 업무": { number: report.counts.total },
      "완료": { number: report.counts.done },
      "진행 중": { number: report.counts.working },
      "승인 대기": { number: report.counts.approval },
      "차단·오류": { number: report.counts.blocked },
      "핵심 성과": { rich_text: richText(joinLines(report.highlights)) },
      "대표 결정사항": { rich_text: richText(joinLines(report.decisions)) },
      "문제·위험": { rich_text: richText(joinLines(report.risks)) },
      "다음 우선순위": { rich_text: richText(joinLines(report.next)) },
    },
    children: [
      {
        object: "block",
        type: "heading_3",
        heading_3: { rich_text: richText("오늘 진행 로그") },
      },
      ...report.log.slice(0, 40).map((entry) => ({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: richText(`${entry.time}  ${entry.text}`) },
      })),
    ],
  };

  const response = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = (await response.json().catch(() => ({}))) as { url?: string; message?: string; code?: string };
  if (!response.ok) {
    const hint =
      json.code === "object_not_found"
        ? "DB를 통합에 연결하지 않았어요. Notion에서 페이지 ⋯ → 연결 → 통합 추가."
        : json.message ?? `HTTP ${response.status}`;
    return { ok: false, status: "failed", detail: hint };
  }
  return { ok: true, status: "sent", url: json.url };
}

async function sendSlack(report: DayReport, env: PublishEnv, notionUrl?: string): Promise<TargetResult> {
  if (!env.SLACK_WEBHOOK_URL) {
    return { ok: false, status: "unconfigured", detail: "SLACK_WEBHOOK_URL 미설정" };
  }

  const blocks: Record<string, unknown>[] = [
    { type: "header", text: { type: "plain_text", text: report.title.slice(0, 150), emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: `*${report.clock} 기준 · ${report.phase}*` } },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*오늘 현황*\n완료 ${report.counts.done} · 진행 ${report.counts.working} · 승인 대기 ${report.counts.approval} · 연동 대기 ${report.counts.blocked}`,
      },
    },
    { type: "section", text: { type: "mrkdwn", text: `*핵심 성과*\n${joinLines(report.highlights).slice(0, 2900)}` } },
    { type: "section", text: { type: "mrkdwn", text: `*대표 결정사항*\n${joinLines(report.decisions).slice(0, 2900)}` } },
    { type: "section", text: { type: "mrkdwn", text: `*문제·위험*\n${joinLines(report.risks).slice(0, 2900)}` } },
    { type: "section", text: { type: "mrkdwn", text: `*다음 우선순위*\n${joinLines(report.next).slice(0, 2900)}` } },
  ];
  if (notionUrl) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `📎 <${notionUrl}|Notion에서 자세히 보기>` } });
  }
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: "CHIKO STUDIO AI Office" }] });

  const response = await fetch(env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: `📋 ${report.title}`, blocks }),
  });

  if (!response.ok) {
    const detail = response.status === 404 ? "웹훅 URL이 잘못됐거나 삭제됐어요." : `HTTP ${response.status}`;
    return { ok: false, status: "failed", detail };
  }
  return { ok: true, status: "sent" };
}

/** Notion 먼저 저장하고, 그 링크를 붙여 Slack으로 같은 내용을 보낸다 */
export async function publishReport(report: DayReport, env: PublishEnv) {
  const notion = await sendNotion(report, env);
  const slack = await sendSlack(report, env, notion.url);
  return { notion, slack, publishedAt: new Date().toISOString() };
}
