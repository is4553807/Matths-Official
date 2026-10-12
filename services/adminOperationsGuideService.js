const mongoose = require("mongoose");

require("../models/matthsModel");
require("../models/goatArenaModel");
require("../models/operationModel");
require("../models/sessionModel");
require("../models/problemTypeModel");
require("../models/parentModel");
require("../models/documentSecurityModel");
require("../models/studyHallModel");

const {
  getFileStorageStatus,
  STORAGE_PURPOSES,
} = require("./fileStorageService");
const {
  USER_CLOUD_UPLOAD_TEMP_DIR,
} = require("../middleware/userCloudUploadStorage");

const CATEGORY_DEFINITIONS = [
  {
    id: "accounts",
    label: "계정·인증·알림",
    description: "회원 식별, 로그인, 계정 상태, 알림과 문의 처리 데이터",
    pattern: /User|Password|Session|Identity|Notification|Nickname|Inquiry|Parent/i,
  },
  {
    id: "learning",
    label: "학습·평가·오답",
    description: "개념 학습, 문제 풀이, 평가센터, 학습 계획과 오답 기록",
    pattern: /Concept|Problem|Assessment|Practice|LearningProgress|DailyPlan|Wrong|Coach|StudyHall/i,
  },
  {
    id: "community",
    label: "게시판·콘텐츠 운영",
    description: "게시글, 댓글, 신고, 공지, 투표와 게시판 파일 메타데이터",
    pattern: /Community|Announcement/i,
  },
  {
    id: "mock-archive",
    label: "주간 모의고사·아카이브",
    description: "공식 모의고사 회차·응시·무결성 검토와 아카이브 폴더·파일",
    pattern: /PrivateMock|Archive|Formula/i,
  },
  {
    id: "subscriptions",
    label: "계정 플랜·결제·환불",
    description: "무료·Pro 플랜, 결제 승인, 환불과 출금 원장",
    pattern: /PackagePayment|Checkout|Refund|Finance|BusinessWithdrawal/i,
  },
  {
    id: "arena",
    label: "GOAT Arena 경기·MMR",
    description: "일반전·경쟁전·친선전, 과거 기록, 풀이, 배치, MMR 정산과 게스트 링크",
    pattern: /Arena/i,
  },
  {
    id: "operations",
    label: "운영·감사·데이터 분석",
    description: "관리자 작업, 스케줄러 임대, 감사 로그, 집계 정의와 결과",
    pattern: /Admin|Scheduler|DataAnalysis|Operation|Metric/i,
  },
];

function categoryFor(modelName) {
  return (
    CATEGORY_DEFINITIONS.find((category) => category.pattern.test(modelName)) || {
      id: "other",
      label: "기타 시스템 데이터",
      description: "위 업무군에 포함되지 않은 공통 시스템 데이터",
    }
  );
}

function printableDefault(value) {
  if (value === undefined) return "—";
  if (typeof value === "function") return "자동 생성 함수";
  if (value === null) return "null";
  if (Array.isArray(value)) return value.length ? JSON.stringify(value) : "빈 배열";
  if (typeof value === "object") return "구조화 기본값";
  return String(value).slice(0, 80);
}

function schemaTypeLabel(schemaType) {
  if (schemaType?.$isMongooseDocumentArray) return "하위 문서 배열";
  if (schemaType?.$isMongooseArray) {
    return `${schemaType.caster?.instance || "혼합"} 배열`;
  }
  if (schemaType?.$isSingleNested) return "하위 문서";
  return schemaType?.instance || schemaType?.constructor?.name || "혼합";
}

function fieldRules(schemaType, { modelName = "", field = "" } = {}) {
  const options = schemaType?.options || {};
  const rules = [];
  if (options.required) rules.push("필수");
  if (options.unique) rules.push("고유");
  if (options.index) rules.push("인덱스");
  if (options.select === false) rules.push("기본 조회 제외");
  if (options.immutable) rules.push("수정 불가");
  if (options.ref) rules.push(`참조: ${options.ref}`);
  const currentEnumValues = schemaType?.enumValues || [];
  if (currentEnumValues.length) {
    rules.push(`허용값: ${currentEnumValues.join(" · ")}`);
  }
  if (options.min !== undefined) rules.push(`최소 ${options.min}`);
  if (options.max !== undefined) rules.push(`최대 ${options.max}`);
  if (options.minlength !== undefined) rules.push(`최소 길이 ${options.minlength}`);
  if (options.maxlength !== undefined) rules.push(`최대 길이 ${options.maxlength}`);
  if (options.match) rules.push("형식 검증");
  return rules.length ? rules.join(" / ") : "추가 제약 없음";
}

