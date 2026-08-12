#!/usr/bin/env python3
"""Build stage-4 generator, degeneracy, solver, and verification contracts.

This is research tooling only. It converts every canonical stage-3 structure
into a typed implementation contract without changing the production problem
bank. The final top-12 pilot structures use manually reviewed screenshot
contracts; formula-loss structures remain explicitly transcription-gated.
"""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "dataAnalysis/arenaPdfSkeletonImplementation/canonical-structure-catalog-v1.json"
OUTPUT_PATH = ROOT / "dataAnalysis/arenaPdfSkeletonImplementation/structure-contracts-v1.json"
REPORT_PATH = ROOT / "dataAnalysis/arenaPdfSkeletonImplementation/step-4-structure-contracts.md"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def canonical_hash(value: Any) -> str:
    serialized = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def parameter(
    name: str,
    data_type: str,
    domain: str,
    role: str,
    mutable: bool = True,
) -> dict:
    return {
        "name": name,
        "dataType": data_type,
        "domain": domain,
        "role": role,
        "mutable": mutable,
    }


def rule(rule_id: str, predicate: str, rationale: str, origin: str = "FAMILY_TEMPLATE") -> dict:
    return {
        "id": rule_id,
        "predicate": predicate,
        "rationale": rationale,
        "origin": origin,
    }


def family_category(family_id: str) -> str:
    if family_id == "PS-COUNTING" or family_id == "CM2-SETS-PROPOSITIONS":
        return "COUNTING"
    if family_id.startswith("PS-"):
        return "PROBABILITY"
    if family_id.startswith("ALG-SEQUENCE"):
        return "SEQUENCE"
    if family_id in {"ALG-TRIG-GEOMETRY", "CM2-COORDINATE-CIRCLE", "C1-GEOMETRIC-LIMIT"}:
        return "GEOMETRY"
    if family_id.startswith("C1-"):
        return "CALCULUS"
    return "ALGEBRA_FUNCTION"


def base_parameters(category: str) -> list[dict]:
    if category == "COUNTING":
        return [
            parameter("universeSize", "INTEGER", "2..20", "base set or symbol count"),
            parameter("objectMultiplicity", "INTEGER_VECTOR", "each entry 0..20", "multiplicity by object type"),
            parameter("constraintThresholds", "INTEGER_VECTOR", "each entry -20..20", "counting restrictions"),
            parameter("equivalenceMode", "ENUM", "LABELED|UNLABELED|ROTATION", "quotient convention"),
        ]
    if category == "PROBABILITY":
        return [
            parameter("trialCount", "INTEGER", "1..12", "number of random transitions"),
            parameter("outcomeWeights", "POSITIVE_INTEGER_VECTOR", "length 2..12; gcd=1", "exact outcome weights"),
            parameter("eventThresholds", "INTEGER_VECTOR", "each entry -30..30", "event and conditioning bounds"),
            parameter("stateCount", "INTEGER", "2..30", "finite state-space size"),
        ]
    if category == "SEQUENCE":
        return [
            parameter("initialTerms", "RATIONAL_VECTOR", "length 1..4", "initial sequence state"),
            parameter("recurrenceCoefficients", "RATIONAL_VECTOR", "numerator/denominator abs <= 30", "recurrence law"),
            parameter("branchThresholds", "RATIONAL_VECTOR", "strictly ordered", "piecewise recurrence boundaries"),
            parameter("evaluationIndices", "INTEGER_VECTOR", "1..80", "requested term or sum positions"),
        ]
    if category == "GEOMETRY":
        return [
            parameter("lengthParameters", "POSITIVE_RATIONAL_VECTOR", "each entry 1/20..50", "geometric lengths"),
            parameter("angleParameters", "RATIONAL_PI_VECTOR", "each entry in (0,1)", "angles as multiples of pi"),
            parameter("coordinateParameters", "RATIONAL_VECTOR", "abs <= 50", "point and line coordinates"),
            parameter("incidencePattern", "ENUM", "fixed finite pattern", "diagram topology"),
        ]
    if category == "CALCULUS":
        return [
            parameter("coefficientVector", "RATIONAL_VECTOR", "length 2..8; abs numerator/denominator <= 30", "function coefficients"),
            parameter("breakpoints", "RATIONAL_VECTOR", "strictly ordered; abs <= 20", "piecewise boundaries"),
            parameter("evaluationPoints", "RATIONAL_VECTOR", "inside declared domain", "conditions and target points"),
            parameter("integralBounds", "RATIONAL_PAIR_VECTOR", "lower < upper", "definite integral intervals"),
        ]
    return [
        parameter("coefficientVector", "RATIONAL_VECTOR", "length 2..8; abs numerator/denominator <= 50", "algebraic coefficients"),
        parameter("domainBounds", "RATIONAL_VECTOR", "strictly ordered; abs <= 50", "equation or graph domain"),
        parameter("integerBounds", "INTEGER_PAIR", "-100 <= lower <= upper <= 100", "discrete search interval"),
        parameter("transformParameters", "RATIONAL_VECTOR", "abs <= 30", "shift, scale, or symmetry data"),
    ]


