const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");
const { execFile, execFileSync } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

const root = path.resolve(__dirname, "..");
const outputPath = path.join(root, "public", "i18n", "en.json");
const delimiter = "MATTHS_SPLIT_8675309";
const koreanPattern = /[가-힣]/;

const manualTranslations = {
  "홈": "Home",
  "학습 홈": "Learning Home",
  "내 학습": "My Learning",
  "교육과정": "Curriculum",
  "평가 센터": "Assessment Center",
  "오답 노트": "Wrong Answer Notes",
  "문구 제안소": "Message Suggestions",
  "대시보드": "Dashboard",
  "GOAT Arena 입장": "Enter GOAT Arena",
  "티어 순위": "Tier Rankings",
  "상점": "Store",
  "경기 규정": "Match Rules",
  "프로필": "Profile",
  "프로필 설정": "Profile Settings",
  "로그인": "Sign In",
  "로그아웃": "Sign Out",
  "회원가입": "Create Account",
  "회원가입 | Matths": "Create Account | Matths",
  "학년": "Learner type",
  "이미 계정이 있나요?": "Already have an account?",
  "Matths 학습을 시작하세요.": "Start learning with Matths.",
  "Matths 메인": "Matths Home",
  "Matths 메인 페이지": "Matths home page",
  "이름": "Full Name",
  "생년월일": "Date of Birth",
  "닉네임": "Nickname",
  "이메일": "Email",
  "비밀번호": "Password",
  "비밀번호 확인": "Confirm Password",
  "보기": "Show",
  "숨기기": "Hide",
  "처리 중...": "Processing...",
  "처리 중…": "Processing…",
  "현재 학습자 구분": "Current learner type",
  "고등학교 1학년": "High school · Grade 10",
  "고등학교 2학년": "High school · Grade 11",
  "고등학교 3학년": "High school · Grade 12",
  "N수생": "High school graduate / Retaking exams",
  "대학생": "University student",
  "직장인": "Working professional",
  "재학 중인 고등학교": "Current high school",
  "학교 소재 시·도": "School region",
  "시·도를 선택해 주세요": "Select a region",
  "학교 검색": "Search for a school",
  "학교명을 입력하세요": "Enter a school name",
  "시·도를 선택한 후 학교명을 검색하세요.": "Select a region, then search for your school.",
  "고등학교": "High school",
  "시·도를 먼저 선택해 주세요": "Select a region first",
  "학교를 선택해 주세요": "Select a school",
  "해외": "Overseas",
  "서울특별시": "Seoul",
  "부산광역시": "Busan",
  "대구광역시": "Daegu",
  "인천광역시": "Incheon",
  "전남광주통합특별시(광주)": "Gwangju",
  "대전광역시": "Daejeon",
  "울산광역시": "Ulsan",
  "세종특별자치시": "Sejong",
  "경기도": "Gyeonggi Province",
  "강원특별자치도": "Gangwon Province",
  "충청북도": "North Chungcheong Province",
  "충청남도": "South Chungcheong Province",
  "전북특별자치도": "North Jeolla Province",
  "전남광주통합특별시(전남)": "South Jeolla Province",
  "경상북도": "North Gyeongsang Province",
  "경상남도": "South Gyeongsang Province",
  "제주특별자치도": "Jeju Province",
  "해외소재고등학교": "High school outside Korea",
  "해외 고등학교 이름": "High school name",
  "학교의 공식 이름을 입력하세요": "Enter the school's official name",
  "국가명은 선택 사항이며, 학교가 사용하는 공식 이름을 입력해 주세요.": "Enter the school's official name. Including the country is optional.",
  "재학 중인 대학교": "Current university",
  "대학교 검색": "Search for a university",
  "대학교명을 입력하세요": "Enter a university name",
  "대학알리미 2026년 공시대상대학 목록을 사용합니다.": "The Korean university list is based on the 2026 AcademyInfo disclosure list.",
  "대학교": "University",
  "대학교를 선택해 주세요": "Select a university",
  "해외소재대학교": "University outside Korea",
  "해외 대학교 이름": "University name",
  "대학교의 공식 이름을 입력하세요": "Enter the university's official name",
  "캠퍼스명이 있다면 학교 이름과 함께 입력해 주세요.": "Include the campus name when applicable.",
  "검색 결과가 없습니다.": "No results found.",
  "학교 데이터를 불러오지 못했습니다.": "School data could not be loaded.",
  "대학교 데이터를 불러오지 못했습니다.": "University data could not be loaded.",
  "학교명을 직접 입력합니다.": "Enter the school name manually.",
  "선택한 날짜의 자정 직전까지 표시 · 비워두면 직접 내릴 때까지 · KST 기준": "Displayed until midnight on the selected date · Leave blank to keep it visible until manually removed · KST",
  "현재 학습자 구분은 고등학교 입력을 사용하지 않습니다.": "A high school is not required for this learner type.",
  "필수 항목을 모두 입력해주세요.": "Please complete all required fields.",
  "필수 가입 정보를 모두 입력해주세요.": "Please complete all required registration details.",
  "닉네임은 2자 이상 30자 이하로 입력해주세요.": "Enter a nickname between 2 and 30 characters.",
  "올바른 이메일 주소를 입력해주세요.": "Enter a valid email address.",
  "올바른 학습자 구분을 선택해주세요.": "Select a valid learner type.",
  "현재 학습자 구분을 선택해주세요.": "Select your current learner type.",
  "비밀번호는 8자 이상이어야 합니다.": "Your password must be at least 8 characters.",
  "비밀번호는 영문과 숫자를 포함해 8자 이상이어야 합니다.": "Your password must be at least 8 characters and include letters and numbers.",
  "비밀번호가 너무 깁니다.": "Your password is too long.",
  "비밀번호가 서로 일치하지 않습니다.": "Passwords do not match.",
  "비밀번호가 일치하지 않습니다.": "Passwords do not match.",
  "비밀번호가 일치합니다.": "Passwords match.",
  "이용약관에 동의해주세요.": "Please agree to the Terms of Service.",
  "이용약관과 개인정보처리방침에 동의해주세요.": "Please agree to the Terms of Service and Privacy Policy.",
  "올바른 고등학교를 선택해주세요.": "Select a valid high school.",
  "목록에서 고등학교를 선택해주세요.": "Select a high school from the list.",
  "목록에서 재학 중인 대학교를 선택해주세요.": "Select your university from the list.",
  "목록에서 대학교를 선택해주세요.": "Select a university from the list.",
  "학교 이름은 2자 이상 120자 이하로 입력해 주세요.": "Enter a school name between 2 and 120 characters.",
  "대학교 이름은 2자 이상 120자 이하로 입력해 주세요.": "Enter a university name between 2 and 120 characters.",
  "학교 이름에 사용할 수 없는 문자가 포함되어 있습니다.": "The school name contains unsupported characters.",
  "대학교 이름에 사용할 수 없는 문자가 포함되어 있습니다.": "The university name contains unsupported characters.",
  "이미 가입된 이메일입니다.": "An account already exists for this email.",
  "이미 사용 중인 닉네임입니다.": "This nickname is already in use.",
  "언어": "Language",
  "궁금한 건 빠르게,": "Get answers quickly.",
  "수학은 깊게.": "Learn math deeply.",
  "현재 시작 범위 · 2022 개정 교육과정 고1 공통수학": "Available now · Grade 10 Common Mathematics · 2022 Revised Korean Curriculum",
  "상호": "Business name",
  "대표자": "Representative",
  "사업자등록번호": "Business registration number",
  "사업장 소재지": "Business address",
  "서울특별시 강남구 강남대로112길 47 (논현동)": "47 Gangnam-daero 112-gil, Gangnam-gu, Seoul, Republic of Korea",
  "고객센터": "Customer support",
  "호스팅 서비스 제공자": "Hosting provider",
  "학습 계속하기": "Continue Learning",
  "학습 기능 보기": "View Learning Features",
  "현재 시즌": "Current Season",
  "현재 상위 순위": "Current Top Rankings",
  "이번 시즌 랭킹은 준비 중입니다.": "This season's rankings are being prepared.",
  "내 아레나 확인": "View My Arena",
  "내 현재 Arena 상태를 확인합니다.": "Check your current Arena status.",
  "경기 진행 중": "Match in progress",
  "남은 시간": "Time remaining",
  "답안 저장": "Answer saved",
  "진행": "Progress",
  "다음 문제": "Next Problem",
  "튜토리얼 시작하기": "Start Tutorial",
  "튜토리얼 다시보기": "Replay Tutorial",
  "다음": "Next",
  "이전": "Back",
  "완료": "Done",
  "건너뛰기": "Skip",
  "닫기": "Close",
  "취소": "Cancel",
  "저장": "Save",
  "변경 내용 저장": "Save Changes",
  "수정": "Edit",
  "삭제": "Delete",
  "확인": "Confirm",
  "검색": "Search",
  "선택": "Select",
  "전체 선택": "Select All",
  "운영자": "Admin",
  "운영자 페이지": "Admin Console",
  "사용자": "User",
  "학생": "Student",
  "학부모": "Parent",
  "이용약관": "Terms of Service",
  "개인정보처리방침": "Privacy Policy",
  "문의하기": "Contact Us",
  "로딩 중...": "Loading...",
  "불러오는 중...": "Loading...",
  "오류가 발생했습니다.": "Something went wrong.",
  "다시 시도": "Try Again",
  "부분 환불액 = 결제금액 - 일할 이용금액(결제금액 × 이용일수 ÷ 30일)": "Partial refund = payment amount − prorated usage amount (payment amount × days used ÷ 30 days)",
  "부분 환불액 = 결제금액 - 일할 이용금액(결제금액 × 이용일수 ÷ 29일)": "Partial refund = payment amount − prorated usage amount (payment amount × days used ÷ 29 days)",
  "와 를 서버 환경변수에 등록해주세요.": "Register both values as server environment variables.",
  "훌륭해요. 이 개념은 제대로 이해하고 있습니다.": "Excellent. You understand this concept well.",
  "이번에는 놓쳤지만 원리를 확인하면 바로 고칠 수 있어요.": "You missed it this time, but reviewing the principle will help you fix it right away.",
  "식을 완성하지 못해도 괜찮아요. 아는 부분부터 적어봐요.": "It's okay if you cannot complete the expression. Write down what you know first."
};

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function normalize(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/&larr;/gi, "←")
    .replace(/&rarr;/gi, "→")
    .replace(/\s+/g, " ")
    .trim();
}