function serializeModel(modelName) {
  const model = mongoose.model(modelName);
  const schema = model.schema;
  const indexes = schema.indexes()
    .map(([keys, options]) => ({
    keys: Object.entries(keys)
      .map(([field, direction]) => `${field}:${direction}`)
      .join(", "),
    unique: options.unique === true,
    ttl:
      options.expireAfterSeconds !== undefined
        ? options.expireAfterSeconds === 0
          ? "필드 시각 도달 즉시"
          : `${options.expireAfterSeconds}초 후`
        : "—",
    partial: options.partialFilterExpression ? "조건부" : "—",
  }));
  const fields = Object.entries(schema.paths)
    .filter(([field]) => field !== "__v")
    .map(([field, schemaType]) => ({
      field,
      type: schemaTypeLabel(schemaType),
      rules: fieldRules(schemaType, { modelName, field }),
      defaultValue: printableDefault(schemaType?.options?.default),
    }));
  const category = categoryFor(modelName);
  return {
    modelName,
    collectionName: model.collection.name,
    categoryId: category.id,
    fieldCount: fields.length,
    fields,
    indexes,
    timestamps: Boolean(schema.options.timestamps),
  };
}

function schemaCatalog() {
  const models = mongoose
    .modelNames()
    .sort((left, right) => left.localeCompare(right, "en"))
    .map(serializeModel);
  const definitions = [
    ...CATEGORY_DEFINITIONS,
    {
      id: "other",
      label: "기타 시스템 데이터",
      description: "공통 보조 모델과 예외적으로 분류되지 않은 데이터",
    },
  ];
  return definitions
    .map((definition) => ({
      ...definition,
      models: models.filter((model) => model.categoryId === definition.id),
    }))
    .filter((category) => category.models.length);
}

const STORAGE_MATRIX = [
  {
    owner: "운영자",
    fileType: "아카이브 자료",
    purpose: STORAGE_PURPOSES.ADMIN_ARCHIVE,
    primary: "Cloudflare R2 비공개 객체",
    backup: "플랫폼 백업 정책",
    retention: "운영자 삭제 전까지. 휴지통 이동 후 30일",
    access: "로그인·폴더 권한 검사 후 PDF는 개인 식별 사본 발급, 비PDF는 5분 서명 URL",
  },
  {
    owner: "운영자",
    fileType: "주간 공식 모의고사 문제지·답지",
    purpose: STORAGE_PURPOSES.ADMIN_WEEKLY_MOCK,
    primary: "Cloudflare R2 비공개 객체",
    backup: "플랫폼 백업 정책",
    retention: "운영자 삭제 전까지. 진행·공개 대기 회차는 삭제 제한",
    access: "상품·공개 시각·관리자 권한 검사 후 PDF는 개인 식별 사본 발급, 비PDF는 5분 서명 URL",
  },
  {
    owner: "운영자",
    fileType: "Matths 교재 상점 상품·이미지",
    purpose: "MATTHS_STORE",
    primary: "Cloudflare R2 비공개 객체",
    backup: "플랫폼 백업 정책",
    retention: "상품 또는 개별 자산 삭제 전까지",
    access: "상품 공개·무료 또는 구매 권한 검사 후 PDF는 개인 식별 사본 발급, 비PDF는 5분 서명 URL",
  },
  {
    owner: "운영자",
    fileType: "GOAT 교재관 문제지·해설·표지·연결 자료",
    purpose: "STUDY_HALL",
    primary: "Cloudflare R2 비공개 객체",
    backup: "플랫폼 백업 정책",
    retention: "콘텐츠 또는 개별 자산 삭제 전까지. 임시 비공개는 원본 유지",
    access: "로그인·공개 시각·콘텐츠 상태를 검사하고 해설은 최종 제출 이후에만 5분 서명 URL 발급",
  },
  {
    owner: "학원",
    fileType: "주차별 수업 과제 첨부",
    purpose: STORAGE_PURPOSES.ACADEMY_ASSIGNMENT,
    primary: "Cloudflare R2 비공개 객체",
    backup: "플랫폼 백업 정책",
    retention: "주차 과제 파일 삭제 전까지. 반 보관 시에도 원본 유지",
    access: "학원·반·주차 권한 검사 후 PDF는 개인 식별 사본 발급, 비PDF는 5분 서명 URL",
  },
  {
    owner: "사용자",
    fileType: "게시판 사진·첨부",
    purpose: STORAGE_PURPOSES.USER_COMMUNITY,
    primary: "Cloudinary authenticated / matths/community",
    backup: "별도 로컬 영구 사본 없음",
    retention: "게시글 유지 기간. 완전 삭제 시 원본 삭제",
    access: "게시판 열람 권한 확인 후 5분 서명 URL",
  },
  {
    owner: "사용자",
    fileType: "GOAT Arena 풀이 증거",
    purpose: STORAGE_PURPOSES.USER_ARENA_EVIDENCE,
    primary: "Cloudinary authenticated / matths/arena-evidence",
    backup: "별도 로컬 영구 사본 없음",
    retention: "제출 후 90일. 이상 징후·미정산·보존 지정 시 연장",
    access: "운영자 권한 확인 후 5분 서명 URL",
  },
  {
    owner: "사용자",
    fileType: "주간 모의고사 소명자료",
    purpose: STORAGE_PURPOSES.USER_PRIVATE_MOCK_INTEGRITY,
    primary: "Cloudinary authenticated / matths/private-mock-integrity",
    backup: "별도 로컬 영구 사본 없음",
    retention: "검토·감사 목적 동안 보관. 계정 완전 삭제 시 원본 삭제",
    access: "본인 또는 운영자 확인 후 5분 서명 URL",
  },
];