def variant_parameters(variant: str) -> list[dict]:
    name = variant.upper()
    result: list[dict] = []
    if "DISTRIBUTION" in name or "PARTITION" in name:
        result.extend([
            parameter("recipientCount", "INTEGER", "2..8", "number of labeled recipients"),
            parameter("recipientBounds", "INTEGER_PAIR_VECTOR", "0 <= lower <= upper", "per-recipient bounds"),
        ])
    if "CIRCULAR" in name:
        result.extend([
            parameter("distinguishedActors", "SYMBOL_VECTOR", "2..6 unique labels", "named adjacency actors", False),
            parameter("adjacencyRules", "RELATION_VECTOR", "nonempty", "required and forbidden neighbors", False),
        ])
    if "DIGIT" in name or "INTEGER_CONSTRUCTION" in name:
        result.extend([
            parameter("digitLengthBounds", "INTEGER_PAIR", "1 <= lower <= upper <= 8", "allowed digit length"),
            parameter("digitSum", "INTEGER", "1..60", "digit-sum condition"),
            parameter("terminalDigitClass", "ENUM", "ANY|ODD|EVEN|NONZERO", "last-digit restriction"),
        ])
    if "MAPPING" in name or "FUNCTION_COUNT" in name:
        result.extend([
            parameter("domainSize", "INTEGER", "2..12", "mapping domain cardinality"),
            parameter("codomainSize", "INTEGER", "2..12", "mapping codomain cardinality"),
            parameter("mappingRelations", "LINEAR_RELATION_VECTOR", "rank >= 1", "constraints on function values", False),
        ])
    if "SUM" in name or "TUPLE" in name:
        result.extend([
            parameter("tupleLength", "INTEGER", "2..10", "ordered tuple arity"),
            parameter("targetSum", "INTEGER", "2..100", "sum constraint"),
            parameter("excludedValues", "INTEGER_SET", "finite; within component domain", "forbidden component values"),
        ])
    if "RESIDUE" in name or "MODULAR" in name:
        result.extend([
            parameter("modulus", "INTEGER", "2..12", "modular base"),
            parameter("residueMultiplicity", "INTEGER_VECTOR", "nonnegative; sum=tupleLength", "required residue counts"),
        ])
    if "TRIAL" in name or "STATE" in name or "CONDITIONAL" in name:
        result.extend([
            parameter("transitionTable", "RATIONAL_MATRIX", "rows sum to 1", "finite-state transition law", False),
            parameter("conditionEvent", "STATE_PREDICATE", "positive probability", "conditioning event", False),
        ])
    if "NORMAL" in name or "CONFIDENCE" in name:
        result.extend([
            parameter("criticalZ", "POSITIVE_RATIONAL", "1..4", "normal critical value", False),
            parameter("sampleSize", "INTEGER", "4..10000", "sample size"),
            parameter("observedStatistic", "RATIONAL", "valid mean or proportion", "sample statistic"),
        ])
    if "INVERSE" in name or "COMPOSITE" in name:
        result.append(parameter("joinConditions", "VALUE_SLOPE_PAIR_VECTOR", "one pair per join", "value and derivative matching", False))
    if "TANGENT" in name:
        result.extend([
            parameter("tangentPoints", "RATIONAL_POINT_VECTOR", "distinct unless explicitly common", "tangency points"),
            parameter("tangentConstraints", "LINE_SLOPE_INTERCEPT_VECTOR", "finite exact rationals", "common tangent equations", False),
        ])
    if "INTEGRAL" in name:
        result.append(parameter("signBreakpoints", "ALGEBRAIC_NUMBER_VECTOR", "sorted and inside bounds", "piecewise integration splits", False))
    if "EXTREMA" in name or "EXTREMUM" in name:
        result.append(parameter("extremumConstraints", "POINT_TYPE_VECTOR", "MAX|MIN with exact point", "extremum conditions", False))
    if "EXP_LOG" in name:
        result.extend([
            parameter("logBases", "POSITIVE_RATIONAL_VECTOR", "each base > 0 and != 1", "logarithm bases"),
            parameter("logArgumentShifts", "RATIONAL_VECTOR", "domain remains nonempty", "log argument offsets"),
        ])
    return result


def deduplicate_parameters(items: list[dict]) -> list[dict]:
    result = []
    seen = set()
    for item in items:
        if item["name"] in seen:
            continue
        seen.add(item["name"])
        result.append(item)
    return result


def generic_invariants(cluster: dict, category: str) -> list[dict]:
    invariants = [
        rule("INV-TARGET", f"answer semantic remains {cluster['targetContract']}", "number changes must not change the requested quantity"),
        rule("INV-SOLVER", f"algorithm variant remains {cluster['algorithmVariant']['id']}", "preserve the independent solver"),
        rule("INV-BRANCH", f"branch contract remains {cluster['branchContract']}", "preserve intended case complexity"),
        rule("INV-VISUAL", f"visual contract remains {cluster['visualContract']}", "preserve required rendering structure"),
    ]
    if category == "COUNTING":
        invariants.append(rule("INV-COUNT-EQUIV", "label and equivalence conventions are fixed", "avoid factorial over/under-counting"))
    elif category == "PROBABILITY":
        invariants.append(rule("INV-PROB-MODEL", "sample space and conditioning semantics are fixed", "avoid changing the probability model"))
    elif category == "CALCULUS":
        invariants.append(rule("INV-CALC-SHAPE", "critical-point, root, and sign topology is unchanged", "preserve calculus reasoning"))
    return invariants


