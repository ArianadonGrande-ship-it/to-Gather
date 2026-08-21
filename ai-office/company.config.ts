// ============================================================
//  치코스튜디오 AI 회사 설정 — 여기 한 파일만 고치면 됩니다
// ============================================================
//  회사 이름, 부서 이름, 직원 이름·성격·머리색까지 전부 여기 있어요.
//  다른 파일은 건드리지 않아도 됩니다.
//
//  ⚠️ 딱 2가지 규칙
//   1. 부서 id(research, brand, ...)는 절대 바꾸지 마세요. 시뮬레이션 엔진이
//      이 id로 움직입니다. 바꾸면 캐릭터가 길을 잃어요.
//      → 바꿔도 되는 건 name(부서 이름) · icon · short 입니다.
//   2. 부서는 12개를 유지하세요. 사무실 배치가 4열 3행 = 12칸 고정입니다.
//      안 쓰는 부서는 지우지 말고 이름만 바꿔서 쓰세요.
//
//  직원 수는 자유롭게 늘리고 줄여도 됩니다. 한 팀에 팀장(lead) 1명은 두세요.
//  이름 표기: name = 채팅·대사에 쓰이는 한글 이름 / callsign = 캐릭터 위·프로필에 뜨는 영문 이름
// ============================================================

/** 회사 기본 정보 */
export const COMPANY = {
  /** 좌측 상단 헤더에 뜨는 회사 이름 */
  name: "치코스튜디오",
  /** 헤더 로고 배지에 들어갈 글자 1개 (이모지도 됩니다) */
  logoLetter: "C",
  /** 화면 상단 큰 제목 (앞부분) */
  titlePrefix: "치코스튜디오의",
  /** 화면 상단 큰 제목 (강조되는 뒷부분) */
  titleAccent: "AI Office",
  /** 브라우저 탭 제목 */
  pageTitle: "치코스튜디오 — AI 오피스",
  /** 검색·공유될 때 뜨는 설명 */
  description: "키치한 액세서리 브랜드 치코스튜디오, 12개 AI팀이 조사·기획·제작·정산까지 돌아가는 오피스",
  /** 창 하단 파일명 느낌의 라벨 */
  windowLabel: "chiko_studio.exe — 대표실",
  /** 일일 브리핑 제목에 들어갈 이름 */
  reportName: "치코스튜디오",
} as const;

/** 대표(나) — 사무실 대표실에 앉아 있는 캐릭터 */
export const CEO_PROFILE = {
  name: "블레어",
  callsign: "대표님",
  role: "대표 · 최종 의사결정",
  hair: "#4a2d3a",
  shirt: "#ff8fc0",
  accent: "#fff3b0",
  skin: "#ffdcc4",
  thoughts: [
    "메일 발송·업로드·결제는 제가 직접 해요. AI는 초안까지만.",
    "오늘 결정할 건 콘텐츠 1개, 상품 1개 — 딱 그만큼만.",
    "저장될 콘텐츠인지, 진짜 팔릴 상품인지부터 봐요.",
  ],
};

/**
 * 부서 12개.
 * id = 고정(엔진용) / name·short·icon = 자유롭게 변경
 * task = 오늘 하는 일 / report = 팀장 한줄보고
 */
