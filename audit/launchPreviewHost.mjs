import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const express = require("express");
const root = path.resolve(import.meta.dirname, "..");
const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(root, "views"));
app.use(express.json({ limit: "64kb" }));
app.use(express.static(path.join(root, "public")));
app.use("/vendor/mathjax", express.static(path.join(root, "node_modules", "mathjax")));
app.use("/vendor/mathjax-fonts", express.static(path.join(root, "node_modules", "@mathjax")));

app.get("/goat-arena/main/shop/analyses/preview", (_req, res) => {
  res.render("goat-arena-main-shop-analysis", {
    activeArenaPage: "shop",
    arenaUser: {
      nickname: "preview",
      hasMainProfileBorder: true,
      hasStyleEntrance: false,
    },
    analysis: {
      id: "preview",
      status: "APPLIED",
      analysisState: "READY",
      relatedMatchId: "preview-match",
      result: "WIN",
      score: 80,
      correctCount: 4,
      totalSolveTimeMs: 523000,
      incorrectQuestionKeys: ["5번"],
      weakSkills: ["수열의 귀납적 정의", "조건 해석"],
      reviewProblemCount: 10,
      checklist: ["점화식의 첫 세 항을 직접 쓰기", "조건에서 시작값을 먼저 확인하기"],
      questionReviews: [
        {
          number: 1,
          questionKey: "Q1",
          courseId: "algebra",
          typeId: "ALG-SEQUENCE-SUM",
          prompt: "\\(a_1=2\\), \\(d=3\\)인 등차수열에서 \\(\\sum_{k=1}^{5} a_k\\)를 구하세요.",
          submittedAnswer: "35",
          correctAnswer: "40",
          correct: false,
          pointsAwarded: 0,
          responseTimeMs: 124000,
          solution: "\\(a_k=2+3(k-1)\\)이므로 \\(\\sum_{k=1}^{5}a_k=40\\)이다.",
          referenceSolutionProcess: [
            { step: 1, explanation: "\\(a_1\\)과 공차 \\(d\\)를 확인한다." },
            { step: 2, explanation: "일반항 \\(a_k=2+3(k-1)\\)을 구한다." },
            { step: 3, explanation: "등차수열의 합 공식을 적용한다." },
          ],
          referenceFinalCheck: "직접 나열한 항의 합과 공식 계산 결과가 같은지 확인한다.",
        },
      ],
      generatedAt: new Date("2026-08-03T10:00:00+09:00"),
    },
  });
});

app.get("/audit/dynamic-math", (_req, res) => {
  res.type("html").send(`<!doctype html>
    <html lang="ko"><head><meta charset="utf-8"><title>동적 수식 런타임 검증</title>
    <script>window.MathJax={tex:{inlineMath:[["\\\\(","\\\\)"]],displayMath:[["\\\\[","\\\\]"]]},svg:{fontCache:"global"},options:{enableSpeech:false,enableBraille:false,enableExplorer:false}};</script>
    <script src="/vendor/mathjax/tex-svg.js" defer></script>
    <script src="/js/math-renderer.js" defer></script></head>
    <body><main id="dynamic-target">대기 중</main>
    <script>window.addEventListener("load",()=>window.MatthsMath.setText(document.getElementById("dynamic-target"),"\\\\[\\\\sum_{k=1}^{5} k^2=55\\\\]").then(()=>document.body.dataset.done="1"));</script>
    </body></html>`);
});