def generic_constraints(category: str, cluster: dict) -> list[dict]:
    constraints = [
        rule("CON-ANSWER-FORM", "projected answer is a nonnegative integer accepted by the short-answer UI", "runtime answer contract"),
        rule("CON-UNIQUE", "exact oracle returns exactly one projected answer", "exclude ambiguous instances"),
        rule("CON-BOUNDED", "all declared finite searches terminate within the complexity bound", "match-time latency"),
    ]
    if category == "COUNTING":
        constraints.extend([
            rule("CON-FEASIBLE", "feasible configuration count > 0", "avoid impossible questions"),
            rule("CON-EQUIVALENCE", "equivalence relation is explicit and internally consistent", "avoid rotation or label ambiguity"),
        ])
    elif category == "PROBABILITY":
        constraints.extend([
            rule("CON-WEIGHTS", "all outcome weights are positive integers and normalize exactly", "exact rational sample space"),
            rule("CON-CONDITION", "P(conditionEvent) > 0 whenever conditioning is used", "avoid zero denominator"),
        ])
    elif category == "SEQUENCE":
        constraints.extend([
            rule("CON-RECURRENCE", "every requested index has a defined predecessor path", "total recurrence"),
            rule("CON-SEQUENCE-UNIQUE", "conditions determine the requested terms uniquely", "avoid underdetermined sequences"),
        ])
    elif category == "GEOMETRY":
        constraints.extend([
            rule("CON-GEO-NONDEGENERATE", "all required lengths and areas are positive", "exclude collapsed diagrams"),
            rule("CON-GEO-INCIDENCE", "declared intersections and tangencies exist and are unique where required", "preserve incidence topology"),
        ])
    elif category == "CALCULUS":
        constraints.extend([
            rule("CON-DOMAIN", "every function, derivative, inverse, and integral is defined on its declared interval", "calculus domain safety"),
            rule("CON-TOPOLOGY", "ordered roots, critical points, and sign intervals match the source topology", "preserve solution branches"),
        ])
    else:
        constraints.extend([
            rule("CON-DOMAIN", "all logarithm, radical, and denominator domains are valid", "algebraic domain safety"),
            rule("CON-ROOT-COUNT", "equation and intersection counts match the structure contract", "preserve graph/equation topology"),
        ])
    if cluster["visualContract"] != "NONE":
        constraints.append(rule("CON-RENDER", "render model contains every required labeled visual primitive", "visual correctness"))
    return constraints


def generic_degeneracy_guards(category: str, cluster: dict) -> list[dict]:
    guards = [
        rule("DEG-NO-SOLUTION", "reject if exact oracle finds zero valid solutions", "invalid instance"),
        rule("DEG-MULTIPLE-ANSWER", "reject if valid derivations project to different answers", "ambiguous answer"),
        rule("DEG-TRIVIAL", "reject if target follows from one direct substitution or the condition set is redundant", "difficulty collapse"),
        rule("DEG-ANSWER-RANGE", "reject if projected answer is outside configured short-answer bounds", "UI compatibility"),
    ]
    if category == "COUNTING":
        guards.extend([
            rule("DEG-ALL-ALLOWED", "reject if every unconstrained arrangement is valid", "counting restriction vanished"),
            rule("DEG-EQUIV-COLLAPSE", "reject if quotient convention has no effect where it is intended", "symmetry reasoning vanished"),
        ])
    elif category == "PROBABILITY":
        guards.extend([
            rule("DEG-ZERO-CONDITION", "reject if conditioning denominator is zero", "undefined conditional probability"),
            rule("DEG-PROB-EXTREME", "reject if target probability is 0 or 1 unless source structure requires it", "probability reasoning collapse"),
        ])
    elif category in {"CALCULUS", "GEOMETRY", "ALGEBRA_FUNCTION"}:
        guards.extend([
            rule("DEG-COINCIDENT", "reject unintended coincident roots, joins, tangencies, or intersections", "topology collapse"),
            rule("DEG-DOMAIN-FAIL", "reject any domain boundary, zero denominator, or invalid inverse", "undefined expression"),
        ])
    else:
        guards.append(rule("DEG-PERIOD-COLLAPSE", "reject unintended constant, fixed-point, or period-one orbit", "sequence reasoning collapse"))
    return guards


def answer_projection(target: str, category: str) -> dict:
    if target == "PROBABILITY":
        return {
            "oracleType": "REDUCED_RATIONAL",
            "projection": "reduce q/p with gcd(p,q)=1, then return p+q unless the source declares a scale",
            "uiType": "NONNEGATIVE_INTEGER",
        }
    if target == "COUNT":
        return {"oracleType": "NONNEGATIVE_INTEGER", "projection": "identity", "uiType": "NONNEGATIVE_INTEGER"}
    return {
        "oracleType": "EXACT_RATIONAL_OR_ALGEBRAIC",
        "projection": "apply the source-declared integer scale or p+q transform exactly",
        "uiType": "NONNEGATIVE_INTEGER",
    }


def solver_method(category: str, variant: str) -> tuple[str, str, str]:
    if category == "COUNTING":
        return (
            "finite constrained enumeration or dynamic programming with exact integer counts",
            "independent brute-force enumeration on reduced parameter instances",
            "O(product of bounded state dimensions)",
        )
    if category == "PROBABILITY":
        return (
            "finite-state enumeration or transition DP with exact rational weights",
            "independent path enumeration and rational reduction",
            "O(trialCount * stateCount * outcomeAlphabetSize)",
        )
    if category == "SEQUENCE":
        return (
            "exact recurrence iteration with branch and invariant tracking",
            "independent symbolic recurrence expansion on reduced indices",
            "O(max evaluationIndex * branchCount)",
        )
    if category == "GEOMETRY":
        return (
            "exact coordinate/trigonometric reduction followed by symbolic solving",
            "high-precision numerical geometry residual check",
            "bounded symbolic system plus fixed-resolution diagram checks",
        )
    if category == "CALCULUS":
        return (
            "symbolic differentiation/integration with exact root and sign partitioning",
            "independent high-precision numerical residual and quadrature check",
            "bounded polynomial/transcendental root partitions",
        )
    return (
        "exact algebraic transformation with domain and root-count tracking",
        "independent substitution and high-precision residual check",
        "bounded symbolic system and finite integer scan",
    )