export const DEPARTMENTS = [
  {
    id: "research",
    name: "시장조사팀",
    short: "trend.lab",
    icon: "🔎",
    task: "경쟁 상품 가격대·구성 서칭 + SNS 트렌드 수집",
    report: "공식 출처만 확인해서 오늘 후보를 정리해요.",
  },
  {
    id: "brand",
    name: "브랜드분석팀",
    short: "brand.room",
    icon: "🧬",
    task: "최근 7일 저장·판매 흐름 점검",
    report: "데이터 없으면 추측 대신 미연동이라 적어요.",
  },
  {
    id: "strategy1",
    name: "기획 1팀",
    short: "idea.studio",
    icon: "💡",
    task: "콘텐츠 10개 + 상품 5개 아이디어 생산",
    report: "점수 매겨서 TOP 3까지 좁혀요.",
  },
  {
    id: "qa",
    name: "브랜드검수팀",
    short: "qa.check",
    icon: "🛡️",
    task: "톤앤매너 + 디자인·저작권 리스크 검수",
    report: "기준에서 벗어나면 반려하고 이유를 남겨요.",
  },
  {
    id: "strategy2",
    name: "기획 2팀",
    short: "script.team",
    icon: "✍️",
    task: "승인된 안으로 대본·상품기획서 작성",
    report: "대표가 고른 것만 실제 형태로 옮겨요.",
  },
  {
    id: "reels",
    name: "영상 제작팀",
    short: "video.edit",
    icon: "🎬",
    task: "촬영 완료본 컷 편집·자막 작업",
    report: "원본은 보존하고 편집본만 새로 만들어요.",
  },
  {
    id: "carousel",
    name: "이미지 제작팀",
    short: "design.studio",
    icon: "🖼️",
    task: "이미지 보정 + 캐러셀·상세페이지 구성",
    report: "CTA 빠지면 반려, 필요한 장수만 만들어요.",
  },
  {
    id: "partner",
    name: "협업 소통팀",
    short: "partner.mail",
    icon: "💌",
    task: "협찬·제휴 제안 검토·답장 초안",
    report: "초안까지만 씁니다. 발송은 대표가 해요.",
  },
  {
    id: "finance",
    name: "정산팀",
    short: "finance.xls",
    icon: "🧾",
    task: "매출·원가·마진, 입금·미수금 정리",
    report: "결제는 안 하고 현황만 정리해요.",
  },
  {
    id: "review",
    name: "성과리뷰팀",
    short: "review.data",
    icon: "📈",
    task: "콘텐츠 성과 + 상품 판매 성과 기록",
    report: "수치 없으면 미연동, 있는 것만 남겨요.",
  },
  {
    id: "ops",
    name: "마케팅팀",
    short: "ads.ops",
    icon: "📣",
    task: "광고비 대비 성과 파악·채널별 집행 제안",
    report: "정확한 수치 없인 증액·감액 판단 안 해요.",
  },
  {
    id: "secretary",
    name: "비서실",
    short: "secretary.hq",
    icon: "📋",
    task: "전 부서 브리핑 조립 + 대표 결정거리 추리기",
    report: "중복 설명 지우고 결정할 것만 남겨요.",
  },
] as const;

/**
 * 직원 명단.
 * dept = 위 부서 id / rank: "lead"(팀장) 또는 "member"(팀원)
 * colors = [머리색, 옷색, 포인트색]
 * name = 채팅창·대사·호칭에 쓰이는 한글 이름
 * callsign = 캐릭터 위 이름표·프로필 큰 제목에 뜨는 영문 이름
 * thoughts = 자리를 비웠을 때 머리 위에 뜨는 혼잣말
 */
export type StaffEntry = {
  dept: string;
  rank: "lead" | "member";
  name: string;
  role: string;
  colors: [string, string, string];
  thoughts: string[];
  callsign?: string;
};