function addCandidate(target, value) {
  const candidate = normalize(value);
  const standaloneParticles = new Set(["은", "는", "이", "가", "을", "를", "와", "과", "의"]);
  if (
    koreanPattern.test(candidate) &&
    !standaloneParticles.has(candidate) &&
    candidate.length <= 3000 &&
    !candidate.includes("<%")
  ) {
    target.add(candidate);
  }
}

function extractViewPhrases(target) {
  const views = walk(path.join(root, "views")).filter((file) => file.endsWith(".ejs"));
  for (const file of views) {
    const originalSource = fs.readFileSync(file, "utf8");
    for (const ejsMatch of originalSource.matchAll(/<%[\s\S]*?%>/g)) {
      for (const stringMatch of ejsMatch[0].matchAll(
        /(["'`])((?:\\.|(?!\1)[^\r\n])*?)\1/g
      )) {
        addCandidate(
          target,
          stringMatch[2].replace(/\\n/g, " ").replace(/\$\{[^}]+\}/g, "")
        );
      }
    }

    let source = originalSource
      .replace(/<%[\s\S]*?%>/g, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ");
    for (const match of source.matchAll(/>([^<>]+)</g)) {
      addCandidate(target, match[1]);
    }
    for (const match of source.matchAll(
      /(?:placeholder|aria-label|title|alt|content|data-search|data-label)\s*=\s*["']([^"']*[가-힣][^"']*)["']/gi
    )) {
      addCandidate(target, match[1]);
    }
  }
}

function extractLocalizedContentPhrases(target) {
  const contentFiles = [
    ...walk(path.join(root, "content_folder")),
    ...walk(path.join(root, "curriculum_folder")),
  ].filter((file) => /\.ya?ml$/i.test(file));

  function visit(value) {
    if (typeof value === "string") {
      addCandidate(target, value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === "object") {
      Object.values(value).forEach(visit);
    }
  }

  for (const file of contentFiles) {
    visit(yaml.load(fs.readFileSync(file, "utf8")));
  }
}

function extractJavascriptPhrases(target) {
  const files = [
    ...walk(path.join(root, "public", "js")),
    ...walk(path.join(root, "controllers")),
    ...walk(path.join(root, "services")),
    ...walk(path.join(root, "middleware")),
  ].filter((file) => file.endsWith(".js") && fs.existsSync(file));

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/(["'`])((?:\\.|(?!\1)[^\r\n])*?)\1/g)) {
      const candidate = match[2]
        .replace(/\\n/g, " ")
        .replace(/\$\{[^}]+\}/g, " ");
      if (!/[<>{}=;]/.test(candidate)) addCandidate(target, candidate);
    }
  }
}

const bingUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 " +
  "Edg/151.0.4129.59";
let bingConfig = null;
let bingRequestCount = 0;

function fetchBingConfig() {
  const html = execFileSync("curl", [
    "-L", "--fail", "--silent", "--show-error", "--max-time", "30",
    "-A", bingUserAgent,
    "https://www.bing.com/translator",
  ], { encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
  const abuse = JSON.parse(
    html.match(/params_AbusePreventionHelper\s?=\s?([^\]]+\])/)[1]
  );
  bingConfig = {
    IG: html.match(/IG:"([^"]+)"/)[1],
    IID: html.match(/data-iid="([^"]+)"/)[1],
    key: abuse[0],
    token: abuse[1],
  };
  bingRequestCount = 0;
  return bingConfig;
}