def generic_verification(category: str, status: str, visual: str) -> dict:
    sample_count = 1000 if status == "PILOT_READY_MANUAL" else 250 if status == "STRUCTURE_TEMPLATE_READY" else 0
    checks = [
        rule("VER-PARAM", "every sampled parameter satisfies its declared domain", "schema validation"),
        rule("VER-CONSTRAINT", "all invariants and constraints evaluate true before rendering", "generator validation"),
        rule("VER-ORACLE", "primary oracle and independent cross-check return the same exact answer", "answer correctness"),
        rule("VER-DEGENERACY", "no degeneracy guard fires", "difficulty and validity"),
        rule("VER-DETERMINISM", "same seed produces byte-stable normalized problem data and answer", "reproducibility"),
    ]
    if visual != "NONE":
        checks.append(rule("VER-RENDER", "all labels and primitives fit without clipping or overlap", "visual QA"))
    return {
        "requiredGeneratedSamples": sample_count,
        "requiredChecks": checks,
        "acceptanceCriteria": [
            "0 oracle disagreements",
            "0 invalid-domain instances",
            "0 ambiguous projected answers",
            "0 render-contract failures when visual output is required",
        ],
        "metamorphicRelations": [],
    }


def manual_parameter(name: str, data_type: str, domain: str, role: str, mutable: bool = True) -> dict:
    item = parameter(name, data_type, domain, role, mutable)
    item["origin"] = "MANUAL_SCREENSHOT_REVIEW"
    return item


