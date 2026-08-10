const mongoose = require("mongoose");

require("../models/matthsModel");
require("../models/goatArenaModel");
require("../models/operationModel");
require("../models/sessionModel");
require("../models/problemTypeModel");
require("../models/parentModel");
require("../models/paybackModel");
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
    label: "상품·결제·학습일수",
    description: "가격 정책, 결제 승인, 이용 주기, 페이백과 학습일수 원장",
    pattern: /Subscription|AccessCycle|PackagePayment|MockExamSubscription|Payback|LearningDay|Shop|PolicyChange|Checkout/i,
  },
  {
    id: "arena",
    label: "GOAT Arena 경기·랭킹",
    description: "Division 권한, 경기, 문제팩, 풀이, 증거, 정산, 랭킹과 시즌",
    pattern: /Arena|FinalRanking|MainToSub/i,
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

function fieldRules(schemaType) {
  const options = schemaType?.options || {};
  const rules = [];
  if (options.required) rules.push("필수");
  if (options.unique) rules.push("고유");
  if (options.index) rules.push("인덱스");
  if (options.select === false) rules.push("기본 조회 제외");
  if (options.immutable) rules.push("수정 불가");
  if (options.ref) rules.push(`참조: ${options.ref}`);
  if (schemaType?.enumValues?.length) {
    rules.push(`허용값: ${schemaType.enumValues.join(" · ")}`);
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
  const indexes = schema.indexes().map(([keys, options]) => ({
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
      rules: fieldRules(schemaType),
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
    fileType: "고2·고3 수험관 문제지·해설·표지·연결 자료",
    purpose: "STUDY_HALL",
    primary: "Cloudflare R2 비공개 객체",
    backup: "플랫폼 백업 정책",
    retention: "콘텐츠 또는 개별 자산 삭제 전까지. 임시 비공개는 원본 유지",
    access: "로그인·공개 시각·콘텐츠 상태를 검사하고 해설은 최종 제출 이후에만 5분 서명 URL 발급",
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
  ["운영자·상점 R2 원본", "기한 없음", "운영자 삭제 전까지 비공개 객체 유지"],
  ["개인 식별 PDF 임시 사본", "응답 완료 즉시 삭제", "발급 원장·추적 코드만 MongoDB에 보존"],
  ["로그인 세션", "기본 7일", "SESSION_TTL_SECONDS 설정과 MongoDB TTL 인덱스 사용"],
  ["학부모 가입 초대", "72시간", "사용·재요청·만료 시 상태를 변경하며 토큰 원문은 저장하지 않음"],
  ["PG 연결 전 결제 대기", "30분", "결제 승인이나 이용권 지급 없이 CheckoutIntent에 준비 상태만 기록"],
  ["페이백 계좌", "재등록 또는 탈퇴 시까지", "AES-256-GCM 암호문으로 저장하고 사용자 화면에는 끝 4자리만 표시"],
  ["위험 연결 신호", "30~730일", "종류별 TTL: 네트워크 30일, 브라우저 90일, 기기 180일, 결제·계좌 730일"],
  ["감사·정산 원장", "원칙적으로 기한 없음", "원본 거래를 수정하지 않고 보정 이벤트를 추가"],
];

const SCHEDULERS = [
  ["다중 서버 공용 임대", "모든 자동 작업 실행 직전", "MongoDB schedulerLeases에서 작업별 임대를 선점하고 실행 중 갱신합니다. 다른 서버는 같은 작업을 건너뛰며 실패·완료 뒤 다음 서버가 이어받습니다."],
  ["주간 모의고사 상태 전환", "30초", "예약→응시→잠금→집계→랭킹·아카이브 상태를 KST 기준으로 전환"],
  ["학습권 이용 주기", "30초", "결제 이용 주기·갱신·정산 대기 상태 처리"],
  ["일일 학습일수·만료", "30초", "KST 기준 학습일수 차감과 잔액 소진 이용 만료 처리"],
  ["학습권 만료 알림", "1분", "72·24·6시간 임계 알림 중복 방지"],
  ["정책 변경 공지", "저장 직후 + 15초 재시도", "정책별·사용자별 전달 원장으로 이메일과 사이트 우편함을 중복 없이 발송"],
  ["Arena 처리 대기 이벤트", "5초", "정책 공지를 포함한 트랜잭션 후속 작업을 outbox에서 장애 복구·재실행"],
  ["Arena 경기 타이머", "10초", "준비·풀이·증거 1분·복수전 24시간 기한 처리"],
  ["Arena 증거 삭제", "6시간", "90일 보존 조건을 만족한 Cloudinary 원본 삭제"],
  ["아카이브 휴지통 삭제", "6시간", "30일 경과 자료의 R2 원본·DB 영구 삭제"],
  ["R2 원본 점검", "관리자 수동 실행", "비공개 객체와 DB의 SHA-256 메타데이터를 대조"],
  ["PDF·스크린샷 유출 추적", "관리자 수동 실행", "PDF의 서명·메타데이터·페이지 식별자 또는 스크린샷의 반복 추적 코드를 분석하고 임시 파일을 즉시 삭제"],
  ["데이터 분석", "15분", "월별 운영 지표 집계와 2분 대시보드 캐시 갱신"],
  ["Arena 무결성 위험", "15분", "최근 경기·연결 신호를 평가해 관리자 할 일 생성"],
  ["사용자 업로드 임시 파일", "시작 즉시 + 6시간", "24시간 이상 남은 임시 파일 삭제"],
];

const PERMISSION_MATRIX = [
  ["무료 회원", "개념 학습·평가센터·오답노트", "주간 모의고사·배치고사·GOAT Arena 차단"],
  ["모의고사 이용권", "주간 공식 모의고사", "배치고사·GOAT Arena 차단, 내부 실력 지표는 누적"],
  ["29일 학습권 패키지", "배치고사·주간 모의고사·GOAT Arena", "Division·학습일수·무결성 상태에 따라 실행 버튼 제어"],
  ["학부모 계정", "연결 자녀의 학습 현황·오답률·공식 랭킹·패키지 구매 준비", "학생용 학습·게시판·Arena 실행 권한 없음"],
  ["관리자", "모든 운영 화면·유료 콘텐츠·Unranked/Ranked 안내", "무제한·만료 없음. 공식 랭킹 데이터 변경은 별도 운영 작업만 사용"],
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
      "스크린샷 OCR은 발급 원장과의 유사도 대조 결과이므로 단독으로 제재를 확정하지 않고 원본 해상도·편집 흔적·다른 증거를 함께 확인",
    ],
  },
  {
    title: "경기·랭킹 정합성 이상",
    checks: [
      "정산·저장 감사에서 미정산 경기와 학습일수 원장 합계 확인",
      "최종 종합 랭킹 재계산은 감사 이력을 남기는 관리자 작업으로만 실행",
      "증거 이상 징후를 먼저 검토하고 임의로 GP·티어를 직접 수정하지 않기",
      "원본 이벤트를 삭제하지 말고 보정 원장 또는 운영 작업을 추가",
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
    objective: "계정 상태와 실제 이용 권한, 학습일수 원장을 같은 결과로 유지합니다.",
    steps: [
      "유저 관리에서 닉네임·가입일·최근 로그인·계정 상태를 확인하고 동명이 아닌 계정 ID를 기준으로 대상을 확정합니다.",
      "무료·주간 공식 모의고사 이용권·29일 학습권 패키지 중 하나를 선택하고 변경 사유를 구체적으로 기록합니다.",
      "미정산 경기, 예치 학습일, 초대 예약 학습일이 있으면 먼저 정산합니다. 이 상태에서는 상품을 강제로 덮어쓰지 않습니다.",
      "변경 뒤 이용 플랜, ArenaAccessState, AccessCycle, 학습일수 원장과 사용자 우편함을 함께 확인합니다.",
      "관리자는 역할 기반 슈퍼계정이므로 별도 유료 상품이나 만료일을 부여하지 않습니다.",
    ],
    hardStops: "카드·계좌 원문, 결제사 전체 응답을 DB나 관리자 메모에 복사하지 않습니다.",
    audit: "AdminActionLog, ArenaLearningDayLedger, UserNotification",
  },
  {
    title: "주간 공식 모의고사 등록",
    cadence: "매주 일요일 공개 전",
    objective: "문제지·채점 기준·공개 시각을 하나의 회차로 원자적으로 등록합니다.",
    steps: [
      "A·B·C는 일요일 15:00·18:00·21:00 KST 고정 슬롯을 선택합니다.",
      "운영 점검 회차는 CUSTOM을 선택하고 한국 날짜와 시작 시각을 직접 입력합니다. CUSTOM은 GP·주간 랭킹·자동 아카이브에 반영되지 않습니다.",
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
      "29일 학습권 전용 자료는 폴더 접근 권한으로 제한하고 단순 URL 추측으로 내려받을 수 없는지 확인합니다.",
      "PDF 다운로드를 시험한 뒤 개인 추적 코드가 페이지 전반에 표시되고, PDF 원본과 해당 페이지 스크린샷 모두에서 발급 사용자를 복원할 수 있는지 확인합니다.",
      "중요 자료·폴더는 상단 고정을 사용하고, 개정본을 올릴 때 이전 파일의 공개·보관 상태를 함께 정리합니다.",
      "삭제는 30일 휴지통을 기본으로 사용하며 R2 객체 삭제까지 가능한 경우에만 영구 삭제합니다.",
    ],
    hardStops: "R2 원본을 public 아래에 복제하거나 R2 공개 URL을 사용자에게 직접 제공하지 않습니다.",
    audit: "ArchiveFolder, ArchiveItem, backupStatus, deletedAt·purgeAt",
  },
  {
    title: "고2·고3 수험관 콘텐츠 운영",
    cadence: "문제집·회차·개념·리포트 공개 및 개정 시",
    objective: "여섯 콘텐츠 유형의 문제·정답·진행률과 R2 원본을 하나의 공개 버전으로 관리합니다.",
    steps: [
      "콘텐츠 유형을 자체제작 N제, 데일리 하프, 실전 모의고사, 수능 파이널, 개념 학습, 오답 유형 리포트 중에서 먼저 선택합니다.",
      "시리즈, 학년·과목, 제목·설명, 난이도, 노출 순서와 유형별 분류값을 입력합니다. 데일리 하프는 연도·월·주차·회차를, 실전 모의고사는 시기·시리즈를 함께 확인합니다.",
      "문항은 화면에서 직접 등록하거나 Matths 주간 공식 모의고사와 같은 matths-answer-key-v1 JSON을 업로드합니다. JSON은 questions 형식 또는 answers·points·questionModes·explanations 형식을 사용하며, 새 JSON을 올리면 화면의 수동 문항 데이터를 대체합니다.",
      "30문항 모의고사는 주간 공식 모의고사와 동일하게 1~21번 객관식·22~30번 주관식·총 100점인지 검증합니다. 공개 상태의 일반 학습 콘텐츠는 표시 문항 수와 정답 데이터 수가 같아야 하며 데일리 하프는 정확히 15문항이어야 합니다.",
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
    title: "전체 Arena 매치메이킹 긴급 제어",
    cadence: "점검·문제 데이터 이상·운영 사고 발생 시",
    objective: "신규 경기만 원자적으로 차단하고 이미 성립한 경기는 정상 완료하게 합니다.",
    steps: [
      "GOAT Arena 정책·상품 관리의 전체 매치메이킹 상태와 마지막 변경 시각을 확인합니다.",
      "일시정지 사유를 입력한 뒤 정지합니다. Unranked·Ranked 신규 경기, 복수전, Ranked 초대 생성과 초대 수락이 차단됩니다.",
      "이미 진행 중인 경기의 문제 풀이·증거 제출·정산은 중단하지 않습니다.",
      "점검 완료 뒤 재개하고 실제 신규 경기 한 건이 정상 생성되는지 확인합니다.",
    ],
    hardStops: "점검을 이유로 진행 중 경기 문서를 직접 취소하거나 정산 상태를 강제로 변경하지 않습니다.",
    audit: "PlatformControl.changedBy·pausedAt·resumedAt, ArenaMatch",
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
    title: "Arena 문제 데이터 배포",
    cadence: "문제 구성 변경·새 유형 코드 배포 후",
    objective: "검산된 생성 유형만 신규 경기에 무중단 적용하고 진행 중 경기의 문제 버전을 보존합니다.",
    steps: [
      "2016~2026 고3 3·5·6·7·9·10·11월 전국연합학력평가·모의평가 114개 수학 형식의 대상 문항 772건을 조사한 공식 유형 분류 현황을 먼저 확인합니다. Arena 범위 707건은 23개 사고 유형과 공개 U1~U9·R1~R9 설계 난이도로 분류되며, 수능과 기하·범위 밖 미적분은 운영 근거에서 제외합니다.",
      "공식 유형 분류는 문제 원문을 출제하는 은행이 아니라 사고 구조와 난이도 설계 근거입니다. 실제 신규 경기는 아래 ACTIVE DB 카탈로그와 독립 검산 생성기를 모두 통과한 유형만 사용합니다.",
      "기존 내부 카탈로그 원본 JSON을 가져올 때는 9개 난이도·각 30개·고유 참고 문항 270개와 대수 12·미적분Ⅰ 12·확률과 통계 6 구성을 먼저 자동 검증합니다.",
      "원본 참고 문항 270개와 정답·5단계 풀이과정을 DB에 그대로 보존합니다. 객관식 168개와 자연수 답 102개가 모두 저장됐는지 확인합니다.",
      "객관식이 혼재하고 실제 이미지 파일이 없으며 Arena 실전은 주관식 생성형이므로 참고 원문은 실전 문항으로 직접 공개하지 않습니다.",
      "각 참고 유형은 평가센터의 독립 검산 생성기와 소스 SHA-256으로 연결합니다. 경기 직전에도 생성기 승인 상태, 소스 일치, 계산기 불필요, 1~999 자연수 답을 다시 확인합니다.",
      "새 유형은 문제 데이터 화면의 ‘1대1 문제 유형 추가’에서 이름, 승인 생성기 기준 유형과 U/R 배정 범위를 선택합니다. 서버는 기준 생성기를 3회 다시 검산하고 기존 30문항 구성을 유지한 새 카탈로그 버전을 활성화합니다.",
      "관리자 화면에서 추가한 유형은 검산된 생성기 구성만 재사용합니다. 새로운 수학 공식이나 생성 알고리즘 자체가 필요하면 코드를 검토·배포한 뒤 서버 생성기 동기화를 먼저 수행합니다.",
      "문제 데이터 화면에서 현재 ACTIVE 버전, 생성 엔진 버전과 마지막 검산 표본 수를 먼저 확인합니다.",
      "ACTIVE 문서를 직접 수정하지 않고 새 DRAFT를 만들거나 기존 DRAFT를 선택합니다. 버전 코드와 변경 사유는 재사용하지 않습니다.",
      "유형별 사용 여부, 1~10 배정 가중치, 1~999 안의 정답 최솟값·최댓값을 입력합니다. 지나치게 좁은 범위는 검산 실패 원인이 됩니다.",
      "공개 U/R 난이도에 연결된 내부 카탈로그마다 사용 상태인 서로 다른 유형을 최소 5개 선택합니다. 화면에 표시되는 유형은 서버에 등록되고 3자리 이하 자연수 답 조건을 통과할 수 있는 생성기뿐입니다.",
      "초안 저장 시 1차 표본 검산 결과를 확인하고, 적용 버튼으로 유형별 5회 자동 검산을 통과시킵니다.",
      "적용 뒤 신규 경기의 ArenaProblemPack.contentSourceVersion, problemDataVersionId와 tierCatalogVersionId가 적용 버전인지 확인합니다. 진행 중 경기는 생성 당시 버전을 유지해야 합니다.",
      "다중 서버는 MongoDB Change Stream으로 캐시를 즉시 무효화하며, Change Stream을 사용할 수 없는 환경도 15초 TTL 뒤 새 버전을 읽습니다.",
    ],
    hardStops: "관리자 입력을 JavaScript로 실행하거나 ACTIVE·RETIRED 문서를 직접 고치지 않습니다. 검산 실패 버전을 강제로 ACTIVE로 바꾸지 않습니다.",
    audit: "ArenaTierQuestionCatalogVersion, ArenaProblemDataVersion, ArenaProblemPack.problemDataVersionId·tierCatalogVersionId, AdminActionLog",
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
    title: "Arena 정책·상점 정책 배포",
    cadence: "새 시즌·가격·규칙 변경 시",
    objective: "진행 중 이용자에게 과거 정책을 소급하지 않고 새 버전을 정해진 시각부터 적용합니다.",
    steps: [
      "Unranked, Ranked, 학습권 상품, 상점 정책을 서로 다른 정책 영역에서 수정합니다.",
      "현재 ACTIVE 정책을 직접 덮어쓰지 않고 새 버전에 변경 요약·KST 적용 시각을 기록합니다. 저장 시점보다 최소 30일 뒤만 선택할 수 있습니다.",
      "배팅 표기 대신 예치 학습일, 페이백 점수와 정기권 학습 가능 일수를 구분해 입력합니다.",
      "Unranked 일반 공격은 전 티어 일일 3회 고정이며 방어 상한은 티어별로 확인합니다. 자동 매칭은 같은 대상 티어에서 당일 방어 횟수가 가장 적은 후보군을 우선 구성한 뒤 무작위 선정하며, 복수전은 이 상한 집계에서 제외됩니다.",
      "Ranked 상향 쟁탈전은 티어 차이 1·2·3단계에 최소 1·2·3일, 공통 최대 5일을 적용합니다. 강제 방어는 최근 24시간 방어 횟수가 가장 적은 후보군에서 무작위 선정하고 경기 종료 뒤 6시간, 진행 중 경기 또는 초대 예약이 있는 사용자는 제외합니다. 6시간 유예는 자동 방어에만 적용하며 적격 사용자는 자발적인 하위 티어 초대전 알림을 계속 받을 수 있습니다.",
      "저장 버튼 한 번으로 적용 예약과 전체 사용자 이메일·우편함 사전 공지가 생성되는지 확인합니다. 전송 실패는 처리 대기 이벤트와 전달 원장에서 자동 재시도됩니다.",
      "적용 예정 시각 전에는 현재 정책, 이후에는 새 정책이 규정 표와 경기 엔진에서 동시에 조회되는지 확인합니다.",
      "적용 뒤 새 이용 주기와 진행 중 이용 주기의 policySnapshot이 의도대로 분리되는지 확인합니다. 단, 일일 경기 상한은 적용 중인 운영 정책을 즉시 공통 사용합니다.",
    ],
    hardStops: "이미 적용된 정책 문서의 조건을 직접 수정하거나 코드 상수만 바꾸어 DB 정책과 어긋나게 만들지 않습니다.",
    audit: "SubscriptionPolicyVersion, MainDivisionPolicyVersion, MainShopPolicyVersion, AdminActionLog",
  },
  {
    title: "경기·증거·정산 이상 대응",
    cadence: "관리 알림 발생 시",
    objective: "문제 풀이 결과, 증거 제출, 학습일수 이전과 티어·GP 변화를 하나의 정산 결과로 보존합니다.",
    steps: [
      "경기 상태, 양측 시도, 10분 제한, 문항별 풀이시간, 1분 증거 제출 기한을 시간순 이벤트로 확인합니다.",
      "증거 원본과 SHA-256 중복, 비정상적으로 짧은 풀이시간, 반복 포커스 이탈 등 위험 신호를 검토합니다.",
      "미정산 상태에서는 GP·티어·학습일수를 수동 변경하지 않고 정산 재시도 또는 보정 원장을 사용합니다.",
      "복수전·No-show는 공격자와 방어자 완료 여부, 24시간 기한, 1일 수수료 소각을 각각 대조합니다.",
      "확정 후 랭킹, 학습일수 원장, 매치 정산 상태와 최종 종합 랭킹 반영을 함께 확인합니다.",
    ],
    hardStops: "풀이 증거를 내려받아 개인 기기에 장기 보관하거나 원본 정산 이벤트를 삭제하지 않습니다.",
    audit: "ArenaMatch, ArenaMatchAttempt, ArenaMatchAttemptEvent, ArenaMatchEvidence, ArenaLearningDayLedger",
  },
  {
    title: "랭킹·시즌·Division 정합성",
    cadence: "일요일 스냅샷·연간 시즌 전환 후",
    objective: "티어 안 순위, Division 랭킹, 최종 종합 랭킹과 학교 평균 랭킹을 같은 원천으로 계산합니다.",
    steps: [
      "Unranked·Ranked 신규 경기가 일요일 14:00에 막히고 15:00에 진행 중 공식 경기가 없는지 확인합니다.",
      "ArenaStanding의 티어·GP·티어 내 순위가 중복 없이 연속인지 정산 감사에서 확인합니다.",
      "Matths 대시보드와 GOAT Arena의 최종 종합 랭킹이 같은 LiveFinalRankingProfile 원천을 사용하는지 확인합니다.",
      "학교 랭킹은 재학생의 최종 종합 랭킹 순위 평균으로 계산하고 N수생은 별도 개인 랭킹으로 표시합니다.",
      "연간 시즌 전환 뒤 Ranked 시즌 배지, 내부 실력 지표 소프트 리셋, 새 배치고사 필요 상태를 점검합니다.",
    ],
    hardStops: "표시 순서를 맞추기 위해 GP만 바꾸지 않습니다. 순위 변동은 승인된 경기 정산 또는 감사 가능한 운영 작업으로 처리합니다.",
    audit: "ArenaStanding, ArenaStandingChangeLedger, ArenaSnapshot, LiveFinalRankingProfile, ArenaAchievementBadge",
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
  ["세션", "SESSION_SECRET, SESSION_TTL_SECONDS", "로그인 세션 서명·TTL", "운영용 긴 무작위 secret, 기본 7일 TTL"],
  ["사용자 파일", "FILE_STORAGE_PROVIDER, CLOUDINARY_URL 또는 Cloudinary 3개 키", "게시판·증거·소명 원본", "authenticated 전달 방식과 사용량 확인"],
  ["운영자·상점 원본", "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET", "아카이브·주간 모의고사·교재 상점", "비공개 버킷·Object Read & Write"],
  ["PDF 개인 식별", "DOCUMENT_WATERMARK_SECRET", "PDF 발급 토큰 서명·유출 역추적", "16자 이상의 별도 운영 secret. 브라우저·로그·Git 노출 금지"],
  ["메일", "GMAIL_USER, GMAIL_APP_PASSWORD, EMAIL_FROM_ADDRESS, EMAIL_FROM_NAME", "계정·정책·무결성 알림", "Gmail 앱 비밀번호 사용, 발송 실패 재시도와 우편함 알림 병행"],
  ["자동 작업", "DISABLE_SCHEDULERS", "스케줄러 실행 여부", "실서비스에서는 임의로 1로 두지 않음"],
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
    schedulers: SCHEDULERS,
    permissionMatrix: PERMISSION_MATRIX,
    incidentPlaybook: INCIDENT_PLAYBOOK,
    operatingWorkflows: OPERATING_WORKFLOWS,
    environmentConfiguration: ENVIRONMENT_CONFIGURATION,
  };
}

module.exports = {
  getAdminOperationsGuideData,
  schemaCatalog,
};