const RETENTION_POLICIES = [
  ["사용자 Cloudinary 임시 파일", "업로드 성공 즉시 삭제", "비정상 종료 잔여분은 24시간 후 정리"],
  ["Arena 풀이 증거 원본", "90일", "이상 징후·미정산·운영자 보존 지정 시 삭제 보류"],
  ["아카이브 휴지통", "30일", "R2 삭제까지 성공해야 DB 행과 원본을 영구 제거"],
  ["게시판 첨부", "게시글 수명과 동일", "게시글 완전 삭제 또는 계정 전체 삭제 시 제거"],
  ["운영자·상점·학원 과제 R2 원본", "기한 없음", "권한 있는 운영자·교사의 삭제 전까지 비공개 객체 유지"],
  ["개인 식별 PDF 임시 사본", "응답 완료 즉시 삭제", "발급 원장·추적 코드만 MongoDB에 보존"],
  ["로그인 세션", "기본 7일", "SESSION_TTL_SECONDS 설정과 MongoDB TTL 인덱스 사용"],
  ["학부모 가입 초대", "72시간", "사용·재요청·만료 시 상태를 변경하며 토큰 원문은 저장하지 않음"],
  ["완료되지 않은 결제 요청", "30분", "승인 완료 전 CheckoutIntent를 자동 만료 처리"],
  ["위험 연결 신호", "30~730일", "종류별 TTL: 네트워크 30일, 브라우저 90일, 기기 180일, 결제·계좌 730일"],
  ["감사·정산 원장", "원칙적으로 기한 없음", "원본 거래를 수정하지 않고 보정 이벤트를 추가"],
];

const SCHEDULERS = [
  ["다중 서버 공용 임대", "모든 자동 작업 실행 직전", "MongoDB schedulerLeases에서 작업별 임대를 선점하고 실행 중 갱신합니다. 다른 서버는 같은 작업을 건너뛰며 실패·완료 뒤 다음 서버가 이어받습니다."],
  ["주간 모의고사 상태 전환", "30초", "예약→응시→잠금→집계→내부 MMR 정산·아카이브 상태를 KST 기준으로 전환"],
  ["배치고사 자동 제출", "30초", "제한시간이 끝난 배치고사의 서버 저장 답안을 자동 제출·채점하고 완료 상태로 전환"],
  ["학원 과제 미제출 처리", "1분", "OMR 과제 마감 후 해당 반의 기한 내 미제출 학생을 자동 채점 기록에 0점으로 반영"],
  ["아카이브 휴지통 삭제", "6시간", "30일 경과 자료의 R2 원본·DB 영구 삭제"],
  ["R2 원본 점검", "관리자 수동 실행", "비공개 객체와 DB의 SHA-256 메타데이터를 대조"],
  ["PDF·스크린샷 유출 추적", "관리자·학원 교사 수동 실행", "운영자는 전체 발급 원장, 학원은 선택한 학원·반의 학생·담당 교사 발급 원장만 대조하고 임시 파일을 즉시 삭제"],
  ["운영 지표", "관리자 조회 시", "무료·Pro 플랜, 현행 Arena, 게스트 친선전과 주간 모의고사 원본을 월별로 조회"],
  ["Arena 무결성 위험", "15분", "최근 경기·연결 신호를 평가해 관리자 할 일 생성"],
  ["사용자 업로드 임시 파일", "시작 즉시 + 6시간", "24시간 이상 남은 임시 파일 삭제"],
];

const PERMISSION_MATRIX = [
  ["무료 플랜", "개념 학습·평가센터·오답노트와 GOAT Arena 무료 이용 범위", "Pro 전용 기능 차단"],
  ["Pro 플랜", "주간 공식 모의고사·Pro 학습 자료·GOAT Arena Pro 이용 범위", "월 5,500원·30일 단위"],
  ["학부모 계정", "연결 자녀의 학습 현황·오답률·공식 랭킹·Pro 결제 준비", "학생용 학습·게시판·Arena 실행 권한 없음"],
  ["관리자", "모든 운영 화면·유료 콘텐츠·일반전/경쟁전 운영 상태", "무제한·만료 없음. MMR과 경기 원장은 승인된 운영 절차만 사용"],
];

