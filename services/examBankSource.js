/* ============================================================
   맵쓰 심화 모의고사 뱅크 — 대수 · 미적분Ⅰ · 확률과 통계
   모든 문항은 생성기(발제문·선지·답이 파라미터로 매번 달라짐).
   구성 단위:
     소단원(sub) → 대단원(unit) → 과목(course)
   빌더:
     buildSubExam(courseId, unitId, subId)  — 소단원 집중 4문항
     buildUnitExam(courseId, unitId)        — 대단원 모의고사 8문항
     brand buildCourseExam(courseId)        — 과목 전범위 12문항
     buildIntegratedExam()                  — 3과목 통합 15문항
   문항 형식: { prompt, inputMode, answer, choices?, solution, points }
   수식은 $...$ 인라인 KaTeX (렌더 측 texify 사용).
   브라우저(전역)와 Node(모듈) 양쪽 동작.
   ============================================================ */
(function (root) {
  "use strict";

  /* ---------- 난수·수식 유틸 ---------- */
  const ri = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const pk = (arr) => arr[ri(0, arr.length - 1)];
  const sh = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = ri(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const nCr = (n, k) => {
    if (k < 0 || k > n) return 0;
    k = Math.min(k, n - k);
    let r = 1;
    for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
    return Math.round(r);
  };
  /* 기약분수 — 단답용 "p/q" (정수면 정수) */
  function frPlain(n, d) {
    if (d < 0) { n = -n; d = -d; }
    const g = gcd(Math.abs(n), d) || 1;
    n /= g; d /= g;
    return d === 1 ? String(n) : `${n}/${d}`;
  }
  /* 기약분수 — 선지 표시용 KaTeX */
  function frTex(n, d) {
    if (d < 0) { n = -n; d = -d; }
    const g = gcd(Math.abs(n), d) || 1;
    n /= g; d /= g;
    if (d === 1) return String(n);
    const sign = n < 0 ? "-" : "";
    return `$${sign}\\dfrac{${Math.abs(n)}}{${d}}$`;
  }
  /* 기약분수 — 이미 열린 $...$ 안에 삽입하는 본문용 ($ 미포함) */
  function frBody(n, d) {
    if (d < 0) { n = -n; d = -d; }
    const g2 = gcd(Math.abs(n), d) || 1;
    n /= g2; d /= g2;
    if (d === 1) return String(n);
    return `${n < 0 ? "-" : ""}\\dfrac{${Math.abs(n)}}{${d}}`;
  }
  /* 다항식 TeX: polyTex([계수, "x^{2}"], [계수, "x"], [상수, ""]) */
  function polyTex() {
    let s = "";
    for (let i = 0; i < arguments.length; i++) {
      const c = arguments[i][0], sym = arguments[i][1];
      if (c === 0) continue;
      const mag = Math.abs(c);
      const body = sym ? (mag === 1 ? sym : mag + sym) : String(mag);
      if (!s) s = (c < 0 ? "-" : "") + body;
      else s += (c < 0 ? " - " : " + ") + body;
    }
    return s || "0";
  }
  /* "x ± m" (평행이동 표기) */
  const xm = (m) => (m === 0 ? "x" : m > 0 ? `x - ${m}` : `x + ${-m}`);
  /* 뒤에 붙는 "± n" */
  const pm = (n) => (n === 0 ? "" : n > 0 ? ` + ${n}` : ` - ${-n}`);
  /* 음수는 괄호로 감싸기 (해설 대입 표기용) */
  const par = (n) => (n < 0 ? `(${n})` : String(n));
  /* 수치 합 나열(0항 생략): sumTex(1, -5, 4) → "1 - 5 + 4" */
  function sumTex() {
    let s = "";
    for (let i = 0; i < arguments.length; i++) {
      const v = arguments[i];
      if (v === 0) continue;
      if (!s) s = String(v);
      else s += v > 0 ? ` + ${v}` : ` - ${-v}`;
    }
    return s || "0";
  }

  /* 5지선다 조립 — 오답 후보에서 4개 확보 실패 시 null(재생성 유도) */
  function mc5(correct, wrongs) {
    const c = String(correct);
    const w = [...new Set(wrongs.map(String).filter((t) => t !== c))];
    if (w.length < 4) return null;
    const all = sh([c, ...sh(w).slice(0, 4)]);
    const keys = ["a", "b", "c", "d", "e"];
    const choices = all.map((text, i) => ({ key: keys[i], text }));
    return { choices, answer: choices.find((x) => x.text === c).key };
  }
  /* 생성 재시도 래퍼 */
  function G(id, points, gen) {
    return {
      id, points,
      generate() {
        for (let t = 0; t < 60; t++) {
          const p = gen();
          if (p) { p.points = points; return p; }
        }
        return null;
      },
    };
  }

  /* ============================================================
     Ⅰ. 대수
     ============================================================ */
  const ALG_RADICAL = [
    G("alg-radical-value", 3, () => {
      const a = pk([2, 3, 5]);
      const n = pk([2, 3]);
      const u = ri(1, 3), k = ri(1, 2);
      const m = n * u;
      const E = u + k;
      const val = Math.pow(a, E);
      if (val > 800) return null;
      const mc = mc5(val, [Math.pow(a, E - 1), Math.pow(a, E + 1), Math.pow(a, m + k), Math.pow(a, Math.max(1, u * k)), val * a * a]);
      if (!mc) return null;
      return {
        prompt: `$\\sqrt[${n}]{${a}^{${m}}} \\times ${a}^{${k}}$ 의 값은?`,
        inputMode: "multiple-choice", choices: mc.choices, answer: mc.answer,
        solution: `$\\sqrt[${n}]{${a}^{${m}}} = ${a}^{${m}/${n}} = ${a}^{${u}}$ 이므로 전체는 $${a}^{${u}+${k}} = ${a}^{${E}} = ${val}$.`,
      };
    }),
    G("alg-radical-nested", 3, () => {
      const a = pk([2, 3, 5, 7]);
      const m = ri(1, 3), n = ri(1, 3);
      const num = 2 * m + n; // 지수 = (2m+n)/4
      if (num % 2 === 0) return null; // 기약분수(분모 4) 보장
      const p = num, q = 4;
      return {
        prompt: `$\\sqrt{${a}^{${m}}\\sqrt{${a}^{${n}}}} = ${a}^{\\frac{p}{q}}$ (p, q는 서로소인 자연수)일 때, $p+q$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: p + q,
        solution: `$\\sqrt{${a}^{${m}}\\sqrt{${a}^{${n}}}} = \\left(${a}^{${m}}\\cdot ${a}^{${n}/2}\\right)^{1/2} = ${a}^{${m}/2 + ${n}/4} = ${a}^{${p}/4}$. 따라서 $p+q = ${p}+4 = ${p + q}$.`,
      };
    }),
  ];

  const ALG_LOG = [
    G("alg-log-chain", 3, () => {
      const k = ri(4, 6);
      const n = Math.pow(2, k);
      return {
        prompt: `$\\log_{2}3 \\times \\log_{3}4 \\times \\log_{4}5 \\times \\cdots \\times \\log_{${n - 1}}${n}$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: k,
        solution: `연쇄 곱은 $\\log_{2}${n}$ 으로 접힌다(사슬 법칙). $${n} = 2^{${k}}$ 이므로 값은 $${k}$.`,
      };
    }),
    G("alg-log-linear", 3, () => {
      const a = pk([2, 3, 5]);
      const m = ri(2, 5), n = ri(2, 5);
      const p = ri(2, 3), q = ri(2, 3), r = ri(1, 3);
      const val = p * m + q * n - r;
      const mc = mc5(val, [p * m + q * n + r, p * m - q * n + r, p * m - q * n - r, m + n - r, p * m + q * n]);
      if (!mc) return null;
      return {
        prompt: `$\\log_{${a}} x = ${m}$, $\\log_{${a}} y = ${n}$ 일 때, $\\log_{${a}} \\dfrac{x^{${p}} y^{${q}}}{${a}^{${r}}}$ 의 값은?`,
        inputMode: "multiple-choice", choices: mc.choices, answer: mc.answer,
        solution: `$\\log$ 성질로 분해하면 $${p}\\log_{${a}}x + ${q}\\log_{${a}}y - ${r} = ${p}\\cdot${m} + ${q}\\cdot${n} - ${r} = ${val}$.`,
      };
    }),
    G("alg-log-digits", 4, () => {
      const base = pk([
        { b: 2, lg: 0.3010, tex: "\\log 2 = 0.3010" },
        { b: 6, lg: 0.7781, tex: "\\log 2 = 0.3010,\\ \\log 3 = 0.4771" },
        { b: 12, lg: 1.0791, tex: "\\log 2 = 0.3010,\\ \\log 3 = 0.4771" },
      ]);
      const n = base.b === 2 ? ri(20, 33) : base.b === 6 ? ri(10, 18) : ri(8, 14);
      const v = n * base.lg;
      const frac = v - Math.floor(v);
      if (frac < 0.03 || frac > 0.97) return null; // 경계 근처 회피
      const digits = Math.floor(v + 1e-9) + 1;
      return {
        prompt: `$${base.tex}$ 로 계산할 때, $${base.b}^{${n}}$ 은 몇 자리의 자연수인지 구하시오.`,
        inputMode: "short-answer", answer: digits,
        solution: `$\\log ${base.b}^{${n}} = ${n} \\times ${base.lg.toFixed(4)} = ${v.toFixed(4)}$. 정수 부분이 ${digits - 1}이므로 ${digits}자리 수다.`,
      };
    }),
  ];

  const ALG_EXPGRAPH = [
    G("alg-graph-shift", 3, () => {
      const a = pk([2, 3]);
      const m = ri(-2, 3), n = ri(-3, 3), t = ri(1, 3);
      const p = m + t, q = Math.pow(a, t) + n;
      return {
        prompt: `함수 $y = ${a}^{x-m} + n$ 의 그래프의 점근선이 직선 $y = ${n}$ 이고, 그래프가 점 $(${p},\\ ${q})$ 를 지난다. 상수 $m,\\ n$ 에 대하여 $m+n$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: m + n,
        solution: `점근선에서 $n = ${n}$. 대입하면 $${a}^{${p}-m} = ${q - n} = ${a}^{${t}}$ 이므로 $m = ${m}$. 따라서 $m+n = ${m + n}$.`,
      };
    }),
    G("alg-graph-inverse", 3, () => {
      const a = pk([2, 3]);
      const m = ri(-2, 3), n = ri(-2, 3), k = ri(1, 3);
      const val = Math.pow(a, k) + m;
      return {
        prompt: `함수 $f(x) = \\log_{${a}}(${xm(m)})${pm(n)}$ 의 역함수를 $g$ 라 할 때, $g(${n + k})$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: val,
        solution: `$g(${n + k}) = x$ ⟺ $f(x) = ${n + k}$ ⟺ $\\log_{${a}}(${xm(m)}) = ${k}$ ⟺ $x = ${a}^{${k}}${m === 0 ? "" : m > 0 ? " + " + m : " - " + (-m)} = ${val}$.`,
      };
    }),
    G("alg-graph-expmax", 4, () => {
      const a = pk([2, 3]);
      const b = a === 2 ? ri(1, 3) : ri(1, 2);
      const c = ri(0, 2);
      if (b === 1 && c === 0) return null; // E ≥ 2 보장 (오답 지수 E-2 ≥ 0)
      const E = b * b + c;
      if (Math.pow(a, E) > 2100) return null;
      const M = Math.pow(a, E);
      const mc = mc5(M, [E - 2, E - 1, E + 1, E + 2].map((e) => Math.pow(a, e)));
      if (!mc) return null;
      return {
        prompt: `함수 $f(x) = ${a}^{-x^{2} + ${2 * b}x${pm(c)}}$ 의 최댓값은?`,
        inputMode: "multiple-choice", choices: mc.choices, answer: mc.answer,
        solution: `지수 $-x^{2}+${2 * b}x${pm(c)} = -(x-${b})^{2}+${E}$ 는 $x=${b}$ 에서 최대 $${E}$. 밑 $${a}>1$ 이므로 최댓값은 $${a}^{${E}} = ${M}$.`,
      };
    }),
  ];

  const ALG_EXPEQ = [
    G("alg-eq-expquad", 4, () => {
      const a = pk([2, 3]);
      const s = ri(0, 2), r0 = ri(1, 2);
      const r = s + r0;
      const t1 = Math.pow(a, s), t2 = Math.pow(a, r);
      const K = t1 + t2, Cc = Math.pow(a, s + r);
      if (Cc > 800) return null;
      return {
        prompt: `방정식 $${a}^{2x} - ${K}\\cdot ${a}^{x} + ${Cc} = 0$ 의 두 실근의 합을 구하시오.`,
        inputMode: "short-answer", answer: s + r,
        solution: `$t = ${a}^{x}$ 로 치환하면 $t^{2} - ${K}t + ${Cc} = 0$, $t = ${t1}$ 또는 $t = ${t2}$. 두 근 $\\alpha, \\beta$ 에 대해 $${a}^{\\alpha+\\beta} = t_{1}t_{2} = ${Cc} = ${a}^{${s + r}}$ 이므로 합은 $${s + r}$.`,
      };
    }),
    G("alg-eq-logquad", 4, () => {
      const a = pk([2, 3]);
      const p = a === 2 ? ri(3, 5) : ri(3, 4);
      const q = ri(1, Math.ceil((p * p) / 4) - 1); // 판별식 > 0 → 서로 다른 두 실근 보장
      const val = Math.pow(a, p);
      return {
        prompt: `방정식 $(\\log_{${a}} x)^{2} - ${p}\\log_{${a}} x + ${q} = 0$ 의 두 실근을 $\\alpha, \\beta$ 라 할 때, $\\alpha\\beta$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: val,
        solution: `$t = \\log_{${a}}x$ 의 두 근의 합이 $${p}$ 이므로 $\\log_{${a}}\\alpha + \\log_{${a}}\\beta = ${p}$, 즉 $\\alpha\\beta = ${a}^{${p}} = ${val}$.`,
      };
    }),
    G("alg-eq-expineq", 4, () => {
      const big = Math.random() < 0.5;
      const baseTex = big ? String(pk([2, 3])) : `\\left(\\tfrac{1}{${pk([2, 3])}}\\right)`;
      const r1 = ri(-4, 2);
      const r2 = r1 + ri(2, 5);
      const P = r1 + r2, Q = -r1 * r2;
      const rhs = polyTex([P, "x"], [Q, ""]);
      const count = r2 - r1 - 1;
      const ineq = big ? "<" : ">";
      return {
        prompt: `부등식 $${baseTex}^{x^{2}} ${ineq} ${baseTex}^{${rhs}}$ 을 만족시키는 정수 $x$ 의 개수를 구하시오.`,
        inputMode: "short-answer", answer: count,
        solution: `${big ? "밑이 1보다 크므로 지수 부등호 유지" : "밑이 1보다 작으므로 지수 부등호 반전"}: $x^{2} < ${rhs}$, 즉 $(${xm(r1)})(${xm(r2)}) < 0$ ⟺ $${r1} < x < ${r2}$. 정수는 ${count}개.`,
      };
    }),
  ];

  const ALG_RADIAN = [
    G("alg-sector-max", 4, () => {
      const L = pk([8, 12, 16, 20, 24]);
      const S = (L * L) / 16;
      return {
        prompt: `둘레의 길이가 $${L}$ 인 부채꼴의 넓이의 최댓값을 구하시오.`,
        inputMode: "short-answer", answer: S,
        solution: `반지름 $r$, 호 $l = ${L} - 2r$ 일 때 넓이 $S = \\tfrac{1}{2}r(${L}-2r)$. $r = ${L / 4}$ 에서 최대이고 (중심각 2라디안), $S = ${L / 4}^{2} = ${S}$.`,
      };
    }),
    G("alg-sector-inverse", 3, () => {
      const r = pk([4, 6, 8]);
      const k = ri(1, 4); // θ = k/2
      const l = (r * k) / 2;
      const S = (r * r * k) / 4;
      if (!Number.isInteger(l) || !Number.isInteger(S)) return null;
      return {
        prompt: `호의 길이가 $${l}$ 이고 넓이가 $${S}$ 인 부채꼴의 반지름의 길이를 구하시오.`,
        inputMode: "short-answer", answer: r,
        solution: `$S = \\tfrac{1}{2}rl$ 에서 $r = \\dfrac{2S}{l} = \\dfrac{${2 * S}}{${l}} = ${r}$.`,
      };
    }),
  ];

  const ALG_TRIGFUN = [
    G("alg-trig-sincos", 3, () => {
      const q = pk([2, 3, 4, 5]);
      const p = ri(1, q - 1);
      if (gcd(p, q) !== 1) return null;
      const num = p * p - q * q, den = 2 * q * q;
      const correct = frTex(num, den);
      const mc = mc5(correct, [frTex(q * q - p * p, den), frTex(num, q * q), frTex(p * p - q * q, 2 * q), frTex(p * p + q * q, den), frTex(num, den * 2)]);
      if (!mc) return null;
      return {
        prompt: `$\\sin\\theta + \\cos\\theta = \\dfrac{${p}}{${q}}$ 일 때, $\\sin\\theta\\cos\\theta$ 의 값은?`,
        inputMode: "multiple-choice", choices: mc.choices, answer: mc.answer,
        solution: `양변 제곱: $1 + 2\\sin\\theta\\cos\\theta = \\dfrac{${p * p}}{${q * q}}$. 따라서 $\\sin\\theta\\cos\\theta = ${frBody(num, den)}$.`,
      };
    }),
    G("alg-trig-graph", 3, () => {
      const A = ri(1, 3), Cc = ri(-2, 2), k = ri(1, 4);
      const M = Cc + A, mn = Cc - A, B = 2 * k;
      const val = A + B + Cc;
      const periodTex = k === 1 ? "\\pi" : `\\dfrac{\\pi}{${k}}`;
      const periodSol = k === 1 ? "\\pi" : `\\tfrac{\\pi}{${k}}`;
      return {
        prompt: `함수 $f(x) = a\\sin(bx) + c$ ($a>0,\\ b>0$)의 최댓값이 $${M}$, 최솟값이 $${mn}$ 이고 주기가 $${periodTex}$ 일 때, $a+b+c$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: val,
        solution: `$a = \\tfrac{${M}-(${mn})}{2} = ${A}$, $c = \\tfrac{${M}+(${mn})}{2} = ${Cc}$, 주기 $\\tfrac{2\\pi}{b} = ${periodSol}$ 에서 $b = ${B}$. 합은 $${val}$.`,
      };
    }),
    G("alg-trig-tan", 3, () => {
      const t = pk([2, 3, 4, 5, -2, -3]);
      const correct = frTex(t + 1, t - 1);
      const mc = mc5(correct, [frTex(t - 1, t + 1), frTex(-(t + 1), t - 1), frTex(t, t - 1), frTex(t + 1, t), String(t + 1)]);
      if (!mc) return null;
      return {
        prompt: `$\\tan\\theta = ${t}$ 일 때, $\\dfrac{\\sin\\theta + \\cos\\theta}{\\sin\\theta - \\cos\\theta}$ 의 값은?`,
        inputMode: "multiple-choice", choices: mc.choices, answer: mc.answer,
        solution: `분모·분자를 $\\cos\\theta$ 로 나누면 $\\dfrac{\\tan\\theta + 1}{\\tan\\theta - 1} = ${frBody(t + 1, t - 1)}$.`,
      };
    }),
  ];

  const ALG_LAWS = [
    G("alg-law-cos", 3, () => {
      const a = ri(3, 7), b = ri(3, 7);
      const big = Math.random() < 0.5; // C = 60° or 120°
      const c2 = a * a + b * b + (big ? a * b : -a * b);
      return {
        prompt: `삼각형 ABC에서 $a = ${a}$, $b = ${b}$, $C = ${big ? 120 : 60}^{\\circ}$ 일 때, $c^{2}$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: c2,
        solution: `코사인법칙: $c^{2} = a^{2}+b^{2}-2ab\\cos C = ${a * a}+${b * b} ${big ? "+" : "-"} ${a * b} = ${c2}$.`,
      };
    }),
    G("alg-law-sin", 3, () => {
      const kind = pk([
        { A: 30, sinTex: "\\tfrac{1}{2}", f: (a) => a },
        { A: 150, sinTex: "\\tfrac{1}{2}", f: (a) => a },
        { A: 90, sinTex: "1", f: (a) => a / 2 },
      ]);
      const a = kind.A === 90 ? pk([4, 6, 8, 10]) : ri(3, 9);
      const R = kind.f(a);
      return {
        prompt: `삼각형 ABC에서 $A = ${kind.A}^{\\circ}$ 이고 $a = ${a}$ 일 때, 외접원의 반지름 $R$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: R,
        solution: `사인법칙 $\\dfrac{a}{\\sin A} = 2R$ 에서 $R = \\dfrac{${a}}{2\\sin ${kind.A}^{\\circ}} = \\dfrac{${a}}{2\\times ${kind.sinTex}} = ${R}$.`,
      };
    }),
    G("alg-law-area", 4, () => {
      const tri = pk([
        { cosN: 3, cosD: 5, sinN: 4, sinD: 5, aFix: 5 },
        { cosN: 5, cosD: 13, sinN: 12, sinD: 13, aFix: 13 },
      ]);
      const b = ri(2, 6);
      const S = (tri.aFix * b * tri.sinN) / (2 * tri.sinD);
      if (!Number.isInteger(S)) return null;
      return {
        prompt: `삼각형 ABC에서 두 변의 길이가 $${tri.aFix},\\ ${b}$ 이고 끼인각 $C$ 가 $\\cos C = \\dfrac{${tri.cosN}}{${tri.cosD}}$ $\\left(0 < C < \\dfrac{\\pi}{2}\\right)$ 를 만족할 때, 삼각형의 넓이를 구하시오.`,
        inputMode: "short-answer", answer: S,
        solution: `$\\sin C = \\sqrt{1-\\cos^{2}C} = \\dfrac{${tri.sinN}}{${tri.sinD}}$. 넓이 $= \\tfrac{1}{2}\\cdot ${tri.aFix} \\cdot ${b} \\cdot \\dfrac{${tri.sinN}}{${tri.sinD}} = ${S}$.`,
      };
    }),
  ];

  const ALG_ARITH = [
    G("alg-arith-term", 3, () => {
      const a1 = ri(-5, 5);
      let d = ri(-4, 4); if (d === 0) d = 2;
      const p = ri(2, 5), q = p + ri(2, 4), r = ri(10, 15);
      const A = a1 + (p - 1) * d, B = a1 + (q - 1) * d;
      const ans = a1 + (r - 1) * d;
      return {
        prompt: `등차수열 $\\{a_n\\}$ 에서 $a_{${p}} = ${A}$, $a_{${q}} = ${B}$ 일 때, $a_{${r}}$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: ans,
        solution: `공차 $d = \\dfrac{${B}-(${A})}{${q}-${p}} = ${d}$, 첫째항 $a_1 = ${a1}$. 따라서 $a_{${r}} = ${a1} + ${r - 1}\\times(${d}) = ${ans}$.`,
      };
    }),
    G("alg-arith-maxsum", 4, () => {
      const d = -ri(2, 5);
      const m = ri(4, 8);
      const c = ri(1, -d - 1);
      const a1 = m * (-d) + c;
      const nMax = m + 1;
      return {
        prompt: `첫째항이 $${a1}$, 공차가 $${d}$ 인 등차수열의 첫째항부터 제 $n$ 항까지의 합 $S_n$ 이 최대가 되는 $n$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: nMax,
        solution: `$a_n = ${a1} + (n-1)(${d}) > 0$ 을 풀면 $n < ${((a1 + (-d)) / (-d)).toFixed(2)}$. 즉 제 ${nMax}항까지 양수이고 제 ${nMax + 1}항부터 음수이므로, 양수 항을 모두 더한 $n = ${nMax}$ 에서 $S_n$ 이 최대가 된다.`,
      };
    }),
    G("alg-arith-snformula", 3, () => {
      const A = ri(1, 4), B = ri(-5, 5), k = ri(5, 12);
      const ans = 2 * A * k - A + B;
      return {
        prompt: `수열 $\\{a_n\\}$ 의 첫째항부터 제 $n$ 항까지의 합이 $S_n = ${polyTex([A, "n^{2}"], [B, "n"])}$ 일 때, $a_{${k}}$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: ans,
        solution: `$n \\ge 2$ 에서 $a_n = S_n - S_{n-1} = ${polyTex([2 * A, "n"], [B - A, ""])}$. 따라서 $a_{${k}} = ${ans}$.`,
      };
    }),
  ];

  const ALG_GEOM = [
    G("alg-geom-term", 3, () => {
      const r = pk([2, 3]);
      const a = r === 3 ? ri(1, 4) : ri(1, 3);
      const p = ri(2, 3), q = p + ri(1, 2);
      const rr = q + ri(1, 2);
      const maxExp = rr - 1;
      const ans = a * Math.pow(r, maxExp);
      if (ans > 990) return null;
      const A = a * Math.pow(r, p - 1), B = a * Math.pow(r, q - 1);
      return {
        prompt: `등비수열 $\\{a_n\\}$ (모든 항 양수)에서 $a_{${p}} = ${A}$, $a_{${q}} = ${B}$ 일 때, $a_{${rr}}$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: ans,
        solution: `$r^{${q - p}} = ${B}/${A} = ${Math.pow(r, q - p)}$ 이므로 공비 $r = ${r}$. $a_{${rr}} = a_{${q}} \\times r^{${rr - q}} = ${B}\\times${Math.pow(r, rr - q)} = ${ans}$.`,
      };
    }),
    G("alg-geom-blocksum", 4, () => {
      const r = pk([2, 3]);
      const a = ri(1, 3);
      const A = a * (1 + r);
      const B = A * r * r;
      const ans = A * Math.pow(r, 4);
      if (ans > 990) return null;
      return {
        prompt: `등비수열 $\\{a_n\\}$ 에서 $a_1 + a_2 = ${A}$, $a_3 + a_4 = ${B}$ 일 때, $a_5 + a_6$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: ans,
        solution: `$a_3+a_4 = r^{2}(a_1+a_2)$ 에서 $r^{2} = ${r * r}$. 따라서 $a_5+a_6 = r^{2}(a_3+a_4) = ${r * r}\\times${B} = ${ans}$.`,
      };
    }),
  ];

  const ALG_SIGMA = [
    G("alg-sigma-formula", 3, () => {
      const n = ri(5, 8), p = ri(1, 2), q = ri(1, 4), r = ri(0, 5);
      const v = (p * n * (n + 1) * (2 * n + 1)) / 6 + (q * n * (n + 1)) / 2 + r * n;
      return {
        prompt: `$\\displaystyle\\sum_{k=1}^{${n}} \\left(${polyTex([p, "k^{2}"], [q, "k"], [r, ""])}\\right)$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: v,
        solution: `$\\sum k^{2} = \\tfrac{${n}\\cdot${n + 1}\\cdot${2 * n + 1}}{6} = ${(n * (n + 1) * (2 * n + 1)) / 6}$, $\\sum k = ${(n * (n + 1)) / 2}$ 를 이용하면 $${p}\\times${(n * (n + 1) * (2 * n + 1)) / 6} + ${q}\\times${(n * (n + 1)) / 2}${r === 0 ? "" : ` + ${r}\\times${n}`} = ${v}$.`,
      };
    }),
    G("alg-sigma-sqrt", 4, () => {
      const m = ri(3, 7);
      const n = m * m - 1;
      return {
        prompt: `$\\displaystyle\\sum_{k=1}^{${n}} \\dfrac{1}{\\sqrt{k+1}+\\sqrt{k}}$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: m - 1,
        solution: `유리화하면 각 항이 $\\sqrt{k+1}-\\sqrt{k}$ 로 망원 소거되어 $\\sqrt{${n + 1}} - 1 = ${m} - 1 = ${m - 1}$.`,
      };
    }),
    G("alg-sigma-partial", 3, () => {
      const n = ri(4, 12);
      return {
        prompt: `$\\displaystyle\\sum_{k=1}^{${n}} \\dfrac{1}{k(k+1)} = \\dfrac{q}{p}$ (p, q는 서로소인 자연수)일 때, $p+q$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: 2 * n + 1,
        solution: `$\\dfrac{1}{k(k+1)} = \\dfrac{1}{k} - \\dfrac{1}{k+1}$ 로 망원 소거: 합 $= 1 - \\dfrac{1}{${n + 1}} = \\dfrac{${n}}{${n + 1}}$. 서로소이므로 $p+q = ${n + 1}+${n} = ${2 * n + 1}$.`,
      };
    }),
  ];

  const ALG_RECUR = [
    G("alg-recur-linear", 3, () => {
      const a1 = ri(1, 4), c = ri(1, 5);
      let v = a1;
      for (let i = 0; i < 3; i++) v = 2 * v + c;
      return {
        prompt: `수열 $\\{a_n\\}$ 이 $a_1 = ${a1}$, $a_{n+1} = 2a_n + ${c}$ $(n \\ge 1)$ 로 정의될 때, $a_4$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: v,
        solution: `차례로 $a_2 = ${2 * a1 + c}$, $a_3 = ${2 * (2 * a1 + c) + c}$, $a_4 = ${v}$.`,
      };
    }),
    G("alg-recur-parity", 4, () => {
      const a1 = ri(3, 9), k = pk([3, 5]);
      let v = a1;
      const steps = [];
      for (let i = 0; i < 4; i++) {
        v = v % 2 === 0 ? v / 2 : v + k;
        steps.push(v);
      }
      return {
        prompt: `수열 $\\{a_n\\}$ 이 $a_1 = ${a1}$ 이고 $a_{n+1} = \\begin{cases} \\dfrac{a_n}{2} & (a_n \\text{이 짝수}) \\\\ a_n + ${k} & (a_n \\text{이 홀수}) \\end{cases}$ 로 정의될 때, $a_5$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: steps[3],
        solution: `짝수면 반, 홀수면 $+${k}$: $a_2 = ${steps[0]}$, $a_3 = ${steps[1]}$, $a_4 = ${steps[2]}$, $a_5 = ${steps[3]}$.`,
      };
    }),
  ];

  /* ============================================================
     Ⅱ. 미적분Ⅰ
     ============================================================ */
  const CAL_LIM = [
    G("cal-lim-factor", 3, () => {
      const a = ri(-3, 4);
      let b = ri(-4, 4); if (b === a) b = a + 2;
      const S = a + b, P = a * b;
      return {
        prompt: `$\\displaystyle\\lim_{x \\to ${a}} \\dfrac{${polyTex([1, "x^{2}"], [-S, "x"], [P, ""])}}{${xm(a)}}$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: a - b,
        solution: `분자 $= (${xm(a)})(${xm(b)})$ 이므로 약분 후 $x \\to ${a}$: $${a} - (${b}) = ${a - b}$.`,
      };
    }),
    G("cal-lim-sqrt", 3, () => {
      const a = pk([2, 4, 6, 8]);
      return {
        prompt: `$\\displaystyle\\lim_{x \\to \\infty} \\left(\\sqrt{x^{2} + ${a}x} - x\\right)$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: a / 2,
        solution: `유리화하면 $\\dfrac{${a}x}{\\sqrt{x^{2}+${a}x}+x} \\to \\dfrac{${a}}{2} = ${a / 2}$.`,
      };
    }),
    G("cal-lim-inverse", 4, () => {
      const a = ri(-2, 3), L = ri(-3, 5);
      const m = L - 2 * a;
      const n = -a * a - m * a;
      const b = a + ri(1, 3);
      const ans = b * b + m * b + n;
      return {
        prompt: `이차함수 $f(x) = ${polyTex([1, "x^{2}"], [1, "mx"], [1, "n"])}$ 이 $\\displaystyle\\lim_{x \\to ${a}} \\dfrac{f(x)}{${xm(a)}} = ${L}$ 을 만족할 때, $f(${b})$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: ans,
        solution: `극한이 존재하려면 $f(${a}) = 0$, 그때 극한값은 $f'(${a}) = 2\\cdot${par(a)} + m = ${L}$ 이므로 $m = ${m}$, $n = ${n}$. 따라서 $f(${b}) = ${sumTex(b * b, m * b, n)} = ${ans}$.`,
      };
    }),
  ];

  const CAL_CONT = [
    G("cal-cont-removable", 4, () => {
      const cc = ri(-2, 3), a = ri(-3, 3);
      const b = -cc * cc - a * cc;
      const k = 2 * cc + a;
      return {
        prompt: `함수 $f(x) = \\begin{cases} \\dfrac{${polyTex([1, "x^{2}"], [a, "x"])} + b}{${xm(cc)}} & (x \\ne ${cc}) \\\\ k & (x = ${cc}) \\end{cases}$ 가 실수 전체에서 연속일 때, 상수 $b,\\ k$ 에 대하여 $b + k$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: b + k,
        solution: `연속이려면 분자가 $x = ${cc}$ 에서 0이어야 한다: $${sumTex(cc * cc, a * cc)} + b = 0$ → $b = ${b}$. 이때 $k = \\displaystyle\\lim_{x \\to ${cc}} f(x) = 2\\cdot${par(cc)}${a === 0 ? "" : a > 0 ? " + " + a : " - " + (-a)} = ${k}$. 따라서 $b + k = ${b + k}$.`,
      };
    }),
    G("cal-cont-piecewise", 3, () => {
      const b = ri(-3, 3), cVal = ri(-2, 3);
      const A = cVal * cVal + b * cVal - cVal;
      return {
        prompt: `함수 $f(x) = \\begin{cases} x + a & (x < ${cVal}) \\\\ ${polyTex([1, "x^{2}"], [b, "x"])} & (x \\ge ${cVal}) \\end{cases}$ 가 $x = ${cVal}$ 에서 연속일 때, 상수 $a$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: A,
        solution: `좌극한 $= ${cVal} + a$, 우극한(함숫값) $= ${cVal * cVal + b * cVal}$. 같아야 하므로 $a = ${A}$.`,
      };
    }),
  ];

  const CAL_DERIV = [
    G("cal-deriv-def", 4, () => {
      const p = ri(-3, 4), q = ri(-5, 5);
      const a = ri(-2, 3), m = ri(1, 3), n = ri(1, 3);
      const fp = 2 * a + p;
      const ans = (m + n) * fp;
      return {
        prompt: `함수 $f(x) = ${polyTex([1, "x^{2}"], [p, "x"], [q, ""])}$ 에 대하여 $\\displaystyle\\lim_{h \\to 0} \\dfrac{f(${a} + ${m === 1 ? "" : m}h) - f(${a} - ${n === 1 ? "" : n}h)}{h}$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: ans,
        solution: `주어진 극한은 $(${m}+${n})f'(${a})$ 와 같다. $f'(x) = ${polyTex([2, "x"], [p, ""])}$ 이므로 $f'(${a}) = ${fp}$, 답은 $${m + n} \\times ${fp} = ${ans}$.`,
      };
    }),
    G("cal-deriv-product", 3, () => {
      let fa = ri(-4, 4); if (fa === 0) fa = 1;
      let ga = ri(-4, 4); if (ga === 0) ga = -1;
      let fpa = ri(-4, 4); if (fpa === 0) fpa = 2;
      let gpa = ri(-4, 4); if (gpa === 0) gpa = -2;
      const a = ri(-2, 3);
      const ans = fpa * ga + fa * gpa;
      return {
        prompt: `두 다항함수 $f,\\ g$ 가 $f(${a}) = ${fa}$, $f'(${a}) = ${fpa}$, $g(${a}) = ${ga}$, $g'(${a}) = ${gpa}$ 를 만족한다. $h(x) = f(x)g(x)$ 일 때, $h'(${a})$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: ans,
        solution: `곱의 미분법: $h'(${a}) = f'(${a})g(${a}) + f(${a})g'(${a}) = ${par(fpa)}\\times${par(ga)} + ${par(fa)}\\times${par(gpa)} = ${ans}$.`,
      };
    }),
  ];

  const CAL_TANGENT = [
    G("cal-tan-intercept", 4, () => {
      const a = ri(-4, 4), b = ri(-5, 5), p = ri(-2, 2);
      const yIntercept = -2 * p * p * p + b;
      return {
        prompt: `곡선 $y = ${polyTex([1, "x^{3}"], [a, "x"], [b, ""])}$ 위의 점 $x = ${p}$ 에서의 접선의 $y$ 절편을 구하시오.`,
        inputMode: "short-answer", answer: yIntercept,
        solution: `기울기 $m = 3\\cdot${par(p)}^{2}${a === 0 ? "" : a > 0 ? " + " + a : " - " + (-a)} = ${3 * p * p + a}$, 접점의 $y$ 좌표 $y_0 = ${p * p * p + a * p + b}$. $y$ 절편 $= y_0 - m\\cdot${par(p)} = -2\\cdot${par(p)}^{3}${b === 0 ? "" : b > 0 ? " + " + b : " - " + (-b)} = ${yIntercept}$.`,
      };
    }),
    G("cal-tan-point", 3, () => {
      const x0 = ri(1, 3), c = ri(-2, 4);
      const m = 3 * x0 * x0 + c;
      const y0 = x0 * x0 * x0 + c * x0;
      return {
        prompt: `곡선 $y = ${polyTex([1, "x^{3}"], [c, "x"])}$ 에 접하고 기울기가 $${m}$ 인 접선의 접점 중 $x$ 좌표가 양수인 점의 $y$ 좌표를 구하시오.`,
        inputMode: "short-answer", answer: y0,
        solution: `$y' = 3x^{2}${c === 0 ? "" : c > 0 ? " + " + c : " - " + (-c)} = ${m}$ 에서 $x^{2} = ${x0 * x0}$, 양수 해 $x = ${x0}$. 접점의 $y$ 좌표 $= ${sumTex(x0 * x0 * x0, c * x0)} = ${y0}$.`,
      };
    }),
  ];

  const CAL_EXTREMA = [
    G("cal-ext-inverse", 4, () => {
      const p = ri(-3, 1);
      const q = p + 2 * ri(1, 2); // p+q 짝수 → a 정수
      const a = (-3 * (p + q)) / 2, b = 3 * p * q;
      return {
        prompt: `함수 $f(x) = x^{3} + ax^{2} + bx$ 가 $x = ${p}$ 에서 극대, $x = ${q}$ 에서 극소가 될 때, 상수 $a,\\ b$ 에 대하여 $a + b$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: a + b,
        solution: `$f'(x) = 3x^{2} + 2ax + b = 3(${xm(p)})(${xm(q)})$. 계수 비교: $2a = ${-3 * (p + q)}$ → $a = ${a}$, $b = 3\\times${par(p)}\\times${par(q)} = ${b}$. 따라서 $a+b = ${a + b}$.`,
      };
    }),
    G("cal-ext-value", 3, () => {
      const t = ri(1, 3), qq = ri(-4, 4);
      const M = 2 * t * t * t + qq;
      return {
        prompt: `함수 $f(x) = ${polyTex([1, "x^{3}"], [-3 * t * t, "x"], [qq, ""])}$ 의 극댓값을 구하시오.`,
        inputMode: "short-answer", answer: M,
        solution: `$f'(x) = 3x^{2} - ${3 * t * t} = 3(x+${t})(x-${t})$. 극대는 $x = -${t}$: $f(-${t}) = ${sumTex(-t * t * t, 3 * t * t * t, qq)} = ${M}$.`,
      };
    }),
    G("cal-ext-threeroots", 4, () => {
      const t = ri(1, 3);
      const count = 4 * t * t * t - 1;
      return {
        prompt: `$x$ 에 대한 방정식 $x^{3} - ${3 * t * t}x - k = 0$ 이 서로 다른 세 실근을 갖도록 하는 정수 $k$ 의 개수를 구하시오.`,
        inputMode: "short-answer", answer: count,
        solution: `$g(x) = x^{3} - ${3 * t * t}x$ 의 극댓값 $${2 * t * t * t}$ (at $x=-${t}$), 극솟값 $-${2 * t * t * t}$. 세 실근 조건: $-${2 * t * t * t} < k < ${2 * t * t * t}$. 정수는 $${2 * (2 * t * t * t) - 1} = ${count}$개.`,
      };
    }),
  ];

  const CAL_APPLY = [
    G("cal-app-motion", 3, () => {
      const aa = ri(-4, 4), bb = ri(-5, 5), c = ri(1, 3);
      const v = 3 * c * c + 2 * aa * c + bb;
      const acc = 6 * c + 2 * aa;
      return {
        prompt: `수직선 위를 움직이는 점 P의 시각 $t$ 에서의 위치가 $x(t) = ${polyTex([1, "t^{3}"], [aa, "t^{2}"], [bb, "t"])}$ 일 때, 시각 $t = ${c}$ 에서의 속도와 가속도의 합을 구하시오.`,
        inputMode: "short-answer", answer: v + acc,
        solution: `속도 $v(t) = ${polyTex([3, "t^{2}"], [2 * aa, "t"], [bb, ""])}$ → $v(${c}) = ${v}$. 가속도 $a(t) = ${polyTex([6, "t"], [2 * aa, ""])}$ → $a(${c}) = ${acc}$. 합은 $${v + acc}$.`,
      };
    }),
    G("cal-app-rootcount", 3, () => {
      const t = ri(1, 2);
      const crit = 2 * t * t * t;
      const k = ri(-crit - 3, crit + 3);
      const count = Math.abs(k) < crit ? 3 : Math.abs(k) === crit ? 2 : 1;
      return {
        prompt: `방정식 $x^{3} - ${3 * t * t}x = ${k}$ 의 서로 다른 실근의 개수를 구하시오.`,
        inputMode: "short-answer", answer: count,
        solution: `$y = x^{3} - ${3 * t * t}x$ 의 극댓값 $${crit}$, 극솟값 $-${crit}$. $k = ${k}$ 와 수평선 교점: $|${k}| ${Math.abs(k) < crit ? "<" : Math.abs(k) === crit ? "=" : ">"} ${crit}$ 이므로 ${count}개.`,
      };
    }),
  ];

  const CAL_ANTIDER = [
    G("cal-anti-value", 3, () => {
      const aa = pk([3, 6]), bb = pk([-4, -2, 2, 4]), cc = ri(-3, 3), d = ri(-3, 3);
      const k = ri(1, 3);
      const f = (x) => (aa / 3) * x * x * x + (bb / 2) * x * x + cc * x + d;
      return {
        prompt: `함수 $f(x)$ 가 $f'(x) = ${polyTex([aa, "x^{2}"], [bb, "x"], [cc, ""])}$, $f(0) = ${d}$ 를 만족할 때, $f(${k})$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: f(k),
        solution: `$f(x) = ${polyTex([aa / 3, "x^{3}"], [bb / 2, "x^{2}"], [cc, "x"], [d, ""])}$ (적분상수는 $f(0)=${d}$ 로 결정). $f(${k}) = ${f(k)}$.`,
      };
    }),
    G("cal-anti-inverse", 4, () => {
      const p = ri(-5, 5), q = ri(-5, 5);
      const a = p - q - 1;
      return {
        prompt: `함수 $f(x)$ 가 $f'(x) = 6x^{2} - 2x + a$, $f(1) = ${p}$, $f(0) = ${q}$ 를 만족할 때, 상수 $a$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: a,
        solution: `$f(1) - f(0) = \\displaystyle\\int_{0}^{1} f'(x)\\,dx = 2 - 1 + a = 1 + a$. 좌변은 $${p} - (${q}) = ${p - q}$ 이므로 $a = ${a}$.`,
      };
    }),
  ];

  const CAL_DEFINT = [
    G("cal-def-basic", 3, () => {
      const a = ri(1, 3), bb = ri(-3, 3), cc = ri(-4, 4);
      const v = a * a * a - bb * a * a + cc * a;
      return {
        prompt: `$\\displaystyle\\int_{0}^{${a}} \\left(${polyTex([3, "x^{2}"], [-2 * bb, "x"], [cc, ""])}\\right) dx$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: v,
        solution: `원시함수 $${polyTex([1, "x^{3}"], [-bb, "x^{2}"], [cc, "x"])}$ 에 $x=${a}$ 대입: $${sumTex(a * a * a, -bb * a * a, cc * a)} = ${v}$.`,
      };
    }),
    G("cal-def-symmetry", 3, () => {
      const a = ri(1, 3), p = ri(1, 3), q = pk([3, 6]), r = ri(-4, 4), s = ri(-3, 3);
      const v = 2 * ((q * a * a * a) / 3 + s * a);
      return {
        prompt: `$\\displaystyle\\int_{-${a}}^{${a}} \\left(${polyTex([p, "x^{3}"], [q, "x^{2}"], [r, "x"], [s, ""])}\\right) dx$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: v,
        solution: `홀수 차수 항($x^{3}, x$)은 대칭 구간에서 0. 남는 것은 $2\\displaystyle\\int_{0}^{${a}}\\left(${polyTex([q, "x^{2}"], [s, ""])}\\right)dx = 2\\left(${sumTex((q * a * a * a) / 3, s * a)}\\right) = ${v}$.`,
      };
    }),
    G("cal-def-inverse", 4, () => {
      const kk = pk([-4, -2, 2, 4]);
      const V = 9 + (9 * kk) / 2;
      return {
        prompt: `$\\displaystyle\\int_{0}^{3} (x^{2} + kx)\\, dx = ${V}$ 일 때, 상수 $k$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: kk,
        solution: `$\\displaystyle\\int_{0}^{3}(x^{2}+kx)dx = 9 + \\dfrac{9k}{2}$. $9 + \\dfrac{9k}{2} = ${V}$ 에서 $k = ${kk}$.`,
      };
    }),
  ];

  const CAL_AREA = [
    G("cal-area-xaxis", 4, () => {
      const r1 = ri(-3, 2);
      const g = ri(2, 5);
      const r2 = r1 + g;
      const S = r1 + r2, P = r1 * r2;
      const correct = frTex(g * g * g, 6);
      const mc = mc5(correct, [frTex(g * g * g, 3), frTex(g * g * g, 2), frTex(g * g, 6), frTex((g + 1) * (g + 1) * (g + 1), 6), frTex(g * g * g, 4)]);
      if (!mc) return null;
      return {
        prompt: `곡선 $y = ${polyTex([1, "x^{2}"], [-S, "x"], [P, ""])}$ 과 $x$ 축으로 둘러싸인 부분의 넓이는?`,
        inputMode: "multiple-choice", choices: mc.choices, answer: mc.answer,
        solution: `두 근은 $${r1},\\ ${r2}$. 근 사이 넓이 공식: $\\dfrac{(\\beta-\\alpha)^{3}}{6} = \\dfrac{${g}^{3}}{6} = ${frBody(g * g * g, 6)}$.`,
      };
    }),
    G("cal-area-twocurves", 3, () => {
      const m = ri(2, 6);
      const correct = frTex(m * m * m, 6);
      const mc = mc5(correct, [frTex(m * m * m, 3), frTex(m * m * m, 2), frTex(m * m, 6), frTex(m * m * m, 12), frTex((m + 1) * (m + 1) * (m + 1), 6)]);
      if (!mc) return null;
      return {
        prompt: `곡선 $y = x^{2}$ 과 직선 $y = ${m}x$ 로 둘러싸인 부분의 넓이는?`,
        inputMode: "multiple-choice", choices: mc.choices, answer: mc.answer,
        solution: `교점 $x = 0,\\ ${m}$. 넓이 $= \\displaystyle\\int_{0}^{${m}}(${m}x - x^{2})dx = \\dfrac{${m}^{3}}{6} = ${frBody(m * m * m, 6)}$.`,
      };
    }),
    G("cal-area-velocity", 4, () => {
      const a = pk([2, 3, 4, 6]);
      const correct = frTex(a * a * a, 6);
      const mc = mc5(correct, [frTex(a * a * a, 3), frTex(a * a * a, 2), frTex(a * a, 2), frTex(a * a * a, 12), frTex(a * a * a + 6, 6)]);
      if (!mc) return null;
      return {
        prompt: `원점을 출발해 수직선 위를 움직이는 점 P의 시각 $t$ 에서의 속도가 $v(t) = ${a}t - t^{2}$ 이다. $t = 0$ 부터 $t = ${a}$ 까지 점 P가 움직인 거리는?`,
        inputMode: "multiple-choice", choices: mc.choices, answer: mc.answer,
        solution: `구간에서 $v(t) = t(${a}-t) \\ge 0$ 이므로 거리 $= \\displaystyle\\int_{0}^{${a}}(${a}t - t^{2})dt = \\dfrac{${a}^{3}}{2} - \\dfrac{${a}^{3}}{3} = \\dfrac{${a}^{3}}{6} = ${frBody(a * a * a, 6)}$.`,
      };
    }),
  ];

  /* ============================================================
     Ⅲ. 확률과 통계 (심화)
     ============================================================ */
  const PS_PERM = [
    G("ps-perm-oddnat", 4, () => {
      const n = ri(4, 6), r = 3;
      const odd = Math.floor(n / 2);
      const count = (n - 1) * Math.pow(n, r - 2) * odd;
      return {
        prompt: `$0, 1, 2, \\ldots, ${n - 1}$ 의 ${n}개 숫자에서 중복을 허용하여 만들 수 있는 세 자리 자연수 중 홀수의 개수를 구하시오.`,
        inputMode: "short-answer", answer: count,
        solution: `첫 자리는 0 제외 ${n - 1}가지, 가운데는 ${n}가지, 끝자리는 홀수(${Array.from({ length: odd }, (_, i) => 2 * i + 1).join(", ")}) ${odd}가지. $${n - 1}\\times${n}\\times${odd} = ${count}$.`,
      };
    }),
    G("ps-perm-endsA", 4, () => {
      const a = ri(3, 4), b = ri(2, 4);
      const count = nCr(a - 2 + b, b);
      return {
        prompt: `문자 A ${a}개와 B ${b}개를 모두 일렬로 나열할 때, 양 끝에 모두 A가 오는 경우의 수를 구하시오.`,
        inputMode: "short-answer", answer: count,
        solution: `양 끝에 A를 고정하면 남은 A ${a - 2}개, B ${b}개의 같은 것이 있는 순열: $\\dfrac{${a - 2 + b}!}{${a - 2}!\\,${b}!} = ${count}$.`,
      };
    }),
  ];

  const PS_HCOMB = [
    G("ps-hcomb-lowerbound", 4, () => {
      const n = ri(6, 10), k = ri(2, 3);
      const count = nCr(n - k + 2, 2);
      return {
        prompt: `방정식 $x + y + z = ${n}$ 을 만족하는 음이 아닌 정수해 중 $x \\ge ${k}$ 인 해 $(x, y, z)$ 의 개수를 구하시오.`,
        inputMode: "short-answer", answer: count,
        solution: `$x' = x - ${k}$ 로 치환하면 $x' + y + z = ${n - k}$ 의 음이 아닌 정수해: $_{3}\\mathrm{H}_{${n - k}} = \\binom{${n - k + 2}}{2} = ${count}$.`,
      };
    }),
    G("ps-hcomb-inequality", 4, () => {
      const n = ri(4, 7);
      const count = nCr(n + 3, 3);
      return {
        prompt: `부등식 $x + y + z \\le ${n}$ 을 만족하는 음이 아닌 정수해 $(x, y, z)$ 의 개수를 구하시오.`,
        inputMode: "short-answer", answer: count,
        solution: `여유분 $w = ${n} - (x+y+z) \\ge 0$ 을 도입하면 $x+y+z+w = ${n}$ 의 음이 아닌 정수해: $_{4}\\mathrm{H}_{${n}} = \\binom{${n + 3}}{3} = ${count}$.`,
      };
    }),
  ];

  const PS_BINOM = [
    G("ps-binom-constterm", 4, () => {
      const a = ri(2, 3), n = pk([4, 6]);
      const half = n / 2;
      const count = nCr(n, half) * Math.pow(a, half);
      return {
        prompt: `$\\left(x + \\dfrac{${a}}{x}\\right)^{${n}}$ 의 전개식에서 상수항을 구하시오.`,
        inputMode: "short-answer", answer: count,
        solution: `일반항 $\\binom{${n}}{r}${a}^{r}x^{${n}-2r}$. 상수항은 $r = ${half}$: $\\binom{${n}}{${half}}\\times${a}^{${half}} = ${nCr(n, half)}\\times${Math.pow(a, half)} = ${count}$.`,
      };
    }),
    G("ps-binom-evensum", 4, () => {
      const n = ri(6, 10);
      const val = Math.pow(2, n - 1);
      return {
        prompt: `$\\binom{${n}}{0} + \\binom{${n}}{2} + \\binom{${n}}{4} + \\cdots$ (짝수 번째 이항계수의 합)의 값을 구하시오.`,
        inputMode: "short-answer", answer: val,
        solution: `$(1+1)^{${n}}$ 과 $(1-1)^{${n}}$ 을 더하면 짝수 항만 2배로 남는다: 합 $= \\dfrac{2^{${n}}}{2} = 2^{${n - 1}} = ${val}$.`,
      };
    }),
  ];

  const PS_PROB = [
    G("ps-prob-atleast", 3, () => {
      const r = ri(3, 5), bl = ri(3, 5);
      const tot = r + bl;
      const num = nCr(tot, 2) - nCr(bl, 2);
      const den = nCr(tot, 2);
      const correct = frTex(num, den);
      const mc = mc5(correct, [frTex(nCr(bl, 2), den), frTex(nCr(r, 2), den), frTex(den - nCr(r, 2), den), frTex(r, tot), frTex(num - 1, den)]);
      if (!mc) return null;
      return {
        prompt: `빨간 공 ${r}개, 파란 공 ${bl}개가 든 주머니에서 임의로 2개를 동시에 꺼낼 때, 적어도 1개가 빨간 공일 확률은?`,
        inputMode: "multiple-choice", choices: mc.choices, answer: mc.answer,
        solution: `여사건(모두 파랑): $\\dfrac{\\binom{${bl}}{2}}{\\binom{${tot}}{2}} = ${frBody(nCr(bl, 2), den)}$. 답 $= 1 - ${frBody(nCr(bl, 2), den)} = ${frBody(num, den)}$.`,
      };
    }),
    G("ps-prob-addition", 3, () => {
      const den = 12;
      const a = ri(3, 7), b = ri(3, 7);
      const c = ri(1, Math.min(a, b) - 1);
      const u = a + b - c;
      if (u > 11) return null;
      const ansN = b - c;
      const correct = frTex(ansN, den);
      const mc = mc5(correct, [frTex(a - c, den), frTex(c, den), frTex(b, den), frTex(12 - u, den), frTex(ansN + 1, den)]);
      if (!mc) return null;
      return {
        prompt: `두 사건 $A, B$ 에 대하여 $P(A) = \\dfrac{${a}}{12}$, $P(B) = \\dfrac{${b}}{12}$, $P(A \\cup B) = \\dfrac{${u}}{12}$ 일 때, $P(A^{c} \\cap B)$ 의 값은?`,
        inputMode: "multiple-choice", choices: mc.choices, answer: mc.answer,
        solution: `$P(A \\cap B) = P(A)+P(B)-P(A\\cup B) = \\dfrac{${c}}{12}$. $P(A^{c}\\cap B) = P(B) - P(A\\cap B) = \\dfrac{${b}}{12} - \\dfrac{${c}}{12} = ${frBody(ansN, den)}$.`,
      };
    }),
  ];

  const PS_COND = [
    G("ps-cond-table", 3, () => {
      const m1 = ri(6, 20), m2 = ri(6, 20), f1 = ri(6, 20), f2 = ri(6, 20);
      const correct = frTex(m1, m1 + m2);
      const mc = mc5(correct, [frTex(m1, m1 + m2 + f1 + f2), frTex(m1, m1 + f1), frTex(m2, m1 + m2), frTex(m1 + f1, m1 + m2 + f1 + f2), frTex(m1 - 1, m1 + m2)]);
      if (!mc) return null;
      return {
        prompt: `어느 학급 학생의 찬반 조사 결과, 남학생은 찬성 ${m1}명·반대 ${m2}명, 여학생은 찬성 ${f1}명·반대 ${f2}명이다. 임의로 뽑은 한 명이 남학생일 때, 그 학생이 찬성일 확률은?`,
        inputMode: "multiple-choice", choices: mc.choices, answer: mc.answer,
        solution: `조건(남학생)으로 표본공간 축소: 남학생 ${m1 + m2}명 중 찬성 ${m1}명 → ${frTex(m1, m1 + m2)}.`,
      };
    }),
    G("ps-cond-bayes", 4, () => {
      const t1 = ri(4, 6), t2 = ri(4, 6);
      const r1 = ri(1, t1 - 1), r2 = ri(1, t2 - 1);
      const num = r1 * t2;
      const den = r1 * t2 + r2 * t1;
      const correct = frTex(num, den);
      const mc = mc5(correct, [frTex(r2 * t1, den), frTex(r1, t1), frTex(r1 + r2, t1 + t2), frTex(r1, r1 + r2), frTex(num, den + t1)]);
      if (!mc) return null;
      return {
        prompt: `주머니 A에는 빨간 공 ${r1}개를 포함해 ${t1}개, 주머니 B에는 빨간 공 ${r2}개를 포함해 ${t2}개의 공이 들어 있다. 동전을 던져 앞면이면 A, 뒷면이면 B에서 한 개를 꺼냈더니 빨간 공이었다. 그 공이 주머니 A에서 나왔을 확률은?`,
        inputMode: "multiple-choice", choices: mc.choices, answer: mc.answer,
        solution: `$P(A\\mid R) = \\dfrac{\\frac{1}{2}\\cdot\\frac{${r1}}{${t1}}}{\\frac{1}{2}\\cdot\\frac{${r1}}{${t1}} + \\frac{1}{2}\\cdot\\frac{${r2}}{${t2}}} = \\dfrac{${r1 * t2}}{${r1 * t2} + ${r2 * t1}} = ${frBody(num, den)}$.`,
      };
    }),
  ];

  const PS_INDEP = [
    G("ps-indep-union", 4, () => {
      const pa = pk([[1, 2], [1, 3], [1, 4]]);
      const pb = pk([[1, 2], [1, 3], [2, 3], [1, 4], [3, 4]]);
      // u = pa + pb(1-pa) — 분수 연산
      const uN = pa[0] * pb[1] + pb[0] * (pa[1] - pa[0]);
      const uD = pa[1] * pb[1];
      const correct = frTex(pb[0], pb[1]);
      const mc = mc5(correct, [frTex(pb[0], pb[1] + 1), frTex(pb[1] - pb[0], pb[1]), frTex(uN - pa[0] * pb[1], uD), frTex(pa[0], pa[1]), frTex(pb[0] + 1, pb[1] + 1)]);
      if (!mc) return null;
      return {
        prompt: `서로 독립인 두 사건 $A, B$ 에 대하여 $P(A) = ${frBody(pa[0], pa[1])}$, $P(A \\cup B) = ${frBody(uN, uD)}$ 일 때, $P(B)$ 의 값은?`,
        inputMode: "multiple-choice", choices: mc.choices, answer: mc.answer,
        solution: `독립이므로 $P(A\\cup B) = P(A) + P(B) - P(A)P(B) = P(A) + P(B)(1 - P(A))$. 정리하면 $P(B) = \\dfrac{P(A\\cup B) - P(A)}{1 - P(A)} = ${frBody(pb[0], pb[1])}$.`,
      };
    }),
    G("ps-indep-repeat", 3, () => {
      const pr = pk([[2, 3], [3, 4], [4, 5]]);
      const miss = pr[1] - pr[0];
      const den = Math.pow(pr[1], 3);
      const num = den - Math.pow(miss, 3);
      const correct = frTex(num, den);
      const mc = mc5(correct, [frTex(Math.pow(miss, 3), den), frTex(Math.pow(pr[0], 3), den), frTex(3 * pr[0], den), frTex(num - 1, den), frTex(pr[0], pr[1])]);
      if (!mc) return null;
      return {
        prompt: `한 번의 사격에서 명중할 확률이 $\\dfrac{${pr[0]}}{${pr[1]}}$ 인 사수가 독립적으로 3발을 쏠 때, 적어도 한 발 명중할 확률은?`,
        inputMode: "multiple-choice", choices: mc.choices, answer: mc.answer,
        solution: `여사건(모두 빗나감) $= \\left(\\dfrac{${miss}}{${pr[1]}}\\right)^{3} = ${frBody(Math.pow(miss, 3), den)}$. 답 $= 1 - ${frBody(Math.pow(miss, 3), den)} = ${frBody(num, den)}$.`,
      };
    }),
  ];

  const PS_RV = [
    G("ps-rv-linear", 3, () => {
      const e = ri(2, 6), v = ri(1, 5), a = ri(2, 4), b = ri(-3, 3);
      const ans = a * e + b + a * a * v;
      return {
        prompt: `확률변수 $X$ 가 $E(X) = ${e}$, $V(X) = ${v}$ 를 만족할 때, $E(${a}X${pm(b)}) + V(${a}X${pm(b)})$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: ans,
        solution: `$E(${a}X${pm(b)}) = ${a}\\times${e}${pm(b)} = ${a * e + b}$, $V(${a}X${pm(b)}) = ${a}^{2}\\times${v} = ${a * a * v}$. 합은 $${ans}$.`,
      };
    }),
    G("ps-rv-table", 3, () => {
      const a = ri(1, 4), b = ri(1, 4);
      if (a + b >= 9) return null;
      const c = 10 - a - b;
      const eN = 20 - 2 * a - b;
      return {
        prompt: `확률변수 $X$ 의 확률분포가 $P(X=0) = \\dfrac{${a}}{10}$, $P(X=1) = \\dfrac{${b}}{10}$, $P(X=2) = k$ 일 때, $E(X)$ 의 값을 구하시오. (분수로 입력 가능)`,
        inputMode: "short-answer", answer: frPlain(eN, 10),
        solution: `확률 합 1: $k = \\dfrac{${c}}{10}$. $E(X) = 0\\cdot\\dfrac{${a}}{10} + 1\\cdot\\dfrac{${b}}{10} + 2\\cdot\\dfrac{${c}}{10} = ${frBody(eN, 10)}$.`,
      };
    }),
  ];

  const PS_BINORM = [
    G("ps-binorm-inverse", 4, () => {
      const q = pk([2, 3, 4]);
      const m = ri(2, 5);
      const n = q * q * m;
      if (n > 90) return null;
      const E = q * m, V = m * (q - 1);
      return {
        prompt: `확률변수 $X$ 가 이항분포 $B(n, p)$ 를 따르고 $E(X) = ${E}$, $V(X) = ${V}$ 일 때, $n$ 의 값을 구하시오.`,
        inputMode: "short-answer", answer: n,
        solution: `$V = E(1-p)$ 에서 $1-p = \\dfrac{${V}}{${E}}$, $p = \\dfrac{1}{${q}}$. $E = np$ 이므로 $n = ${E}\\times${q} = ${n}$.`,
      };
    }),
    G("ps-binorm-normal", 4, () => {
      const m = ri(50, 70), s = pk([5, 10]);
      const kind = pk([
        { bound: (mm, ss) => mm + ss, tex: (c) => `P(X \\le ${c})`, ans: 0.8413, sol: (c) => `$Z = 1$ 까지: $0.5 + 0.3413 = 0.8413$` },
        { bound: (mm, ss) => mm - 2 * ss, tex: (c) => `P(X \\ge ${c})`, ans: 0.9772, sol: (c) => `$Z = -2$ 오른쪽: $0.5 + 0.4772 = 0.9772$` },
        { bound: (mm, ss) => mm + ss, tex: (c) => `P(X \\ge ${c})`, ans: 0.1587, sol: (c) => `$Z = 1$ 오른쪽: $0.5 - 0.3413 = 0.1587$` },
        { bound: (mm, ss) => mm - ss, tex: (c) => `P(X \\le ${c})`, ans: 0.1587, sol: (c) => `$Z = -1$ 왼쪽: $0.5 - 0.3413 = 0.1587$` },
      ]);
      const c = kind.bound(m, s);
      return {
        prompt: `확률변수 $X$ 가 정규분포 $N(${m}, ${s}^{2})$ 을 따를 때, $${kind.tex(c)}$ 의 값을 구하시오. (단, $P(0 \\le Z \\le 1) = 0.3413$, $P(0 \\le Z \\le 2) = 0.4772$, 소수로 입력)`,
        inputMode: "short-answer", answer: String(kind.ans),
        solution: `표준화 $Z = \\dfrac{X - ${m}}{${s}}$ 를 적용하면 ${kind.sol(c)} $= ${kind.ans}$.`,
      };
    }),
  ];

  const PS_SAMPLE = [
    G("ps-sample-dist", 4, () => {
      const combo = pk([[8, 16, 2], [10, 4, 5], [10, 25, 2], [12, 4, 6], [6, 9, 2], [15, 25, 3]]);
      const s = combo[0], n = combo[1], sd = combo[2];
      const m = ri(40, 60);
      const kind = pk([
        { c: m + sd, tex: (c) => `P(\\overline{X} \\ge ${c})`, ans: 0.1587, note: "$Z = 1$ 오른쪽: $0.5 - 0.3413$" },
        { c: m - 2 * sd, tex: (c) => `P(\\overline{X} \\ge ${c})`, ans: 0.9772, note: "$Z = -2$ 오른쪽: $0.5 + 0.4772$" },
        { c: m + 2 * sd, tex: (c) => `P(\\overline{X} \\le ${c})`, ans: 0.9772, note: "$Z = 2$ 왼쪽: $0.5 + 0.4772$" },
      ]);
      return {
        prompt: `정규분포 $N(${m}, ${s}^{2})$ 을 따르는 모집단에서 크기 ${n}인 표본을 임의추출할 때, 표본평균 $\\overline{X}$ 에 대하여 $${kind.tex(kind.c)}$ 의 값을 구하시오. (단, $P(0 \\le Z \\le 1) = 0.3413$, $P(0 \\le Z \\le 2) = 0.4772$, 소수로 입력)`,
        inputMode: "short-answer", answer: String(kind.ans),
        solution: `$\\overline{X} \\sim N\\left(${m}, \\left(\\dfrac{${s}}{\\sqrt{${n}}}\\right)^{2}\\right)$, 표준편차 $= ${sd}$. ${kind.note} $= ${kind.ans}$.`,
      };
    }),
    G("ps-sample-cin", 4, () => {
      const sigma = pk([5, 10, 15, 20]);
      const sroot = pk([5, 10]);
      const n = sroot * sroot;
      const L = (2 * 1.96 * sigma) / sroot;
      return {
        prompt: `정규분포를 따르는 모집단(모표준편차 $\\sigma = ${sigma}$)에서 크기 $n$ 인 표본을 임의추출하여 모평균을 신뢰도 95%로 추정할 때, 신뢰구간의 길이가 $${L.toFixed(2)}$ 이 되도록 하는 $n$ 의 값을 구하시오. (단, $P(|Z| \\le 1.96) = 0.95$)`,
        inputMode: "short-answer", answer: n,
        solution: `길이 $= 2 \\times 1.96 \\times \\dfrac{${sigma}}{\\sqrt{n}} = ${L.toFixed(2)}$ 에서 $\\sqrt{n} = ${sroot}$, $n = ${n}$.`,
      };
    }),
  ];

  /* ============================================================
     과목 트리
     ============================================================ */
  const EXAM_COURSES = [
    {
      id: "algebra", label: "대수", icon: "🧮",
      units: [
        {
          id: "explog", numeral: "Ⅰ", label: "지수함수와 로그함수",
          subs: [
            { id: "radical", label: "지수의 확장과 거듭제곱근", gens: ALG_RADICAL },
            { id: "log", label: "로그의 뜻과 성질", gens: ALG_LOG },
            { id: "graph", label: "지수·로그함수의 그래프", gens: ALG_EXPGRAPH },
            { id: "eq", label: "지수·로그 방정식과 부등식", gens: ALG_EXPEQ },
          ],
        },
        {
          id: "trig", numeral: "Ⅱ", label: "삼각함수",
          subs: [
            { id: "radian", label: "일반각과 호도법·부채꼴", gens: ALG_RADIAN },
            { id: "trigfun", label: "삼각함수의 뜻과 그래프", gens: ALG_TRIGFUN },
            { id: "laws", label: "사인법칙과 코사인법칙", gens: ALG_LAWS },
          ],
        },
        {
          id: "seq", numeral: "Ⅲ", label: "수열",
          subs: [
            { id: "arith", label: "등차수열", gens: ALG_ARITH },
            { id: "geom", label: "등비수열", gens: ALG_GEOM },
            { id: "sigma", label: "수열의 합(Σ)", gens: ALG_SIGMA },
            { id: "recur", label: "수열의 귀납적 정의", gens: ALG_RECUR },
          ],
        },
      ],
    },
    {
      id: "calculus", label: "미적분Ⅰ", icon: "📈",
      units: [
        {
          id: "limit", numeral: "Ⅰ", label: "함수의 극한과 연속",
          subs: [
            { id: "lim", label: "함수의 극한", gens: CAL_LIM },
            { id: "cont", label: "함수의 연속", gens: CAL_CONT },
          ],
        },
        {
          id: "diff", numeral: "Ⅱ", label: "미분",
          subs: [
            { id: "deriv", label: "미분계수와 도함수", gens: CAL_DERIV },
            { id: "tangent", label: "접선의 방정식", gens: CAL_TANGENT },
            { id: "extrema", label: "함수의 극대·극소", gens: CAL_EXTREMA },
            { id: "apply", label: "미분의 활용(방정식·운동)", gens: CAL_APPLY },
          ],
        },
        {
          id: "integral", numeral: "Ⅲ", label: "적분",
          subs: [
            { id: "antider", label: "부정적분", gens: CAL_ANTIDER },
            { id: "defint", label: "정적분", gens: CAL_DEFINT },
            { id: "area", label: "정적분의 활용(넓이·거리)", gens: CAL_AREA },
          ],
        },
      ],
    },
    {
      id: "probstat", label: "확률과 통계", icon: "🎲",
      units: [
        {
          id: "counting", numeral: "Ⅰ", label: "경우의 수",
          subs: [
            { id: "perm", label: "여러 가지 순열", gens: PS_PERM },
            { id: "hcomb", label: "중복조합", gens: PS_HCOMB },
            { id: "binom", label: "이항정리", gens: PS_BINOM },
          ],
        },
        {
          id: "probability", numeral: "Ⅱ", label: "확률",
          subs: [
            { id: "prob", label: "확률의 뜻과 덧셈정리", gens: PS_PROB },
            { id: "cond", label: "조건부확률", gens: PS_COND },
            { id: "indep", label: "독립과 곱셈정리", gens: PS_INDEP },
          ],
        },
        {
          id: "statistics", numeral: "Ⅲ", label: "통계",
          subs: [
            { id: "rv", label: "확률변수와 기댓값", gens: PS_RV },
            { id: "binorm", label: "이항분포와 정규분포", gens: PS_BINORM },
            { id: "sample", label: "표본평균과 추정", gens: PS_SAMPLE },
          ],
        },
      ],
    },
  ];

  /* ============================================================
     시험지 조립
     ============================================================ */
  function flattenGens(sub, course, unit) {
    return sub.gens.map((g) => ({
      gen: g,
      meta: {
        courseLabel: course.label,
        unitLabel: `${unit.numeral}. ${unit.label}`,
        subLabel: sub.label,
      },
    }));
  }

  /* 배열들의 라운드로빈 인터리브 (각 배열은 셔플된 상태로 들어옴) */
  function interleave(arrays) {
    const out = [];
    const pools = arrays.map((a) => sh(a));
    let added = true;
    while (added) {
      added = false;
      for (const p of pools) {
        if (p.length) { out.push(p.shift()); added = true; }
      }
    }
    return out;
  }

  /* 정렬된 후보 풀에서 count문항 생성 (순환·프롬프트 중복 제거) */
  function drawProblems(orderedPool, count) {
    const items = [];
    const seen = new Set();
    let gi = 0, guard = 0;
    while (items.length < count && guard++ < 500) {
      const rec = orderedPool[gi % orderedPool.length];
      gi++;
      const p = rec.gen.generate();
      if (!p || seen.has(p.prompt)) continue;
      seen.add(p.prompt);
      items.push({ p, ...rec.meta, genId: rec.gen.id, points: rec.gen.points });
    }
    // 수능풍 배치: 5지선다 먼저, 단답형은 뒤로
    items.sort((x, y) => (x.p.inputMode === "short-answer" ? 1 : 0) - (y.p.inputMode === "short-answer" ? 1 : 0));
    return items;
  }

  const GRADE_BANDS = [
    { min: 90, grade: "1등급", msg: "심화까지 잡았다. 이 단원은 네 무기다." },
    { min: 80, grade: "2등급", msg: "상위권 진입. 틀린 문항의 소단원만 정밀 타격해라." },
    { min: 70, grade: "3등급", msg: "뼈대는 섰다. 오답 소단원 복습 후 새 회차로 재응시." },
    { min: 55, grade: "4등급", msg: "구멍이 여러 곳이다. 아래 오답 리뷰의 소단원부터 다시." },
    { min: 0, grade: "5등급 이하", msg: "심화는 아직이다. 개념 학습부터 다시 밟고 와라." },
  ];

  function packPaper(kind, title, subtitle, items, rebuild) {
    const totalPoints = items.reduce((s, it) => s + it.points, 0);
    return { kind, title, subtitle, items, totalPoints, rebuild };
  }

  function findCourse(courseId) { return EXAM_COURSES.find((c) => c.id === courseId); }

  function buildSubExam(courseId, unitId, subId) {
    const course = findCourse(courseId);
    const unit = course.units.find((u) => u.id === unitId);
    const sub = unit.subs.find((s) => s.id === subId);
    const pool = sh(flattenGens(sub, course, unit));
    const items = drawProblems(pool, 4);
    return packPaper("sub", `${course.label} 소단원 집중 — ${sub.label}`,
      `${unit.numeral}. ${unit.label} · 4문항 · 같은 소단원 변형 반복`,
      items, () => buildSubExam(courseId, unitId, subId));
  }

  function buildUnitExam(courseId, unitId) {
    const course = findCourse(courseId);
    const unit = course.units.find((u) => u.id === unitId);
    const pool = interleave(unit.subs.map((s) => flattenGens(s, course, unit)));
    const items = drawProblems(pool, 8);
    return packPaper("unit", `${course.label} 대단원 모의고사 — ${unit.numeral}. ${unit.label}`,
      `8문항 · 소단원 전체 배합 · 새 회차마다 발제문·수치 변경`,
      items, () => buildUnitExam(courseId, unitId));
  }

  function buildCourseExam(courseId) {
    const course = findCourse(courseId);
    const unitPools = course.units.map((u) => interleave(u.subs.map((s) => flattenGens(s, course, u))));
    const pool = interleave(unitPools);
    const items = drawProblems(pool, 12);
    return packPaper("course", `${course.label} 전범위 모의고사`,
      `12문항 · ${course.units.map((u) => u.label).join(" / ")} 통합`,
      items, () => buildCourseExam(courseId));
  }

  function buildIntegratedExam() {
    const coursePools = EXAM_COURSES.map((c) =>
      interleave(c.units.map((u) => interleave(u.subs.map((s) => flattenGens(s, c, u))))));
    const pool = interleave(coursePools);
    const items = drawProblems(pool, 15);
    return packPaper("integrated", "3과목 통합 모의고사",
      "15문항 · 대수 + 미적분Ⅰ + 확률과 통계 전 범위",
      items, () => buildIntegratedExam());
  }

  function examGrade(earned, totalPoints) {
    const pct = totalPoints ? Math.round((earned / totalPoints) * 100) : 0;
    const band = GRADE_BANDS.find((b) => pct >= b.min) || GRADE_BANDS[GRADE_BANDS.length - 1];
    return { pct, grade: band.grade, msg: band.msg };
  }

  const api = { EXAM_COURSES, buildSubExam, buildUnitExam, buildCourseExam, buildIntegratedExam, examGrade };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof window !== "undefined" ? window : globalThis);