app.get("/audit/formula-gallery", (_req, res) => {
  const formulas = [
    ["분수", "\\[\\frac{x+1}{x-1}\\]"],
    ["지수·아래첨자", "\\[a_n=x^{n+1}+b_{n-1}\\]"],
    ["제곱근", "\\[\\sqrt{x^2+1}+\\sqrt[3]{8}\\]"],
    ["중첩 분수", "\\[\\frac{1}{1+\\frac{1}{x}}\\]"],
    ["극한", "\\[\\lim_{x\\to 0}\\frac{\\sin x}{x}=1\\]"],
    ["적분", "\\[\\int_{0}^{1}x^2\\,dx=\\frac13\\]"],
    ["합", "\\[\\sum_{k=1}^{n}k=\\frac{n(n+1)}2\\]"],
    ["곱", "\\[\\prod_{k=1}^{n}k=n!\\]"],
    ["행렬", "\\[A=\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}\\]"],
    ["조각함수", "\\[f(x)=\\begin{cases}x^2,&x\\ge0\\\\-x,&x<0\\end{cases}\\]"],
    ["절댓값·부등식", "\\[|x-1|\\le2\\iff-1\\le x\\le3\\]"],
    ["함수", "\\[f(g(x))=e^{x^2}\\]"],
    ["긴 식", "\\[\\frac{x^4-1}{x^2-1}=x^2+1\\quad(x\\ne\\pm1)\\]"],
    ["인라인", "문장 안에서 \\(a^2+b^2=c^2\\)가 자연스럽게 이어집니다."],
  ];
  res.type("html").send(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>수식 갤러리</title><style>body{margin:0;padding:24px;font-family:system-ui;background:#f5f6fb;color:#121827}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.card{min-width:0;padding:18px;background:white;border:1px solid #dce2ef;border-radius:16px;overflow:auto}.card h2{font-size:14px;margin:0 0 12px}.card p{margin:0;line-height:1.7}@media(max-width:480px){body{padding:12px}.grid{grid-template-columns:minmax(0,1fr)}.card{padding:14px}}</style><script>window.MathJax={tex:{inlineMath:[["\\\\(","\\\\)"]],displayMath:[["\\\\[","\\\\]"]]},svg:{fontCache:"global"},options:{enableSpeech:false,enableBraille:false,enableExplorer:false}};</script><script src="/vendor/mathjax/tex-svg.js" defer></script><script src="/js/math-renderer.js" defer></script></head><body><main class="grid">${formulas.map(([label, formula]) => `<article class="card"><h2>${label}</h2><p>${formula}</p></article>`).join("")}</main></body></html>`);
});

app.get("/quick-practice", (_req, res) => {
  res.render("quick-practice", {
    user: { name: "수식검수학생", schoolGrade: 11 },
    stats: { total: 2, accuracy: 50, averageMs: 4300 },
    catalog: {
      scope: "2022~2026학년도 6월·9월 대학수학능력시험 모의평가 수학 공통과목 첫 페이지",
      typeCount: 1,
      variantCount: 2,
      byPoint: [{ points: 2, types: [{ label: "극한과 적분", variants: ["극한", "정적분"] }] }],
    },
  });
});

app.get("/wrong-notes", (_req, res) => {
  res.render("wrong-notes", {
    user: { name: "수식검수학생", schoolGrade: 11 },
    wrongNoteData: {
      filters: { status: "all", course: "", search: "", sort: "priority", page: 1 },
      options: { courses: [{ id: "calculus-1", title: "미적분Ⅰ" }] },
      stats: { total: 3, pending: 2, scheduled: 1, completed: 0, due: 3, filtered: 1 },
      pagination: { currentPage: 1, totalPages: 1, hasPrevious: false, hasNext: false },
      items: [{
        reviewStatus: "pending",
        sourceLabel: "40초 눈풀이",
        submittedAtLabel: "2026년 8월 15일",
        reviewLabel: "복습 대기",
        scheduledAtLabel: "",
        stem: "함수 \\(f(x)=-x^2+2\\)에 대하여 \\(f'(0)\\)의 값은?",
        courseTitle: "미적분Ⅰ",
        unitTitle: "미분",
        conceptTitle: "도함수",
        difficulty: 2,
        submittedAnswer: "2",
        score: 0,
        maxScore: 2,
        standardCode: "12미적Ⅰ-02-03",
        conceptHref: "/quick-practice",
        reviewHref: "/wrong-notes/preview/review",
        isQuickPractice: true,
        retryAvailable: true,
      }],
    },
  });
});

app.get("/my-learning", (_req, res) => {
  const concepts = [
    { title: "함수 \\(f(x)=x^2\\)와 그래프", progress: 60, href: "/courses/common-math/units/functions/concepts/quadratic", standardCode: "10공수2-01-01", completedTopics: 3, topics: [1, 2, 3, 4, 5], status: "in-progress" },
    { title: "방정식 \\(x^2-3x+2=0\\)", progress: 0, href: "/courses/common-math/units/functions/concepts/equation", standardCode: "10공수2-01-02", completedTopics: 0, topics: [1, 2, 3], status: "not-started" },
  ];
  res.render("my-learning", {
    user: { name: "수식검수학생", schoolGrade: 11 },
    learningData: {
      completedConcepts: 0,
      totalConcepts: 2,
      continueHref: concepts[0].href,
      courses: [{
        id: "common-math",
        officialTitle: "공통수학 \\(x^2+y^2\\)",
        developmentLocked: false,
        progress: 30,
        hasActivity: true,
        completedConcepts: 0,
        totalConcepts: 2,
        defaultSemester: "1학기",
        assessmentRequired: false,
        assessmentPassed: false,
        units: [{
          id: "functions",
          order: 1,
          title: "함수와 그래프 \\(y=f(x)\\)",
          completedConcepts: 0,
          progress: 30,
          assessmentRequired: false,
          assessmentPassed: false,
          firstConceptHref: concepts[0].href,
          concepts,
        }],
      }],
    },
  });
});

app.get("/contact", (_req, res) => {
  res.render("contact", {
    user: { id: "preview-user", name: "검수학생", role: "student" },
    contactData: {
      user: {
        id: "preview-user",
        nickname: "검수학생",
        realName: "김검수",
        email: "audit@example.com",
        schoolName: "검수고등학교",
        schoolGrade: 12,
      },
      inquiries: [],
      refundableOrders: [],
    },
    feedback: null,
    inquiryRequestId: "5a8ebeb1-0b55-4d70-a200-8a1d58c85b2e",
    oldInput: {
      inquiryType: "GENERAL",
      paymentId: "",
      refundReasonType: "SIMPLE_CHANGE",
      subject: "",
      content: "",
    },
  });
});

app.get("/parent/inquiries", (_req, res) => {
  res.render("parent-inquiries", {
    parent: { _id: "preview-parent", username: "검수 학부모" },
    child: { _id: "preview-child", name: "검수학생", realName: "김검수" },
    familyChildren: [],
    selectedChildId: "preview-child",
    inquiryData: {
      contactEmail: "parent@example.com",
      inquiries: [],
    },
    inquiryRequestId: "6b9fcfc2-1c66-5e81-b311-9b2e69d96c3f",
    feedback: "",
    error: "",
    oldInput: { subject: "", content: "" },
  });
});

app.post("/api/quick-practice/start", (_req, res) => {
  res.json({
    attempt: {
      instanceId: "preview-attempt",
      pointValue: 2,
      topicLabel: "미적분Ⅰ",
      variantLabel: "극한값 계산",
      prompt: "함수 \\(f(x)=\\frac{\\sin x}{x}\\)에 대하여 \\(\\lim_{x\\to0}f(x)\\)의 값은?",
      deadlineAt: new Date(Date.now() + 40_000).toISOString(),
    },
  });
});

app.post("/api/quick-practice/:instanceId/submit", (_req, res) => {
  res.json({
    result: {
      correct: false,
      answer: "1",
      responseTimeMs: 4600,
      solution: "\\(\\lim_{x\\to0}\\frac{\\sin x}{x}=1\\)이므로 정답은 \\(1\\)입니다.",
      coachFeedback: { mode: "spicy", label: "집중", message: "기본 극한값은 바로 떠올려야 합니다." },
    },
    stats: { total: 3, accuracy: 33, averageMs: 4400 },
  });
});

app.post("/api/quick-practice/:instanceId/expire", (_req, res) => {
  res.json({ result: { expired: true, answer: "1", solution: "\\(\\lim_{x\\to0}\\frac{\\sin x}{x}=1\\)" }, stats: { total: 3, accuracy: 33, averageMs: 4400 } });
});

app.get("/audit/viewport/:width/:height/:page", (req, res) => {
  const width = Math.min(1920, Math.max(320, Number(req.params.width) || 390));
  const height = Math.min(1200, Math.max(568, Number(req.params.height) || 844));
  const targets = {
    quick: "/quick-practice",
    analysis: "/goat-arena/main/shop/analyses/preview",
    formulas: "/audit/formula-gallery",
    wrongnotes: "/wrong-notes",
    mylearning: "/my-learning",
    contact: "/contact",
    parentinquiries: "/parent/inquiries",
  };
  const target = targets[req.params.page] || targets.quick;
  res.type("html").send(`<!doctype html><html><head><meta charset="utf-8"><title>${width}x${height} responsive audit</title><style>html,body{margin:0;background:#222}iframe{display:block;width:${width}px;height:${height}px;border:0;background:white}</style></head><body><iframe title="반응형 검수" src="${target}"></iframe></body></html>`);
});

export const server = app.listen(8012, "127.0.0.1");
