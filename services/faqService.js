const fs = require("node:fs");
const path = require("node:path");
const { ERROR_HELP_ITEMS } = require("./errorHelpService");

const CATEGORY_LABELS = Object.freeze({
  service: "서비스",
  learning: "학습",
  curriculum: "교육과정",
  usage: "이용",
  community: "게시판",
  arena: "GOAT Arena",
  error: "오류 코드",
});

function decodeHTML(value) {
  const entities = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  };
  return String(value || "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, token) => {
      if (token.startsWith("#x")) return String.fromCodePoint(Number.parseInt(token.slice(2), 16));
      if (token.startsWith("#")) return String.fromCodePoint(Number.parseInt(token.slice(1), 10));
      return entities[token.toLowerCase()] ?? match;
    });
}

function plainText(html) {
  return decodeHTML(String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n\n")
    .replace(/<\/li\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function attribute(source, name) {
  return source.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] || "";
}

function loadStaticFAQ() {
  const template = fs.readFileSync(path.join(__dirname, "../views/faq.ejs"), "utf8");
  const items = [];
  const detailsPattern = /<details\s+([^>]*\bdata-category="([^"]+)"[^>]*)>([\s\S]*?)<\/details>/gi;
  let match;
  while ((match = detailsPattern.exec(template))) {
    const attributes = match[1];
    const category = match[2];
    if (!CATEGORY_LABELS[category] || attributes.includes("<%")) continue;
    const body = match[3];
    const question = plainText(body.match(/<summary[^>]*>[\s\S]*?<strong>([\s\S]*?)<\/strong>/i)?.[1]);
    const answer = plainText(body.match(/<div\s+class="faq-answer"[^>]*>([\s\S]*?)<\/div>/i)?.[1]);
    if (!question || !answer) continue;
    const ordinal = plainText(body.match(/<span\s+class="question-meta"[^>]*>[\s\S]*?<i>([\s\S]*?)<\/i>/i)?.[1]);
    items.push({
      id: attribute(attributes, "id") || `faq-${category}-${items.length + 1}`,
      category,
      categoryLabel: CATEGORY_LABELS[category],
      ordinal,
      question,
      answer,
      searchText: plainText(attribute(attributes, "data-search")),
    });
  }
  if (items.length < 40) {
    throw new Error(`FAQ template parse failed: expected at least 40 rows, found ${items.length}`);
  }
  return items;
}

const ERROR_FAQ_ITEMS = ERROR_HELP_ITEMS.map((item) => ({
  id: item.id,
  category: "error",
  categoryLabel: CATEGORY_LABELS.error,
  ordinal: item.code,
  question: `${item.code} 오류는 무엇인가요?`,
  answer: `${item.title} — ${item.summary}\n\n${item.action}\n\n문의할 때 발생 시각, 페이지 주소와 HTTP_${item.code}를 함께 알려주세요.`,
  searchText: `오류 에러 코드 error ${item.code} HTTP_${item.code} ${item.title}`,
}));
let cachedFAQItems;

function faqItems() {
  // 템플릿 문구 변경이 서버 부팅 자체를 막아서는 안 된다. 첫 FAQ 요청 때만 읽고,
  // 파싱 오류는 컨트롤러의 정상 오류 처리로 넘긴다.
  if (!cachedFAQItems) {
    cachedFAQItems = Object.freeze([...loadStaticFAQ(), ...ERROR_FAQ_ITEMS]);
  }
  return cachedFAQItems;
}

function listFAQ({ query = "", category = "", code = "" } = {}) {
  const allItems = faqItems();
  const normalizedCategory = Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, category)
    ? category : "";
  const normalizedCode = String(code || "").trim();
  const normalizedQuery = String(query || "").trim().slice(0, 80).toLocaleLowerCase("ko-KR");
  const items = allItems.filter((item) => {
    if (normalizedCode && item.ordinal !== normalizedCode) return false;
    if (normalizedCategory && item.category !== normalizedCategory) return false;
    if (!normalizedQuery) return true;
    return `${item.question} ${item.answer} ${item.searchText}`
      .toLocaleLowerCase("ko-KR").includes(normalizedQuery);
  });
  const categories = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
    value,
    label,
    count: allItems.filter((item) => item.category === value).length,
  }));
  return {
    query: String(query || "").trim().slice(0, 80),
    category: normalizedCategory,
    code: normalizedCode,
    totalCount: allItems.length,
    resultCount: items.length,
    categories,
    items,
  };
}

module.exports = { listFAQ };