PILOT_SPECS: dict[str, dict] = {
    "2020-09-KICE-GA-Q29": {
        "title": "두 색 공을 최소 수량 조건으로 세 상자에 분배",
        "parameters": [
            manual_parameter("whiteCount", "INTEGER", "3..12", "indistinguishable white balls"),
            manual_parameter("blackCount", "INTEGER", "3..12", "indistinguishable black balls"),
            manual_parameter("boxCount", "INTEGER", "3..5", "labeled boxes"),
            manual_parameter("minimumPerBox", "INTEGER", "1..floor((whiteCount+blackCount)/boxCount)", "total balls per box lower bound"),
        ],
        "invariants": [
            rule("P1-INV-COLOR", "balls are indistinguishable within each color and boxes are labeled", "source counting model", "MANUAL_SCREENSHOT_REVIEW"),
            rule("P1-INV-LOWER", "each box receives at least minimumPerBox balls", "source restriction", "MANUAL_SCREENSHOT_REVIEW"),
        ],
        "constraints": [
            rule("P1-CON-TOTAL", "whiteCount + blackCount >= boxCount * minimumPerBox", "nonempty feasible set", "MANUAL_SCREENSHOT_REVIEW"),
            rule("P1-CON-BRANCH", "at least two distinct per-box total profiles are feasible", "preserve multi-branch enumeration", "MANUAL_SCREENSHOT_REVIEW"),
        ],
        "degeneracy": [
            rule("P1-DEG-ONEPROFILE", "reject if only one total profile is feasible", "difficulty collapse", "MANUAL_SCREENSHOT_REVIEW"),
            rule("P1-DEG-COLORFREE", "reject if one color count is zero", "two-color reasoning disappears", "MANUAL_SCREENSHOT_REVIEW"),
        ],
        "method": "enumerate white and black composition vectors independently, pair vectors by per-box lower bounds, sum exact counts",
        "crossCheck": "direct enumeration of all bounded color-composition vector pairs",
        "metamorphic": ["swapping whiteCount and blackCount preserves the answer"],
    },
    "2024-09-KICE-PROBABILITY_STATISTICS-Q30": {
        "title": "두 색 공의 수령인별 상하한 분배",
        "parameters": [
            manual_parameter("colorCounts", "INTEGER_PAIR", "each 3..10", "indistinguishable balls by color"),
            manual_parameter("recipientLabels", "SYMBOL_VECTOR", "exactly 3 labels", "labeled students", False),
            manual_parameter("recipientTotalBounds", "INTEGER_PAIR_VECTOR", "0 <= lower <= upper", "student-specific total bounds"),
        ],
        "invariants": [rule("P2-INV-MODEL", "same-color balls are indistinguishable and recipients are labeled", "source model", "MANUAL_SCREENSHOT_REVIEW")],
        "constraints": [rule("P2-CON-FEASIBLE", "at least two recipient total profiles satisfy all bounds", "nontrivial distribution", "MANUAL_SCREENSHOT_REVIEW")],
        "degeneracy": [rule("P2-DEG-REDUNDANT", "reject if every recipient bound is redundant", "restriction collapse", "MANUAL_SCREENSHOT_REVIEW")],
        "method": "enumerate one bounded color-composition vector per color and test recipient total bounds",
        "crossCheck": "generating-function coefficient extraction over recipient/color variables",
        "metamorphic": ["permuting recipient labels together with their bounds preserves the answer"],
    },
    "2020-10-EDUCATION_OFFICE-NA-Q27": {
        "title": "양의 정수 순서쌍의 합과 제외값 조건",
        "parameters": [
            manual_parameter("tupleLength", "INTEGER", "3..6", "ordered positive tuple arity"),
            manual_parameter("targetSum", "INTEGER", "tupleLength+4..60", "fixed component sum"),
            manual_parameter("excludedValue", "INTEGER", "1..targetSum-tupleLength+1", "forbidden value for every component"),
        ],
        "invariants": [rule("P3-INV-ORDER", "tuples remain ordered and every component is positive", "source semantics", "MANUAL_SCREENSHOT_REVIEW")],
        "constraints": [rule("P3-CON-EXCLUSION", "both tuples containing and avoiding excludedValue exist", "inclusion-exclusion remains necessary", "MANUAL_SCREENSHOT_REVIEW")],
        "degeneracy": [rule("P3-DEG-VOID", "reject if excludedValue cannot occur under targetSum", "exclusion becomes redundant", "MANUAL_SCREENSHOT_REVIEW")],
        "method": "stars-and-bars total minus inclusion-exclusion over component positions fixed to excludedValue",
        "crossCheck": "bounded recursive enumeration of positive ordered tuples",
        "metamorphic": ["permuting component positions preserves the counted set size"],
    },
    "2016-04-EDUCATION_OFFICE-GA-Q28": {
        "title": "고정합 순서쌍의 나머지 개수 조건",
        "parameters": [
            manual_parameter("tupleLength", "INTEGER", "3..7", "ordered positive tuple arity"),
            manual_parameter("targetSum", "INTEGER", "tupleLength+5..80", "fixed sum"),
            manual_parameter("modulus", "INTEGER", "2..7", "residue modulus"),
            manual_parameter("residueMultiplicity", "INTEGER_VECTOR", "sum=tupleLength", "required component counts by residue"),
        ],
        "invariants": [rule("P4-INV-RESIDUE", "residueMultiplicity is imposed on positive ordered components", "source structure", "MANUAL_SCREENSHOT_REVIEW")],
        "constraints": [rule("P4-CON-MODSUM", "targetSum mod modulus equals weighted residue sum mod modulus", "modular feasibility", "MANUAL_SCREENSHOT_REVIEW")],
        "degeneracy": [rule("P4-DEG-PERM", "reject if only one residue ordering is possible", "permutation factor disappears", "MANUAL_SCREENSHOT_REVIEW")],
        "method": "enumerate residue-position assignments, transform to nonnegative quotient variables, and count fixed sums",
        "crossCheck": "direct positive-tuple enumeration within targetSum",
        "metamorphic": ["renaming tuple positions preserves the answer"],
    },
    "2021-04-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q29": {
        "title": "회전동치 원순열의 인접·비인접 조건",
        "parameters": [
            manual_parameter("maleCount", "INTEGER", "3..7", "distinct male students"),
            manual_parameter("femaleCount", "INTEGER", "3..7", "distinct female students"),
            manual_parameter("requiredAdjacentPair", "SYMBOL_PAIR", "two distinct actors", "must be adjacent", False),
            manual_parameter("forbiddenFemaleNeighborActor", "SYMBOL", "one distinguished actor", "cannot neighbor a female", False),
        ],
        "invariants": [rule("P5-INV-ROT", "rotations are equivalent and reflections are distinct", "source quotient", "MANUAL_SCREENSHOT_REVIEW")],
        "constraints": [rule("P5-CON-DISTINCT", "all actors are distinct and distinguished actors are different", "well-defined restrictions", "MANUAL_SCREENSHOT_REVIEW")],
        "degeneracy": [rule("P5-DEG-AUTO", "reject instances with additional rotational stabilizers", "quotient ambiguity", "MANUAL_SCREENSHOT_REVIEW")],
        "method": "fix one anchor to quotient rotations, enumerate remaining permutations, and test cyclic neighbor predicates",
        "crossCheck": "Burnside count over the full labeled circular action",
        "metamorphic": ["renaming non-distinguished actors within the same gender preserves the answer"],
    },
    "2021-07-EDUCATION_OFFICE-CALCULUS-Q29": {
        "title": "역함수 합성과 삼각 브리지의 미분가능성 매칭",
        "parameters": [
            manual_parameter("outerPolynomial", "POLYNOMIAL", "odd cubic with declared coefficients", "f", False),
            manual_parameter("inverseCubicCoefficients", "RATIONAL_VECTOR", "globally monotone cubic", "g", True),
            manual_parameter("joinPoints", "RATIONAL_PAIR", "fixed ordered pair", "piecewise joins", False),
            manual_parameter("bridgeAmplitude", "RATIONAL_PI_SCALE", "nonzero", "trigonometric middle branch"),
        ],
        "invariants": [
            rule("P6-INV-INVERSE", "g is globally one-to-one and has a differentiable inverse at both joins", "inverse branch validity", "MANUAL_SCREENSHOT_REVIEW"),
            rule("P6-INV-JOIN", "outer branches and bridge match value and first derivative at both joins", "source differentiability", "MANUAL_SCREENSHOT_REVIEW"),
        ],
        "constraints": [rule("P6-CON-UNIQUE", "join equations determine the requested coefficient combination uniquely", "well-posed inverse problem", "MANUAL_SCREENSHOT_REVIEW")],
        "degeneracy": [rule("P6-DEG-ZERODER", "reject if g' vanishes at an inverse evaluation point", "inverse derivative undefined", "MANUAL_SCREENSHOT_REVIEW")],
        "method": "apply inverse-function differentiation and solve the two value/slope matching systems exactly",
        "crossCheck": "substitute solved coefficients and numerically compare one-sided values and derivatives",
        "metamorphic": ["simultaneous algebraic simplification of equivalent coefficient forms preserves the answer"],
    },
    "2016-03-EDUCATION_OFFICE-GA-Q27": {
        "title": "자릿수 합과 홀짝 조건을 갖는 자연수 개수",
        "parameters": [
            manual_parameter("minimumDigits", "INTEGER", "2..4", "minimum digit length"),
            manual_parameter("maximumDigits", "INTEGER", "minimumDigits..7", "maximum digit length"),
            manual_parameter("digitSum", "INTEGER", "2..45", "required digit sum"),
            manual_parameter("parity", "ENUM", "ODD|EVEN", "number parity"),
        ],
        "invariants": [rule("P7-INV-LEAD", "leading digit is nonzero and parity is enforced by the final digit", "decimal semantics", "MANUAL_SCREENSHOT_REVIEW")],
        "constraints": [rule("P7-CON-FEASIBLE", "at least two digit lengths admit valid numbers", "multi-length counting", "MANUAL_SCREENSHOT_REVIEW")],
        "degeneracy": [rule("P7-DEG-LENGTH", "reject if only one digit length contributes", "source branch structure collapses", "MANUAL_SCREENSHOT_REVIEW")],
        "method": "digit DP by position, accumulated sum, started flag, and terminal parity",
        "crossCheck": "brute-force scan of the declared integer interval",
        "metamorphic": ["DP count equals the sum of independent fixed-length counts"],
    },
    "2023-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q19": {
        "title": "수직이동한 삼차곡선 사이의 공통접선 복원",
        "parameters": [
            manual_parameter("cubicLeadingCoefficient", "RATIONAL", "nonzero; abs <= 5", "shared cubic shape"),
            manual_parameter("baseVerticalShift", "RATIONAL", "abs <= 30", "first curve shift"),
            manual_parameter("knownTangencyX", "RATIONAL", "abs <= 10", "known tangent point"),
            manual_parameter("unknownVerticalShift", "RATIONAL", "positive after solving", "second curve shift"),
        ],
        "invariants": [rule("P8-INV-TANGENT", "both tangency points produce the identical slope and intercept", "common tangent", "MANUAL_SCREENSHOT_REVIEW")],
        "constraints": [rule("P8-CON-UNIQUE", "the positive unknownVerticalShift is unique", "single short answer", "MANUAL_SCREENSHOT_REVIEW")],
        "degeneracy": [rule("P8-DEG-SAMEPOINT", "reject if the two tangency points coincide", "translation reasoning disappears", "MANUAL_SCREENSHOT_REVIEW")],
        "method": "equate derivative slopes, then equate tangent-line intercepts and solve the vertical shift",
        "crossCheck": "substitute both tangency points into the recovered common line",
        "metamorphic": ["adding the same vertical constant to both curves preserves the relative shift"],
    },
    "2026-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q30": {
        "title": "조건부 종점이 있는 유한상태 주사위 보행",
        "parameters": [
            manual_parameter("trialCount", "INTEGER", "5..10", "number of dice transitions"),
            manual_parameter("stepMap", "INTEGER_VECTOR", "length 6; entries -2..2", "die-face displacement map"),
            manual_parameter("anchoredCoordinates", "INDEX_VALUE_MAP", "at least two distinct indices", "conditioned path coordinates"),
            manual_parameter("targetMaximum", "INTEGER", "within reachable coordinate range", "maximum event"),
        ],
        "invariants": [rule("P9-INV-PATH", "coordinate indices follow the source convention and maximum includes every declared a_n", "path semantics", "MANUAL_SCREENSHOT_REVIEW")],
        "constraints": [rule("P9-CON-COND", "anchoredCoordinates event has positive probability", "conditional probability denominator", "MANUAL_SCREENSHOT_REVIEW")],
        "degeneracy": [rule("P9-DEG-MAX", "reject if targetMaximum is forced or impossible under the anchors", "nontrivial conditional event", "MANUAL_SCREENSHOT_REVIEW")],
        "method": "enumerate or DP over (trial index, coordinate, running maximum), filter anchored coordinates, and reduce the exact ratio",
        "crossCheck": "full die-sequence enumeration for pilot-sized trialCount",
        "metamorphic": ["reflecting every step and anchor negates coordinates while preserving corresponding minimum-event probability"],
    },
    "2024-07-EDUCATION_OFFICE-CALCULUS-Q30": {
        "title": "절댓값 지수·로그 적분함수의 극값과 적분 역산",
        "parameters": [
            manual_parameter("extremumLocation", "LOG_RATIONAL", "positive", "declared extremum x"),
            manual_parameter("kernelOffset", "RATIONAL", "0 < a < 1", "a in ln(e^|t|-a)"),
            manual_parameter("valueRatio", "POSITIVE_RATIONAL", "2..12", "f(-u)=f(k)/ratio"),
            manual_parameter("answerScale", "POSITIVE_INTEGER", "10..1000", "integer projection scale", False),
        ],
        "invariants": [
            rule("P10-INV-KERNEL", "f'(x)=ln(e^|x|-a) and the declared extremum fixes a exactly", "fundamental theorem", "MANUAL_SCREENSHOT_REVIEW"),
            rule("P10-INV-SIGN", "absolute derivative is split at every zero before integration", "exact integral", "MANUAL_SCREENSHOT_REVIEW"),
        ],
        "constraints": [rule("P10-CON-DEN", "f(x)-f(-k) is nonzero on the open integration interval", "finite target integral", "MANUAL_SCREENSHOT_REVIEW")],
        "degeneracy": [rule("P10-DEG-K", "reject if k is nonpositive or not unique", "value-ratio inverse problem fails", "MANUAL_SCREENSHOT_REVIEW")],
        "method": "derive a from the extremum, solve the value-ratio equation for k, split signs, and integrate exactly",
        "crossCheck": "high-precision quadrature and residual checks for the extremum and ratio equations",
        "metamorphic": ["differentiating the recovered antiderivative reproduces the declared kernel away from x=0"],
    },
    "2020-07-EDUCATION_OFFICE-NA-Q30": {
        "title": "구간별 극값 임계함수의 적분",
        "parameters": [
            manual_parameter("quadraticMagnitude", "POSITIVE_RATIONAL", "1..10", "piecewise quadratic coefficient"),
            manual_parameter("linearParameter", "RATIONAL", "declared lower-bounded domain", "t in f_t"),
            manual_parameter("windowLength", "POSITIVE_RATIONAL", "1/2..3", "adjacent extremum windows"),
            manual_parameter("outerIntegralBounds", "RATIONAL_PAIR", "inside g domain", "integration interval"),
        ],
        "invariants": [rule("P11-INV-MIN", "g(t) is the minimum k satisfying both adjacent-window extremum conditions", "source definition", "MANUAL_SCREENSHOT_REVIEW")],
        "constraints": [rule("P11-CON-PIECE", "g(t) has at least two active algebraic branches on the outer integral interval", "piecewise reasoning", "MANUAL_SCREENSHOT_REVIEW")],
        "degeneracy": [rule("P11-DEG-CONST", "reject if g is constant on the full outer interval", "integral collapses", "MANUAL_SCREENSHOT_REVIEW")],
        "method": "derive interval extrema inequalities, solve the minimum feasible k piecewise in t, then integrate each branch exactly",
        "crossCheck": "grid-search the defining minimum and compare against the symbolic g(t) branches",
        "metamorphic": ["symbolic and sampled definitions of g(t) agree at every branch endpoint"],
    },
    "2022-07-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q22": {
        "title": "절댓값 삼차함수의 접선·실근 조건 복원",
        "parameters": [
            manual_parameter("cubicCoefficients", "RATIONAL_VECTOR", "leading coefficient nonzero", "unknown cubic f"),
            manual_parameter("originTangent", "LINE", "tangent to f at x=0", "g", False),
            manual_parameter("horizontalTangencyRoot", "RATIONAL", "nonzero", "k with h(k)=h'(k)=0"),
            manual_parameter("largestRoot", "RATIONAL", "greater than all other real roots", "largest h root"),
            manual_parameter("calibrationValue", "POINT_VALUE", "exact rational", "additional h value"),
        ],
        "invariants": [rule("P12-INV-ABS", "h=|f|+g is split at every real root of f before differentiating", "absolute-value topology", "MANUAL_SCREENSHOT_REVIEW")],
        "constraints": [rule("P12-CON-ROOTS", "the declared largest root and nonzero horizontal tangency root are unique", "well-posed cubic recovery", "MANUAL_SCREENSHOT_REVIEW")],
        "degeneracy": [rule("P12-DEG-MULT", "reject unintended repeated roots of f or h", "sign partition changes", "MANUAL_SCREENSHOT_REVIEW")],
        "method": "introduce cubic coefficients, impose tangent/value/root equations by sign branch, solve exactly, and verify root ordering",
        "crossCheck": "factor recovered f and h branches and numerically verify all real roots and tangencies",
        "metamorphic": ["substitution of the recovered coefficients satisfies every source condition exactly"],
    },
}