function translatedText(response) {
  const parsed = JSON.parse(response);
  if (parsed?.ShowCaptcha) throw new Error("Bing translation captcha requested");
  return parsed?.[0]?.translations?.[0]?.text || "";
}

async function requestTranslation(batch, attempt = 1) {
  const query = batch.join(`\n${delimiter}\n`);
  const config = bingConfig || fetchBingConfig();
  bingRequestCount += 1;
  const url = "https://www.bing.com/ttranslatev3?isVertical=1" +
    `&IG=${encodeURIComponent(config.IG)}` +
    `&IID=${encodeURIComponent(config.IID)}` +
    `&SFX=${bingRequestCount}&ref=TThis&edgepdftranslator=1`;
  try {
    const { stdout: response } = await execFileAsync("curl", [
      "-L", "--fail", "--silent", "--show-error", "--max-time", "30",
      "-A", bingUserAgent,
      "-e", "https://www.bing.com/translator",
      "--data-urlencode", `text=${query}`,
      "--data", "fromLang=ko",
      "--data", "to=en",
      "--data-urlencode", `token=${config.token}`,
      "--data-urlencode", `key=${config.key}`,
      "--data", "tryFetchingGenderDebiasedTranslations=true",
      url,
    ], { encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
    const rows = translatedText(response)
      .split(delimiter)
      .map((value) => normalize(value));
    if (rows.length !== batch.length) {
      if (batch.length === 1) return [normalize(translatedText(response))];
      const middle = Math.ceil(batch.length / 2);
      const [left, right] = await Promise.all([
        requestTranslation(batch.slice(0, middle)),
        requestTranslation(batch.slice(middle)),
      ]);
      return [...left, ...right];
    }
    return rows;
  } catch (error) {
    if (attempt >= 4) throw error;
    bingConfig = null;
    await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
    return requestTranslation(batch, attempt + 1);
  }
}

function batchesFor(phrases, maxCharacters = 1600) {
  const batches = [];
  let current = [];
  let currentLength = 0;
  for (const phrase of phrases) {
    const nextLength = currentLength + phrase.length + delimiter.length + 2;
    if (current.length && nextLength > maxCharacters) {
      batches.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(phrase);
    currentLength += phrase.length + delimiter.length + 2;
  }
  if (current.length) batches.push(current);
  return batches;
}

function loadExistingTranslations() {
  try {
    const parsed = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    return parsed.translations || {};
  } catch (_error) {
    return {};
  }
}

function polishTranslation(source, translation) {
  let polished = normalize(translation);
  if (/^맞았다[.!]/u.test(source)) {
    polished = polished.replace(
      /^(?:It was right|I was right|That was right|Right)\./i,
      "Correct."
    );
  }
  if (/^정답[.!]/u.test(source)) {
    polished = polished.replace(/^(?:Answer|The answer)\./i, "Correct.");
  }
  if (/(?:^|[^가-힣])식(?:을|이|은|의|으로|부터|도|만)?(?=[^가-힣]|$)/u.test(source)) {
    polished = polished
      .replace(/\bceremon(?:y|ies)\b/gi, "expression")
      .replace(/\brituals?\b/gi, "expression")
      .replace(/\bmeals?\b/gi, "expression");
  }
  return polished;
}

function save(translations) {
  const sorted = Object.fromEntries(
    Object.entries(translations)
      .map(([source, translation]) => [
        source,
        polishTranslation(source, translation),
      ])
      .sort(([a], [b]) => a.localeCompare(b, "ko"))
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify({
    locale: "en",
    sourceLocale: "ko",
    generatedAt: new Date().toISOString(),
    translations: sorted,
  }, null, 2)}\n`);
}

async function main() {
  const candidates = new Set(Object.keys(manualTranslations));
  extractViewPhrases(candidates);
  extractLocalizedContentPhrases(candidates);
  extractJavascriptPhrases(candidates);

  const translations = {
    ...Object.fromEntries(
      Object.entries(loadExistingTranslations())
        .filter(([source]) => candidates.has(source))
    ),
    ...manualTranslations,
  };
  const missing = [...candidates]
    .filter((phrase) => !translations[phrase])
    .sort((a, b) => a.localeCompare(b, "ko"));
  const batches = batchesFor(missing);

  if (process.argv.includes("--check")) {
    const koreanValues = Object.entries(translations)
      .filter(([, value]) => koreanPattern.test(String(value || "")));
    if (missing.length || koreanValues.length) {
      throw new Error(
        `English localization incomplete: ${missing.length} missing, ${koreanValues.length} Korean values.`
      );
    }
    process.stdout.write(
      `English localization coverage passed: ${candidates.size} source phrases.\n`
    );
    return;
  }

  save(translations);

  process.stdout.write(
    `English dictionary: ${candidates.size} phrases, ${missing.length} new, ${batches.length} batches.\n`
  );
  const concurrency = 10;
  for (let start = 0; start < batches.length; start += concurrency) {
    const currentBatches = batches.slice(start, start + concurrency);
    const results = await Promise.all(
      currentBatches.map((batch) => requestTranslation(batch))
    );
    currentBatches.forEach((batch, resultIndex) => {
      batch.forEach((source, index) => {
        translations[source] = results[resultIndex][index] || source;
      });
    });
    save(translations);
    process.stdout.write(
      `Translated ${Math.min(start + concurrency, batches.length)}/${batches.length} batches.\n`
    );
  }
  save(translations);
  process.stdout.write(`Wrote ${Object.keys(translations).length} translations to ${outputPath}.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