const INCIDENT_PLAYBOOK = [
  {
    title: "Cloudinary 업로드 실패",
    checks: [
      "Cloudinary 환경 변수 3개 또는 CLOUDINARY_URL 설정 여부 확인",
      "Cloudinary 사용량·전송량·API 오류 확인",
      "사용자 파일을 서버 디스크에 임의 보관하지 말고 재시도 안내",
      "DB 기록이 생성됐다면 자산 식별자와 실제 원본 존재 여부 대조",
    ],
  },
  {
    title: "R2 저장소 이상",
    checks: [
      "R2 API 토큰의 대상 버킷과 Object Read & Write 권한 확인",
      "R2 저장량·요청량과 공급자 상태 페이지 확인",
      "신규 업로드 실패 시 임시 파일을 영구 원본으로 간주하지 않기",
      "기존 로컬 파일 마이그레이션 결과의 missing·failed가 0인지 확인",
    ],
  },
  {
    title: "개인 식별 PDF 발급·추적 이상",
    checks: [
      "DOCUMENT_WATERMARK_SECRET이 배포 secret에 등록되어 있고 16자 이상인지 확인",
      "원본 R2 객체는 변경하지 않고 다운로드 요청마다 별도 임시 PDF가 생성되는지 확인",
      "유출 자료 추적 화면에서 PDF 서명 또는 스크린샷 OCR 결과를 추적 코드·문서 발급 ID·사용자 계정·시험 또는 상품 ID와 대조",
      "학원 추적은 선택 반의 ACADEMY_ASSIGNMENT 발급 중 학생·테스트 학생·담당 교사 기록만 조회하고 다른 학원·반·Matths 운영자 발급은 제외하는지 확인",
      "스크린샷 OCR은 발급 원장과의 유사도 대조 결과이므로 단독으로 제재를 확정하지 않고 원본 해상도·편집 흔적·다른 증거를 함께 확인",
    ],
  },
  {
    title: "계정·게시판 신고",
    checks: [
      "신고 원문·댓글·첨부를 확인하고 숨김·삭제·경고를 구분",
      "경고 1회 이상이면 사용자 신규 파일 업로드가 자동 차단됨을 확인",
      "경고를 0회로 되돌리면 파일 업로드가 다시 허용되는지 확인",
      "계정 완전 삭제와 익명 통계 보존을 혼동하지 않기",
    ],
  },
];