def contract_status(cluster: dict) -> tuple[str, list[str]]:
    source_id = cluster["representativeSourceId"]
    if source_id in PILOT_SPECS:
        return "PILOT_READY_MANUAL", ["representative screenshot reviewed", "source formula contract transcribed"]
    if cluster["groupingDiscriminator"] != "SHARED":
        return "FORMULA_TRANSCRIPTION_REQUIRED", ["source-specific isolation due to formula-text loss"]
    if cluster["recordCount"] >= 2 and cluster["algorithmVariant"]["confidence"] == "HIGH":
        return "STRUCTURE_TEMPLATE_READY", ["multi-source strong variant", "family contract assigned"]
    return "MANUAL_FORMULA_REVIEW_REQUIRED", ["family contract assigned", "exact formula topology not manually confirmed"]


def build_contract(cluster: dict) -> dict:
    category = family_category(cluster["familyId"])
    variant = cluster["algorithmVariant"]["id"]
    status, reasons = contract_status(cluster)
    parameters = deduplicate_parameters(base_parameters(category) + variant_parameters(variant))
    invariants = generic_invariants(cluster, category)
    constraints = generic_constraints(category, cluster)
    degeneracy = generic_degeneracy_guards(category, cluster)
    method, cross_check, complexity = solver_method(category, variant)
    verification = generic_verification(category, status, cluster["visualContract"])
    pilot = PILOT_SPECS.get(cluster["representativeSourceId"])
    title = f"{cluster['familyId']} / {variant}"
    if pilot:
        title = pilot["title"]
        parameters = pilot["parameters"]
        invariants = generic_invariants(cluster, category) + pilot["invariants"]
        constraints = generic_constraints(category, cluster) + pilot["constraints"]
        degeneracy = generic_degeneracy_guards(category, cluster) + pilot["degeneracy"]
        method = pilot["method"]
        cross_check = pilot["crossCheck"]
        verification["metamorphicRelations"] = pilot["metamorphic"]
    render_required = cluster["visualContract"] != "NONE"
    return {
        "contractId": f"CTR-{cluster['canonicalStructureId'][4:]}",
        "canonicalStructureId": cluster["canonicalStructureId"],
        "solverGroupId": cluster["solverGroupId"],
        "title": title,
        "status": status,
        "readinessReasons": reasons,
        "familyId": cluster["familyId"],
        "algorithmVariant": cluster["algorithmVariant"],
        "targetContract": cluster["targetContract"],
        "branchContract": cluster["branchContract"],
        "visualContract": cluster["visualContract"],
        "correctionAudit": cluster.get("correctionAudit", {
            "applied": False,
            "sourceCount": 0,
            "sourceIds": [],
            "flagCounts": {},
            "policy": None,
        }),
        "transcriptionAudit": cluster.get("transcriptionAudit", {
            "applied": False,
            "sourceCount": 0,
            "sourceIds": [],
            "targetContractPromotedCount": 0,
            "policy": None,
        }),
        "sourceCoverage": {
            "recordCount": cluster["recordCount"],
            "representativeSourceId": cluster["representativeSourceId"],
            "sourceIds": cluster["sourceIds"],
        },
        "parameterSchema": parameters,
        "invariants": invariants,
        "constraints": constraints,
        "degeneracyGuards": degeneracy,
        "solverContract": {
            "method": method,
            "arithmeticPolicy": "EXACT_FIRST_NO_FLOAT_DECISIONS",
            "inputParameters": [item["name"] for item in parameters],
            "outputContract": answer_projection(cluster["targetContract"], category),
            "independentCrossCheck": cross_check,
            "ambiguityPolicy": "reject unless exactly one projected answer remains",
            "complexityBound": complexity,
        },
        "verificationContract": verification,
        "renderContract": {
            "required": render_required,
            "visualMode": cluster["visualContract"],
            "mathRenderer": "KATEX_COMPATIBLE",
            "requiredElements": [
                "problem stem", "condition block", "answer prompt"
            ] + (["labeled visual primitives"] if render_required else []),
            "acceptance": "no clipping, overlap, missing label, or semantic mismatch",
            "representativeScreenshotReviewed": bool(cluster["review"]["representativeScreenshotReviewed"]),
        },
    }


