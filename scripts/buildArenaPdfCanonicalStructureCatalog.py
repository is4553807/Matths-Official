#!/usr/bin/env python3
"""Canonicalize stage-2 PDF decompositions into solver-compatible structures.

The compatibility contract is intentionally conservative: records share an
independent solver only when their corrected curriculum family, algorithm
variant, target, branch topology, condition topology, and operation topology
agree. Rendering requirements are allowed to share a solver group but receive
distinct canonical structure IDs.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DECOMPOSITION_PATH = ROOT / "dataAnalysis/arenaPdfSkeletonImplementation/structure-decomposition-v1.json"
LEDGER_PATH = ROOT / "dataAnalysis/arenaPdfSkeletonImplementation/source-ledger-v1.json"
MANIFEST_PATH = ROOT / "tmp/pdfs/arena_short_answer_audit/manifest.json"
RAW_INTENTS_PATH = Path("/private/tmp/matths-arena-official-mock-raw-intents.json")
OUTPUT_PATH = ROOT / "dataAnalysis/arenaPdfSkeletonImplementation/canonical-structure-catalog-v1.json"
REPORT_PATH = ROOT / "dataAnalysis/arenaPdfSkeletonImplementation/step-3-canonical-structures.md"
CORRECTIONS_PATH = ROOT / "dataAnalysis/arenaPdfSkeletonImplementation/contract-corrections-v1.json"
RECONCILIATION_PATH = ROOT / "dataAnalysis/arenaPdfSkeletonImplementation/transcription-reconciliation-v1.json"

sys.path.insert(0, str(ROOT / "scripts"))
from buildArenaPdfStructureDecomposition import (  # noqa: E402
    branch_descriptor,
    condition_descriptors,
    extract_problem_evidence,
    target_descriptor,
)


FAMILY_CODES = {
    "PS-COUNTING": "PSCNT",
    "PS-CONDITIONAL": "PSCOND",
    "PS-PROBABILITY-AXIOMS": "PSAXM",
    "PS-RANDOM-VARIABLE": "PSRV",
    "PS-NORMAL-SAMPLE": "PSNORM",
    "ALG-SEQUENCE-RECURRENCE": "ALGSEQREC",
    "ALG-SEQUENCE-SUM": "ALGSEQSUM",
    "ALG-TRIG-GEOMETRY": "ALGTRIGGEO",
    "ALG-TRIG-GRAPH": "ALGTRIGGR",
    "ALG-EXP-LOG-GRAPH": "ALGELGR",
    "ALG-EXP-LOG-EQUATION": "ALGELEQ",
    "C1-INTEGRAL-DEFINED": "C1INTDEF",
    "C1-INTEGRAL-AREA": "C1INTAREA",
    "C1-VELOCITY-DISTANCE": "C1MOTION",
    "C1-DERIVATIVE-ROOTS": "C1DERROOT",
    "C1-TANGENT-EXTREMA": "C1TANEXT",
    "C1-LIMIT-CONTINUITY": "C1LIMCONT",
    "C1-DERIVATIVE": "C1DER",
    "C1-SEQUENCE-LIMIT-SERIES": "C1SEQLIM",
    "C1-TRANSCENDENTAL-DERIVATIVE": "C1TRDER",
    "C1-TRANSCENDENTAL-INTEGRAL": "C1TRINT",
    "C1-ADVANCED-CALCULUS-MIXED": "C1ADVMIX",
    "C1-GEOMETRIC-LIMIT": "C1GEOLIM",
    "CM2-COMPOSITION-INVERSE": "CM2COMPINV",
    "CM2-RATIONAL-RADICAL": "CM2RAT",
    "CM2-SETS-PROPOSITIONS": "CM2SET",
    "CM2-COORDINATE-CIRCLE": "CM2COORD",
    "CM1-EQUATION-INEQUALITY": "CM1EQINQ",
    "FUNCTION-GRAPH-CONDITION": "FNGRAPH",
}


# Ordered from specific to general. The evidence text is the official EBSi
# intent section already used by the research catalog, not the answer itself.
VARIANT_RULES: dict[str, list[tuple[str, str, str]]] = {
    "PS-COUNTING": [
        ("BINOMIAL_COEFFICIENT", "BINOMIAL", r"이항정리|전개식|계수"),
        ("GRID_PATH_COUNT", "GRID_PATH", r"최단거리|도로망|격자|경로"),
        ("BINARY_ADJACENCY_SEQUENCE", "BINARY_ADJACENCY", r"카드.{0,40}자리.{0,80}곱|번째 자리.{0,80}곱"),
        ("CIRCULAR_ADJACENCY_ARRANGEMENT", "CIRCULAR_ADJACENCY", r"원형으로 배열|회전하여 일치|이웃한|이웃하는"),
        ("MONOTONE_RANGE_CARDINALITY_FUNCTION", "MONOTONE_RANGE", r"치역.{0,30}원소의 개수|단조|감소하지|증가하지"),
        ("INTEGER_SUM_RESIDUE_CONSTRAINT", "SUM_RESIDUE", r"나머지|나누어떨어|배수"),
        ("INTEGER_PRODUCT_EXPONENT_DISTRIBUTION", "PRODUCT_EXPONENT", r"정수.{0,40}곱|자연수.{0,40}곱|소인수"),
        ("POSITIVE_INTEGER_SUM_EXCLUSION", "SUM_EXCLUSION", r"순서쌍|순서조.{0,30}합|양의 정수.{0,80}합"),
        ("MAPPING_FUNCTION_COUNT", "MAPPING", r"함수|대응|일대일"),
        ("SET_SUBSET_COUNT", "SET_SUBSET", r"부분집합|집합의 개수"),
        ("DIGIT_INTEGER_CONSTRUCTION", "DIGIT_INTEGER", r"자리|자연수의 개수|정수의 개수"),
        ("DISTRIBUTION_PARTITION", "DISTRIBUTION", r"나누어|분배|중복조합|분할"),
        ("PERMUTATION_ARRANGEMENT", "PERMUTATION", r"순열|배열|나열|원순열"),
        ("COMBINATION_SELECTION", "COMBINATION", r"조합|선택|뽑"),
    ],
    "PS-CONDITIONAL": [
        ("INDEPENDENCE_CONSTRAINT", "INDEPENDENCE", r"독립"),
        ("BAYES_REVERSE_CONDITION", "BAYES", r"조건부확률|조건부 확률|역으로"),
        ("REPEATED_TRIAL_PARTITION", "REPEATED_TRIAL", r"반복|시행|주사위|동전"),
        ("EVENT_PARTITION", "EVENT_PARTITION", r"사건|여사건|분할"),
    ],
    "PS-PROBABILITY-AXIOMS": [
        ("REPEATED_TRIAL_STATE_TRANSITION", "REPEATED_STATE", r"시행을.{0,30}반복|번 반복.{0,30}후|카드.{0,40}뒤집"),
        ("TRANSFER_STATE_PROBABILITY", "TRANSFER_STATE", r"주머니.{0,80}꺼내어.{0,80}넣|실행 1|실행 2"),
        ("WEIGHTED_OUTCOME_ENUMERATION", "WEIGHTED_OUTCOME", r"점수를 얻는 시행|서로 다른 색|서로 같은 색"),
        ("COMPLEMENT_UNION", "COMPLEMENT_UNION", r"여사건|합사건|교사건|덧셈정리"),
        ("EQUIPROBABLE_COUNT", "EQUIPROBABLE", r"경우의 수|수학적 확률"),
        ("PROBABILITY_PARAMETER", "PROBABILITY_PARAMETER", r"확률의 값|미지수|조건을 만족"),
    ],
    "PS-RANDOM-VARIABLE": [
        ("BINOMIAL_DISTRIBUTION", "BINOMIAL_DIST", r"이항분포"),
        ("MOMENT_PARAMETER_CONSTRAINT", "MOMENT_CONSTRAINT", r"E\s*E|E\s*의 값을|기댓값|평균|분산|표준편차"),
        ("DISTRIBUTION_TABLE", "DISTRIBUTION_TABLE", r"확률분포|확률변수"),
        ("EXPECTATION_CONSTRAINT", "EXPECTATION", r"기댓값|평균"),
        ("VARIANCE_CONSTRAINT", "VARIANCE", r"분산|표준편차"),
    ],
    "PS-NORMAL-SAMPLE": [
        ("SAMPLE_MEAN_DISTRIBUTION", "SAMPLE_MEAN", r"표본평균|표본"),
        ("NORMAL_STANDARDIZATION", "NORMAL_STANDARD", r"표준정규|정규분포|표준화"),
    ],
    "ALG-SEQUENCE-RECURRENCE": [
        ("ARITHMETIC_GEOMETRIC_SUBSEQUENCE_CONSTRAINT", "ARITH_GEO_SUBSEQUENCE", r"등차수열.{0,120}등비수열|등비수열.{0,120}등차수열"),
        ("PARITY_RECURRENCE", "PARITY", r"홀수|짝수|\(\-1\)"),
        ("PERIODIC_RECURRENCE", "PERIODIC", r"주기|반복"),
        ("PIECEWISE_RECURRENCE", "PIECEWISE", r"경우|이면|구간"),
        ("FUNCTION_ITERATION", "FUNCTION_ITERATION", r"함수.*수열|합성"),
        ("LINEAR_RECURRENCE", "LINEAR", r"점화식|귀납적 정의|수열.*관계"),
    ],
    "ALG-SEQUENCE-SUM": [
        ("PARTIAL_SUM_TO_TERM", "PARTIAL_SUM", r"부분합|수열의 합과 일반항"),
        ("TELESCOPING_OR_SIGMA", "TELESCOPING", r"시그마|합을 계산|수열의 합"),
        ("ARITHMETIC_GEOMETRIC_SUM", "ARITH_GEO", r"등차수열|등비수열|공차|공비"),
        ("WEIGHTED_SEQUENCE_SUM", "WEIGHTED_SUM", r"가중|곱의 합|합의 값"),
    ],
    "ALG-TRIG-GEOMETRY": [
        ("SINE_LAW_CONFIGURATION", "SINE_LAW", r"사인법칙"),
        ("COSINE_LAW_CONFIGURATION", "COSINE_LAW", r"코사인법칙"),
        ("TRIANGLE_AREA_CONFIGURATION", "TRIANGLE_AREA", r"삼각형.*넓이|넓이"),
        ("CIRCLE_CHORD_CONFIGURATION", "CIRCLE_CHORD", r"원|현|접선"),
        ("MOVING_POINT_GEOMETRY", "MOVING_POINT", r"움직|점 [A-Z]"),
    ],
    "ALG-TRIG-GRAPH": [
        ("TRIG_ROOT_COUNT", "ROOT_COUNT", r"해의 개수|실근|교점|만나는 점"),
        ("TRIG_PERIOD_PHASE", "PERIOD_PHASE", r"주기|평행이동|위상"),
        ("TRIG_MAX_MIN", "MAX_MIN", r"최댓값|최솟값|최대|최소"),
        ("TRIG_EQUATION_PARAMETER", "EQUATION_PARAM", r"방정식|미지수|조건을 만족"),
    ],
    "ALG-EXP-LOG-GRAPH": [
        ("EXP_LOG_INTERSECTION_COUNT", "INTERSECTION", r"교점|만나는 점|실근|개수"),
        ("EXP_LOG_AREA", "AREA", r"넓이|정적분"),
        ("EXP_LOG_SYMMETRY_TRANSFORM", "SYMMETRY", r"대칭|평행이동|역함수"),
        ("EXP_LOG_INTEGER_LATTICE", "INTEGER_LATTICE", r"격자점|자연수|정수"),
    ],
    "ALG-EXP-LOG-EQUATION": [
        ("LOG_POWER_COUNT", "POWER_COUNT", r"거듭제곱|자연수인|개수"),
        ("EXP_LOG_ROOT_EQUATION", "ROOT_EQUATION", r"방정식|근|해"),
        ("EXP_LOG_INEQUALITY_INTEGER", "INEQUALITY_INTEGER", r"부등식|자연수|정수"),
        ("EXP_LOG_PARAMETER_BACKSOLVE", "PARAMETER", r"미지수|조건을 만족|값을 추론"),
    ],
    "C1-INTEGRAL-DEFINED": [
        ("FUNDAMENTAL_THEOREM_RECOVERY", "FTC_RECOVERY", r"미분하여|미적분의 기본정리|도함수"),
        ("INTEGRAL_FUNCTIONAL_EQUATION", "FUNCTIONAL_EQ", r"함수.*정적분|적분.*함수|함수방정식"),
        ("ABSOLUTE_PIECEWISE_INTEGRAL", "ABS_PIECEWISE", r"절댓값|구간|경우"),
        ("INTEGRAL_EXTREMUM", "EXTREMUM", r"최댓값|최솟값|극값"),
    ],
    "C1-INTEGRAL-AREA": [
        ("AREA_BETWEEN_CURVES", "BETWEEN_CURVES", r"두 곡선|곡선과 직선|넓이"),
        ("MOVING_BOUNDARY_AREA", "MOVING_BOUNDARY", r"움직|변하는|구간.*넓이"),
        ("ABSOLUTE_SIGNED_AREA", "ABS_SIGNED", r"절댓값|부호|넓이의 합"),
        ("INTEGRAL_EQUATION_PARAMETER", "INTEGRAL_EQ", r"정적분.*방정식|조건을 만족|미지수"),
    ],
    "C1-VELOCITY-DISTANCE": [
        ("TOTAL_DISTANCE_SIGN_SPLIT", "TOTAL_DISTANCE", r"움직인 거리|이동거리|거리"),
        ("DISPLACEMENT_INTEGRAL", "DISPLACEMENT", r"위치의 변화량|변위"),
        ("DIRECTION_CHANGE_TIME", "DIRECTION_CHANGE", r"운동 방향|방향을 바"),
        ("SPEED_ACCELERATION_VALUE", "SPEED_ACCEL", r"속력|가속도|속도"),
    ],
    "C1-DERIVATIVE-ROOTS": [
        ("DERIVATIVE_ROOT_COUNT", "ROOT_COUNT", r"실근|근의 개수|해의 개수"),
        ("TANGENCY_MULTIPLE_ROOT", "MULTIPLE_ROOT", r"중근|접하|접점"),
        ("DERIVATIVE_GRAPH_ROOTS", "DERIV_GRAPH", r"도함수의 그래프|그래프"),
        ("ROOT_PARAMETER_BACKSOLVE", "ROOT_PARAM", r"미지수|조건을 만족"),
    ],
    "C1-TANGENT-EXTREMA": [
        ("COMMON_OR_MOVING_TANGENT", "COMMON_TANGENT", r"공통접선|두 접선|접선"),
        ("EXTREMUM_VALUE_BACKSOLVE", "EXTREMUM", r"극댓값|극솟값|최댓값|최솟값|극값"),
        ("MONOTONICITY_INTERVAL", "MONOTONICITY", r"증가|감소|증감"),
        ("TANGENT_SLOPE_VALUE", "TANGENT_SLOPE", r"기울기|접선"),
    ],
    "C1-LIMIT-CONTINUITY": [
        ("POLYNOMIAL_FUNCTIONAL_EQUATION_LIMIT", "FUNCTIONAL_LIMIT", r"두 다항함수|다항함수.{0,80}lim"),
        ("PIECEWISE_CONTINUITY_MATCH", "PIECEWISE_CONT", r"구간|이면|연속"),
        ("DIFFERENTIABILITY_MATCH", "DIFFERENTIABLE", r"미분가능"),
        ("REMOVABLE_SINGULARITY", "REMOVABLE", r"불연속|극한.*함숫값|분모"),
        ("SEQUENCE_FUNCTION_LIMIT", "SEQUENCE_LIMIT", r"수열|무한대로|lim"),
    ],
    "C1-DERIVATIVE": [
        ("DISCRETE_DIFFERENCE_INEQUALITY_RECOVERY", "DISCRETE_DIFFERENCE", r"모든 정수.{0,100}최고차항|최고차항.{0,100}모든 정수"),
        ("INVERSE_FUNCTION_DERIVATIVE", "INVERSE_DER", r"역함수"),
        ("DERIVATIVE_FUNCTIONAL_EQUATION", "FUNCTIONAL_EQ", r"함수방정식|합성함수|함수.*도함수"),
        ("POLYNOMIAL_COEFFICIENT_RECOVERY", "COEFF_RECOVERY", r"다항함수|계수|삼차함수|사차함수"),
        ("INSTANTANEOUS_RATE", "RATE", r"변화율|속도|가속도"),
    ],
    "C1-SEQUENCE-LIMIT-SERIES": [
        ("GEOMETRIC_SERIES_CONVERGENCE", "GEOMETRIC_SERIES", r"등비급수|무한급수|급수"),
        ("SEQUENCE_LIMIT_RATIO", "SEQUENCE_LIMIT", r"수열의 극한|lim|무한대로"),
        ("RECURRENCE_LIMIT", "RECURRENCE_LIMIT", r"점화식|귀납적 정의"),
    ],
    "C1-TRANSCENDENTAL-DERIVATIVE": [
        ("PARAMETRIC_DIFFERENTIATION", "PARAMETRIC", r"매개변수"),
        ("INVERSE_COMPOSITE_DIFFERENTIATION", "INVERSE_COMPOSITE", r"역함수|합성함수"),
        ("TRIGONOMETRIC_DIFFERENTIATION", "TRIG_DERIVATIVE", r"삼각함수|sin|cos|tan"),
        ("EXP_LOG_DIFFERENTIATION", "EXP_LOG_DERIVATIVE", r"지수함수|로그함수|ln|e"),
    ],
    "C1-TRANSCENDENTAL-INTEGRAL": [
        ("INTEGRATION_BY_PARTS", "PARTS", r"부분적분"),
        ("SUBSTITUTION_INTEGRATION", "SUBSTITUTION", r"치환적분|치환"),
        ("TRANSCENDENTAL_AREA", "AREA", r"넓이|두 곡선"),
        ("EXP_LOG_TRIG_INTEGRAL", "EXP_LOG_TRIG", r"지수함수|로그함수|삼각함수|sin|cos|ln"),
    ],
    "C1-ADVANCED-CALCULUS-MIXED": [
        ("MIXED_LIMIT_DERIVATIVE", "LIMIT_DERIVATIVE", r"극한|미분"),
        ("MIXED_DERIVATIVE_INTEGRAL", "DERIVATIVE_INTEGRAL", r"미분|적분"),
    ],
    "CM2-COMPOSITION-INVERSE": [
        ("INVERSE_VALUE_CHAIN", "INVERSE_CHAIN", r"역함수"),
        ("COMPOSITION_CYCLE", "COMPOSITION_CYCLE", r"합성함수|합성"),
    ],
    "CM2-RATIONAL-RADICAL": [
        ("RATIONAL_ASYMPTOTE_TRANSFORM", "RATIONAL", r"유리함수|점근선"),
        ("RADICAL_DOMAIN_RANGE", "RADICAL", r"무리함수|정의역|치역"),
    ],
    "CM2-SETS-PROPOSITIONS": [
        ("NECESSARY_SUFFICIENT_SET", "NEC_SUFF", r"필요조건|충분조건|필요충분"),
        ("TRUTH_SET_COUNT", "TRUTH_SET", r"진리집합|명제"),
        ("SET_OPERATION_COUNT", "SET_OPERATION", r"합집합|교집합|부분집합|집합"),
    ],
    "CM2-COORDINATE-CIRCLE": [
        ("CIRCLE_LINE_TANGENCY", "CIRCLE_LINE", r"원|직선|접"),
    ],
    "CM1-EQUATION-INEQUALITY": [
        ("DISCRIMINANT_PARAMETER", "DISCRIMINANT", r"판별식|실근|부등식"),
    ],
    "FUNCTION-GRAPH-CONDITION": [
        ("GRAPH_INTERSECTION_COUNT", "INTERSECTION", r"교점|실근|해의 개수"),
        ("GRAPH_EXTREMUM_PARAMETER", "EXTREMUM", r"최댓값|최솟값|극값"),
        ("GRAPH_TRANSFORM_RECOVERY", "TRANSFORM", r"평행이동|대칭|그래프"),
    ],
}


# Formula glyphs are frequently absent from the official PDF text layer. These
# overrides are limited to representatives whose screenshots were opened and
# whose solver-defining formula could therefore be read directly.
MANUAL_EFFECTIVE_FAMILY_OVERRIDES: dict[str, str] = {
    "2023-07-EDUCATION_OFFICE-CALCULUS-Q29": "C1-ADVANCED-CALCULUS-MIXED",
    "2024-06-KICE-CALCULUS-Q29": "C1-TRANSCENDENTAL-DERIVATIVE",
    "2024-10-EDUCATION_OFFICE-CALCULUS-Q30": "C1-TRANSCENDENTAL-DERIVATIVE",
    "2026-06-KICE-CALCULUS-Q30": "C1-DERIVATIVE",
    "2023-10-EDUCATION_OFFICE-CALCULUS-Q29": "C1-GEOMETRIC-LIMIT",
    "2026-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q18": "ALG-EXP-LOG-EQUATION",
    "2024-07-EDUCATION_OFFICE-CALCULUS-Q30": "C1-TRANSCENDENTAL-INTEGRAL",
}


MANUAL_TARGET_CONTRACT_OVERRIDES: dict[str, str] = {
    "2024-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q21": "SCALAR_VALUE",
    "2020-07-EDUCATION_OFFICE-NA-Q30": "INTEGRAL_VALUE",
}


MANUAL_VARIANT_OVERRIDES: dict[str, str] = {
    "2024-10-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q29": "MONOTONE_UNIQUE_FIXED_POINT_FUNCTION",
    "2019-04-EDUCATION_OFFICE-NA-Q29": "INTEGER_PRODUCT_EXPONENT_DISTRIBUTION",
    "2023-07-EDUCATION_OFFICE-CALCULUS-Q29": "MIXED_DERIVATIVE_INTEGRAL",
    "2023-09-KICE-PROBABILITY_STATISTICS-Q29": "REPEATED_TRIAL_STATE_TRANSITION",
    "2026-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q29": "MOMENT_PARAMETER_CONSTRAINT",
    "2023-06-KICE-PROBABILITY_STATISTICS-Q30": "WEIGHTED_OUTCOME_ENUMERATION",
    "2025-06-KICE-PROBABILITY_STATISTICS-Q30": "LOCAL_INEQUALITY_MAPPING_COUNT",
    "2022-04-EDUCATION_OFFICE-CALCULUS-Q30": "MIXED_LIMIT_DERIVATIVE",
    "2026-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q30": "BINARY_ADJACENCY_SEQUENCE",
    "2016-06-KICE-GA-Q30": "SLIDING_INTEGRAL_SYMMETRY_RECOVERY",
    "2020-10-EDUCATION_OFFICE-NA-Q27": "POSITIVE_INTEGER_SUM_EXCLUSION",
    "2021-06-KICE-PROBABILITY_STATISTICS-Q29": "CIRCULAR_ADJACENCY_ARRANGEMENT",
    "2018-10-EDUCATION_OFFICE-NA-Q26": "MONOTONE_RANGE_CARDINALITY_FUNCTION",
    "2024-06-KICE-CALCULUS-Q29": "PIECEWISE_DIFFERENTIABILITY_MATCH",
    "2016-04-EDUCATION_OFFICE-GA-Q28": "INTEGER_SUM_RESIDUE_CONSTRAINT",
    "2025-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q21": "PIECEWISE_RECURRENCE",
    "2024-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q29": "MULTI_TYPE_DISTRIBUTION_LOWER_BOUND",
    "2022-10-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q30": "TRANSFER_STATE_PROBABILITY",
    "2024-09-KICE-PROBABILITY_STATISTICS-Q21": "DISCRETE_DIFFERENCE_INEQUALITY_RECOVERY",
    "2024-10-EDUCATION_OFFICE-CALCULUS-Q30": "DERIVATIVE_LEVEL_SET_ROOT_COUNT",
    "2024-05-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q20": "POLYNOMIAL_FUNCTIONAL_EQUATION_LIMIT",
    "2021-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q21": "ARITHMETIC_GEOMETRIC_SUBSEQUENCE_CONSTRAINT",
    "2021-04-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q29": "CIRCULAR_ADJACENCY_ARRANGEMENT",
    "2023-05-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q29": "FUNCTION_VALUE_SUM_CONSTRAINT",
    "2025-10-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q29": "COMPOSITION_IMAGE_CARDINALITY_MAPPING",
    "2023-09-KICE-PROBABILITY_STATISTICS-Q30": "ORDERED_PARITY_TUPLE_COUNT",
    "2026-06-KICE-CALCULUS-Q30": "COMPOSITE_DIFFERENTIABILITY_EXTREMA_RECOVERY",
    "2025-06-KICE-PROBABILITY_STATISTICS-Q29": "DICE_EVENT_UNION_ENUMERATION",
    "2024-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q21": "EXP_LOG_LINE_CIRCLE_PARAMETER",
    "2017-06-KICE-NA-Q28": "EVENT_CONDITION_HYPERGEOMETRIC",
    "2023-10-EDUCATION_OFFICE-CALCULUS-Q29": "GEOMETRIC_AREA_LIMIT",
    "2019-10-EDUCATION_OFFICE-GA-Q26": "CONFIDENCE_INTERVAL_PARAMETER_RECOVERY",
    "2026-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q18": "EXP_LOG_INEQUALITY_INTEGER",
    "2017-09-KICE-GA-Q28": "MULTI_SOURCE_ORDER_EVENT_CONDITIONAL",
    "2016-09-KICE-GA-Q28": "PROPORTION_CONFIDENCE_INTERVAL_SAMPLE_SIZE",
    "2024-07-EDUCATION_OFFICE-CALCULUS-Q30": "ABSOLUTE_EXP_LOG_INTEGRAL_EXTREMUM",
    "2020-07-EDUCATION_OFFICE-NA-Q30": "INTERVAL_EXTREMA_THRESHOLD_INTEGRAL",
    "2022-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q22": "ABSOLUTE_TANGENT_ROOT_RECOVERY",
}


# These labels can be triggered after the PDF text layer has dropped the
# solver-defining formula. They remain valid descriptive labels, but two such
# records are not allowed to share a solver without a manual screenshot rule.
NON_SHAREABLE_AUTOMATIC_VARIANTS = {
    "MAPPING_FUNCTION_COUNT",
    "DIFFERENTIABILITY_MATCH",
    "PSAXM_BASE",
}


HIGH_SIGNAL_CONDITIONS = {
    "INTEGER_OR_NATURAL_DOMAIN": "DISCRETE",
    "SET_OR_MAPPING": "SETMAP",
    "PIECEWISE_OR_ABSOLUTE": "PIECEWISE",
    "ROOT_OR_INTERSECTION_COUNT": "ROOTINT",
    "TANGENCY": "TANGENCY",
    "CONTINUITY_OR_DIFFERENTIABILITY": "CONTDIFF",
    "INVERSE_OR_COMPOSITION": "INVCOMP",
    "GEOMETRIC_CONFIGURATION": "GEOMETRY",
    "GRAPH_CONDITION": "GRAPH",
}


BRANCH_CODES = {
    "NO_EXPLICIT_CASE_SPLIT": "B0",
    "SINGLE_AXIS_CASE_SPLIT": "B1",
    "NESTED_OR_MULTI_AXIS_CASE_SPLIT": "BM",
}


# Audit crops opened at original resolution after the clustering rules were
# stabilized. Only the final high-difficulty pilot representatives are listed.
VISUALLY_REVIEWED_REPRESENTATIVES: set[str] = {
    "2020-09-KICE-GA-Q29",
    "2024-09-KICE-PROBABILITY_STATISTICS-Q30",
    "2020-10-EDUCATION_OFFICE-NA-Q27",
    "2016-04-EDUCATION_OFFICE-GA-Q28",
    "2021-04-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q29",
    "2021-07-EDUCATION_OFFICE-CALCULUS-Q29",
    "2016-03-EDUCATION_OFFICE-GA-Q27",
    "2023-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q19",
    "2026-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q30",
    "2024-07-EDUCATION_OFFICE-CALCULUS-Q30",
    "2020-07-EDUCATION_OFFICE-NA-Q30",
    "2022-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q22",
}


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def safe_text(value: str) -> str:
    safe = str(value or "").encode("utf-8", errors="replace").decode("utf-8")
    safe = re.sub(r"[\ue000-\uf8ff]", " ", safe)
    return re.sub(r"\s+", " ", safe).strip()


def stable_hash(value: str, length: int = 10) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:length].upper()


def canonical_hash(value: Any) -> str:
    serialized = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def slug(value: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "-", value.upper()).strip("-")


def load_intent_map() -> dict[tuple[str, int], str]:
    if not RAW_INTENTS_PATH.exists():
        return {}
    result: dict[tuple[str, int], str] = {}
    for form in load_json(RAW_INTENTS_PATH):
        url = form.get("solutionUrl", "")
        for question in form.get("questions", []):
            result[(url, int(question["questionNumber"]))] = safe_text(question.get("intent", ""))
    return result


EFFECTIVE_FAMILY_LABELS = {
    "PS-COUNTING": "순열·조합과 경우의 수",
    "PS-CONDITIONAL": "조건부확률·독립 사건 다단계 추론",
    "PS-PROBABILITY-AXIOMS": "확률의 덧셈정리·수학적 확률 조건 추론",
    "PS-RANDOM-VARIABLE": "확률변수의 평균·분산 조건 추론",
    "PS-NORMAL-SAMPLE": "정규분포·표본평균 조건 역산",
    "C1-SEQUENCE-LIMIT-SERIES": "수열의 극한·급수 조건 추론",
    "C1-TRANSCENDENTAL-DERIVATIVE": "지수·로그·삼각함수 미분 추론",
    "C1-TRANSCENDENTAL-INTEGRAL": "초월함수 적분·넓이 추론",
    "C1-ADVANCED-CALCULUS-MIXED": "미적분 선택과목 복합 추론",
    "C1-GEOMETRIC-LIMIT": "도형의 미소 변화와 극한 추론",
    "C1-INTEGRAL-DEFINED": "적분으로 정의된 함수의 조건 복원",
    "C1-INTEGRAL-AREA": "정적분·넓이·교점 조건 역문제",
    "C1-VELOCITY-DISTANCE": "속도 부호 변화와 이동거리 추론",
    "C1-DERIVATIVE-ROOTS": "도함수 그래프와 실근 개수 추론",
    "C1-TANGENT-EXTREMA": "접선·극값·증감 조건 결합",
    "C1-LIMIT-CONTINUITY": "극한·연속 조건의 미정계수 추론",
    "C1-DERIVATIVE": "미분 조건을 이용한 함수 복원",
    "ALG-SEQUENCE-RECURRENCE": "점화식·귀납 수열의 분기 추론",
    "ALG-SEQUENCE-SUM": "수열의 합과 일반항 역추적",
    "ALG-TRIG-GEOMETRY": "삼각함수와 도형 조건 결합",
    "ALG-TRIG-GRAPH": "삼각함수 그래프·주기·해 개수 추론",
    "ALG-EXP-LOG-GRAPH": "지수·로그 그래프와 정수 조건",
    "ALG-EXP-LOG-EQUATION": "지수·로그 방정식과 부등식 조건 추론",
    "CM2-COMPOSITION-INVERSE": "합성함수·역함수 조건 역추적",
    "CM2-RATIONAL-RADICAL": "유리·무리함수 그래프와 정수 조건",
    "CM2-SETS-PROPOSITIONS": "집합·명제의 필요충분조건 추론",
    "CM2-COORDINATE-CIRCLE": "좌표도형·원·직선의 위치 관계",
    "CM1-EQUATION-INEQUALITY": "방정식·부등식의 해 조건 결합",
    "FUNCTION-GRAPH-CONDITION": "함수 그래프와 조건 역추론",
}


def course_for_family(family_id: str, fallback_id: str, fallback_label: str) -> tuple[str, str]:
    if family_id.startswith("PS-"):
        return "probability-statistics", "확률과 통계"
    if family_id.startswith("C1-"):
        return "calculus-1", "미적분Ⅰ"
    if family_id.startswith("CM2-"):
        return "common-math-2", "공통수학Ⅱ"
    if family_id.startswith("CM1-"):
        return "common-math-1", "공통수학Ⅰ"
    if family_id.startswith("ALG-") or family_id == "FUNCTION-GRAPH-CONDITION":
        return "algebra", "대수"
    return fallback_id, fallback_label


def calculus_selection_family(problem_text: str, record: dict) -> str:
    text = safe_text(problem_text)
    target = record["decomposition"]["target"]["kind"]
    transcendental = bool(re.search(r"지수함수|로그함수|삼각함수|sin|cos|tan|ln|e\^", text, flags=re.IGNORECASE))
    has_limit = bool(re.search(r"극한|lim", text, flags=re.IGNORECASE))
    has_derivative = bool(re.search(r"도함수|미분|′|f'", text, flags=re.IGNORECASE))
    if re.search(r"급수|수열의 극한|무한수열|등비급수|수열", text, flags=re.IGNORECASE):
        return "C1-SEQUENCE-LIMIT-SERIES"
    if transcendental and has_limit and has_derivative:
        return "C1-ADVANCED-CALCULUS-MIXED"
    if re.search(r"정적분|부정적분|(?<!미)적분|넓이", text):
        if transcendental:
            return "C1-TRANSCENDENTAL-INTEGRAL"
        if re.search(r"적분으로 정의|정적분.*함수|함수.*정적분", text):
            return "C1-INTEGRAL-DEFINED"
        return "C1-INTEGRAL-AREA"
    if re.search(r"속도|가속도|움직인 거리|위치의 변화량|운동 방향", text):
        return "C1-VELOCITY-DISTANCE"
    if transcendental:
        return "C1-TRANSCENDENTAL-DERIVATIVE"
    if re.search(r"연속|미분가능|극한", text):
        return "C1-LIMIT-CONTINUITY"
    if re.search(r"실근|근의 개수|해의 개수", text):
        return "C1-DERIVATIVE-ROOTS"
    if re.search(r"접선|극댓값|극솟값|극대|극소|최댓값|최솟값|증가|감소", text):
        return "C1-TANGENT-EXTREMA"
    if re.search(r"도함수|미분|삼차함수|사차함수|다항함수", text):
        return "C1-DERIVATIVE"
    if target == "LIMIT_VALUE":
        return "C1-SEQUENCE-LIMIT-SERIES"
    if target in {"AREA", "INTEGRAL_VALUE", "DISTANCE_OR_LENGTH"}:
        return "C1-INTEGRAL-AREA"
    if target in {"EXTREMUM", "MAX_MIN_COMBINATION", "SLOPE"}:
        return "C1-TANGENT-EXTREMA"
    return "C1-ADVANCED-CALCULUS-MIXED"


def probability_selection_family(problem_text: str, record: dict) -> str:
    text = safe_text(problem_text)
    body = text.replace("확률과 통계", "")
    if re.search(r"정규분포|표준정규|표본평균|표본", text):
        return "PS-NORMAL-SAMPLE"
    if re.search(r"확률변수|확률분포|기댓값|평균|분산|표준편차|이항분포", text):
        return "PS-RANDOM-VARIABLE"
    if re.search(r"조건부확률|조건부 확률|독립", text):
        return "PS-CONDITIONAL"
    if record["decomposition"]["target"]["kind"] == "PROBABILITY" or re.search(
        r"여사건|합사건|교사건|확률(?:은|이|을|의 값)|시행", body
    ):
        return "PS-PROBABILITY-AXIOMS"
    return "PS-COUNTING"


def effective_curriculum(record: dict, problem_text: str, correction: dict | None = None) -> dict:
    original = record["curriculum"]
    snapshot = record["sourceSnapshot"]
    year = int(snapshot["year"])
    question_number = int(snapshot["questionNumber"])
    form = snapshot["form"]
    corrected_family = (correction or {}).get("resolution", {}).get("familyId")
    manual_family = corrected_family or MANUAL_EFFECTIVE_FAMILY_OVERRIDES.get(record["sourceId"])
    if manual_family:
        course_id, course_label = course_for_family(
            manual_family, original["courseId"], original["courseLabel"]
        )
        return {
            "courseId": course_id,
            "courseLabel": course_label,
            "familyId": manual_family,
            "familyLabel": EFFECTIVE_FAMILY_LABELS.get(manual_family, original["familyLabel"]),
            "basis": (
                "STAGE_6B_CONTRACT_CORRECTION"
                if correction and manual_family != original["familyId"]
                else "MANUAL_SCREENSHOT_AND_PROBLEM_PDF"
            ),
        }
    if year >= 2021 and question_number >= 29 and form == "CALCULUS":
        family = calculus_selection_family(problem_text, record)
        return {
            "courseId": "calculus-1",
            "courseLabel": "미적분Ⅰ",
            "familyId": family,
            "familyLabel": EFFECTIVE_FAMILY_LABELS[family],
            "basis": "SELECTION_FORM_AND_PROBLEM_PDF",
        }
    if year >= 2021 and question_number >= 29 and form == "PROBABILITY_STATISTICS":
        family = probability_selection_family(problem_text, record)
        return {
            "courseId": "probability-statistics",
            "courseLabel": "확률과 통계",
            "familyId": family,
            "familyLabel": EFFECTIVE_FAMILY_LABELS[family],
            "basis": "SELECTION_FORM_AND_PROBLEM_PDF",
        }
    return {**original, "basis": "STEP_2_CURRICULUM"}


def algorithm_variant(record: dict, evidence_text: str, curriculum: dict, target_contract: str) -> dict:
    family = curriculum["familyId"]
    if record["sourceId"] in MANUAL_VARIANT_OVERRIDES:
        return {
            "id": MANUAL_VARIANT_OVERRIDES[record["sourceId"]],
            "evidencePatternId": "MANUAL_SCREENSHOT_REVIEW",
            "confidence": "HIGH",
        }
    if family == "PS-COUNTING" and target_contract == "COEFFICIENT":
        return {"id": "BINOMIAL_COEFFICIENT", "evidencePatternId": "TARGET_COEFFICIENT", "confidence": "HIGH"}
    for variant_id, pattern_id, expression in VARIANT_RULES.get(family, []):
        if re.search(expression, evidence_text, flags=re.IGNORECASE):
            return {"id": variant_id, "evidencePatternId": pattern_id, "confidence": "HIGH"}
    fallback = f"{FAMILY_CODES.get(family, slug(family))}_BASE"
    return {"id": fallback, "evidencePatternId": "FAMILY_FALLBACK", "confidence": "MEDIUM" if evidence_text else "LOW"}


def condition_topology_from_items(items: list[dict]) -> str:
    kinds = {item["kind"] for item in items}
    codes = sorted({code for kind, code in HIGH_SIGNAL_CONDITIONS.items() if kind in kinds})
    return "+".join(codes) if codes else "BASE"


def condition_topology(record: dict) -> str:
    return condition_topology_from_items(record["decomposition"]["conditions"])


STRICT_CONDITION_RULES: list[tuple[str, str]] = [
    ("DISCRETE", r"자연수|정수"),
    ("MODULAR", r"나머지|나누어떨어|배수|약수"),
    ("SETMAP", r"집합|부분집합|대응|일대일|전단사"),
    ("PIECEWISE", r"절댓값|구간에 따라|이면"),
    ("ROOTINT", r"실근|근의 개수|교점|만나는 점"),
    ("TANGENCY", r"접선|접하"),
    ("CONTDIFF", r"연속|미분가능"),
    ("INVCOMP", r"역함수|합성함수"),
    ("GEOMETRY", r"삼각형|사각형|원의 |원과 |선분|각[A-Z]|좌표평면"),
    ("GRAPH", r"그래프"),
    ("INTEGRAL", r"정적분|부정적분|(?<!미)적분"),
    ("DERIVATIVE", r"도함수|미분|′|f'"),
    ("LIMIT", r"극한|lim"),
    ("TRIG", r"삼각함수|사인|코사인|sin|cos|tan"),
    ("MOMENT", r"확률변수|기댓값|평균|분산|표준편차|\bE\b"),
    ("PROBABILITY", r"확률|사건|시행"),
    ("ADJACENCY", r"이웃|인접|번째 자리|원형으로 배열"),
    ("SYMMETRY", r"대칭|주기|회전하여 일치"),
    ("EXTREMUM", r"극대|극소|최댓값|최솟값"),
    ("ORDER", r"부등식|이상|이하|초과|미만|대소 관계"),
]


OPERATION_TOPOLOGY_RULES: list[tuple[str, str]] = [
    ("ENUM", r"경우의 수|순열|조합|부분집합|배열"),
    ("MAP", r"함수|대응|일대일|전단사"),
    ("PARTITION", r"나누어|분배|분할|합이|곱이"),
    ("MODULAR", r"나머지|나누어떨어|배수|약수"),
    ("REPEAT", r"반복|시행"),
    ("MOMENT", r"확률변수|기댓값|평균|분산|표준편차|\bE\b"),
    ("DIFF", r"도함수|미분|′|f'"),
    ("INTEGRATE", r"정적분|부정적분|(?<!미)적분"),
    ("LIMIT", r"극한|lim"),
    ("ROOT", r"실근|근의 개수|교점|판별식"),
    ("EXTREMUM", r"극대|극소|최댓값|최솟값"),
    ("TRIG", r"삼각함수|사인|코사인|sin|cos|tan"),
    ("ABS", r"절댓값"),
    ("GRAPH", r"그래프"),
]


def strict_topology(text: str, rules: list[tuple[str, str]], fallback: str = "BASE") -> str:
    codes = sorted(code for code, expression in rules if re.search(expression, text, flags=re.IGNORECASE))
    return "+".join(codes) if codes else fallback


def visual_contract(record: dict) -> str:
    kinds = set(record["decomposition"]["visualization"].get("kinds", []))
    codes = []
    if "GEOMETRIC_DIAGRAM" in kinds:
        codes.append("GEO")
    if "FUNCTION_GRAPH" in kinds:
        codes.append("GRAPH")
    if "CASE_TABLE_OR_TREE" in kinds:
        codes.append("TABLE")
    if "SIGN_CHART_OR_NUMBER_LINE" in kinds:
        codes.append("SIGN")
    return "+".join(codes) if codes else "NONE"


def problem_visual_contract(problem_text: str) -> str:
    text = safe_text(problem_text)
    codes = []
    if re.search(r"그림", text) and re.search(r"삼각형|사각형|도형|원의 |원과 |선분|각[A-Z]|좌표평면", text):
        codes.append("GEO")
    if re.search(r"그래프|좌표평면", text):
        codes.append("GRAPH")
    if re.search(r"표를 이용|분포표|다음 표|아래 표", text):
        codes.append("TABLE")
    if re.search(r"원형으로 배열|원 모양|둥글러앉|개의 자리에|도로망|격자", text):
        codes.append("LAYOUT")
    return "+".join(sorted(set(codes))) if codes else "NONE"


def feature_contract(
    record: dict,
    problem_text: str,
    correction: dict | None = None,
    reconciliation: dict | None = None,
) -> dict:
    text = safe_text(problem_text)
    if not text:
        result = {
            "targetContract": record["decomposition"]["target"]["kind"],
            "branchKind": record["decomposition"]["branching"]["kind"],
            "conditionTopology": condition_topology(record),
            "visualContract": visual_contract(record),
            "operationTopology": "STEP2_FALLBACK",
            "basis": "STEP_2_DECOMPOSITION",
        }
    else:
        target = target_descriptor(record["sourceId"], text, "")
        if record["sourceId"] in MANUAL_TARGET_CONTRACT_OVERRIDES:
            target_kind = MANUAL_TARGET_CONTRACT_OVERRIDES[record["sourceId"]]
        elif target["kind"] == "UNRESOLVED_NUMERIC_TARGET":
            target_kind = record["decomposition"]["target"]["kind"]
        else:
            target_kind = target["kind"]
        branching = branch_descriptor(text, {})
        result = {
            "targetContract": target_kind,
            "branchKind": branching["kind"],
            "conditionTopology": strict_topology(text, STRICT_CONDITION_RULES),
            "visualContract": problem_visual_contract(text),
            "operationTopology": strict_topology(text, OPERATION_TOPOLOGY_RULES),
            "basis": "PROBLEM_PDF_REDECOMPOSITION",
        }
    if correction:
        resolution = correction["resolution"]
        changed_fields = []
        for field, resolution_key in [
            ("targetContract", "targetContract"),
            ("visualContract", "visualContract"),
        ]:
            if result[field] != resolution[resolution_key]:
                changed_fields.append(field)
            result[field] = resolution[resolution_key]
        result["stage6BCorrectionApplied"] = True
        result["stage6BCorrectedFields"] = changed_fields
    else:
        result["stage6BCorrectionApplied"] = False
        result["stage6BCorrectedFields"] = []
    if reconciliation:
        resolved = reconciliation["resolvedContract"]
        result["stage6B10TargetReconciled"] = result["targetContract"] != resolved["targetContract"]
        result["targetContract"] = resolved["targetContract"]
    else:
        result["stage6B10TargetReconciled"] = False
    return result


def compatibility(
    record: dict,
    evidence_text: str,
    curriculum: dict,
    features: dict,
    correction: dict | None = None,
    reconciliation: dict | None = None,
) -> dict:
    family = curriculum["familyId"]
    target = features["targetContract"]
    variant = algorithm_variant(record, evidence_text, curriculum, target)
    branch = BRANCH_CODES[features["branchKind"]]
    conditions = features["conditionTopology"]
    operations = features["operationTopology"]
    visual = features["visualContract"]
    grouping_discriminator = "SHARED"
    if (
        variant["evidencePatternId"] == "FAMILY_FALLBACK"
        or variant["id"] in NON_SHAREABLE_AUTOMATIC_VARIANTS
    ):
        grouping_discriminator = record["sourceId"]
    if correction and correction["resolution"]["groupingPolicy"] == "SOURCE_ISOLATED_UNTIL_GENERATOR_VALIDATED":
        grouping_discriminator = record["sourceId"]
    if reconciliation and reconciliation["resolvedContract"]["groupingPolicy"] == "SOURCE_ISOLATED_UNTIL_GENERATOR_VALIDATED":
        grouping_discriminator = record["sourceId"]
    solver_key = "::".join([
        family, variant["id"], target, branch, conditions, operations, grouping_discriminator
    ])
    structure_key = "::".join([solver_key, visual])
    family_code = FAMILY_CODES.get(family, slug(family))
    solver_id = f"SOL-{family_code}-{slug(variant['id'])}-{slug(target)}-{branch}-{stable_hash(solver_key, 8)}"
    structure_id = f"STR-{family_code}-{slug(variant['id'])}-{slug(target)}-{branch}-{slug(visual)}-{stable_hash(structure_key, 8)}"
    return {
        "familyId": family,
        "algorithmVariant": variant,
        "targetContract": target,
        "branchContract": branch,
        "conditionTopology": conditions,
        "operationTopology": operations,
        "groupingDiscriminator": grouping_discriminator,
        "visualContract": visual,
        "solverCompatibilityKey": solver_key,
        "structureCompatibilityKey": structure_key,
        "solverGroupId": solver_id,
        "canonicalStructureId": structure_id,
    }


def exact_rate(record: dict) -> float | None:
    value = record["difficulty"].get("correctRatePercent")
    return float(value) if value is not None else None


def difficulty_rank(record: dict) -> int:
    return {"KILLER": 0, "SEMI_KILLER": 1, "UPPER_GENERAL": 2, "GENERAL": 3, "BASIC_GENERAL": 4}.get(
        record["difficulty"]["difficultyClass"], 9
    )


def representative(group: list[dict]) -> dict:
    rates = [exact_rate(item["record"]) for item in group if exact_rate(item["record"]) is not None]
    median_target = sorted(rates)[len(rates) // 2] if rates else 50.0

    def score(item: dict) -> tuple:
        record = item["record"]
        evidence = record["evidence"]
        rate = exact_rate(record)
        return (
            evidence["problemScreenshot"]["status"] != "AVAILABLE",
            evidence["problemTextLayer"]["status"] != "EXTRACTED",
            evidence["officialSolution"]["status"] != "INTENT_SECTION_MATCHED",
            abs((rate if rate is not None else median_target) - median_target),
            -evidence["officialSolution"].get("solutionCharacterCount", 0),
            record["ledgerIndex"],
        )

    return min(group, key=score)


def cluster_priority(group: list[dict]) -> tuple:
    killer = sum(item["record"]["difficulty"]["difficultyClass"] == "KILLER" for item in group)
    semi = sum(item["record"]["difficulty"]["difficultyClass"] == "SEMI_KILLER" for item in group)
    rates = [exact_rate(item["record"]) for item in group if exact_rate(item["record"]) is not None]
    average_rate = mean(rates) if rates else 100.0
    return (-killer, -semi, -len(group), average_rate, group[0]["compatibility"]["canonicalStructureId"])


def cluster_record(group: list[dict], priority_rank: int) -> dict:
    compat = group[0]["compatibility"]
    rep = representative(group)
    ordered_by_rate = sorted(
        group,
        key=lambda item: (exact_rate(item["record"]) is None, exact_rate(item["record"]) or math.inf, item["record"]["ledgerIndex"]),
    )
    edge_ids = []
    for item in [ordered_by_rate[0], ordered_by_rate[-1]]:
        source_id = item["record"]["sourceId"]
        if source_id != rep["record"]["sourceId"] and source_id not in edge_ids:
            edge_ids.append(source_id)
    difficulty_counts = Counter(item["record"]["difficulty"]["difficultyClass"] for item in group)
    condition_counts = Counter(item["compatibility"]["conditionTopology"] for item in group)
    wave_counts = Counter(
        "WAVE_1_HIGH_DIFFICULTY" if item["record"]["difficulty"]["difficultyClass"] in {"KILLER", "SEMI_KILLER"}
        else "WAVE_2_UPPER_GENERAL" if item["record"]["difficulty"]["difficultyClass"] == "UPPER_GENERAL"
        else "WAVE_3_GENERAL_FOUNDATION"
        for item in group
    )
    rates = [exact_rate(item["record"]) for item in group if exact_rate(item["record"]) is not None]
    source_ids = [item["record"]["sourceId"] for item in sorted(group, key=lambda item: item["record"]["ledgerIndex"])]
    reviewed = rep["record"]["sourceId"] in VISUALLY_REVIEWED_REPRESENTATIVES
    corrected_items = [item for item in group if item.get("sourceCorrection")]
    reconciled_items = [item for item in group if item.get("transcriptionReconciliation")]
    correction_flag_counts = Counter(
        flag for item in corrected_items for flag in item["sourceCorrection"]["flags"]
    )
    return {
        "canonicalStructureId": compat["canonicalStructureId"],
        "solverGroupId": compat["solverGroupId"],
        "familyId": compat["familyId"],
        "algorithmVariant": compat["algorithmVariant"],
        "targetContract": compat["targetContract"],
        "branchContract": compat["branchContract"],
        "conditionTopologyCounts": dict(sorted(condition_counts.items())),
        "operationTopology": compat["operationTopology"],
        "groupingDiscriminator": compat["groupingDiscriminator"],
        "visualContract": compat["visualContract"],
        "priorityRank": priority_rank,
        "recordCount": len(group),
        "difficultyCounts": dict(sorted(difficulty_counts.items())),
        "implementationWaveCounts": dict(sorted(wave_counts.items())),
        "correctRateRangePercent": {
            "minimum": min(rates) if rates else None,
            "maximum": max(rates) if rates else None,
            "mean": round(mean(rates), 2) if rates else None,
        },
        "representativeSourceId": rep["record"]["sourceId"],
        "edgeSourceIds": edge_ids,
        "sourceIds": source_ids,
        "correctionAudit": {
            "applied": bool(corrected_items),
            "sourceCount": len(corrected_items),
            "sourceIds": [item["record"]["sourceId"] for item in corrected_items],
            "flagCounts": dict(sorted(correction_flag_counts.items())),
            "policy": "SOURCE_ISOLATED_UNTIL_GENERATOR_VALIDATED" if corrected_items else None,
        },
        "transcriptionAudit": {
            "applied": bool(reconciled_items),
            "sourceCount": len(reconciled_items),
            "sourceIds": [item["record"]["sourceId"] for item in reconciled_items],
            "targetContractPromotedCount": sum(
                "PROMOTE_SCREENSHOT_TRANSCRIBED_TARGET_CONTRACT" in item["transcriptionReconciliation"]["actions"]
                for item in reconciled_items
            ),
            "policy": "SCREENSHOT_TRANSCRIPTION_IS_TARGET_PROJECTION_SOURCE_OF_TRUTH" if reconciled_items else None,
        },
        "review": {
            "compatibilityContractVerified": True,
            "representativeScreenshotReviewed": reviewed,
            "status": "VISUALLY_REVIEWED" if reviewed else "CONTRACT_CANONICALIZED",
        },
    }


def make_assignment(item: dict) -> dict:
    record = item["record"]
    compat = item["compatibility"]
    effective = item["effectiveCurriculum"]
    features = item["featureContract"]
    original = record["curriculum"]
    correction = item.get("sourceCorrection")
    reconciliation = item.get("transcriptionReconciliation")
    return {
        "ledgerIndex": record["ledgerIndex"],
        "sourceId": record["sourceId"],
        "canonicalStructureId": compat["canonicalStructureId"],
        "solverGroupId": compat["solverGroupId"],
        "algorithmVariant": compat["algorithmVariant"],
        "targetContract": compat["targetContract"],
        "branchContract": compat["branchContract"],
        "conditionTopology": compat["conditionTopology"],
        "operationTopology": compat["operationTopology"],
        "solverGroupingDiscriminator": compat["groupingDiscriminator"],
        "visualContract": compat["visualContract"],
        "curriculumOriginal": original,
        "curriculumEffective": effective,
        "curriculumCorrectionApplied": (
            original["courseId"] != effective["courseId"] or original["familyId"] != effective["familyId"]
        ),
        "featureContractBasis": features["basis"],
        "featureCorrectionApplied": features["basis"] == "PROBLEM_PDF_REDECOMPOSITION",
        "contractCorrectionApplied": bool(correction),
        "contractCorrection": ({
            "flags": correction["flags"],
            "correctionHash": correction["recordHash"],
            "contextAugmentation": correction["resolution"]["contextAugmentation"],
            "priorIdentifiers": correction["priorIdentifiers"],
        } if correction else None),
        "transcriptionReconciliationApplied": bool(reconciliation),
        "transcriptionReconciliation": ({
            "actions": reconciliation["actions"],
            "reconciliationRecordHash": reconciliation["recordHash"],
            "transcriptionDigest": reconciliation["transcriptionDigest"],
        } if reconciliation else None),
        "sourceSnapshot": record["sourceSnapshot"],
        "difficulty": record["difficulty"],
    }


def build_report(payload: dict) -> str:
    summary = payload["summary"]
    lines = [
        "# PDF 스켈레톤 구현 3단계 - canonical structure 확정",
        "",
        f"- 배정 문항: {summary['assignmentCount']}개",
        f"- canonical structure: {summary['canonicalStructureCount']}개",
        f"- 독립 solver group: {summary['solverGroupCount']}개",
        f"- 문제 PDF·대표 캡처 기준 교과·계열 보정: {summary['curriculumCorrectionCount']}개",
        f"- 그중 2021년 이후 선택과목 29·30번: {summary['selectionCurriculumCorrectionCount']}개",
        f"- 문제 PDF 기준 목표값·조건·연산·분기·시각자료 재분해: {summary['problemPdfFeatureRedecompositionCount']}개",
        f"- 그중 2021년 이후 선택과목 29·30번: {summary['selectionFeatureRedecompositionCount']}개",
        f"- 6-B 전사 감사 교정 반영: {summary['contractCorrectionCount']}개 문항",
        f"- 교정 플래그: {summary['contractCorrectionFlagCounts']}",
        f"- 6-B-10 전사 계약 재연결: {summary['transcriptionReconciliationCount']}개 문항",
        f"- 캡처 전사 기준 목표값 정밀화: {summary['transcriptionTargetPromotionCount']}개 문항",
        f"- 2개 이상 문항을 공유하는 구조: {summary['multiRecordStructureCount']}개",
        f"- 단독 구조: {summary['singletonStructureCount']}개",
        f"- 수식 텍스트 손실로 자동 병합 금지: {summary['sourceIsolatedSolverCount']}개",
        f"- 상위 12개 파일럿 대표 화면 검토: {summary['visuallyReviewedRepresentativeCount']}개",
        f"- 3단계 콘텐츠 해시: `{payload['contentHash']}`",
        "",
        "## 동일 구조 판정 계약",
        "",
        "2021년 이후 선택과목 29·30번은 해설의 중복 번호를 신뢰하지 않고 문제 PDF 본문과 과목 형식으로 교과·계열을 다시 판정한다. 전체 문항도 문제 PDF 본문으로 목표값·조건·연산·분기·시각자료를 다시 분해한다. 교과 계열, 알고리즘 변형, 목표값, 분기 깊이, 조건 위상과 핵심 연산 조합이 모두 같은 문항만 solver group을 공유한다. 실제 문제에 필요한 시각자료 계약이 다르면 같은 solver라도 structureId를 분리한다. 수식 텍스트가 빠져 포괄 라벨이나 계열 fallback만 남은 문항은 자동 병합하지 않고 source별 독립 solver로 둔다.",
        "",
        "## 구조 규모",
        "",
        "| 구조당 문항 수 | 구조 수 |",
        "|---|---:|",
    ]
    for band, count in summary["structureSizeBands"].items():
        lines.append(f"| {band} | {count} |")
    lines.extend([
        "",
        "## 4단계 우선순위 상위 12개",
        "",
        "| 순위 | structureId | 문항 수 | 킬러 | 준킬러 | 대표 문항 |",
        "|---:|---|---:|---:|---:|---|",
    ])
    for cluster in payload["clusters"][:12]:
        counts = cluster["difficultyCounts"]
        lines.append(
            f"| {cluster['priorityRank']} | `{cluster['canonicalStructureId']}` | {cluster['recordCount']} | "
            f"{counts.get('KILLER', 0)} | {counts.get('SEMI_KILLER', 0)} | `{cluster['representativeSourceId']}` |"
        )
    lines.extend([
        "",
        "## 4단계 입력 계약",
        "",
        "- 각 structureId마다 매개변수 스키마, 허용 범위, 퇴화 조건과 독립 풀이기 검증 계약을 작성한다.",
        "- 우선순위 상위 12개는 5단계 JS 파일럿 대상으로 유지한다.",
        "- 원문 숫자만 바꾸는 방식이 아니라 동일 solver group의 불변량을 보존해야 한다.",
        "- 문제은행과 1대1 매치 런타임은 아직 변경하지 않는다.",
        "",
    ])
    return "\n".join(lines)


def main() -> None:
    decomposition = load_json(DECOMPOSITION_PATH)
    ledger = load_json(LEDGER_PATH)
    manifest = load_json(MANIFEST_PATH)
    intents = load_intent_map()
    corrections_payload = load_json(CORRECTIONS_PATH)
    corrections = {}
    for correction in corrections_payload["records"]:
        correction = {**correction, "recordHash": canonical_hash(correction)}
        corrections[correction["sourceId"]] = correction
    reconciliation_payload = load_json(RECONCILIATION_PATH)
    reconciliations = {}
    for reconciliation in reconciliation_payload["records"]:
        reconciliation = {**reconciliation, "recordHash": canonical_hash(reconciliation)}
        reconciliations[reconciliation["sourceId"]] = reconciliation
    problem_evidence = extract_problem_evidence(ledger["records"], manifest)
    enriched = []
    for record in decomposition["records"]:
        solution_url = record["evidence"]["officialSolution"]["sourceUrl"]
        question_number = int(record["sourceSnapshot"]["questionNumber"])
        intent = intents.get((solution_url, question_number), "")
        problem_text = problem_evidence.get(record["sourceId"], {}).get("scanText", "")
        source_correction = corrections.get(record["sourceId"])
        source_reconciliation = reconciliations.get(record["sourceId"])
        effective = effective_curriculum(record, problem_text, source_correction)
        features = feature_contract(record, problem_text, source_correction, source_reconciliation)
        # Prefer the exact problem PDF text for every record. The official
        # intent remains only as a fallback when that problem text is empty.
        evidence_text = problem_text if problem_text else intent
        enriched.append({
            "record": record,
            "sourceCorrection": source_correction,
            "transcriptionReconciliation": source_reconciliation,
            "effectiveCurriculum": effective,
            "featureContract": features,
            "compatibility": compatibility(
                record, evidence_text, effective, features, source_correction, source_reconciliation
            ),
        })

    by_structure: dict[str, list[dict]] = defaultdict(list)
    for item in enriched:
        by_structure[item["compatibility"]["canonicalStructureId"]].append(item)
    ordered_groups = sorted(by_structure.values(), key=cluster_priority)
    clusters = [cluster_record(group, index) for index, group in enumerate(ordered_groups, start=1)]
    assignments = [make_assignment(item) for item in sorted(enriched, key=lambda item: item["record"]["ledgerIndex"])]
    solver_groups = {item["solverGroupId"] for item in assignments}
    size_counts = Counter(cluster["recordCount"] for cluster in clusters)
    structure_size_bands = {
        "1": size_counts.get(1, 0),
        "2-3": sum(count for size, count in size_counts.items() if 2 <= size <= 3),
        "4-7": sum(count for size, count in size_counts.items() if 4 <= size <= 7),
        "8+": sum(count for size, count in size_counts.items() if size >= 8),
    }
    summary = {
        "assignmentCount": len(assignments),
        "canonicalStructureCount": len(clusters),
        "solverGroupCount": len(solver_groups),
        "multiRecordStructureCount": sum(cluster["recordCount"] >= 2 for cluster in clusters),
        "singletonStructureCount": sum(cluster["recordCount"] == 1 for cluster in clusters),
        "sourceIsolatedSolverCount": sum(
            item["solverGroupingDiscriminator"] != "SHARED" for item in assignments
        ),
        "visuallyReviewedRepresentativeCount": sum(cluster["review"]["representativeScreenshotReviewed"] for cluster in clusters),
        "curriculumCorrectionCount": sum(item["curriculumCorrectionApplied"] for item in assignments),
        "selectionCurriculumCorrectionCount": sum(
            item["curriculumCorrectionApplied"]
            and int(item["sourceSnapshot"]["year"]) >= 2021
            and int(item["sourceSnapshot"]["questionNumber"]) >= 29
            and item["sourceSnapshot"]["form"] in {"CALCULUS", "PROBABILITY_STATISTICS"}
            for item in assignments
        ),
        "problemPdfFeatureRedecompositionCount": sum(item["featureCorrectionApplied"] for item in assignments),
        "selectionFeatureRedecompositionCount": sum(
            item["featureCorrectionApplied"]
            and int(item["sourceSnapshot"]["year"]) >= 2021
            and int(item["sourceSnapshot"]["questionNumber"]) >= 29
            and item["sourceSnapshot"]["form"] in {"CALCULUS", "PROBABILITY_STATISTICS"}
            for item in assignments
        ),
        "problemTextEvidenceCount": len(problem_evidence),
        "contractCorrectionCount": sum(item["contractCorrectionApplied"] for item in assignments),
        "contractCorrectionFlagCounts": dict(sorted(Counter(
            flag
            for item in assignments if item["contractCorrectionApplied"]
            for flag in item["contractCorrection"]["flags"]
        ).items())),
        "transcriptionReconciliationCount": sum(item["transcriptionReconciliationApplied"] for item in assignments),
        "transcriptionTargetPromotionCount": sum(
            "PROMOTE_SCREENSHOT_TRANSCRIBED_TARGET_CONTRACT" in item["transcriptionReconciliation"]["actions"]
            for item in assignments if item["transcriptionReconciliationApplied"]
        ),
        "structureSizeBands": structure_size_bands,
        "byFamily": dict(sorted(Counter(cluster["familyId"] for cluster in clusters).items())),
    }
    content_hash = canonical_hash({"clusters": clusters, "assignments": assignments})
    payload = {
        "schemaVersion": "ARENA_PDF_CANONICAL_STRUCTURE_CATALOG_V1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceDecomposition": {
            "schemaVersion": decomposition["schemaVersion"],
            "contentHash": decomposition["contentHash"],
            "recordCount": len(decomposition["records"]),
        },
        "sourceCorrections": {
            "schemaVersion": corrections_payload["schemaVersion"],
            "correctionHash": corrections_payload["correctionHash"],
            "recordCount": len(corrections_payload["records"]),
        },
        "sourceTranscriptionReconciliation": {
            "schemaVersion": reconciliation_payload["schemaVersion"],
            "reconciliationHash": reconciliation_payload["reconciliationHash"],
            "recordCount": len(reconciliation_payload["records"]),
        },
        "compatibilityContract": {
            "solverGroupEqualFields": [
                "correctedFamilyId", "algorithmVariant", "targetContract", "branchContract",
                "conditionTopology", "operationTopology", "groupingDiscriminator"
            ],
            "canonicalStructureAdditionalEqualFields": ["visualContract"],
            "allowedDifferencesWithinStructure": [
                "source numbers", "coefficient values", "answer", "difficulty", "exam source"
            ],
            "falseMergePolicy": "Prefer a singleton or smaller cluster when official intent does not establish solver equivalence",
        "formulaLossPolicy": "Family fallbacks and broad automatic labels use a source-specific grouping discriminator",
            "stage6BCorrectionPolicy": "Audited family, target, visual, and context corrections reissue source-isolated identifiers until generator validation",
            "stage6B10TargetPolicy": "Screenshot-transcribed target projections supersede broad OCR-derived target labels for the 200 formula-loss sources",
        },
        "summary": summary,
        "contentHash": content_hash,
        "clusters": clusters,
        "assignments": assignments,
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    REPORT_PATH.write_text(build_report(payload), encoding="utf-8")
    print(f"wrote {OUTPUT_PATH}")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