const OPERATING_WORKFLOWS = [
  {
    title: "회원·권한·상품 변경",
    cadence: "요청·결제·고객지원 발생 시",
    objective: "계정 상태와 무료·Pro 플랜 권한을 같은 결과로 유지합니다.",
    steps: [
      "유저 관리에서 닉네임·가입일·최근 로그인·계정 상태를 확인하고 동명이 아닌 계정 ID를 기준으로 대상을 확정합니다.",
      "무료 플랜과 Pro 플랜 중 하나를 선택하고 변경 사유를 구체적으로 기록합니다.",
      "관리자 변경은 결제 매출로 집계되지 않으며 Pro는 변경 시각부터 30일 동안 적용됩니다.",
      "변경 뒤 User.accountPlan과 사용자 화면의 현재 플랜을 함께 확인합니다. 과거 결제·환불·이용권 원장은 수정하지 않습니다.",
      "관리자는 역할 기반 슈퍼계정이므로 별도 유료 상품이나 만료일을 부여하지 않습니다.",
    ],
    hardStops: "카드·계좌 원문, 결제사 전체 응답을 DB나 관리자 메모에 복사하지 않습니다.",
    audit: "User.accountPlan, AdminActionLog, ArenaPackagePayment, RefundRequest",
  },
  {
    title: "주간 공식 모의고사 등록",
    cadence: "매주 일요일 공개 전",
    objective: "문제지·채점 기준·공개 시각을 하나의 회차로 원자적으로 등록합니다.",
    steps: [
      "A·B·C는 일요일 15:00·18:00·21:00 KST 고정 슬롯을 선택합니다.",
      "운영 점검 회차는 CUSTOM을 선택하고 한국 날짜와 시작 시각을 직접 입력합니다. CUSTOM은 공식 주간 MMR 정산과 자동 아카이브에 반영되지 않습니다.",
      "문제지 PDF, 정확히 30문항·100점인 채점 JSON, 선택적 답지 PDF의 순서와 개수를 맞춥니다.",
      "등록 뒤 공개 시각, 100분 마감, C형 1분 집계 대기, 23:00 랭킹·보관 전환을 미리보기에서 재확인합니다.",
      "공개 뒤 정답 오류는 파일을 교체하지 않고 정답 정정 기능으로 처리해 재채점·지표 재생·알림 이력을 남깁니다.",
    ],
    hardStops: "진행 중인 공식 회차를 DB에서 직접 삭제하거나 CUSTOM을 공식 랭킹 회차로 사용하지 않습니다.",
    audit: "PrivateMockExam, PrivateMockExamEvent, PrivateMockAnswerCorrection, AdminActionLog",
  },
  {
    title: "아카이브 폴더·파일 운영",
    cadence: "자료 배포·개정 시",
    objective: "자료의 공개 범위, 핀 고정, 폴더 계층과 원본 백업을 일치시킵니다.",
    steps: [
      "자료 폴더 아래에 목적별 폴더를 만들고 이름·설명·접근 권한을 먼저 정합니다. 사용자는 내부 루트 폴더를 보지 않습니다.",
      "파일을 업로드한 뒤 상위 폴더의 재귀 파일 수와 하위 폴더 표시를 확인합니다.",
      "모의고사 자료는 ‘모의고사 이용 대상’으로 지정해 Pro와 학원 이용자에게 제공하고, Pro 전용 자료는 ‘Pro 플랜’으로 제한합니다.",
      "하위 폴더에는 경로상 가장 강한 접근 권한이 상속됩니다. 무료·Pro·학원 이용 계정으로 각각 폴더 진입과 직접 다운로드 URL을 확인합니다.",
      "PDF 다운로드를 시험한 뒤 개인 추적 코드가 페이지 전반에 표시되고, PDF 원본과 해당 페이지 스크린샷 모두에서 발급 사용자를 복원할 수 있는지 확인합니다.",
      "중요 자료·폴더는 상단 고정을 사용하고, 개정본을 올릴 때 이전 파일의 공개·보관 상태를 함께 정리합니다.",
      "삭제는 30일 휴지통을 기본으로 사용하며 R2 객체 삭제까지 가능한 경우에만 영구 삭제합니다.",
    ],
    hardStops: "R2 원본을 public 아래에 복제하거나 R2 공개 URL을 사용자에게 직접 제공하지 않습니다.",
    audit: "ArchiveFolder, ArchiveItem, backupStatus, deletedAt·purgeAt",
  },
  {
    title: "GOAT 교재관 콘텐츠 운영",
    cadence: "문제집·회차·개념·리포트 공개 및 개정 시",
    objective: "여섯 콘텐츠 유형의 문제·정답·진행률과 R2 원본을 하나의 공개 버전으로 관리합니다.",
    steps: [
      "콘텐츠 유형을 자체제작 N제, 데일리 하프, 실전 모의고사, 수능 파이널, 개념 학습, 오답 유형 리포트 중에서 먼저 선택합니다.",
      "시리즈, 학년·과목, 제목·설명, 난이도, 노출 순서와 유형별 분류값을 입력합니다. 데일리 하프는 연도·월·주차·회차를, 실전 모의고사는 시기·시리즈를 함께 확인합니다.",
      "문항은 화면에서 직접 등록하거나 Matths 주간 공식 모의고사와 같은 matths-answer-key-v3 JSON을 업로드합니다. v3는 questions의 각 문항에 number·type·answer·points·concept·explanation을 함께 저장하며, 새 JSON을 올리면 화면의 수동 문항 데이터를 대체합니다. 이전 answers 배열 형식은 기존 자료 호환을 위해서만 읽습니다.",
      "30문항 모의고사는 번호 1~30의 중복·누락, 객관식·주관식 유형, 문항별 2·3·4점과 총 100점, 실제 교육과정 개념 ID와 제목을 검증합니다. 공개 상태의 일반 학습 콘텐츠는 표시 문항 수와 정답 데이터 수가 같아야 하며 데일리 하프는 정확히 15문항이어야 합니다.",
      "사용자가 최종 제출하면 서버가 주간 공식 모의고사와 같은 답안 정규화·복수 정답 비교로 정오답을 판정하고 문항 배점 합계, 정답 수와 정답률을 저장합니다. JSON 임시 파일은 변환 후 삭제되고 정답 데이터만 DB에 보존됩니다.",
      "표지, 문제지 PDF, 해설 PDF와 연결 자료를 업로드한 뒤 R2 저장 여부를 확인합니다. 해설 PDF는 사용자가 최종 제출한 뒤에만 열립니다.",
      "공개 시각·노출 순서·공개 상태를 점검한 뒤 DRAFT에서 PUBLISHED로 전환합니다. 당장 내리지 않고 보존하려면 삭제 대신 ARCHIVED를 사용합니다.",
      "사용자 화면에서 최근 학습 이어서 하기, 임시 저장, 답안 수, 최종 제출 확인창, 제출 결과와 중복 제출 차단이 정상인지 표본 계정으로 확인합니다.",
      "문제지·해설 다운로드는 사용자·콘텐츠·자산별 기록으로 남는지 확인하고, 원본 R2 객체를 public 폴더나 공개 URL로 복제하지 않습니다.",
    ],
    hardStops: "정답 없는 콘텐츠를 공개하거나, 제출 전 해설을 노출하거나, 공개 중 콘텐츠를 DB에서 직접 삭제하지 않습니다.",
    audit: "StudyHallContent, StudyHallProgress.answers·downloads·submittedAt",
  },
  {
    title: "게시판·신고·첨부 관리",
    cadence: "매일 및 신고 접수 즉시",
    objective: "게시판별 공지와 운영 규칙을 유지하고 제재를 실제 콘텐츠 상태에 반영합니다.",
    steps: [
      "게시판별 운영 공지를 등록·수정·삭제하고 필요한 공지를 상단에 고정합니다.",
      "신고 원문, 댓글, 첨부, 작성자 경고 이력을 확인한 뒤 기각·숨김·삭제·경고를 구분합니다.",
      "경고가 1회 이상이면 새 사진·파일 업로드가 차단되고, 경고를 0으로 되돌리면 자동 복구되는지 확인합니다.",
      "모든 계정의 일일 글 작성 상한은 5회이며 우회 계정 의심은 신원 일치 알림과 함께 검토합니다.",
      "익명 게시글에는 도시와 학년만 표시하고 실제 고등학교명은 공개하지 않습니다.",
    ],
    hardStops: "신고 완료 상태만 바꾸고 게시글 숨김·삭제·경고 같은 실제 조치를 누락하지 않습니다.",
    audit: "CommunityReport, CommunityPost, CommunityBoardNotice, CommunityPostingQuota, AdminActionLog",
  },
  {
    title: "개념·평가센터·배치고사 문제 유형 운영",
    cadence: "출제 비중 조정 또는 생성기 코드 배포 후",
    objective: "검산을 통과한 서버 생성기만 출제하고 기존 설정·소스 이력을 삭제하지 않습니다.",
    steps: [
      "문제 데이터 화면에서 개념·유형 학습, 평가센터, 배치고사 분류를 선택하고 이름 또는 엔진 ID로 대상을 검색합니다.",
      "코드·설정 보기에서 DB가 보존한 생성 함수 스냅샷, 실제 서버 파일, 소스 SHA-256, 계산기 불필요·정답 검산 상태를 확인합니다.",
      "운영 중 즉시 조정 가능한 값은 신규 출제 사용 여부, 1~100 출제 가중치, 운영 메모입니다. 저장하면 유형별 5회 검산 뒤 새 리비전이 활성화됩니다.",
      "기존 리비전은 RETIRED 이력으로 남습니다. 원래 코드를 지우거나 ACTIVE 문서를 직접 수정하지 않습니다.",
      "새 공식·숫자 생성 방식·유형별 검산 함수는 서버 코드로 검토·배포한 뒤 ‘서버 생성기 검산·동기화’를 실행합니다.",
      "동기화는 새 소스 해시를 감지해 표본 검산을 수행하고, 통과한 유형만 현재 설정을 승계한 새 리비전으로 전환합니다.",
      "배치고사는 30개 번호 청사진 중 하나라도 출제 제외 또는 검산 실패이면 시험지 전체를 차단하므로 실제 응시 전 상태를 모두 확인합니다.",
    ],
    hardStops: "DB의 소스 문자열을 eval·Function으로 실행하거나 검산 실패 유형을 강제로 활성화하지 않습니다.",
    audit: "ProblemTypeVersion, AdminActionLog, Problem·ProblemAttempt·AssessmentAttempt",
  },
  {
    title: "계정 삭제·개인정보 요청",
    cadence: "사용자 요청 및 법적 보존 검토 시",
    objective: "익명 통계 보존과 모든 데이터 삭제를 명확히 구분합니다.",
    steps: [
      "대상 계정과 요청 방식을 다시 확인하고 처리 전 영향 범위를 관리자 화면에서 검토합니다.",
      "익명 통계 보존은 식별 필드와 원본 파일을 제거하고 집계 가능한 비식별 기록만 남깁니다.",
      "모든 데이터 삭제는 학습·게시판·문의·Arena·알림과 Cloudinary 원본까지 제거 대상으로 표시합니다.",
      "모든 데이터 삭제를 선택하면 PDF 발급-사용자 매핑도 제거되어 이후 유출 PDF를 삭제된 계정에 다시 연결할 수 없음을 확인합니다.",
      "운영자 계정 삭제는 일반 사용자 삭제 경로에서 차단하고 별도 권한·인수인계 절차를 거칩니다.",
      "처리 후 Cloudinary 삭제 실패, R2·로컬 잔여 원본과 비식별 처리 실패 항목을 다시 점검합니다.",
    ],
    hardStops: "삭제 요청을 단순 isActive=false 처리로 끝내거나 개인 식별 파일을 익명 통계라는 이유로 남기지 않습니다.",
    audit: "AdminActionLog와 계정 삭제 작업 결과. 비밀번호·생년월일 원문은 로그에 기록하지 않음",
  },
];

