/**
 * 직원 1:1 대화 — OpenAI로 그 직원의 성격에 맞는 실제 응답을 생성한다.
 * 비밀값은 코드에 두지 않는다. 로컬은 `.dev.vars`, 배포는 `wrangler secret put`.
 *   OPENAI_API_KEY   platform.openai.com에서 발급받은 API 키
 */

export type ChatEnv = { OPENAI_API_KEY?: string };

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type ChatRequest = {
  agentId: string;
  persona: { name: string; role: string; thoughts: string[] };
  history: ChatTurn[];
  message: string;
};

export type ChatResult = { ok: boolean; reply?: string; detail?: string };

const MODEL = "gpt-4o-mini";

export async function chatWithPersona(req: ChatRequest, env: ChatEnv): Promise<ChatResult> {
  if (!env.OPENAI_API_KEY) {
    return { ok: false, detail: "OPENAI_API_KEY 미설정" };
  }
  if (!req.message?.trim()) {
    return { ok: false, detail: "빈 메시지" };
  }

  const systemPrompt = [
    `당신은 치코스튜디오라는 회사의 "${req.persona.name}"입니다.`,
    `역할: ${req.persona.role}.`,
    `평소 성격·말투(참고): ${req.persona.thoughts.join(" / ")}`,
    "대표님과 편하게 대화하되, 이 역할과 성격에 맞게 답하세요.",
    "회사 절대 규칙: 메일 실제 발송·SNS 실제 게시·상품 등록·결제는 절대 하지 않습니다. 항상 초안·의견까지만 제시하고, 실제 실행은 대표님 몫이라고 안내하세요.",
    "확인 안 된 정보를 사실처럼 말하지 말고, 모르면 모른다고 하세요.",
    "답변은 한국어로, 2~4문장 정도로 짧게 하세요.",
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        ...req.history.slice(-12),
        { role: "user", content: req.message },
      ],
      max_tokens: 300,
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    const errJson = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    return { ok: false, detail: errJson.error?.message ?? `HTTP ${response.status}` };
  }

  const json = (await response.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string } }[];
  };
  const reply = json.choices?.[0]?.message?.content?.trim();
  if (!reply) return { ok: false, detail: "빈 응답을 받았어요." };
  return { ok: true, reply };
}