def build_report(payload: dict) -> str:
    summary = payload["summary"]
    lines = [
        "# PDF 스켈레톤 구현 4단계 - 생성·솔버·검증 계약",
        "",
        f"- 계약 배정 구조: {summary['contractCount']}개",
        f"- 상위 12개 파일럿 수동 계약 완료: {summary['byStatus'].get('PILOT_READY_MANUAL', 0)}개",
        f"- 다문항 강한 구조 템플릿 준비: {summary['byStatus'].get('STRUCTURE_TEMPLATE_READY', 0)}개",
        f"- 수식 전사 필요: {summary['byStatus'].get('FORMULA_TRANSCRIPTION_REQUIRED', 0)}개",
        f"- 추가 수식 검토 필요: {summary['byStatus'].get('MANUAL_FORMULA_REVIEW_REQUIRED', 0)}개",
        f"- 6-B 전사 감사 교정 반영: {summary['correctedContractCount']}개 계약 / {summary['correctedSourceCount']}개 문항",
        f"- 6-B-10 전사 계약 재연결: {summary['reconciledContractCount']}개 계약 / 목표값 정밀화 {summary['targetPromotedContractCount']}개",
        f"- 4단계 콘텐츠 해시: `{payload['contentHash']}`",
        "",
        "## 계약 원칙",
        "",
        "모든 canonical structure에는 매개변수 타입과 도메인, 구조 불변량, 생성 제약, 퇴화 거부 조건, exact-first 독립 솔버, 교차검산 및 렌더 검증 계약을 배정했다. 수식 텍스트가 손실된 구조는 가족 템플릿만으로 구현 가능하다고 간주하지 않고 source별 수식 전사 게이트를 유지한다.",
        "",
        "## 5단계 파일럿 12개",
        "",
        "| 순위 | structureId | 수동 계약 | 대표 문항 |",
        "|---:|---|---|---|",
    ]
    for index, contract in enumerate(payload["contracts"][:12], start=1):
        lines.append(
            f"| {index} | `{contract['canonicalStructureId']}` | `{contract['status']}` | "
            f"`{contract['sourceCoverage']['representativeSourceId']}` |"
        )
    lines.extend([
        "",
        "## 5단계 진입 조건",
        "",
        "- 상위 12개만 우선 JS 생성기와 독립 솔버로 구현한다.",
        "- 각 파일럿은 최소 1,000개 seed에서 exact oracle과 교차검산이 모두 일치해야 한다.",
        "- 퇴화 거부율, 정답 분포, 렌더 결과를 기록하고 난이도 보정 전까지 운영 풀에 연결하지 않는다.",
        "- 나머지 구조는 `FORMULA_TRANSCRIPTION_REQUIRED`와 `MANUAL_FORMULA_REVIEW_REQUIRED`를 먼저 해소한다.",
        "- 문제은행과 1대1 매치 런타임은 아직 변경하지 않는다.",
        "",
    ])
    return "\n".join(lines)