const ENVIRONMENT_CONFIGURATION = [
  ["MongoDB", "DB", "계정·학습·경기·감사 데이터", "Atlas 연결·백업·인덱스 상태 확인"],
  ["세션", "SECRET, SESSION_TTL_SECONDS", "로그인 세션 서명·TTL", "운영용 긴 무작위 secret, 기본 7일 TTL"],
  ["사용자 파일", "FILE_STORAGE_PROVIDER, CLOUDINARY_URL 또는 Cloudinary 3개 키", "게시판·증거·소명 원본", "authenticated 전달 방식과 사용량 확인"],
  ["운영자·상점 원본", "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET", "아카이브·주간 모의고사·교재 상점", "비공개 버킷·Object Read & Write"],
  ["PDF 개인 식별", "DOCUMENT_WATERMARK_SECRET", "PDF 발급 토큰 서명·유출 역추적", "16자 이상의 별도 운영 secret. 브라우저·로그·Git 노출 금지"],
  ["학원 출석 코드", "ATTENDANCE_CODE_SECRET", "수업 회차별 6자리 출석 코드 HMAC", "32자 이상의 별도 무작위 값 필수. 기존 회차 중간에는 값을 변경하지 않음"],
  ["메일", "SUPPORT_SMTP_HOST, SUPPORT_SMTP_USER, GMAIL_APP_PASSWORD", "계정·정책·무결성 알림", "모든 발신은 lsbproduction00@gmail.com으로 통일하고 실제 처리 운영자는 감사 로그에서 확인"],
  ["자금 준비금", "FINANCE_PG_FEE_RESERVE_BPS", "PG 수수료 준비금과 사업자 출금 잠금", "PG 계약 기준의 부가세 포함 bp 값을 설정하기 전에는 출금 불가"],
  ["자동 작업", "DISABLE_SCHEDULERS", "스케줄러 실행 여부", "실서비스에서는 임의로 1로 두지 않음"],
];

