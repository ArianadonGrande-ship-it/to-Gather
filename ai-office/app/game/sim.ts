// 라이브 오피스 시뮬레이션 엔진
// 직원 상태머신 + A* 이동 + 회의 엔진 + 하루 시나리오 스크립트

import { findPath } from "./pathfinding";
import { CEO, DEPT_BRIEF, DEPT_LEAD, STAFF, type StaffSeed } from "./staff";
import {
  CEO_REPORT_SPOT,
  CEO_SEAT,
  COLS,
  DEPT_ROOMS,
  ENTRANCE,
  LOUNGE_ROOM,
  MEETING_SEATS,
  doorApproach,
  roomOf,
  walkable,
  type Pt,
} from "./world";

export type DeptStatus = "완료" | "진행 중" | "승인 대기" | "연동 대기" | "대기";
export type AgentStatus =
  | "출근 전"
  | "출근 중"
  | "대기"
  | "이동 중"
  | "업무 중"
  | "회의 중"
  | "보고 중"
  | "휴식"
  | "연동 대기";
export type Anim = "idle" | "walk" | "type" | "talk" | "sit" | "coffee";
export type Facing = "up" | "down" | "left" | "right";

const WALK_SPEED = 3.6; // tiles / sec
/**
 * 사내 시계는 '시뮬레이션 시간' 기준으로 흐른다 — 시뮬 1초 = 1.6분.
 * 배속을 올리면 시계도 같이 빨라지므로, 몇 배속으로 보든 하루는 10:00 → 약 16:00으로 끝난다.
 */
const SIM_MIN_PER_SEC = 1.6;
/** ⏭ 건너뛰기(터보)일 때의 배속 */
const TURBO_SPEED = 10;

type Action =
  | { k: "walk"; to: Pt }
  | { k: "say"; text: string; dur: number; kind: "talk" | "think" }
  | { k: "wait"; dur: number }
  | { k: "face"; dir: Facing }
  | { k: "anim"; a: Anim }
  | { k: "status"; s: AgentStatus }
  | { k: "work"; dur: number; label: string }
  | { k: "fn"; fn: () => void };

export type Agent = {
  id: string;
  name: string;
  callsign?: string;
  role: string;
  deptId: string;
  rank: StaffSeed["rank"];
  hair: string;
  shirt: string;
  accent: string;
  skin: string;
  thoughts: string[];

  x: number;
  y: number;
  facing: Facing;
  anim: Anim;
  status: AgentStatus;
  home: Pt;
  progress: number;
  taskLabel: string;

  path: Pt[];
  pathIdx: number;
  blockedFor: number;
  queue: Action[];
  current: Action | null;
  timer: number;
  speech: string | null;
  speechKind: "talk" | "think";
  speechFor: number;
  idleFor: number;
  /** 렌더링에서 겹침을 줄이는 미세 오프셋 */
  jitter: number;
};

export type LogEntry = { id: number; time: string; icon: string; text: string; tone: string };
/** 대표 지시창 대화 */
export type ChatEntry = {
  id: number;
  time: string;
  from: "ceo" | "staff";
  name: string;
  text: string;
};

type Slot = {
  gen: Generator<number | (() => boolean), void, void> | null;
  wait: number;
  until: (() => boolean) | null;
};

export type ContentBrief = { title: string; hook: string; reason: string; target: string };
export type ProductBrief = { name: string; spec: string; price: string };
export type ApprovalItem = { content: ContentBrief; product: ProductBrief; note?: string };

/** 승인 대기 중인 콘텐츠·상품 후보 — 폐기하면 다음 후보로 넘어간다 */
const BRIEF_POOL: { content: ContentBrief; product: ProductBrief }[] = [
  {
    content: {
      title: "요즘 유행 비즈스트랩 언박싱",
      hook: "이거 안 사면 다음 주엔 품절이에요",
      reason: "최근 7일 저장률 1위 포맷 + 공식 트렌드 확인 완료",
      target: "20대 후반 여성",
    },
    product: { name: "신규 카스티커 세트", spec: "5매입 · 방수 코팅 · 3color", price: "9,900원" },
  },
  {
    content: {
      title: "책상 꾸미기 브이로그 with 비즈스트랩",
      hook: "이 색조합 그대로 따라해도 돼요",
      reason: "경쟁 콘텐츠 대비 저장 각도 차별화, 브랜드분석팀 확인",
      target: "20대 여성 · 데스크테리어",
    },
    product: { name: "파스텔 비즈 팔찌 3종 세트", spec: "논알러지 소재 · 사이즈 조절 가능", price: "12,900원" },
  },
  {
    content: {
      title: "친구한테 만들어준 커스텀 카스티커",
      hook: "선물로 하나쯤은 있어야 하는 이유",
      reason: "협업소통팀 제휴 제안과 시너지 가능",
      target: "20대 여성 · 선물용",
    },
    product: { name: "커스텀 각인 카스티커", spec: "이니셜 각인 · 주문제작 3일 소요", price: "14,900원" },
  },
];

export type Snapshot = {
  clock: string;
  running: boolean;
  paused: boolean;
  speed: number;
  turbo: boolean;
  dayComplete: boolean;
  phase: string;
  phaseIndex: number;
  approvalPending: boolean;
  approvalItem: ApprovalItem | null;
  approved: boolean;
  briefingReady: boolean;
  deptStatus: Record<string, DeptStatus>;
  counts: Record<AgentStatus, number>;
  stats: { done: number; working: number; approval: number; blocked: number };
  log: LogEntry[];
  meetingTitle: string | null;
  chat: ChatEntry[];
  focusMode: boolean;
  spotlight: string | null;
  busyWithOrder: boolean;
};

const PHASES = [
  "출근 대기",
  "10:00 전사 출근",
  "시장조사",
  "브랜드 분석",
  "콘텐츠·상품 아이디어",
  "브랜드검수(톤·저작권)",
  "TOP 3 선정",
  "대표 승인 대기",
  "대본·상품기획",
  "영상·이미지 제작",
  "정산·마케팅 병행",
  "켈리 브리핑",
  "업무 종료",
];

/** 실제로 업무가 외부 연동 부재로 멈춰 있는 팀만 (기획·진행 중인 팀은 제외) */
const BLOCKED_DEPTS = new Set(["review", "ops"]);

/** 연동 대기 부서가 멈춰 있는 진짜 이유 */
const BLOCK_REASON: Record<string, string> = {
  review: "Instagram·스토어 판매 데이터가 아직 연동 전이라 저장·전환 수치를 읽을 수 없어요. 없는 숫자를 만들지는 않습니다. 연동만 되면 바로 돌려요.",
  ops: "인스타·스마트스토어 광고 채널 성과 데이터가 아직 연동 전이라 증액·감액 판단을 못 내려요. 연동되면 바로 채널별 제안안을 만듭니다.",
};

