#!/usr/bin/env python3
"""Compile 200 verified transcriptions into isolated generator blueprints.

The output is an implementation queue, not a production problem bank. Numeric
literals are only mutation candidates until a hand-authored generator rule and
two independent oracles have passed stage 6-C validation.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "dataAnalysis/arenaPdfSkeletonImplementation"
VERIFICATION_PATH = DATA_DIR / "formula-transcription-verification-v1.json"
CATALOG_PATH = DATA_DIR / "canonical-structure-catalog-v1.json"
CONTRACTS_PATH = DATA_DIR / "structure-contracts-v1.json"
OUTPUT_PATH = DATA_DIR / "generator-blueprints-v1.json"
REPORT_PATH = DATA_DIR / "step-6c1-generator-blueprints.md"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def canonical_hash(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def slug(value: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "-", value.upper()).strip("-")


def load_transcriptions() -> dict[str, dict]:
    result = {}
    for path in sorted(DATA_DIR.glob("formula-transcriptions-batch-6b*.json")):
        payload = load_json(path)
        for item in payload["records"]:
            if item["sourceId"] in result:
                raise AssertionError(f"duplicate transcription: {item['sourceId']}")
            result[item["sourceId"]] = {**item, "batchId": path.stem}
    return result


def literal_role(expression: str, start: int, end: int) -> str:
    before = expression[max(0, start - 12):start]
    after = expression[end:min(len(expression), end + 12)]
    if re.search(r"\\frac\{[^{}]*$", before) or re.match(r"^\}\{", after):
        return "RATIONAL_COMPONENT"
    if before.endswith("^") or before.endswith("^{"):
        return "EXPONENT_OR_POWER"
    if before.endswith("_") or before.endswith("_{"):
        return "INDEX_OR_SUBSCRIPT"
    if re.search(r"(?:<=|>=|<|>|\\le|\\ge)\s*$", before):
        return "DOMAIN_OR_BOUND"
    if re.match(r"\s*[A-Za-z\\]", after):
        return "COEFFICIENT_OR_SCALE"
    return "SCALAR_CONSTANT"


def numeric_candidates(givens: list[str], target: str) -> list[dict]:
    candidates = []
    ordinal = 0
    for field, expressions in [("GIVEN", givens), ("TARGET", [target])]:
        for expression_index, expression in enumerate(expressions):
            for match in re.finditer(r"-?\d+", expression):
                ordinal += 1
                role = literal_role(expression, match.start(), match.end())
                candidates.append({
                    "id": f"N{ordinal}",
                    "field": field,
                    "expressionIndex": expression_index,
                    "literal": match.group(0),
                    "role": role,
                    "sourceKind": "DIGIT_LITERAL",
                    "mutationStatus": "REQUIRES_MANUAL_DOMAIN_AND_INVARIANT_RULE",
                })
            for match in re.finditer(
                r"\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b",
                expression,
                flags=re.IGNORECASE,
            ):
                ordinal += 1
                candidates.append({
                    "id": f"N{ordinal}",
                    "field": field,
                    "expressionIndex": expression_index,
                    "literal": match.group(0).lower(),
                    "role": "TEXTUAL_CARDINAL",
                    "sourceKind": "TEXTUAL_NUMBER_WORD",
                    "mutationStatus": "REQUIRES_MANUAL_DOMAIN_AND_INVARIANT_RULE",
                })
    return candidates


def solver_route(family_id: str) -> tuple[str, str]:
    if family_id == "PS-COUNTING" or family_id == "CM2-SETS-PROPOSITIONS":
        return "EXACT_FINITE_ENUMERATION_OR_DP", "INDEPENDENT_BRUTE_FORCE_ENUMERATION"
    if family_id.startswith("PS-"):
        return "EXACT_RATIONAL_STATE_ENUMERATION", "INDEPENDENT_SAMPLE_SPACE_OR_TRANSITION_ENUMERATION"
    if family_id.startswith("ALG-SEQUENCE"):
        return "EXACT_RECURRENCE_OR_CLOSED_FORM", "INDEPENDENT_TERM_ITERATION"
    if family_id in {"ALG-TRIG-GEOMETRY", "CM2-COORDINATE-CIRCLE"}:
        return "EXACT_COORDINATE_TRIG_REDUCTION", "HIGH_PRECISION_GEOMETRY_RESIDUAL"
    if family_id.startswith("C1-"):
        return "SYMBOLIC_CALCULUS_EXACT_FIRST", "INDEPENDENT_NUMERICAL_OR_ALGEBRAIC_RESIDUAL"
    return "SYMBOLIC_ALGEBRA_EXACT_FIRST", "INDEPENDENT_SUBSTITUTION_OR_BOUNDED_ENUMERATION"


def answer_projection(target: str) -> str:
    if target == "REDUCED_RATIONAL_COMPONENT_SUM":
        return "REDUCE_POSITIVE_RATIONAL_THEN_SUM_DECLARED_COMPONENTS"
    if target.startswith("SCALED_"):
        return "APPLY_SOURCE_DECLARED_INTEGER_SCALE_EXACTLY"
    if target in {"COUNT", "SUM_OF_COUNTS", "COUNT_SUM", "SUM_OF_INTEGER_SOLUTIONS"}:
        return "NONNEGATIVE_INTEGER_IDENTITY"
    if target in {"SUM", "SUM_OF_PARAMETERS", "ALGEBRAIC_COEFFICIENT_SUM", "INTEGER_QUADRATIC_SUM"}:
        return "EXACT_SUM_THEN_INTEGER_PROJECTION"
    if target in {"PRODUCT", "PRODUCT_OF_PARAMETERS", "PRODUCT_OF_SET_ELEMENTS"}:
        return "EXACT_PRODUCT_THEN_INTEGER_PROJECTION"
    return "SOURCE_DECLARED_EXACT_INTEGER_PROJECTION"


def render_route(visual: str) -> str:
    if visual == "NONE":
        return "KATEX_TEXT_ONLY"
    if visual == "GRAPH":
        return "KATEX_PLUS_DETERMINISTIC_SVG_GRAPH"
    if visual == "GEO":
        return "KATEX_PLUS_DETERMINISTIC_SVG_GEOMETRY"
    if visual == "GEO+GRAPH":
        return "KATEX_PLUS_COMPOSITE_SVG_GEOMETRY_GRAPH"
    if visual == "LAYOUT":
        return "KATEX_PLUS_DETERMINISTIC_LAYOUT_DIAGRAM"
    return "MANUAL_VISUAL_RENDERER_REQUIRED"


def implementation_wave(family_id: str, visual: str) -> str:
    if visual != "NONE":
        return "6C-WAVE-3-VISUAL"
    if family_id.startswith("PS-") or family_id.startswith("ALG-SEQUENCE") or family_id == "CM2-SETS-PROPOSITIONS":
        return "6C-WAVE-1-DISCRETE-EXACT"
    return "6C-WAVE-2-SYMBOLIC-TEXT"


def formula_signature(item: dict) -> str:
    normalized = {
        "givens": [re.sub(r"\s+", "", value) for value in item["givensTeX"]],
        "target": re.sub(r"\s+", "", item["targetTeX"]),
    }
    return canonical_hash(normalized)


def build_report(payload: dict) -> str:
    summary = payload["summary"]
    lines = [
        "# PDF 스켈레톤 구현 6-C-1 - 생성기 입력 계약",
        "",
        f"- 입력 전사 문항: {summary['blueprintCount']}개",
        f"- 숫자 변경 후보 추출 완료: {summary['candidateExtractionCompleteCount']}개",
        f"- 자동 추출 숫자 후보: {summary['numericCandidateCount']}개",
        f"- 자동 후보가 없어 수동 매개변수 지정 필요: {summary['manualParameterDiscoveryCount']}개",
        f"- 텍스트 전용 렌더: {summary['textOnlyRenderCount']}개",
        f"- 시각자료 렌더 필요: {summary['visualRenderCount']}개",
        f"- 동일 수식 중복 후보 그룹: {summary['duplicateFormulaGroupCount']}개",
        f"- 운영 연결: {str(summary['productionConnected']).lower()}",
        f"- 블루프린트 해시: `{payload['contentHash']}`",
        "",
        "## 구현 파동",
        "",
        "| 파동 | 문항 | 범위 |",
        "|---|---:|---|",
    ]
    descriptions = {
        "6C-WAVE-1-DISCRETE-EXACT": "경우의 수·확률·수열: 정수/유리수 완전탐색과 DP부터 구현",
        "6C-WAVE-2-SYMBOLIC-TEXT": "대수·미적분 텍스트형: exact-first 식 변형과 독립 잔차 검산",
        "6C-WAVE-3-VISUAL": "그래프·도형·배치도: solver 검증 후 결정적 SVG 렌더 추가",
    }
    for wave, count in summary["byImplementationWave"].items():
        lines.append(f"| `{wave}` | {count} | {descriptions[wave]} |")
    lines.extend([
        "",
        "## 중요한 제한",
        "",
        "숫자 리터럴을 찾았다고 바로 바꾸지 않는다. 각 후보는 문항별 생성기에서 허용 범위, 정수성, 유일해, 분기 위상, 난이도 퇴화 조건을 수동으로 명시해야 한다. 주 솔버와 독립 검산기가 일치하고 답이 1~999 범위에 들어온 seed만 렌더 단계로 보낸다.",
        "",
        "## 다음 작업",
        "",
        "6-C-2에서 1차 파동부터 문항별 생성 규칙을 작성한다. 기존 32종 파일럿 런타임을 공통 exact 연산 라이브러리로만 재사용하며, 운영 1대1 매치와 문제은행에서는 import하지 않는다.",
        "",
    ])
    return "\n".join(lines)


def main() -> None:
    verification = load_json(VERIFICATION_PATH)
    catalog = load_json(CATALOG_PATH)
    contracts = load_json(CONTRACTS_PATH)
    transcriptions = load_transcriptions()
    assignments = {item["sourceId"]: item for item in catalog["assignments"]}
    contract_by_source: dict[str, dict] = {}
    for contract in contracts["contracts"]:
        for source_id in contract["sourceCoverage"]["sourceIds"]:
            contract_by_source[source_id] = contract

    formula_groups: dict[str, list[str]] = defaultdict(list)
    signatures = {}
    for source_id, item in transcriptions.items():
        signature = formula_signature(item)
        signatures[source_id] = signature
        formula_groups[signature].append(source_id)

    blueprints = []
    for verified in sorted(verification["records"], key=lambda item: item["ledgerIndex"]):
        source_id = verified["sourceId"]
        source = transcriptions[source_id]
        assignment = assignments[source_id]
        contract = contract_by_source[source_id]
        assert verified["status"] == "VERIFIED_PENDING_GENERATOR_CONTRACT", source_id
        assert verified["canonicalStructureId"] == assignment["canonicalStructureId"], source_id
        assert source["contractId"] == contract["contractId"], source_id
        candidates = numeric_candidates(source["givensTeX"], source["targetTeX"])
        primary_solver, independent_solver = solver_route(verified["familyId"])
        wave = implementation_wave(verified["familyId"], verified["visualContract"])
        duplicate_sources = formula_groups[signatures[source_id]]
        blueprints.append({
            "generatorContractId": f"GEN-{assignment['canonicalStructureId'][4:]}",
            "sourceId": source_id,
            "ledgerIndex": verified["ledgerIndex"],
            "canonicalStructureId": assignment["canonicalStructureId"],
            "solverGroupId": assignment["solverGroupId"],
            "structureContractId": contract["contractId"],
            "transcriptionReference": {
                "batchId": source["batchId"],
                "transcriptionDigest": verified["transcriptionDigest"],
                "cropPath": source["cropPath"],
            },
            "semanticContract": {
                "familyId": verified["familyId"],
                "algorithmVariant": assignment["algorithmVariant"],
                "targetContract": verified["targetContract"],
                "answerProjection": answer_projection(verified["targetContract"]),
                "branchContract": assignment["branchContract"],
                "conditionTopology": assignment["conditionTopology"],
                "operationTopology": assignment["operationTopology"],
                "visualContract": verified["visualContract"],
            },
            "parameterization": {
                "numericCandidates": candidates,
                "candidateCount": len(candidates),
                "status": (
                    "MUTATION_CANDIDATES_EXTRACTED_REQUIRES_MANUAL_RULES"
                    if candidates else "MANUAL_PARAMETER_DISCOVERY_REQUIRED"
                ),
                "automaticMutationAllowed": False,
                "requiredManualRules": [
                    "parameter domain and type",
                    "structural versus mutable literal",
                    "integrality and answer range",
                    "unique-solution predicate",
                    "branch and topology preservation",
                    "difficulty-degeneracy rejection",
                ],
            },
            "solverPlan": {
                "primaryRoute": primary_solver,
                "independentRoute": independent_solver,
                "arithmeticPolicy": "EXACT_FIRST_NO_FLOAT_DECISIONS",
                "answerRange": "1..999",
                "sourceSolverShape": source["solverShape"],
            },
            "renderPlan": {
                "route": render_route(verified["visualContract"]),
                "productionMatchShell": False,
                "acceptance": "no clipping, overlap, missing label, or semantic mismatch",
            },
            "formulaCompatibility": {
                "signature": signatures[source_id],
                "duplicateCandidateSourceIds": duplicate_sources if len(duplicate_sources) > 1 else [],
                "mergeAllowed": False,
                "mergeGate": "PRIMARY_AND_INDEPENDENT_SOLVER_EQUIVALENCE_REQUIRED",
            },
            "implementationWave": wave,
            "status": "READY_FOR_MANUAL_GENERATOR_RULE",
            "productionConnected": False,
        })

    assert len(blueprints) == 200
    assert len({item["generatorContractId"] for item in blueprints}) == 200
    assert all(item["productionConnected"] is False for item in blueprints)
    duplicate_groups = [sources for sources in formula_groups.values() if len(sources) > 1]
    summary = {
        "blueprintCount": len(blueprints),
        "candidateExtractionCompleteCount": len(blueprints),
        "numericCandidateCount": sum(item["parameterization"]["candidateCount"] for item in blueprints),
        "manualParameterDiscoveryCount": sum(
            item["parameterization"]["status"] == "MANUAL_PARAMETER_DISCOVERY_REQUIRED"
            for item in blueprints
        ),
        "textOnlyRenderCount": sum(item["semanticContract"]["visualContract"] == "NONE" for item in blueprints),
        "visualRenderCount": sum(item["semanticContract"]["visualContract"] != "NONE" for item in blueprints),
        "duplicateFormulaGroupCount": len(duplicate_groups),
        "duplicateFormulaSourceCount": sum(len(group) for group in duplicate_groups),
        "byImplementationWave": dict(sorted(Counter(item["implementationWave"] for item in blueprints).items())),
        "byPrimarySolverRoute": dict(sorted(Counter(item["solverPlan"]["primaryRoute"] for item in blueprints).items())),
        "productionConnected": False,
    }
    payload = {
        "schemaVersion": "ARENA_PDF_GENERATOR_BLUEPRINTS_V1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceVerification": {
            "schemaVersion": verification["schemaVersion"],
            "verificationHash": verification["verificationHash"],
            "recordCount": len(verification["records"]),
        },
        "policy": {
            "productionRuntimeModified": False,
            "automaticLiteralMutation": False,
            "generatorPromotionGate": "hand-authored parameter rules plus primary/independent solver agreement",
            "renderPromotionGate": "generator promotion plus deterministic visual acceptance",
        },
        "summary": summary,
        "duplicateFormulaGroups": duplicate_groups,
        "contentHash": canonical_hash(blueprints),
        "blueprints": blueprints,
    }
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    REPORT_PATH.write_text(build_report(payload), encoding="utf-8")
    print(f"wrote {OUTPUT_PATH}")
    print(f"wrote {REPORT_PATH}")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
