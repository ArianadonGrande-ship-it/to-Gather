// 직원 1:1 대화창 — 서버(/api/chat)로 실제 OpenAI 응답을 요청한다.
// OPENAI_API_KEY가 없으면 서버가 ok:false를 돌려주고, 그때는 규칙 기반 답변(Company.askPersonal)으로 대체한다.

export type ChatTurn = { role: "user" | "assistant"; content: string };
export type PersonaChatResult = { ok: boolean; reply?: string; detail?: string };

export async function askPersonaAI(
  agentId: string,
  persona: { name: string; role: string; thoughts: string[] },
  history: ChatTurn[],
  message: string,
): Promise<PersonaChatResult> {
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId, persona, history, message }),
    });
    if (!response.ok) return { ok: false, detail: `HTTP ${response.status}` };
    return (await response.json()) as PersonaChatResult;
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}