const CURRENT_ARENA_WORKFLOWS = [
  {
    title: "Arena 신규 경기 긴급 제어",
    cadence: "문제 데이터 이상·저장소 장애·운영 사고 발생 시",
    objective: "신규 경기 접수만 원자적으로 차단하고 이미 성립한 경기는 안전하게 완료합니다.",
    steps: [
      "Arena 운영 설정에서 신규 경기 접수 상태와 정지 사유를 확인합니다.",
      "영향 범위를 확인한 뒤 사유를 기록하고 접수를 일시정지합니다.",
      "진행 중인 일반전·경쟁전·친선전의 풀이와 업로드는 중단하지 않습니다.",
      "원인이 해소되면 접수를 재개하고 일반전 한 건의 과거 기록 연결을 확인합니다.",
    ],
    hardStops: "진행 중 경기 문서를 직접 삭제하거나 결과·MMR을 수동으로 덮어쓰지 않습니다.",
    audit: "PlatformControl, ArenaMatch, ArenaCompetitiveRecord",
  },
  {
    title: "과거 기록 풀·MMR 정산 검수",
    cadence: "매일 및 경쟁전 활성화 전",
    objective: "서로 다른 문제 세트를 공정하게 비교하고 현재 응시자만 한 번 갱신되도록 확인합니다.",
    steps: [
      "Arena 데이터 감사에서 만료된 예약과 과거 기록이 없는 비동기 경기를 확인합니다.",
      "양쪽의 정오답·문항 난도를 반영한 내부 성취지표와 근소 구간의 유효 풀이 시간을 대조합니다.",
      "경쟁전 경기당 MMR 정산 원장이 한 건인지, 과거 상대 프로필이 바뀌지 않았는지 확인합니다.",
      "일반전 기록은 사용 후 20게임 동안 다시 배정되지 않는지 표본을 확인합니다.",
    ],
    hardStops: "과거 상대 MMR을 소급 변경하거나 정산 원장을 삭제한 뒤 다시 계산하지 않습니다.",
    audit: "ArenaCompetitiveRecord, ArenaRatingSettlement, ArenaMatch.resultSnapshot",
  },
  {
    title: "풀이 업로드·무결성 검토",
    cadence: "검토 알림 발생 시",
    objective: "경쟁전만 부정행위 신호를 검토하고 일반전·친선전·단체 도전장은 자동 감지 대상에서 제외합니다.",
    steps: [
      "경기 모드가 경쟁전인지 먼저 확인합니다. 일반전은 무결성 판정 대신 복구 절차로 분리합니다.",
      "현재 응시자의 답안 변경, 풀이 시간, 화면 이탈과 업로드 파일을 함께 확인합니다.",
      "비동기 경기의 과거 기록 소유자는 재응시자가 아니므로 제재 대상으로 선택하지 않습니다.",
      "일반전·친선전·게스트 친선전이 검토 대기에 들어왔다면 데이터 감사의 정책 위반으로 처리합니다.",
    ],
    hardStops: "위험 점수만으로 자동 제재하거나 풀이 원본을 개인 기기에 장기 보관하지 않습니다.",
    audit: "ArenaMatchEvidence, ArenaMatchAttemptEvent, ArenaIntegrityRiskCase, AdminActionLog",
  },
  {
    title: "배치고사 시도 복구",
    cadence: "서버 오류 신고 또는 5회 소진 검토 시",
    objective: "서버 오류만 자동 차감 취소하고 추가 시도는 운영자 승인 원장으로 통제합니다.",
    steps: [
      "응시 이벤트와 오류 로그로 서버 오류인지 사용자 중단인지 구분합니다.",
      "서버 오류는 시도를 소비하지 않도록 복구 원장을 확인합니다.",
      "사용자 중단은 자동 복구하지 않습니다.",
      "5회 소진 후에는 운영자 사유와 요청 ID를 남긴 초기화만 허용합니다.",
    ],
    hardStops: "추가 시도를 자동 지급하거나 유효 결과 없이 티어를 부여하지 않습니다.",
    audit: "ArenaPlacementAttemptAdjustment, ArenaCompetitiveProfile.placementAttemptsUsed, AssessmentAttempt",
  },
];