/** 지시창에서 부서를 찾을 때 쓰는 키워드 — 구체적인 것부터 검사한다 */
const DEPT_KEYWORDS: [string, string[]][] = [
  ["qa", ["qa", "브랜드검수", "검수", "톤앤매너", "저작권", "주노", "juno"]],
  ["brand", ["브랜드분석", "저장률", "판매 흐름", "세이지", "sage"]],
  ["strategy1", ["기획 1", "기획1", "아이디어", "코코", "coco", "톱3", "top 3"]],
  ["strategy2", ["기획 2", "기획2", "대본", "상품기획", "렌", "ren", "스크립트"]],
  ["research", ["시장조사", "리서치", "조사팀", "경쟁 상품", "노바", "nova"]],
  ["reels", ["릴스", "영상", "편집", "맥스", "max"]],
  ["carousel", ["캐러셀", "이미지 제작", "상세페이지", "미아", "mia"]],
  ["partner", ["협업", "협찬", "제휴", "아이비", "ivy"]],
  ["finance", ["재무", "정산", "입금", "돈", "테오", "theo"]],
  ["review", ["성과", "리뷰", "지표", "조이", "zoe"]],
  ["ops", ["마케팅", "광고", "채널", "레오", "leo"]],
  ["secretary", ["비서", "켈리", "kelly", "비서실"]],
];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export class Company {
  agents: Agent[] = [];
  agentById = new Map<string, Agent>();
  deptStatus: Record<string, DeptStatus> = {};
  log: LogEntry[] = [];
  clockMinutes = 10 * 60;
  /** 재생 속도 — 시뮬레이션 전체(걷기·업무·대사)를 함께 배속한다. 실제 외부 작업 속도와는 무관 */
  speed = 2;
  turbo = false;
  paused = false;
  running = false;
  dayComplete = false;
  phaseIndex = 0;
  approvalPending = false;
  approvalItem: ApprovalItem | null = null;
  approved = false;
  briefingReady = false;
  meetingTitle: string | null = null;
  onBriefing: (() => void) | null = null;
  /** 대표 지시창 */
  chat: ChatEntry[] = [];
  focusMode = false;
  spotlight: string | null = null;

  private spotlightUntil = 0;
  private elapsed = 0;
  private approvalSince: number | null = null;
  private logSeq = 0;
  /** 대표 승인 흐름: 승인 / 수정 요청 / 폐기 결정 */
  private decision: "approved" | "revise" | "discard" | null = null;
  private pendingFeedback = "";
  private briefIndex = 0;
  /** 하루 시나리오(main)와 대표 지시로 끼어드는 장면(side)을 각각 돌린다 */
  private main: Slot = { gen: null, wait: 0, until: null };
  private side: Slot = { gen: null, wait: 0, until: null };
  private occupancy = new Set<number>();
  private seatBook = new Map<string, Pt>();
  /** 시나리오 장면에 참여 중인 직원 — 자율 행동(커피·잡담)이 끼어들지 못하게 잠근다 */
  private locked = new Set<string>();

  constructor() {
    this.reset();
  }

  reset() {
    this.agents = [];
    this.agentById.clear();
    this.log = [];
    this.logSeq = 0;
    this.clockMinutes = 10 * 60;
    this.running = false;
    this.paused = false;
    this.dayComplete = false;
    this.phaseIndex = 0;
    this.approvalPending = false;
    this.approvalItem = null;
    this.approved = false;
    this.briefingReady = false;
    this.decision = null;
    this.pendingFeedback = "";
    this.briefIndex = 0;
    this.meetingTitle = null;
    this.main = { gen: null, wait: 0, until: null };
    this.side = { gen: null, wait: 0, until: null };
    this.seatBook.clear();
    this.locked.clear();
    this.chat = [];
    this.focusMode = false;
    this.spotlight = null;
    this.spotlightUntil = 0;
    this.elapsed = 0;
    this.approvalSince = null;

    const seats = new Map<string, Pt[]>();
    for (const room of DEPT_ROOMS) seats.set(room.id, room.desks.map((d) => d.seat));

    for (const seed of STAFF) {
      const pool = seats.get(seed.deptId);
      const home = pool?.shift() ?? { x: ENTRANCE.x, y: ENTRANCE.y - 2 };
      this.spawn(seed, home, { x: ENTRANCE.x, y: ENTRANCE.y });
    }
    this.spawn(CEO, CEO_SEAT, CEO_SEAT);

    const ceo = this.agentById.get("ceo")!;
    ceo.status = "업무 중";
    ceo.anim = "sit";
    ceo.facing = "down";

    for (const room of DEPT_ROOMS) {
      this.deptStatus[room.id] = BLOCKED_DEPTS.has(room.id) ? "연동 대기" : "대기";
    }
    this.pushLog("🎀", "대표실 준비 완료. 출근 버튼을 기다리는 중이에요.", "lav");
    this.pushChat("staff", "켈리", "대표님, 비서실장 켈리입니다. 궁금한 건 여기에 바로 물어보세요.");
  }

  private spawn(seed: StaffSeed, home: Pt, at: Pt) {
    const agent: Agent = {
      ...seed,
      x: at.x,
      y: at.y,
      facing: "down",
      anim: seed.rank === "ceo" ? "sit" : "idle",
      status: seed.rank === "ceo" ? "업무 중" : "출근 전",
      home,
      progress: 0,
      taskLabel: DEPT_BRIEF[seed.deptId]?.task ?? "대표 업무",
      path: [],
      pathIdx: 0,
      blockedFor: 0,
      queue: [],
      current: null,
      timer: 0,
      speech: null,
      speechKind: "talk",
      speechFor: 0,
      idleFor: Math.random() * 8,
      jitter: (Math.random() - 0.5) * 0.28,
    };
    this.agents.push(agent);
    this.agentById.set(agent.id, agent);
  }

  // ── 로그 ────────────────────────────────────────────────
  pushLog(icon: string, text: string, tone = "pink") {
    this.log.unshift({ id: this.logSeq++, time: this.clockText(), icon, text, tone });
    if (this.log.length > 60) this.log.pop();
  }

  clockText() {
    const total = Math.floor(this.clockMinutes) % (24 * 60);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  // ── 액션 큐 ──────────────────────────────────────────────
  private enqueue(agent: Agent, ...actions: Action[]) {
    agent.queue.push(...actions);
  }

  private goto(agent: Agent, to: Pt, status: AgentStatus = "이동 중") {
    this.enqueue(agent, { k: "status", s: status }, { k: "walk", to });
  }

  private sitAtDesk(agent: Agent) {
    this.enqueue(
      agent,
      { k: "walk", to: agent.home },
      { k: "face", dir: "up" },
      { k: "anim", a: "sit" },
      { k: "status", s: "대기" },
    );
  }

  say(agent: Agent, text: string, dur = 2.6, kind: "talk" | "think" = "talk") {
    agent.speech = text;
    agent.speechKind = kind;
    agent.speechFor = dur;
  }

  /** 장면 시작: 진행 중이던 자율 행동을 끊고 잠근다 */
  private lock(agents: Agent[]) {
    for (const agent of agents) {
      this.locked.add(agent.id);
      agent.queue.length = 0;
      agent.current = null;
      agent.path = [];
      agent.pathIdx = 0;
    }
  }

  private unlock(agents: Agent[]) {
    for (const agent of agents) this.locked.delete(agent.id);
  }

  private busy(agent: Agent) {
    return agent.queue.length > 0 || agent.current !== null;
  }

  private allFree(agents: Agent[]) {
    return () => agents.every((a) => !this.busy(a));
  }

  private deptAgents(deptId: string) {
    return this.agents.filter((a) => a.deptId === deptId && a.rank !== "ceo");
  }

  // ── 하루 시나리오 ─────────────────────────────────────────
  start() {
    if (this.running) return;
    this.reset();
    this.running = true;
    this.main.gen = this.dayScript();
  }

  private *dayScript(): Generator<number | (() => boolean), void, void> {
    // ① 10:00 출근
    this.phaseIndex = 1;
    const workers = this.agents.filter((a) => a.rank !== "ceo");
    this.pushLog("🚪", `10:00 자동 출근을 시작합니다. AI 직원 ${workers.length}명 입장!`, "yellow");
    this.lock(workers);
    for (const agent of workers) {
      this.enqueue(
        agent,
        { k: "status", s: "출근 중" },
        { k: "wait", dur: Math.random() * 6 },
        { k: "fn", fn: () => this.say(agent, rand(["좋은 아침이에요!", "출근합니다 ✨", "오늘도 화이팅!", "커피부터…"]), 2.4) },
        { k: "walk", to: agent.home },
        { k: "face", dir: "up" },
        { k: "anim", a: "sit" },
        { k: "status", s: "대기" },
      );
    }
    yield this.allFree(workers);
    this.unlock(workers);
    this.pushLog("✅", "전원 착석 완료. 오늘 업무를 시작합니다.", "mint");
    yield 0.6;

    const seri = this.agentById.get("secretary-lead")!;
    this.stand(seri);
    this.say(seri, "대표님, 오늘 업무 시작합니다.", 2.6);
    yield 1.6;
    this.sitAtDesk(seri);

    // ② 시장조사팀 — 경쟁 상품 서칭 + 트렌드 수집
    this.phaseIndex = 2;
    yield* this.runDept("research", "경쟁 상품 가격대·구성 서칭 + 트렌드 수집", 6.5, "경쟁사 가격·구성 요약이랑 오늘 써먹을 트렌드 하나 뽑았어요.");

    // ③ 브랜드분석팀 — 저장·판매 흐름 점검
    this.phaseIndex = 3;
    yield* this.runDept("brand", "최근 7일 저장·판매 흐름 점검", 5.5, "잘된 콘텐츠·상품 유형 각각 하나씩 정리했어요.");

    // ④ 회의 — 시장조사·브랜드분석 → 기획1팀 인수인계
    yield* this.meeting(
      "오늘의 후보 인수인계",
      ["research-lead", "brand-lead", "strategy1-lead"],
      [
        ["research-lead", "경쟁 상품·트렌드 다 공식 출처로 확인했어요."],
        ["brand-lead", "저장 잘 되는 유형이랑 잘 팔린 상품 유형 넘길게요."],
        ["strategy1-lead", "좋아요. 콘텐츠 10개 상품 5개로 풀어볼게요."],
      ],
    );

    // ⑤ 기획 1팀 — 콘텐츠+상품 아이디어
    this.phaseIndex = 4;
    yield* this.runDept("strategy1", "콘텐츠 10개 + 상품 5개 아이디어 생산", 7, "콘텐츠 10개 상품 5개 다 뽑았고 점수까지 매겼어요.");

    // ⑥ 브랜드검수팀 — 톤·저작권 검수
    this.phaseIndex = 5;
    yield* this.runDept("qa", "톤앤매너 + 디자인·저작권 검수", 5.5, "톤 벗어난 2건 반려, 나머지는 치코 느낌으로 통과예요.");
    this.pushLog("🛡️", "브랜드검수 반려 2건: B급 톤 / 기존 디자인과 유사도 있음", "lav");

    // ⑦ TOP 3 선정
    this.phaseIndex = 6;
    const coco = this.agentById.get("strategy1-lead")!;
    this.stand(coco);
    this.say(coco, "콘텐츠·상품 TOP 3 정리했어요!", 3);
    this.pushLog("💡", "기획 1팀: 콘텐츠 TOP 3 + 상품 TOP 3 확정", "pink");
    yield 1.8;
    this.sitAtDesk(coco);

    // ⑧ 대표 승인 회의 — 콘텐츠 1개 + 상품 1개 (승인 / 수정 요청 / 폐기 반복 가능)
    this.phaseIndex = 7;
    this.deptStatus.strategy2 = "승인 대기";
    this.turbo = false; // 대표 결정 지점에서는 즉시 정상 속도로 돌아온다
    this.briefIndex = 0;
    this.approvalItem = { ...BRIEF_POOL[this.briefIndex] };

    const approvers = ["strategy1-lead", "strategy2-lead", "secretary-lead"].map((id) => this.agentById.get(id)!);
    const ceo = this.agentById.get("ceo")!;
    this.lock([...approvers, ceo]);
    approvers.forEach((agent, i) => {
      this.stand(agent);
      const seat = this.bookSeat(agent, i);
      this.goto(agent, seat, "회의 중");
      this.enqueue(agent, { k: "face", dir: seat.y < 7 ? "down" : "up" }, { k: "anim", a: "sit" });
    });
    const ceoSeat = this.bookSeat(ceo, 3);
    this.enqueue(
      ceo,
      { k: "anim", a: "idle" },
      { k: "status", s: "회의 중" },
      { k: "walk", to: ceoSeat },
      { k: "face", dir: ceoSeat.y < 7 ? "down" : "up" },
      { k: "anim", a: "sit" },
    );
    yield this.allFree([...approvers, ceo]);

    let finalDecision = false;
    while (!finalDecision) {
      const item: ApprovalItem = this.approvalItem!;
      this.approvalPending = true;
      this.decision = null;
      this.meetingTitle = "콘텐츠·상품 TOP 3 대표 승인";
      this.pushLog("📋", `대표 승인 대기: '${item.content.title}' + '${item.product.name}'`, "yellow");

      this.say(approvers[0], `콘텐츠는 '${item.content.title}'예요.`, 3.4);
      yield 2.4;
      this.say(approvers[1], `상품은 ${item.product.name}, ${item.product.price}이에요.`, 3.2);
      yield 2.4;
      this.say(approvers[2], "대표님, 확인 부탁드려요.", 3.2);
      yield 2.2;
      this.say(ceo, "확인해볼게요.", 2.4);

      // 대표가 승인 / 수정 요청 / 폐기 중 하나를 고를 때까지 대기
      yield () => this.decision !== null;

      if (this.decision === "approved") {
        finalDecision = true;
      } else if (this.decision === "discard") {
        this.briefIndex = (this.briefIndex + 1) % BRIEF_POOL.length;
        this.approvalItem = { ...BRIEF_POOL[this.briefIndex] };
        this.say(approvers[0], "네, 완전히 새 각도로 다시 가져올게요.", 2.8);
        this.pushLog("🗑️", "대표 폐기 — 기획 1팀이 다른 콘텐츠·상품으로 재준비", "lav");
        yield 3;
      } else if (this.decision === "revise") {
        const note = this.pendingFeedback || "디테일 다듬기";
        this.approvalItem = { ...item, note };
        this.say(approvers[0], "말씀하신 대로 다듬어서 다시 가져올게요.", 2.8);
        this.pushLog("✏️", `대표 수정 요청 — "${note}" 반영 중`, "lav");
        yield 3;
      }
    }

    this.approvalPending = false;
    this.approved = true;
    this.meetingTitle = null;
    this.say(ceo, "승인! 이대로 갑시다.", 2.8);
    this.pushLog("✅", `대표 승인 완료 — ${this.approvalItem!.content.title} 제작을 시작합니다.`, "mint");
    yield 1.6;
    for (const agent of approvers) {
      this.releaseSeat(agent);
      this.stand(agent);
      this.sitAtDesk(agent);
    }
    this.releaseSeat(ceo);
    this.enqueue(ceo, { k: "anim", a: "idle" }, { k: "walk", to: CEO_SEAT }, { k: "face", dir: "down" }, { k: "anim", a: "sit" }, { k: "status", s: "업무 중" });
    yield this.allFree([...approvers, ceo]);
    this.unlock([...approvers, ceo]);

    // ⑨ 기획 2팀 — 대본·상품기획서 작성
    this.phaseIndex = 8;
    yield* this.runDept("strategy2", "릴스·캐러셀 대본 + 상품기획서 집필", 7, "대본 완성했고 상품 스펙·옵션·가격안까지 잡았어요.");

    // ⑩ 제작 인수인계 → 영상·이미지 동시 작업
    this.phaseIndex = 9;
    yield* this.deliver("strategy2-lead", "reels", "릴스 대본 넘길게요. 30초 컷이에요.", "받았어요! 무음컷부터 칠게요.");
    yield* this.deliver("strategy2-lead", "carousel", "캐러셀 원고랑 상세페이지 구성안이에요.", "표지 3안부터 뽑을게요.");

    this.startDept("reels", "촬영본 컷 편집·자막 작업", 8);
    this.startDept("carousel", "이미지 보정·캐러셀/상세페이지 구성", 8);
    yield () => this.deptStatus.reels === "완료" && this.deptStatus.carousel === "완료";
    this.pushLog("🎬", "릴스 초안 1건 · 캐러셀+상세페이지 구성 완료 (원본 마스터는 그대로 보존)", "mint");

    // ⑪ 정산 / 마케팅 병행 — 정산은 실제 진행, 마케팅은 광고 채널 연동 대기
    this.phaseIndex = 10;
    this.startDept("finance", "이번 주 입금 대기 건 정리", 6);
    const leo = this.agentById.get("ops-lead")!;
    this.stand(leo);
    this.say(leo, "광고 채널 데이터가 아직 미연동이라 판단을 못 내려요.", 3);
    this.pushLog("📣", "마케팅팀: 광고 채널 성과 데이터 미연동 → 증액·감액 판단 보류, 기록만 남김", "lav");
    this.goto(leo, rand(LOUNGE_ROOM.loiter), "휴식");
    this.enqueue(
      leo,
      { k: "anim", a: "coffee" },
      { k: "wait", dur: 4 },
      { k: "fn", fn: () => this.say(leo, "연동되면 바로 채널별 제안 만들게요.", 2.4) },
    );
    this.sitAtDesk(leo);
    yield () => this.deptStatus.finance === "완료";
    this.pushLog("🧾", "정산팀: 입금 대기 3건 정리 완료 (결제는 진행하지 않음)", "mint");

    // ⑫ 성과리뷰팀 — SNS/판매 데이터 미연동
    const zoe = this.agentById.get("review-lead")!;
    this.stand(zoe);
    this.say(zoe, "Instagram 미연동이라 수치는 못 만들어요.", 3);
    this.pushLog("📈", "성과리뷰팀: Instagram·판매 데이터 미연동 → 추측 대신 기록만 남김", "lav");
    this.goto(zoe, rand(LOUNGE_ROOM.loiter), "휴식");
    this.enqueue(
      zoe,
      { k: "anim", a: "coffee" },
      { k: "wait", dur: 4 },
      { k: "fn", fn: () => this.say(zoe, "연결되면 바로 돌립니다.", 2.4) },
    );
    this.sitAtDesk(zoe);

    // ⑬ 켈리 브리핑
    this.phaseIndex = 11;
    this.lock([seri]);
    this.stand(seri);
    this.say(seri, "전사 보고 취합했어요. 대표님께 갑니다.", 3);
    this.goto(seri, CEO_REPORT_SPOT, "보고 중");
    this.enqueue(seri, { k: "face", dir: "up" });
    yield this.allFree([seri]);
    this.say(seri, "대표님, 오늘 결정할 건 이제 없어요.", 3.2);
    this.say(ceo, "고생했어요 ✨", 2.6);
    this.deptStatus.secretary = "완료";
    this.briefingReady = true;
    this.onBriefing?.();
    const stats = this.snapshot().stats;
    this.pushLog("📋", `켈리 최종 브리핑 완료 — 완료 ${stats.done}팀 · 연동 대기 ${stats.blocked}팀`, "pink");
    yield 3;
    this.stand(seri);
    this.sitAtDesk(seri);
    yield this.allFree([seri]);
    this.unlock([seri]);

    this.phaseIndex = 12;
    this.dayComplete = true;
    this.running = false;
    this.pushLog("🎀", "오늘 업무 종료. 직원들이 라운지로 이동합니다.", "yellow");

    for (const agent of workers) {
      if (Math.random() < 0.45) {
        this.stand(agent);
        this.goto(agent, rand(LOUNGE_ROOM.loiter), "휴식");
      }
    }
  }

  /** 부서 업무 시작(비동기) */
  private startDept(deptId: string, label: string, dur: number) {
    this.deptStatus[deptId] = "진행 중";
    const crew = this.deptAgents(deptId);
    this.lock(crew);
    this.pushLog(roomOf(deptId).icon, `${roomOf(deptId).name} 업무 시작 — ${label}`, "pink");
    crew.forEach((agent, i) => {
      this.enqueue(
        agent,
        { k: "wait", dur: i * 0.35 },
        { k: "walk", to: agent.home },
        { k: "face", dir: "up" },
        { k: "status", s: "업무 중" },
        { k: "work", dur: dur + Math.random() * 1.5, label },
        { k: "anim", a: "sit" },
        { k: "status", s: "대기" },
        { k: "fn", fn: () => this.finishDept(deptId) },
      );
    });
  }

  private finishDept(deptId: string) {
    if (this.deptAgents(deptId).some((a) => a.status === "업무 중")) return;
    if (this.deptStatus[deptId] === "완료") return;
    this.deptStatus[deptId] = "완료";
    this.unlock(this.deptAgents(deptId));
    const lead = DEPT_LEAD[deptId];
    const agent = lead ? this.agentById.get(lead.id) : null;
    if (agent) this.say(agent, "완료했어요!", 2.4);
    this.pushLog(roomOf(deptId).icon, `${roomOf(deptId).name} 완료 — ${DEPT_BRIEF[deptId].report}`, "mint");
  }

  private *runDept(deptId: string, label: string, dur: number, report: string) {
    this.startDept(deptId, label, dur);
    yield () => this.deptStatus[deptId] === "완료";
    const lead = this.agentById.get(DEPT_LEAD[deptId].id);
    if (lead) this.say(lead, report, 3.2);
    yield 1.2;
  }

  /** 회의: 참석자 소집 → 대사 → 자리 복귀 */
  private *meeting(title: string, ids: string[], lines: [string, string][]) {
    this.meetingTitle = title;
    this.pushLog("💬", `회의 소집: ${title} (${ids.length}명)`, "lav");
    const crew = ids.map((id) => this.agentById.get(id)!);
    this.lock(crew);
    crew.forEach((agent, i) => {
      this.stand(agent);
      this.say(agent, "회의실로 갈게요.", 2);
      const seat = this.bookSeat(agent, i);
      this.goto(agent, seat, "회의 중");
      this.enqueue(
        agent,
        { k: "face", dir: seat.y < 7 ? "down" : "up" },
        { k: "anim", a: "sit" },
        { k: "status", s: "회의 중" },
      );
    });
    yield this.allFree(crew);
    yield 0.6;

    for (const [id, text] of lines) {
      const speaker = this.agentById.get(id)!;
      speaker.anim = "talk";
      this.say(speaker, text, 3.2);
      this.pushLog("🗣️", `${speaker.name}: “${text}”`, "lav");
      yield 2.3;
      speaker.anim = "sit";
    }

    yield 0.8;
    for (const agent of crew) {
      this.releaseSeat(agent);
      this.stand(agent);
      this.sitAtDesk(agent);
    }
    this.meetingTitle = null;
    yield this.allFree(crew);
    this.unlock(crew);
  }

  /** 부서 간 전달 — 직접 걸어가서 말하고 돌아온다 */
  private *deliver(fromId: string, toDeptId: string, line: string, reply: string) {
    const from = this.agentById.get(fromId)!;
    const toLead = this.agentById.get(DEPT_LEAD[toDeptId].id)!;
    const room = roomOf(toDeptId);
    const spot = { x: toLead.home.x, y: Math.min(toLead.home.y + 2, room.y + room.h - 2) };

    this.lock([from, toLead]);
    this.stand(from);
    this.goto(from, walkable(spot.x, spot.y) ? spot : doorApproach(room), "이동 중");
    yield this.allFree([from]);
    from.anim = "talk";
    this.say(from, line, 3);
    this.pushLog("🤝", `${from.name} → ${room.name}: “${line}”`, "pink");
    yield 2;
    this.say(toLead, reply, 2.8);
    yield 1.6;
    from.anim = "idle";
    this.sitAtDesk(from);
    yield this.allFree([from]);
    this.unlock([from, toLead]);
  }

  private stand(agent: Agent) {
    agent.anim = "idle";
    agent.progress = 0;
  }

  /** 테이블을 사이에 두고 마주보도록 위·아래 줄을 번갈아 배정한다 */
  private bookSeat(agent: Agent, preferred: number): Pt {
    const zigzag = [0, 4, 1, 5, 2, 6, 3, 7];
    const taken = new Set([...this.seatBook.values()].map((p) => `${p.x},${p.y}`));
    const order = [zigzag[preferred % zigzag.length], ...zigzag];
    for (const i of order) {
      const seat = MEETING_SEATS[i % MEETING_SEATS.length];
      if (!taken.has(`${seat.x},${seat.y}`)) {
        this.seatBook.set(agent.id, seat);
        return seat;
      }
    }
    return MEETING_SEATS[0];
  }

  private releaseSeat(agent: Agent) {
    this.seatBook.delete(agent.id);
  }

  // ── 대표 지시창 ──────────────────────────────────────────
  pushChat(from: "ceo" | "staff", name: string, text: string) {
    this.chat.push({ id: this.logSeq++, time: this.clockText(), from, name, text });
    if (this.chat.length > 60) this.chat.shift();
  }

  /** 지시창에 들어온 한 줄을 해석해 보고하거나 실제로 지시를 실행한다 */
  command(raw: string) {
    const text = raw.trim();
    if (!text) return;
    this.pushChat("ceo", CEO.name, text);
    const q = text.toLowerCase();

    // ① 특정 부서·직원 지목
    const deptId = this.matchDept(text);
    if (deptId && !/전체|모두|다들/.test(text)) {
      this.deptReport(deptId, text);
      return;
    }

    // ② 지시(실제로 동작하는 명령)
    if (/집중|커피 ?금지|딴짓|자리 지켜/.test(text)) return this.setFocusMode(true);
    if (/자유|쉬어|휴식 허용|집중 해제/.test(text)) return this.setFocusMode(false);
    if (/자리로|복귀|착석/.test(text)) return this.recallAll();
    if (/빨리|서둘|속도|급해|당겨/.test(text)) return this.boost();
    if (/회의|모여|소집/.test(text)) return this.convene();
    if (/브리핑|보고하러|올라와/.test(text)) return this.briefNow();
    if (/승인|오케이|고고|진행해/.test(text) && this.approvalPending) {
      this.approve();
      this.pushChat("staff", "켈리", "승인 접수했습니다. 제작팀에 바로 넘길게요.");
      return;
    }
    if (/수고|칭찬|잘했|좋아요|고마/.test(text)) return this.cheer();

    // ③ 질문(보고)
    if (/왜|늦|지연|막힘|블로|안 되|안돼|문제/.test(text)) return this.reportDelay();
    if (/뭐|현황|상황|진행|보고|어디까지|status/.test(q)) return this.reportStatus();

    this.pushChat(
      "staff",
      "켈리",
      "이렇게 물어보시면 제일 빨라요 — “현황 보고” / “왜 늦어져?” / “시장조사팀 뭐해?” / “회의 소집” / “집중 모드” / “지금 브리핑”.",
    );
  }

  // ── 보고 ────────────────────────────────────────────────
  private reportStatus() {
    if (!this.running && !this.dayComplete) {
      this.pushChat("staff", "켈리", "아직 출근 전이에요. ‘오늘 업무 시작하기’를 눌러주시면 전원 출근합니다.");
      return;
    }
    const working = this.workingDepts();
    const lines: string[] = [`지금 ${this.clockText()} · ‘${PHASES[this.phaseIndex]}’ 단계입니다.`];

    if (working.length) {
      lines.push(`진행 중: ${working.map((d) => `${roomOf(d).name} ${this.deptProgress(d)}%`).join(" · ")}`);
    } else if (this.approvalPending) {
      lines.push("전 부서가 대표님 결재를 기다리는 중입니다.");
    } else if (this.dayComplete) {
      lines.push("오늘 업무는 모두 끝났어요.");
    } else if (this.meetingTitle) {
      lines.push(`회의 진행 중 — ${this.meetingTitle}`);
    } else {
      lines.push("지금은 앞 단계 결과를 넘기는 중이라 잠깐 비어 있어요. 곧 다음 팀이 붙습니다.");
    }

    const stats = this.snapshot().stats;
    lines.push(`완료 ${stats.done}팀 · 연동 대기 ${stats.blocked}팀 · 근무 인원 ${this.onDutyCount()}명.`);
    const next = PHASES[this.phaseIndex + 1];
    if (next && !this.dayComplete) lines.push(`다음 순서는 ‘${next}’입니다.`);

    this.pushChat("staff", "켈리", lines.join("\n"));
    this.speakSecretary("현황 정리해서 올렸어요.");
  }

  private reportDelay() {
    const lines: string[] = [];

    if (this.approvalPending) {
      const waited = Math.max(1, Math.round(this.elapsed - (this.approvalSince ?? this.elapsed)));
      lines.push(
        `원인은 하나예요 — 대표님 결재 대기입니다. 회의실에서 코코·렌·켈리가 ${waited}초째 기다리고 있어요.`,
      );
      lines.push("승인만 눌러주시면 바로 대본 작성으로 넘어갑니다.");
    }

    const working = this.workingDepts();
    for (const dept of working) {
      lines.push(`${roomOf(dept).name}: ${this.deptTaskLabel(dept)} — 진행률 ${this.deptProgress(dept)}%. 정상 속도예요.`);
    }

    const blocked = Object.entries(this.deptStatus)
      .filter(([, s]) => s === "연동 대기")
      .map(([dept]) => dept);
    if (blocked.length) {
      if (lines.length) {
        // 이미 진짜 병목을 짚었으면 연동 대기는 한 줄로 요약한다
        lines.push(`그 외 연동 대기 ${blocked.length}팀(${blocked.map((d) => roomOf(d).name).join("·")})은 외부 연결 문제라 오늘 진행이 어려워요.`);
      } else {
        for (const dept of blocked) {
          lines.push(`${roomOf(dept).name}: ${BLOCK_REASON[dept] ?? "외부 연동 대기 중이에요."}`);
        }
      }
    }

    const away = this.agents.filter((a) => a.status === "휴식").length;
    if (away) lines.push(`참고로 지금 ${away}명이 라운지에 있어요. ‘집중 모드’라고 하시면 전원 자리로 붙입니다.`);

    if (!lines.length) {
      lines.push(
        this.running ? "지연 없습니다. 대기 중인 병목도 없어요." : "아직 출근 전이라 진행할 업무가 없어요.",
      );
    }
    this.pushChat("staff", "켈리", lines.join("\n"));
    this.speakSecretary("지연 사유 보고드렸어요.");
  }

  private deptReport(deptId: string, question: string) {
    const room = roomOf(deptId);
    const lead = this.agentById.get(DEPT_LEAD[deptId].id)!;
    const status = this.deptStatus[deptId];
    const crew = this.deptAgents(deptId);
    const lines: string[] = [];

    if (status === "진행 중") {
      lines.push(`${this.deptTaskLabel(deptId)} 작업 중이에요. 진행률 ${this.deptProgress(deptId)}%.`);
    } else if (status === "완료") {
      lines.push(`오늘 몫은 끝냈어요. ${DEPT_BRIEF[deptId].report}`);
    } else if (status === "연동 대기") {
      lines.push(BLOCK_REASON[deptId] ?? "외부 연동을 기다리는 중이에요.");
    } else if (status === "승인 대기") {
      lines.push("대표님 결재를 기다리는 중입니다. 승인 주시면 바로 움직여요.");
    } else {
      lines.push(`앞 단계 결과를 기다리는 중이에요. 오늘 제 일은 ‘${DEPT_BRIEF[deptId].task}’입니다.`);
    }
    lines.push(`팀원 현황: ${crew.map((a) => `${a.name}(${a.status})`).join(" · ")}`);
    if (/왜|늦|지연/.test(question) && status === "대기") {
      lines.push("저희가 늦는 게 아니라 앞 팀 산출물이 아직 안 왔어요.");
    }

    this.pushChat("staff", `${lead.name} · ${room.name}`, lines.join("\n"));
    this.say(lead, "대표님, 보고드릴게요!", 3);
    lead.anim = "talk";
    this.spotlightRoom(deptId, 8);
    this.pushLog("🎤", `대표 지시: ${room.name} 상황 확인`, "yellow");
  }

  /**
   * 직원 프로필 창에서 그 사람에게만 1:1로 묻는다.
   * 인사·격려는 그 사람 성격으로 짧게 받고, 업무 질문은 부서 보고 로직을 그대로 재사용한다.
   * (실제 LLM 대화가 아니라 상태·혼잣말 기반의 규칙 응답입니다.)
   */
  askPersonal(agentId: string, question: string): string {
    const agent = this.agentById.get(agentId);
    const text = question.trim();
    if (!agent || !text) return "";

    if (agent.rank === "ceo") return "대표님이신데 저한테 물어보시는 거예요? 😄";
    if (agent.status === "출근 전") return "아직 출근 전이에요. 오늘 업무를 시작하면 바로 답할게요.";

    if (/안녕|하이|반가/.test(text)) {
      const reply = rand([`안녕하세요, 대표님! ${agent.role}입니다.`, "네 대표님, 부르셨어요?"]);
      this.say(agent, reply, 2.6);
      return reply;
    }
    if (/수고|고마|잘했|좋아요|고생|화이팅|힘내/.test(text)) {
      const reply = rand(["감사합니다 🩷", "더 잘해볼게요!", "힘이 나요 ✨"]);
      this.say(agent, reply, 2.6);
      return reply;
    }

    const before = this.chat.length;
    this.deptReport(agent.deptId, text);
    const added = this.chat.slice(before);
    return added.length ? added[added.length - 1].text : rand(agent.thoughts);
  }

  // ── 지시 실행 ────────────────────────────────────────────
  private setFocusMode(on: boolean) {
    this.focusMode = on;
    if (on) {
      this.recallAll(true);
      this.pushChat("staff", "켈리", "집중 모드 켰습니다. 커피·잡담 없이 전원 자리에서 업무만 봅니다.");
      this.pushLog("🎤", "대표 지시: 집중 모드 ON — 자율 휴식 중단", "yellow");
    } else {
      this.pushChat("staff", "켈리", "집중 모드 껐어요. 다들 숨 좀 돌리겠습니다 ☕");
      this.pushLog("🎤", "대표 지시: 집중 모드 OFF", "yellow");
    }
  }

  private recallAll(quiet = false) {
    let moved = 0;
    for (const agent of this.agents) {
      if (agent.rank === "ceo" || this.locked.has(agent.id) || agent.status === "출근 전") continue;
      if (Math.abs(agent.x - agent.home.x) < 0.2 && Math.abs(agent.y - agent.home.y) < 0.2) continue;
      agent.queue.length = 0;
      agent.current = null;
      this.say(agent, "네, 바로 갈게요!", 2.4);
      this.sitAtDesk(agent);
      moved += 1;
    }
    if (!quiet) {
      this.pushChat("staff", "켈리", moved ? `${moved}명 자리로 복귀시켰습니다.` : "다들 이미 자리에 있어요.");
      this.pushLog("🎤", `대표 지시: 전원 자리 복귀 (${moved}명 이동)`, "yellow");
    }
  }

  private boost() {
    let count = 0;
    for (const agent of this.agents) {
      if (agent.current?.k === "work") {
        agent.current.dur = Math.max(agent.timer + 0.8, agent.current.dur * 0.55);
        this.say(agent, "네! 속도 올릴게요", 2.4);
        count += 1;
      }
    }
    this.speed = Math.min(4, this.speed * 2);
    this.pushChat(
      "staff",
      "켈리",
      count ? `작업 ${count}건 속도 올렸고 배속도 ${this.speed}x로 바꿨습니다.` : `지금 돌아가는 작업이 없어서 배속만 ${this.speed}x로 올렸어요.`,
    );
    this.pushLog("🎤", `대표 지시: 속도 올리기 (${this.speed}x)`, "yellow");
  }

  private cheer() {
    for (const agent of this.agents) {
      if (agent.rank === "ceo" || agent.status === "출근 전") continue;
      this.say(agent, rand(["감사합니다 🩷", "힘나요!", "더 잘할게요 ✨"]), 3.2);
    }
    this.pushChat("staff", "켈리", "대표님 한마디에 사무실 분위기가 확 살았어요 🩷");
    this.pushLog("🎀", "대표 격려 — 전 직원 사기 상승", "pink");
  }

  private convene() {
    if (this.side.gen) {
      this.pushChat("staff", "켈리", "앞선 지시를 아직 처리 중이에요. 끝나면 바로 잡겠습니다.");
      return;
    }
    const ids = Object.keys(this.deptStatus)
      .map((dept) => DEPT_LEAD[dept].id)
      .filter((id) => !this.locked.has(id) && this.agentById.get(id)?.status !== "출근 전")
      .slice(0, 8);
    if (!ids.length) {
      this.pushChat("staff", "켈리", "지금은 다들 진행 중인 업무가 있어 소집이 어려워요. 잠시 뒤 다시 불러주세요.");
      return;
    }
    this.pushChat("staff", "켈리", `${ids.length}명 회의실로 소집했습니다. 각자 한 줄씩 보고할게요.`);
    this.pushLog("🎤", `대표 지시: 긴급 회의 소집 (${ids.length}명)`, "yellow");
    this.spotlightRoom("meeting", 24);
    this.side.gen = this.conveneScene(ids);
  }

  private *conveneScene(ids: string[]): Generator<number | (() => boolean), void, void> {
    const lines = ids.map((id) => {
      const agent = this.agentById.get(id)!;
      const status = this.deptStatus[agent.deptId];
      const text =
        status === "진행 중"
          ? `${this.deptTaskLabel(agent.deptId)} ${this.deptProgress(agent.deptId)}% 진행 중입니다.`
          : status === "완료"
            ? "오늘 몫은 끝냈습니다."
            : status === "연동 대기"
              ? (BLOCK_REASON[agent.deptId] ?? "외부 연동 대기 중입니다.")
              : "앞 단계 결과를 기다리는 중입니다.";
      return [id, text] as [string, string];
    });
    yield* this.meeting("대표 긴급 소집 · 전 부서 한 줄 보고", ids, lines);
    this.pushChat("staff", "켈리", "회의 마쳤습니다. 전원 자리로 복귀했어요.");
  }

  private briefNow() {
    if (this.side.gen) {
      this.pushChat("staff", "켈리", "앞선 지시를 처리 중이에요. 끝나고 바로 올라가겠습니다.");
      return;
    }
    const seri = this.agentById.get("secretary-lead")!;
    if (this.locked.has(seri.id)) {
      this.pushChat("staff", "켈리", "지금 다른 일정에 묶여 있어요. 마치는 대로 대표실로 가겠습니다.");
      return;
    }
    this.pushLog("🎤", "대표 지시: 즉시 브리핑 요청", "yellow");
    this.side.gen = this.briefScene(seri);
  }

  private *briefScene(seri: Agent): Generator<number | (() => boolean), void, void> {
    this.lock([seri]);
    this.stand(seri);
    this.say(seri, "대표님께 지금 보고드리러 갑니다.", 3);
    this.goto(seri, CEO_REPORT_SPOT, "보고 중");
    this.enqueue(seri, { k: "face", dir: "up" });
    yield this.allFree([seri]);
    seri.anim = "talk";
    this.say(seri, "바로 보고드릴게요.", 3);
    this.reportStatus();
    yield 3;
    seri.anim = "idle";
    this.stand(seri);
    this.sitAtDesk(seri);
    yield this.allFree([seri]);
    this.unlock([seri]);
  }

  // ── 보고용 계산 ──────────────────────────────────────────
  private workingDepts() {
    return Object.entries(this.deptStatus)
      .filter(([, status]) => status === "진행 중")
      .map(([dept]) => dept);
  }

  private deptProgress(deptId: string) {
    const crew = this.deptAgents(deptId);
    if (!crew.length) return 0;
    return Math.round((crew.reduce((sum, a) => sum + a.progress, 0) / crew.length) * 100);
  }

  private deptTaskLabel(deptId: string) {
    const crew = this.deptAgents(deptId);
    return crew.find((a) => a.status === "업무 중")?.taskLabel ?? DEPT_BRIEF[deptId].task;
  }

  private onDutyCount() {
    return this.agents.filter((a) => a.rank !== "ceo" && a.status !== "출근 전").length;
  }

  private speakSecretary(text: string) {
    const seri = this.agentById.get("secretary-lead");
    if (seri && seri.status !== "출근 전") this.say(seri, text, 3);
  }

  private spotlightRoom(roomId: string, seconds: number) {
    this.spotlight = roomId;
    this.spotlightUntil = this.elapsed + seconds;
  }

  /** 질문에 등장한 부서·이름을 찾아낸다 (구체적인 키워드부터 검사) */
  private matchDept(text: string): string | null {
    for (const [deptId, words] of DEPT_KEYWORDS) {
      if (words.some((word) => text.includes(word))) return deptId;
    }
    const staff = STAFF.find((s) => text.includes(s.name) || (s.callsign && text.includes(s.callsign)));
    return staff?.deptId ?? null;
  }

  // ── 대표 액션 ────────────────────────────────────────────
  approve() {
    if (!this.approvalPending) return;
    this.decision = "approved";
  }

  /** 사규 승인 선택지 — 수정 요청: 피드백을 남기고 같은 안을 다듬어 다시 받는다 */
  requestRevision(feedback: string) {
    if (!this.approvalPending) return;
    this.pendingFeedback = feedback.trim();
    this.decision = "revise";
  }

  /** 사규 승인 선택지 — 폐기: 이 안은 버리고 다른 콘텐츠·상품으로 다시 받는다 */
  discardItem() {
    if (!this.approvalPending) return;
    this.decision = "discard";
  }

  setBriefingHandler(handler: (() => void) | null) {
    this.onBriefing = handler;
  }

  togglePause() {
    this.paused = !this.paused;
  }

  setSpeed(value: number) {
    this.speed = value;
    this.turbo = false;
  }

  /** 대표가 결정할 일이 생길 때까지(또는 업무 종료까지) 단숨에 건너뛴다 */
  skipToDecision() {
    if (!this.running || this.approvalPending || this.dayComplete) return;
    this.turbo = true;
    this.paused = false;
    this.pushLog("⏭", "대표 지시: 결정이 필요한 지점까지 건너뜁니다.", "yellow");
  }

  // ── 틱 ──────────────────────────────────────────────────
  tick(rawDt: number) {
    if (this.paused) return;
    // 터보(건너뛰기)는 대표 결정이 필요한 지점이나 업무 종료에서 자동 해제된다
    if (this.turbo && (this.approvalPending || this.dayComplete || !this.running)) this.turbo = false;

    const raw = Math.min(rawDt, 0.05);
    const dt = raw * (this.turbo ? TURBO_SPEED : this.speed);
    if (this.running) this.clockMinutes += dt * SIM_MIN_PER_SEC;

    this.occupancy.clear();
    for (const agent of this.agents) {
      this.occupancy.add(Math.round(agent.y) * COLS + Math.round(agent.x));
    }

    for (const agent of this.agents) this.stepAgent(agent, dt);
    this.runSlot(this.main, dt);
    this.runSlot(this.side, dt);

    this.elapsed += dt;
    if (this.spotlight && this.elapsed > this.spotlightUntil) this.spotlight = null;
    if (this.approvalPending && this.approvalSince === null) this.approvalSince = this.elapsed;
    if (!this.approvalPending) this.approvalSince = null;
  }

  private runSlot(slot: Slot, dt: number) {
    if (!slot.gen) return;
    if (slot.wait > 0) {
      slot.wait -= dt;
      return;
    }
    if (slot.until) {
      if (!slot.until()) return;
      slot.until = null;
    }
    const result = slot.gen.next();
    if (result.done) {
      slot.gen = null;
      return;
    }
    if (typeof result.value === "number") slot.wait = result.value;
    else slot.until = result.value;
  }

  private stepAgent(agent: Agent, dt: number) {
    if (agent.speechFor > 0) {
      agent.speechFor -= dt;
      if (agent.speechFor <= 0) agent.speech = null;
    }

    if (!agent.current) {
      const next = agent.queue.shift();
      if (next) {
        agent.current = next;
        agent.timer = 0;
        this.beginAction(agent, next);
      } else {
        this.idleBrain(agent, dt);
        return;
      }
    }

    const action = agent.current;
    if (!action) return;
    agent.timer += dt;

    switch (action.k) {
      case "walk": {
        this.stepWalk(agent, dt);
        if (agent.pathIdx >= agent.path.length) {
          agent.path = [];
          agent.anim = "idle";
          agent.current = null;
        }
        break;
      }
      case "wait":
      case "say": {
        if (agent.timer >= action.dur) agent.current = null;
        break;
      }
      case "work": {
        agent.anim = "type";
        agent.progress = Math.min(1, agent.timer / action.dur);
        agent.taskLabel = action.label;
        if (agent.timer >= action.dur) {
          agent.progress = 1;
          agent.current = null;
        }
        break;
      }
      default:
        agent.current = null;
    }
  }

  private beginAction(agent: Agent, action: Action) {
    switch (action.k) {
      case "walk": {
        const path = findPath(
          { x: Math.round(agent.x), y: Math.round(agent.y) },
          action.to,
          this.occupancy,
        );
        agent.path = path;
        agent.pathIdx = 0;
        agent.anim = path.length ? "walk" : "idle";
        if (agent.status === "대기" || agent.status === "휴식") agent.status = "이동 중";
        break;
      }
      case "say":
        this.say(agent, action.text, action.dur, action.kind);
        break;
      case "face":
        agent.facing = action.dir;
        agent.current = null;
        break;
      case "anim":
        agent.anim = action.a;
        agent.current = null;
        break;
      case "status":
        agent.status = action.s;
        agent.current = null;
        break;
      case "fn":
        action.fn();
        agent.current = null;
        break;
      default:
        break;
    }
  }

  private stepWalk(agent: Agent, dt: number) {
    if (agent.pathIdx >= agent.path.length) return;
    const node = agent.path[agent.pathIdx];
    const dx = node.x - agent.x;
    const dy = node.y - agent.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 0.06) {
      agent.x = node.x;
      agent.y = node.y;
      agent.pathIdx += 1;
      return;
    }

    if (Math.abs(dx) > Math.abs(dy)) agent.facing = dx > 0 ? "right" : "left";
    else agent.facing = dy > 0 ? "down" : "up";

    const step = WALK_SPEED * dt;
    agent.x += (dx / dist) * Math.min(step, dist);
    agent.y += (dy / dist) * Math.min(step, dist);
    agent.anim = "walk";
  }

  /** 할 일이 없을 때의 자율 행동 — 생각 말풍선, 커피, 잡담 */
  private idleBrain(agent: Agent, dt: number) {
    if (agent.rank === "ceo" || this.locked.has(agent.id)) return;
    agent.idleFor -= dt;
    if (agent.idleFor > 0) return;
    agent.idleFor = 7 + Math.random() * 14;

    const roll = Math.random();
    const blocked = BLOCKED_DEPTS.has(agent.deptId) && this.deptStatus[agent.deptId] === "연동 대기";

    if (agent.status === "출근 전") return;

    if (roll < 0.5 || this.focusMode) {
      // 집중 모드에서는 자리에서 생각만 한다 — 커피·잡담 금지
      this.say(agent, rand(agent.thoughts), 3.4, "think");
      return;
    }
    if (roll < 0.68 || blocked) {
      // 라운지 커피 타임
      this.stand(agent);
      this.enqueue(
        agent,
        { k: "status", s: "휴식" },
        { k: "walk", to: rand(LOUNGE_ROOM.loiter) },
        { k: "face", dir: "down" },
        { k: "anim", a: "coffee" },
        { k: "say", text: rand(["잠깐 커피 ☕", "머리 좀 식히고요", "당 충전 필요해요"]), dur: 2.6, kind: "talk" },
        { k: "wait", dur: 3 + Math.random() * 4 },
      );
      this.sitAtDesk(agent);
      return;
    }
    if (roll < 0.82) {
      // 옆자리 잡담
      const mate = this.agents.find(
        (a) => a.deptId === agent.deptId && a.id !== agent.id && !this.busy(a) && a.status !== "출근 전",
      );
      if (mate) {
        this.say(agent, rand(["이거 어떻게 생각해요?", "잠깐만요, 이거 봐봐요", "저장할 만한가요 이거?"]), 3);
        this.say(mate, rand(["오, 괜찮은데요?", "각도를 살짝 틀면 좋겠어요", "근거만 붙이면 돼요"]), 3);
        agent.anim = "talk";
        mate.anim = "talk";
        this.enqueue(agent, { k: "wait", dur: 2.6 }, { k: "anim", a: "sit" });
        this.enqueue(mate, { k: "wait", dur: 2.6 }, { k: "anim", a: "sit" });
      }
      return;
    }
    // 자리 정리
    if (Math.abs(agent.x - agent.home.x) > 0.1 || Math.abs(agent.y - agent.home.y) > 0.1) {
      this.sitAtDesk(agent);
    }
  }

  // ── 스냅샷 ──────────────────────────────────────────────
  snapshot(): Snapshot {
    const counts = {} as Record<AgentStatus, number>;
    for (const agent of this.agents) {
      counts[agent.status] = (counts[agent.status] ?? 0) + 1;
    }
    const values = Object.values(this.deptStatus);
    return {
      clock: this.clockText(),
      running: this.running,
      paused: this.paused,
      speed: this.speed,
      turbo: this.turbo,
      dayComplete: this.dayComplete,
      phase:
        this.phaseIndex === 7 && this.approved ? "승인 완료 · 자리 복귀" : PHASES[this.phaseIndex] ?? "",
      phaseIndex: this.phaseIndex,
      approvalPending: this.approvalPending,
      approvalItem: this.approvalItem,
      approved: this.approved,
      briefingReady: this.briefingReady,
      deptStatus: { ...this.deptStatus },
      counts,
      stats: {
        done: values.filter((v) => v === "완료").length,
        working: values.filter((v) => v === "진행 중").length,
        approval: values.filter((v) => v === "승인 대기").length,
        blocked: values.filter((v) => v === "연동 대기").length,
      },
      log: this.log.slice(0, 24),
      meetingTitle: this.meetingTitle,
      chat: this.chat.slice(-24),
      focusMode: this.focusMode,
      spotlight: this.spotlight,
      busyWithOrder: this.side.gen !== null,
    };
  }
}

export const TOTAL_PHASES = PHASES.length;
export { PHASES };
