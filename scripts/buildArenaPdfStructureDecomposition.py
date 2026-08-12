#!/usr/bin/env python3
"""Build stage-2 structural decomposition drafts for the frozen PDF source ledger.

This is research tooling only. It reads the already-downloaded official problem
PDFs and the screenshot manifest, then emits abstract implementation features.
It deliberately does not modify the production question bank or persist the
verbatim problem/solution text in the output artifact.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pdfplumber


ROOT = Path(__file__).resolve().parents[1]
LEDGER_PATH = ROOT / "dataAnalysis/arenaPdfSkeletonImplementation/source-ledger-v1.json"
MANIFEST_PATH = ROOT / "tmp/pdfs/arena_short_answer_audit/manifest.json"
SOURCE_DIR = ROOT / "tmp/pdfs/arena_short_answer_audit/source"
CROP_DIR = ROOT / "tmp/pdfs/arena_short_answer_audit/crops"
RAW_INTENTS_PATH = Path("/private/tmp/matths-arena-official-mock-raw-intents.json")
OUTPUT_PATH = ROOT / "dataAnalysis/arenaPdfSkeletonImplementation/structure-decomposition-v1.json"
REPORT_PATH = ROOT / "dataAnalysis/arenaPdfSkeletonImplementation/step-2-structure-decomposition.md"


FAMILY_OPERATION_PRIORS: dict[str, list[str]] = {
    "PS-COUNTING": ["CONSTRAINED_ENUMERATION", "COUNT_AGGREGATION"],
    "PS-CONDITIONAL": ["EVENT_PARTITION", "CONDITIONAL_PROBABILITY"],
    "PS-PROBABILITY-AXIOMS": ["EVENT_PARTITION", "PROBABILITY_AGGREGATION"],
    "PS-RANDOM-VARIABLE": ["EXPECTATION_VARIANCE_EVALUATION", "PARAMETER_BACKSOLVE"],
    "PS-NORMAL-SAMPLE": ["STANDARDIZATION", "PARAMETER_BACKSOLVE"],
    "ALG-SEQUENCE-RECURRENCE": ["RECURRENCE_ITERATION", "INVARIANT_OR_PATTERN_EXTRACTION"],
    "ALG-SEQUENCE-SUM": ["SEQUENCE_SUM_TRANSFORM", "PARAMETER_BACKSOLVE"],
    "ALG-TRIG-GEOMETRY": ["TRIGONOMETRIC_GEOMETRY", "LENGTH_OR_ANGLE_BACKSOLVE"],
    "ALG-TRIG-GRAPH": ["PERIODIC_GRAPH_ANALYSIS", "ROOT_OR_INTERVAL_COUNT"],
    "ALG-EXP-LOG-GRAPH": ["EXP_LOG_GRAPH_ANALYSIS", "ROOT_OR_INTERVAL_COUNT"],
    "ALG-EXP-LOG-EQUATION": ["EXP_LOG_REWRITE", "PARAMETER_BACKSOLVE"],
    "C1-INTEGRAL-DEFINED": ["INTEGRAL_DEFINED_FUNCTION_TRANSFORM", "PARAMETER_BACKSOLVE"],
    "C1-INTEGRAL-AREA": ["INTERSECTION_PARTITION", "SIGNED_AREA_INTEGRATION"],
    "C1-VELOCITY-DISTANCE": ["SIGN_INTERVAL_PARTITION", "ABSOLUTE_DISTANCE_INTEGRATION"],
    "C1-DERIVATIVE-ROOTS": ["DERIVATIVE_SIGN_ANALYSIS", "ROOT_COUNT_ANALYSIS"],
    "C1-TANGENT-EXTREMA": ["DERIVATIVE_SIGN_ANALYSIS", "EXTREMUM_OR_TANGENCY_BACKSOLVE"],
    "C1-LIMIT-CONTINUITY": ["PIECEWISE_LIMIT_MATCHING", "PARAMETER_BACKSOLVE"],
    "C1-DERIVATIVE": ["DIFFERENTIATION", "FUNCTION_RECONSTRUCTION"],
    "CM2-COMPOSITION-INVERSE": ["INVERSE_COMPOSITION_TRANSFORM", "FUNCTION_VALUE_BACKSOLVE"],
    "CM2-RATIONAL-RADICAL": ["DOMAIN_RANGE_ANALYSIS", "GRAPH_TRANSFORM"],
    "CM2-SETS-PROPOSITIONS": ["SET_LOGIC_TRANSFORM", "CASE_ENUMERATION"],
    "CM2-COORDINATE-CIRCLE": ["COORDINATE_GEOMETRY", "DISTANCE_OR_TANGENCY_BACKSOLVE"],
    "CM1-EQUATION-INEQUALITY": ["DISCRIMINANT_OR_SIGN_ANALYSIS", "PARAMETER_BACKSOLVE"],
    "FUNCTION-GRAPH-CONDITION": ["FUNCTION_GRAPH_ANALYSIS", "PARAMETER_BACKSOLVE"],
}

# These were the only targets left unresolved after text-layer extraction.
# Each value was assigned by opening the corresponding audit crop and reading
# the requested quantity directly. Keeping the overrides explicit makes this
# human judgment reviewable instead of hiding it inside a broad heuristic.
MANUAL_TARGET_OVERRIDES: dict[str, str] = {
    "2020-05-EDUCATION_OFFICE-GA-Q30": "FUNCTION_VALUE",
    "2020-05-EDUCATION_OFFICE-NA-Q30": "SUM",
    "2020-05-EDUCATION_OFFICE-GA-Q29": "COUNT",
    "2020-05-EDUCATION_OFFICE-NA-Q29": "COUNT",
    "2020-05-EDUCATION_OFFICE-GA-Q27": "LIMIT_VALUE",
    "2020-05-EDUCATION_OFFICE-GA-Q26": "PRODUCT",
    "2016-10-EDUCATION_OFFICE-NA-Q30": "COUNT",
    "2020-05-EDUCATION_OFFICE-GA-Q28": "DISTANCE_OR_LENGTH",
    "2020-05-EDUCATION_OFFICE-NA-Q26": "DISTANCE_OR_LENGTH",
    "2018-07-EDUCATION_OFFICE-NA-Q27": "SLOPE",
    "2020-05-EDUCATION_OFFICE-NA-Q28": "EXTREMUM",
    "2016-03-EDUCATION_OFFICE-NA-Q26": "LIMIT_VALUE",
    "2017-10-EDUCATION_OFFICE-NA-Q27": "SCALAR_VALUE",
    "2018-07-EDUCATION_OFFICE-NA-Q28": "SCALAR_VALUE",
    "2020-07-EDUCATION_OFFICE-NA-Q25": "SPEED_OR_ACCELERATION",
    "2020-05-EDUCATION_OFFICE-NA-Q27": "SEQUENCE_TERM",
    "2020-07-EDUCATION_OFFICE-GA-Q25": "SPEED_OR_ACCELERATION",
    "2016-04-EDUCATION_OFFICE-NA-Q25": "SUM",
    "2026-06-KICE-PROBABILITY_STATISTICS-Q19": "INTERCEPT",
    "2019-06-KICE-NA-Q25": "SPEED_OR_ACCELERATION",
    "2021-06-KICE-PROBABILITY_STATISTICS-Q19": "DISTANCE_OR_LENGTH",
    "2023-05-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q19": "SPEED_OR_ACCELERATION",
    "2016-07-EDUCATION_OFFICE-NA-Q23": "COEFFICIENT",
    "2018-06-KICE-NA-Q26": "COEFFICIENT",
    "2018-07-EDUCATION_OFFICE-NA-Q24": "COEFFICIENT",
    "2018-10-EDUCATION_OFFICE-GA-Q26": "SUM",
    "2017-09-KICE-GA-Q24": "SLOPE",
    "2019-04-EDUCATION_OFFICE-GA-Q25": "SLOPE",
    "2016-07-EDUCATION_OFFICE-GA-Q22": "COEFFICIENT",
    "2020-09-KICE-GA-Q22": "COEFFICIENT",
}


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8", errors="replace")).hexdigest()


def canonical_hash(value: Any) -> str:
    serialized = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return sha256_text(serialized)


def normalize_text(value: str) -> str:
    safe = str(value or "").encode("utf-8", errors="replace").decode("utf-8")
    return re.sub(r"\s+", " ", safe).strip()


def scan_text(value: str) -> str:
    # Korean text remains useful while private-use math glyphs are discarded.
    value = re.sub(r"[\ue000-\uf8ff]", " ", str(value or ""))
    return normalize_text(value)


def normalize_marker_text(value: str) -> str:
    return str(value).strip().replace("．", ".").replace("。", ".").replace("․", ".")


def question_markers(pdf: pdfplumber.PDF) -> tuple[dict[int, list[dict]], list[list[dict]]]:
    by_number: dict[int, list[dict]] = defaultdict(list)
    by_page: list[list[dict]] = []
    for page_index, page in enumerate(pdf.pages):
        markers: list[dict] = []
        midpoint = float(page.width) / 2
        for word in page.extract_words(x_tolerance=1, y_tolerance=3):
            match = re.fullmatch(r"([1-9]|[12][0-9]|30)\.", normalize_marker_text(word["text"]))
            if not match:
                continue
            x0 = float(word["x0"])
            if not (15 <= x0 <= 125 or midpoint - 12 <= x0 <= midpoint + 125):
                continue
            marker = {
                "number": int(match.group(1)),
                "page": page_index,
                "x0": x0,
                "top": float(word["top"]),
                "column": 0 if x0 < midpoint else 1,
            }
            markers.append(marker)
            by_number[marker["number"]].append(marker)
        markers.sort(key=lambda item: (item["column"], item["top"]))
        by_page.append(markers)
    return by_number, by_page


def best_marker(candidates: list[dict], page_width: float) -> dict | None:
    if not candidates:
        return None
    expected = (58.0, page_width / 2 + 6.0)
    return min(candidates, key=lambda item: abs(item["x0"] - expected[item["column"]]))


def fallback_location(year: int, question_number: int, page_count: int) -> tuple[int, int, float, float]:
    if year >= 2021:
        mapping = {
            16: (5, 1, 0.08, 0.58), 17: (5, 1, 0.36, 0.95),
            18: (6, 0, 0.08, 0.58), 19: (6, 0, 0.36, 0.95),
            20: (6, 1, 0.10, 0.95), 21: (7, 0, 0.10, 0.95),
            22: (7, 1, 0.10, 0.95), 29: (11, 0, 0.10, 0.95),
            30: (11, 1, 0.10, 0.95),
        }
    else:
        mapping = {
            22: (8, 1, 0.08, 0.58), 23: (8, 1, 0.36, 0.95),
            24: (9, 0, 0.08, 0.58), 25: (9, 0, 0.36, 0.95),
            26: (9, 1, 0.10, 0.95), 27: (10, 0, 0.10, 0.95),
            28: (10, 1, 0.10, 0.95), 29: (11, 0, 0.10, 0.95),
            30: (11, 1, 0.10, 0.95),
        }
    page, column, top_ratio, bottom_ratio = mapping[question_number]
    return min(page, page_count - 1), column, top_ratio, bottom_ratio


def problem_bbox(
    record: dict,
    pdf: pdfplumber.PDF,
    by_number: dict[int, list[dict]],
    by_page: list[list[dict]],
) -> tuple[int, tuple[float, float, float, float], bool]:
    question_number = int(record["source"]["questionNumber"])
    marker = best_marker(by_number.get(question_number, []), float(pdf.pages[0].width))
    used_fallback = marker is None
    if marker is None:
        page_index, column, top_ratio, bottom_ratio = fallback_location(
            int(record["source"]["year"]), question_number, len(pdf.pages)
        )
        page = pdf.pages[page_index]
        top = float(page.height) * top_ratio
        bottom = float(page.height) * bottom_ratio
    else:
        page_index = marker["page"]
        column = marker["column"]
        page = pdf.pages[page_index]
        top = max(35.0, marker["top"] - 15.0)
        later = [
            item for item in by_page[page_index]
            if item["column"] == column and item["top"] > marker["top"] + 10
        ]
        bottom = min((item["top"] - 10.0 for item in later), default=float(page.height) - 42.0)
    midpoint = float(page.width) / 2
    left = 38.0 if column == 0 else midpoint - 7.0
    right = midpoint + 7.0 if column == 0 else float(page.width) - 38.0
    if bottom - top < 85:
        bottom = min(float(page.height) - 42.0, top + 170.0)
    return page_index, (left, top, right, bottom), used_fallback


def extract_problem_evidence(records: list[dict], manifest: dict) -> dict[str, dict]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for record in records:
        grouped[record["source"]["problemUrl"]].append(record)
    evidence: dict[str, dict] = {}
    for source_index, (url, grouped_records) in enumerate(grouped.items(), start=1):
        source_entry = manifest["sources"].get(url, {})
        source_filename = source_entry.get("filename", "")
        source_path = SOURCE_DIR / source_filename
        if not source_path.exists():
            for record in grouped_records:
                evidence[record["sourceId"]] = {
                    "status": "SOURCE_PDF_MISSING",
                    "rawText": "",
                    "scanText": "",
                    "sourcePdf": source_filename,
                    "pageNumber": None,
                    "usedFallbackLocation": True,
                }
            continue
        try:
            with pdfplumber.open(source_path) as pdf:
                by_number, by_page = question_markers(pdf)
                for record in grouped_records:
                    page_index, bbox, used_fallback = problem_bbox(record, pdf, by_number, by_page)
                    raw = normalize_text(pdf.pages[page_index].crop(bbox).extract_text() or "")
                    scanned = scan_text(raw)
                    status = "EXTRACTED" if len(scanned) >= 45 else "PARTIAL" if scanned else "EMPTY"
                    evidence[record["sourceId"]] = {
                        "status": status,
                        "rawText": raw,
                        "scanText": scanned,
                        "sourcePdf": source_filename,
                        "pageNumber": page_index + 1,
                        "usedFallbackLocation": used_fallback,
                    }
        except Exception as error:  # Keep a complete audit rather than aborting at first malformed source.
            for record in grouped_records:
                evidence[record["sourceId"]] = {
                    "status": "EXTRACTION_ERROR",
                    "rawText": "",
                    "scanText": "",
                    "sourcePdf": source_filename,
                    "pageNumber": None,
                    "usedFallbackLocation": True,
                    "errorType": type(error).__name__,
                }
        if source_index % 20 == 0 or source_index == len(grouped):
            print(f"problem text sources={source_index}/{len(grouped)} records={len(evidence)}/{len(records)}", flush=True)
    return evidence


def load_intent_map() -> dict[tuple[str, int], dict]:
    if not RAW_INTENTS_PATH.exists():
        return {}
    forms = load_json(RAW_INTENTS_PATH)
    result: dict[tuple[str, int], dict] = {}
    for form in forms:
        solution_url = form.get("solutionUrl", "")
        for question in form.get("questions", []):
            result[(solution_url, int(question["questionNumber"]))] = question
    return result


def matched_terms(text: str, patterns: list[tuple[str, str]]) -> list[tuple[str, list[str]]]:
    matches: list[tuple[str, list[str]]] = []
    for kind, expression in patterns:
        found = sorted(set(re.findall(expression, text, flags=re.IGNORECASE)))
        if found:
            matches.append((kind, [str(item) for item in found[:4]]))
    return matches


TARGET_RULES = [
    ("COUNT", r"(?:개수|경우의 수|몇 가지).{0,16}구하"),
    ("PROBABILITY", r"확률.{0,16}구하"),
    ("MAX_MIN_COMBINATION", r"(?:최댓값.{0,30}최솟값|최솟값.{0,30}최댓값).{0,20}구하"),
    ("EXTREMUM", r"(?:최댓값|최솟값|극댓값|극솟값|최대가 되는|최소가 되는).{0,20}구하"),
    ("AREA", r"넓이.{0,16}구하"),
    ("DISTANCE_OR_LENGTH", r"(?:거리|길이|위치의 변화량).{0,16}구하"),
    ("ANGLE", r"(?:각의 크기|각도).{0,16}구하"),
    ("COEFFICIENT", r"계수.{0,16}구하"),
    ("SLOPE", r"기울기.{0,16}구하"),
    ("INTERCEPT", r"절편.{0,16}구하"),
    ("SPEED_OR_ACCELERATION", r"(?:속력|가속도).{0,16}구하"),
    ("SUM", r"(?:값의 합|모든.{0,20}합|합).{0,16}구하"),
    ("PRODUCT", r"(?:값의 곱|곱).{0,16}구하"),
    ("FUNCTION_VALUE", r"(?:함숫값|함수값).{0,16}구하"),
    ("SEQUENCE_TERM", r"(?:항의 값|일반항).{0,16}구하"),
    ("LIMIT_VALUE", r"(?:극한값|극한|lim).{0,24}구하"),
    ("INTEGRAL_VALUE", r"(?:정적분의 값|적분값).{0,16}구하"),
    ("INTEGER_PARAMETER", r"(?:자연수|정수).{0,24}(?:값|개수).{0,16}구하"),
    ("SCALAR_VALUE", r"값.{0,16}구하"),
]


CONDITION_RULES = [
    ("INTEGER_OR_NATURAL_DOMAIN", r"자연수|정수"),
    ("SET_OR_MAPPING", r"집합|부분집합|대응|일대일|전단사"),
    ("FUNCTION_RELATION", r"함수|함숫값|함수값"),
    ("PIECEWISE_OR_ABSOLUTE", r"절댓값|구간에 따라|이면"),
    ("INEQUALITY_OR_ORDER", r"부등식|이상|이하|초과|미만|대소 관계"),
    ("ROOT_OR_INTERSECTION_COUNT", r"실근|근의 개수|교점|만나는 점"),
    ("TANGENCY", r"접선|접하"),
    ("EXTREMUM_CONDITION", r"극대|극소|최댓값|최솟값"),
    ("MONOTONICITY", r"증가|감소|단조"),
    ("CONTINUITY_OR_DIFFERENTIABILITY", r"연속|미분가능"),
    ("DERIVATIVE_CONDITION", r"도함수|미분"),
    ("INTEGRAL_CONDITION", r"정적분|부정적분|적분"),
    ("LIMIT_CONDITION", r"극한"),
    ("SEQUENCE_OR_RECURRENCE", r"수열|점화식|귀납"),
    ("EXPONENTIAL_OR_LOG", r"지수|로그|거듭제곱"),
    ("TRIGONOMETRIC", r"삼각함수|사인|코사인|sin|cos|tan"),
    ("PROBABILITY_EVENT", r"확률|사건|표본공간"),
    ("CONDITIONAL_OR_INDEPENDENT", r"조건부|독립"),
    ("COMBINATORIAL_RESTRICTION", r"순열|조합|경우의 수|배열"),
    ("GEOMETRIC_CONFIGURATION", r"삼각형|사각형|원|도형|직선|점 [A-Z]"),
    ("INVERSE_OR_COMPOSITION", r"역함수|합성함수"),
    ("GRAPH_CONDITION", r"그래프"),
]


OPERATION_RULES = [
    ("CASE_SPLIT", r"경우|ⅰ|ⅱ|나누어|각각|홀수|짝수"),
    ("CONSTRAINED_ENUMERATION", r"경우의 수|순열|조합|부분집합|배열"),
    ("BIJECTION_OR_CYCLE_ANALYSIS", r"일대일 대응|전단사|대응"),
    ("EXP_LOG_REWRITE", r"로그|지수|거듭제곱"),
    ("RECURRENCE_ITERATION", r"점화식|귀납적 정의"),
    ("SEQUENCE_SUM_TRANSFORM", r"수열의 합|부분합|등차수열|등비수열"),
    ("DIFFERENTIATION", r"미분|도함수"),
    ("INTEGRATION", r"정적분|부정적분|적분"),
    ("INTERSECTION_PARTITION", r"교점|만나는 점"),
    ("DISCRIMINANT_OR_ROOT_ANALYSIS", r"판별식|중근|실근|근의 개수"),
    ("GRAPH_SHAPE_ANALYSIS", r"그래프"),
    ("MONOTONICITY_OR_EXTREMUM", r"증가|감소|극대|극소|최댓값|최솟값"),
    ("LIMIT_MATCHING", r"극한|연속|미분가능"),
    ("INVERSE_COMPOSITION_TRANSFORM", r"역함수|합성함수"),
    ("CONDITIONAL_PROBABILITY", r"조건부확률|조건부 확률"),
    ("EXPECTATION_VARIANCE_EVALUATION", r"기댓값|평균|분산|확률변수"),
    ("STANDARDIZATION", r"정규분포|표준화|표본평균"),
    ("TRIGONOMETRIC_GEOMETRY", r"사인법칙|코사인법칙|삼각형"),
    ("SET_LOGIC_TRANSFORM", r"집합|명제|진리집합|필요조건|충분조건"),
    ("ALGEBRAIC_SUBSTITUTION", r"대입|치환|정리하면"),
    ("PARAMETER_BACKSOLVE", r"미지수|구하는 문제|추론|조건을 만족"),
]


PARAMETER_RULES = [
    ("DISCRETE_INTEGER_PARAMETER", r"자연수|정수"),
    ("SET_MEMBERSHIP_OR_CARDINALITY", r"집합|부분집합|원소의 개수"),
    ("FUNCTION_COEFFICIENT_OR_VALUE", r"함수|다항함수|함숫값|함수값"),
    ("SEQUENCE_INITIAL_TERM_OR_RATIO", r"첫째항|공비|공차|수열"),
    ("DOMAIN_OR_INTERVAL_BOUND", r"구간|이상|이하|초과|미만"),
    ("PROBABILITY_OR_EVENT_SIZE", r"확률|사건|표본"),
    ("GEOMETRIC_MEASURE", r"길이|거리|넓이|각의 크기"),
    ("ROOT_OR_INTERSECTION_LOCATION", r"근|교점|접점"),
]


def target_descriptor(source_id: str, problem_text: str, intent_text: str) -> dict:
    if source_id in MANUAL_TARGET_OVERRIDES:
        return {
            "kind": MANUAL_TARGET_OVERRIDES[source_id],
            "outputShape": "NONNEGATIVE_INTEGER_SHORT_ANSWER",
            "confidence": "HIGH",
            "origin": "MANUAL_SCREENSHOT_REVIEW",
            "evidenceTerms": ["audit crop reviewed"],
        }
    combined = f"{problem_text} {intent_text}"
    for kind, expression in TARGET_RULES:
        found = sorted(set(re.findall(expression, combined)))
        if found:
            return {
                "kind": kind,
                "outputShape": "NONNEGATIVE_INTEGER_SHORT_ANSWER",
                "confidence": "HIGH" if re.search(expression, problem_text) else "MEDIUM",
                "origin": "PROBLEM_TEXT" if re.search(expression, problem_text) else "OFFICIAL_INTENT",
                "evidenceTerms": found[:4],
            }
    return {
        "kind": "UNRESOLVED_NUMERIC_TARGET",
        "outputShape": "NONNEGATIVE_INTEGER_SHORT_ANSWER",
        "confidence": "LOW",
        "origin": "UNRESOLVED",
        "evidenceTerms": [],
    }


def condition_descriptors(combined: str) -> list[dict]:
    matches = matched_terms(combined, CONDITION_RULES)
    if not matches:
        return [{"kind": "ALGEBRAIC_RELATION", "evidenceTerms": [], "confidence": "LOW"}]
    return [
        {"kind": kind, "evidenceTerms": terms, "confidence": "MEDIUM"}
        for kind, terms in matches
    ]


def operation_descriptors(combined: str, family_id: str, observed: dict) -> list[dict]:
    detected = matched_terms(combined, OPERATION_RULES)
    operations: list[dict] = [
        {"kind": kind, "origin": "TEXT_SIGNAL", "confidence": "MEDIUM", "evidenceTerms": terms}
        for kind, terms in detected
    ]
    present = {item["kind"] for item in operations}
    for prior in FAMILY_OPERATION_PRIORS.get(family_id, ["ALGEBRAIC_SUBSTITUTION", "PARAMETER_BACKSOLVE"]):
        if prior not in present:
            operations.append({
                "kind": prior,
                "origin": "FAMILY_PRIOR",
                "confidence": "LOW",
                "evidenceTerms": [],
            })
            present.add(prior)
    if observed.get("hasCaseSignal") and "CASE_SPLIT" not in present:
        operations.append({
            "kind": "CASE_SPLIT",
            "origin": "OFFICIAL_SOLUTION_SIGNAL",
            "confidence": "MEDIUM",
            "evidenceTerms": [],
        })
    return operations


def branch_descriptor(combined: str, observed: dict) -> dict:
    axes = []
    for axis, expression in [
        ("PARITY", r"홀수|짝수"),
        ("SIGN", r"양수|음수|부호"),
        ("INTERVAL", r"구간|이상|이하|초과|미만"),
        ("ROOT_COUNT", r"실근|근의 개수|교점"),
        ("MEMBERSHIP", r"부분집합|원소|집합"),
        ("ORDER", r"순서|배열|대소 관계"),
    ]:
        if re.search(expression, combined):
            axes.append(axis)
    explicit_count = len(re.findall(r"경우|ⅰ|ⅱ|ⅲ|각각|나누어", combined, flags=re.IGNORECASE))
    has_case = observed.get("hasCaseSignal") or explicit_count > 0 or bool(set(axes) & {"PARITY", "ROOT_COUNT"})
    kind = "NO_EXPLICIT_CASE_SPLIT"
    if has_case and (explicit_count >= 3 or len(axes) >= 3):
        kind = "NESTED_OR_MULTI_AXIS_CASE_SPLIT"
    elif has_case:
        kind = "SINGLE_AXIS_CASE_SPLIT"
    return {
        "kind": kind,
        "axes": axes,
        "explicitSignalCount": explicit_count,
        "confidence": "MEDIUM" if has_case else "LOW",
    }


def parameter_descriptors(combined: str) -> list[dict]:
    matches = matched_terms(combined, PARAMETER_RULES)
    if not matches:
        return [{"role": "GENERIC_NUMERIC_PARAMETER", "confidence": "LOW", "evidenceTerms": []}]
    return [
        {"role": kind, "confidence": "MEDIUM", "evidenceTerms": terms}
        for kind, terms in matches
    ]


def visualization_descriptor(combined: str, family_id: str, observed: dict) -> dict:
    kinds: list[str] = []
    requirement = "NONE"
    if re.search(r"그림|도형|삼각형|사각형|원", combined) or family_id in {
        "ALG-TRIG-GEOMETRY", "CM2-COORDINATE-CIRCLE"
    }:
        kinds.append("GEOMETRIC_DIAGRAM")
        requirement = "REQUIRED"
    if re.search(r"그래프", combined) or observed.get("solutionMayUseGraph"):
        kinds.append("FUNCTION_GRAPH")
        requirement = "REQUIRED" if re.search(r"그래프", combined) else "HELPFUL"
    if re.search(r"확률|경우의 수|부분집합", combined):
        kinds.append("CASE_TABLE_OR_TREE")
        if requirement == "NONE":
            requirement = "HELPFUL"
    if re.search(r"부등식|구간|부호", combined):
        kinds.append("SIGN_CHART_OR_NUMBER_LINE")
        if requirement == "NONE":
            requirement = "HELPFUL"
    return {
        "requirement": requirement,
        "kinds": sorted(set(kinds)),
        "confidence": "MEDIUM" if kinds else "LOW",
    }


def implementation_risk(problem_status: str, target_kind: str, operations: list[dict], branch: dict, visual: dict) -> dict:
    reasons = []
    if problem_status != "EXTRACTED":
        reasons.append("PROBLEM_TEXT_EXTRACTION_INCOMPLETE")
    if target_kind == "UNRESOLVED_NUMERIC_TARGET":
        reasons.append("TARGET_KIND_UNRESOLVED")
    if branch["kind"] == "NESTED_OR_MULTI_AXIS_CASE_SPLIT":
        reasons.append("MULTI_AXIS_BRANCHING")
    if visual["requirement"] == "REQUIRED":
        reasons.append("VISUAL_ASSET_REQUIRED")
    if len(operations) >= 6:
        reasons.append("MULTI_STAGE_SOLVER")
    if reasons:
        level = "HIGH" if any(reason in reasons for reason in (
            "PROBLEM_TEXT_EXTRACTION_INCOMPLETE", "TARGET_KIND_UNRESOLVED", "MULTI_AXIS_BRANCHING"
        )) else "MEDIUM"
    else:
        level = "MEDIUM" if len(operations) >= 4 or branch["kind"] != "NO_EXPLICIT_CASE_SPLIT" else "LOW"
    return {"level": level, "reasons": reasons}


def solver_signature(family_id: str, target: dict, operations: list[dict], branch: dict) -> str:
    core = [item["kind"] for item in operations[:4]]
    branch_code = {
        "NO_EXPLICIT_CASE_SPLIT": "NO_BRANCH",
        "SINGLE_AXIS_CASE_SPLIT": "ONE_BRANCH_AXIS",
        "NESTED_OR_MULTI_AXIS_CASE_SPLIT": "MULTI_BRANCH_AXIS",
    }[branch["kind"]]
    return "::".join([family_id, target["kind"], "+".join(core), branch_code])


def make_record(record: dict, problem: dict, intent: dict | None, manifest: dict) -> dict:
    source = record["source"]
    curriculum = record["curriculum"]
    observed = record["observedStructureSignals"]
    problem_scan = problem.get("scanText", "")
    intent_text = scan_text((intent or {}).get("intent", ""))
    combined = normalize_text(" ".join([
        problem_scan,
        intent_text,
        curriculum.get("familyLabel", ""),
    ]))
    target = target_descriptor(record["sourceId"], problem_scan, intent_text)
    conditions = condition_descriptors(combined)
    operations = operation_descriptors(combined, curriculum["familyId"], observed)
    branch = branch_descriptor(combined, observed)
    parameters = parameter_descriptors(combined)
    visual = visualization_descriptor(combined, curriculum["familyId"], observed)
    risk = implementation_risk(problem["status"], target["kind"], operations, branch, visual)
    crop_filename = manifest["records"].get(record["sourceId"], {}).get("crop", "")
    crop_path = CROP_DIR / crop_filename
    review_reasons = ["CANONICAL_SOLVER_GROUP_NOT_ASSIGNED", "SCREENSHOT_SEMANTICS_NOT_YET_CONFIRMED"]
    if problem.get("usedFallbackLocation"):
        review_reasons.append("FALLBACK_PDF_LOCATION_USED")
    if not intent:
        review_reasons.append("OFFICIAL_INTENT_SECTION_UNMATCHED")
    if target["confidence"] == "LOW":
        review_reasons.append("TARGET_REQUIRES_MANUAL_CONFIRMATION")
    return {
        "ledgerIndex": record["ledgerIndex"],
        "sourceId": record["sourceId"],
        "sourceSnapshot": {
            "year": source["year"],
            "sessionMonth": source["sessionMonth"],
            "form": source["form"],
            "questionNumber": source["questionNumber"],
            "problemCropPath": str(crop_path.relative_to(ROOT)) if crop_filename else "",
        },
        "curriculum": curriculum,
        "difficulty": record["difficulty"],
        "evidence": {
            "problemTextLayer": {
                "status": problem["status"],
                "characterCount": len(problem.get("scanText", "")),
                "sha256": sha256_text(problem.get("rawText", "")),
                "sourcePdfPath": str((SOURCE_DIR / problem.get("sourcePdf", "")).relative_to(ROOT)),
                "pageNumber": problem.get("pageNumber"),
                "usedFallbackLocation": problem.get("usedFallbackLocation", False),
            },
            "problemScreenshot": {
                "status": "AVAILABLE" if crop_path.exists() else "MISSING",
                "sha256": hashlib.sha256(crop_path.read_bytes()).hexdigest() if crop_path.exists() else "",
            },
            "officialSolution": {
                "status": "INTENT_SECTION_MATCHED" if intent else "UNMATCHED",
                "intentDigest": sha256_text(intent_text),
                "intentCharacterCount": len(intent_text),
                "solutionCharacterCount": int((intent or {}).get("solutionCharacters", 0)),
                "solutionCharacterBand": observed.get("solutionCharacterBand", ""),
                "sourceUrl": source["solutionUrl"],
            },
        },
        "decomposition": {
            "target": target,
            "conditions": conditions,
            "operations": operations,
            "branching": branch,
            "parameterRoles": parameters,
            "visualization": visual,
            "solverSignatureDraft": solver_signature(curriculum["familyId"], target, operations, branch),
            "implementationRisk": risk,
        },
        "review": {
            "status": "PENDING_STEP_3_CLUSTER_REVIEW",
            "manualScreenshotReviewRequired": True,
            "reasons": sorted(set(review_reasons)),
            "canonicalStructureId": None,
            "solverGroupId": None,
        },
    }


def count_by(records: list[dict], getter) -> dict[str, int]:
    counts = Counter(str(getter(record)) for record in records)
    return dict(sorted(counts.items()))


def build_report(payload: dict) -> str:
    summary = payload["summary"]
    lines = [
        "# PDF 스켈레톤 구현 2단계 - 문항별 구조 분해",
        "",
        f"- 구조 분해 대상: {summary['recordCount']}개",
        f"- 문제 스크린샷 연결: {summary['screenshotAvailable']}개",
        f"- 문제 PDF 텍스트 추출 성공: {summary['problemTextExtracted']}개",
        f"- 텍스트층 부분·미추출(캡처/해설 근거 유지): {summary['problemTextPartialOrMissing']}개",
        f"- 공식 해설 출제의도 연결: {summary['officialIntentMatched']}개",
        f"- 공식 해설 출제의도 미연결: {summary['officialIntentUnmatched']}개 (2016-04 나형 28번 보충 문항)",
        f"- 자동 미확정 목표값 스크린샷 수동 확인: {summary['manualTargetReviewed']}개",
        f"- 2단계 콘텐츠 해시: `{payload['contentHash']}`",
        "",
        "## 이번 단계에서 기록한 구조",
        "",
        "각 문항마다 목표값, 조건 형식, 풀이 연산, 경우 분기 축, 매개변수 역할, 시각자료 요구, 구현 위험도와 임시 풀이기 시그니처를 기록했다. 원문 문제와 해설 전문은 복제하지 않고 원본 캡처·PDF 경로와 텍스트 해시만 남겼다.",
        "",
        "문제 PDF 텍스트층이 짧거나 비어 있던 문항도 스크린샷은 629개 모두 연결되어 있다. 목표값을 자동 확정하지 못했거나 텍스트층이 완전히 비어 있던 30개는 캡처를 직접 열어 목표값을 확인했고, 그 판단은 `MANUAL_SCREENSHOT_REVIEW`로 분리 기록했다.",
        "",
        "## 목표값 분포",
        "",
        "| 목표값 유형 | 문항 수 |",
        "|---|---:|",
    ]
    for kind, count in summary["byTargetKind"].items():
        lines.append(f"| {kind} | {count} |")
    lines.extend([
        "",
        "## 분기 구조",
        "",
        "| 분기 유형 | 문항 수 |",
        "|---|---:|",
    ])
    for kind, count in summary["byBranchKind"].items():
        lines.append(f"| {kind} | {count} |")
    lines.extend([
        "",
        "## 구현 위험도",
        "",
        "| 위험도 | 문항 수 |",
        "|---|---:|",
    ])
    for kind, count in summary["byImplementationRisk"].items():
        lines.append(f"| {kind} | {count} |")
    lines.extend([
        "",
        "## 3단계로 넘기는 계약",
        "",
        "- `solverSignatureDraft`는 자동 구조 신호이며 최종 유형 ID가 아니다.",
        "- 3단계에서 문제 캡처와 공식 풀이를 함께 대조해 동일 독립 풀이기를 공유하는 문항만 묶는다.",
        "- `canonicalStructureId`와 `solverGroupId`는 그 검토가 끝날 때까지 비워 둔다.",
        "- 문제은행과 1대1 매치 런타임은 아직 변경하지 않는다.",
        "",
    ])
    return "\n".join(lines)


def main() -> None:
    ledger = load_json(LEDGER_PATH)
    manifest = load_json(MANIFEST_PATH)
    records = ledger["records"]
    intents = load_intent_map()
    problem_evidence = extract_problem_evidence(records, manifest)
    decomposed = []
    for record in records:
        key = (record["source"]["solutionUrl"], int(record["source"]["questionNumber"]))
        decomposed.append(make_record(record, problem_evidence[record["sourceId"]], intents.get(key), manifest))
    content_hash = canonical_hash(decomposed)
    summary = {
        "recordCount": len(decomposed),
        "screenshotAvailable": sum(item["evidence"]["problemScreenshot"]["status"] == "AVAILABLE" for item in decomposed),
        "problemTextExtracted": sum(item["evidence"]["problemTextLayer"]["status"] == "EXTRACTED" for item in decomposed),
        "problemTextPartialOrMissing": sum(item["evidence"]["problemTextLayer"]["status"] != "EXTRACTED" for item in decomposed),
        "officialIntentMatched": sum(item["evidence"]["officialSolution"]["status"] == "INTENT_SECTION_MATCHED" for item in decomposed),
        "officialIntentUnmatched": sum(item["evidence"]["officialSolution"]["status"] != "INTENT_SECTION_MATCHED" for item in decomposed),
        "manualTargetReviewed": sum(item["decomposition"]["target"]["origin"] == "MANUAL_SCREENSHOT_REVIEW" for item in decomposed),
        "byWave": count_by(records, lambda item: item["implementation"]["wave"]),
        "byTargetKind": count_by(decomposed, lambda item: item["decomposition"]["target"]["kind"]),
        "byBranchKind": count_by(decomposed, lambda item: item["decomposition"]["branching"]["kind"]),
        "byVisualizationRequirement": count_by(decomposed, lambda item: item["decomposition"]["visualization"]["requirement"]),
        "byImplementationRisk": count_by(decomposed, lambda item: item["decomposition"]["implementationRisk"]["level"]),
    }
    payload = {
        "schemaVersion": "ARENA_PDF_STRUCTURE_DECOMPOSITION_V1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceLedger": {
            "schemaVersion": ledger["schemaVersion"],
            "contentHash": ledger["contentHash"],
            "recordCount": len(records),
        },
        "methodology": {
            "problemEvidence": "Official problem PDF text extracted from the exact crop bounding box used by the audit PDF",
            "solutionEvidence": "Existing official EBSi intent-section extraction joined by solution URL and question number",
            "verbatimTextStored": False,
            "canonicalGroupingDeferredToStep": 3,
            "productionRuntimeModified": False,
        },
        "summary": summary,
        "contentHash": content_hash,
        "records": decomposed,
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    REPORT_PATH.write_text(build_report(payload), encoding="utf-8")
    print(f"wrote {OUTPUT_PATH}")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