def main() -> None:
    catalog = load_json(CATALOG_PATH)
    contracts = [build_contract(cluster) for cluster in catalog["clusters"]]
    by_status = dict(sorted(Counter(item["status"] for item in contracts).items()))
    by_category = dict(sorted(Counter(family_category(item["familyId"]) for item in contracts).items()))
    summary = {
        "contractCount": len(contracts),
        "byStatus": by_status,
        "byCategory": by_category,
        "pilotRequiredSamples": sum(
            item["verificationContract"]["requiredGeneratedSamples"]
            for item in contracts if item["status"] == "PILOT_READY_MANUAL"
        ),
        "renderRequiredCount": sum(item["renderContract"]["required"] for item in contracts),
        "correctedContractCount": sum(item["correctionAudit"]["applied"] for item in contracts),
        "correctedSourceCount": sum(item["correctionAudit"]["sourceCount"] for item in contracts),
        "reconciledContractCount": sum(item["transcriptionAudit"]["applied"] for item in contracts),
        "targetPromotedContractCount": sum(item["transcriptionAudit"]["targetContractPromotedCount"] for item in contracts),
        "allHaveIndependentCrossCheck": all(bool(item["solverContract"]["independentCrossCheck"]) for item in contracts),
    }
    content_hash = canonical_hash(contracts)
    payload = {
        "schemaVersion": "ARENA_PDF_STRUCTURE_CONTRACTS_V1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceCatalog": {
            "schemaVersion": catalog["schemaVersion"],
            "contentHash": catalog["contentHash"],
            "structureCount": len(catalog["clusters"]),
        },
        "sourceCorrections": catalog.get("sourceCorrections"),
        "sourceTranscriptionReconciliation": catalog.get("sourceTranscriptionReconciliation"),
        "contractPolicy": {
            "productionRuntimeModified": False,
            "verbatimProblemTextStored": False,
            "arithmetic": "exact rational, integer, symbolic, or algebraic decisions before numerical checks",
            "formulaLoss": "never promote to implementation-ready without screenshot transcription",
            "pilotScope": "top 12 stage-3 priority structures only",
        },
        "summary": summary,
        "contentHash": content_hash,
        "contracts": contracts,
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    REPORT_PATH.write_text(build_report(payload), encoding="utf-8")
    print(f"wrote {OUTPUT_PATH}")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