const CURRENT_ARENA_SCHEDULERS = [
  ["Arena 비동기 경기 타이머", "10초", "문항당 10분 제한, 풀이 업로드 대기와 안전한 취소·확정 상태 처리"],
  ["과거 기록 예약 복구", "경기 시작·만료 처리 시", "만료된 예약을 해제하고 재사용 제한 순번을 보존"],
  ["Arena 풀이 원본 보존", "6시간", "90일 보존 조건과 검토 보류를 확인한 뒤 원격 원본 삭제"],
  ["게스트 링크 만료", "요청 시 + 자동 작업", "생성 후 3일이 지난 OPEN 링크를 만료 상태로 정리"],
];

const CURRENT_ARENA_INCIDENTS = [
  {
    title: "비동기 경기·MMR 정합성 이상",
    checks: [
      "Arena 데이터 감사에서 기록 예약·경기 연결·정산 원장 상태 확인",
      "현재 응시자 MMR만 변경됐는지 확인하고 과거 상대 기록은 보존",
      "문항별 정답률과 풀이 시간이 결과 스냅샷에 남았는지 확인",
      "원본 이벤트를 삭제하지 말고 승인된 보정 원장을 추가",
    ],
  },
];

function getAdminOperationsGuideData() {
  const storageStatus = getFileStorageStatus();
  const categories = schemaCatalog();
  return {
    generatedAt: new Date(),
    database: {
      connectionState: ["연결 안 됨", "연결됨", "연결 중", "연결 해제 중"]
        [mongoose.connection.readyState] || "상태 확인 필요",
      databaseName: mongoose.connection.name || "연결 후 표시",
      note: "MongoDB에는 폴더 대신 컬렉션이 있습니다. 아래 업무 분류는 운영자가 찾기 쉽게 묶은 화면 분류이며 실제 저장 위치는 각 컬렉션명입니다.",
      categoryCount: categories.length,
      modelCount: categories.reduce((sum, category) => sum + category.models.length, 0),
      fieldCount: categories.reduce(
        (sum, category) =>
          sum + category.models.reduce((modelSum, model) => modelSum + model.fieldCount, 0),
        0
      ),
    },
    environment: {
      cloudinaryConfigured:
        storageStatus.purposes?.USER_COMMUNITY?.configured === true,
      persistentLocalReady: storageStatus.persistentLocalReady,
      r2BackupConfigured: storageStatus.r2BackupConfigured,
      localCapacity: storageStatus.localCapacity,
      userCloudTempDirectory: USER_CLOUD_UPLOAD_TEMP_DIR,
    },
    schemaCategories: categories,
    storageMatrix: STORAGE_MATRIX,
    retentionPolicies: RETENTION_POLICIES,
    schedulers: [
      ...CURRENT_ARENA_SCHEDULERS,
      ...SCHEDULERS,
    ],
    permissionMatrix: PERMISSION_MATRIX,
    incidentPlaybook: [
      ...CURRENT_ARENA_INCIDENTS,
      ...INCIDENT_PLAYBOOK,
    ],
    operatingWorkflows: [
      ...CURRENT_ARENA_WORKFLOWS,
      ...OPERATING_WORKFLOWS,
    ],
    environmentConfiguration: ENVIRONMENT_CONFIGURATION,
  };
}

module.exports = {
  getAdminOperationsGuideData,
  schemaCatalog,
};