export const STAFF_LIST: StaffEntry[] = [
  // ① 시장조사팀 — Nova
  {
    dept: "research",
    rank: "lead",
    name: "노바",
    callsign: "Nova",
    role: "시장조사 팀장",
    colors: ["#6b3d34", "#fff3b0", "#ff8fc0"],
    thoughts: ["요즘 이게 유행이잖아요, 놓치면 안 돼요.", "이거 지금이 막차예요, 다들 곧 이거 할 걸요.", "출처 없는 소문은 후보에도 안 올려요."],
  },

  // ② 브랜드분석팀 — Sage
  {
    dept: "brand",
    rank: "lead",
    name: "세이지",
    callsign: "Sage",
    role: "브랜드분석 팀장",
    colors: ["#372b4a", "#c9b8ff", "#c9b8ff"],
    thoughts: ["데이터 없는 날은 추측 대신 미연동이라 적어요.", "우리 톤에서 벗어난 각도는 여기서 걸러요.", "저장률이 도달보다 진짜예요."],
  },

  // ③ 기획 1팀 — Coco
  {
    dept: "strategy1",
    rank: "lead",
    name: "코코",
    callsign: "Coco",
    role: "기획 1팀장",
    colors: ["#c26e4b", "#ff8fc0", "#fff3b0"],
    thoughts: ["오늘도 콘텐츠 10개 상품 5개, 예외 없어요.", "겹치는 각도면 프레임부터 바꿔요.", "오늘 행동 하나로 안 닫히면 다시 써요."],
  },

  // ④ 브랜드검수팀 — Juno
  {
    dept: "qa",
    rank: "lead",
    name: "주노",
    callsign: "Juno",
    role: "브랜드검수 팀장",
    colors: ["#2d4b46", "#b8f0dd", "#b8f0dd"],
    thoughts: ["너무 B급은 안 돼요.", "치코만의 느낌으로 살려볼게요.", "카피 느낌 나면 바로 반려예요."],
  },

  // ⑤ 기획 2팀 — Ren
  {
    dept: "strategy2",
    rank: "lead",
    name: "렌",
    callsign: "Ren",
    role: "기획 2팀장 · 대본/상품기획",
    colors: ["#8b534a", "#fff3b0", "#ff8fc0"],
    thoughts: ["승인된 안만 원고로 옮겨요.", "훅-문제-원인-해결-CTA, 순서 안 바꿔요.", "상품 스펙은 대충 안 적어요."],
  },

  // ⑥ 영상 제작팀 — Max
  {
    dept: "reels",
    rank: "lead",
    name: "맥스",
    callsign: "Max",
    role: "영상 제작 팀장",
    colors: ["#2c2638", "#ff8fc0", "#ff8fc0"],
    thoughts: ["원본은 절대 안 건드려요, 복제본에서만.", "촬영 안 된 장면은 '촬영 필요'라고 적어요.", "30초 안에 끝나야 해요."],
  },

  // ⑦ 이미지 제작팀 — Mia
  {
    dept: "carousel",
    rank: "lead",
    name: "미아",
    callsign: "Mia",
    role: "이미지 제작 팀장",
    colors: ["#d88d68", "#c9b8ff", "#c9b8ff"],
    thoughts: ["마지막 장 CTA 빠지면 반려예요.", "원본 사진은 복제본에서만 손대요.", "표지 3안부터 뽑아볼게요."],
  },

  // ⑧ 협업 소통팀 — Ivy
  {
    dept: "partner",
    rank: "lead",
    name: "아이비",
    callsign: "Ivy",
    role: "협업 소통 팀장",
    colors: ["#563a32", "#b8f0dd", "#b8f0dd"],
    thoughts: ["실제 발송은 제가 안 해요, 초안까지만.", "브랜드 핏 안 맞으면 정중히 거절 초안 써요.", "금액·기간 없으면 확인 필요로 남겨요."],
  },

  // ⑨ 정산팀 — Theo
  {
    dept: "finance",
    rank: "lead",
    name: "테오",
    callsign: "Theo",
    role: "정산 팀장",
    colors: ["#313b56", "#fff3b0", "#fff3b0"],
    thoughts: ["결제는 자동으로 안 해요.", "입금 대기 건부터 확인할게요.", "근거 없는 금액은 안 적어요."],
  },

  // ⑩ 성과리뷰팀 — Zoe
  {
    dept: "review",
    rank: "lead",
    name: "조이",
    callsign: "Zoe",
    role: "성과리뷰 팀장",
    colors: ["#9c5c72", "#ff8fc0", "#ff8fc0"],
    thoughts: ["수치 없으면 미연동이라고 적어요, 지어내지 않아요.", "반복할 패턴 하나, 중단할 패턴 하나만 남겨요.", "콘텐츠랑 판매 성과는 같이 봐야 보여요."],
  },

  // ⑪ 마케팅팀 — Leo
  {
    dept: "ops",
    rank: "lead",
    name: "레오",
    callsign: "Leo",
    role: "마케팅 팀장",
    colors: ["#3b3b49", "#b8f0dd", "#b8f0dd"],
    thoughts: ["정확한 수치 없인 증액도 감액도 못 정해요.", "연동 안 된 채널은 미연동으로 남겨둬요.", "채널별로 어디서 먹혔는지부터 봐요."],
  },

  // ⑫ 비서실 — Kelly
  {
    dept: "secretary",
    rank: "lead",
    name: "켈리",
    callsign: "Kelly",
    role: "비서실 총괄비서",
    colors: ["#7a453c", "#c9b8ff", "#c9b8ff"],
    thoughts: ["대표님께 보고드립니다.", "대표님 승인해주실 게 있어요.", "대표님 5분 후 회의 있어요."],
  },
];

/**
 * 외부 연동을 아직 안 붙인 팀 → 화면에 "연동 대기"로 표시됩니다.
 * (실제로 진행 중이거나 기획 중인 팀은 제외하고, 업무가 외부 연동 부재로
 *  진짜 멈춰 있는 팀만 넣습니다 — 성과리뷰팀은 Instagram, 마케팅팀은 광고 채널 데이터.)
 */
export const PENDING_INTEGRATIONS: Record<string, string> = {
  review: "Instagram/판매 데이터 연동",
  ops: "광고 채널 성과 데이터 연동",
};

/**
 * 결과 보관함 링크 (Notion 등). 비워두면 화면에서 링크 버튼이 숨겨집니다.
 * 예: "https://www.notion.so/내페이지주소"
 */
export const STORAGE_LINK = "";
