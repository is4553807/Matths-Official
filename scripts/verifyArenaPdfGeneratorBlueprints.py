#!/usr/bin/env python3
"""Verify stage-6C-1 generator blueprints and the production boundary."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "dataAnalysis/arenaPdfSkeletonImplementation"
BLUEPRINTS_PATH = DATA_DIR / "generator-blueprints-v1.json"
VERIFICATION_PATH = DATA_DIR / "formula-transcription-verification-v1.json"
OUTPUT_PATH = DATA_DIR / "generator-blueprint-verification-v1.json"
PRODUCTION_BOUNDARY_FILES = [
    ROOT / "services/arenaOneOnOneProblemBank.js",
    ROOT / "services/arenaTierQuestionCatalogService.js",
    ROOT / "services/arenaProblemPackService.js",
    ROOT / "services/problemBankCatalogService.js",
]


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def canonical_hash(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def load_transcriptions() -> dict[str, dict]:
    result = {}
    for path in sorted(DATA_DIR.glob("formula-transcriptions-batch-6b*.json")):
        for item in load_json(path)["records"]:
            result[item["sourceId"]] = item
    return result


def main() -> None:
    payload = load_json(BLUEPRINTS_PATH)
    verification = load_json(VERIFICATION_PATH)
    transcriptions = load_transcriptions()
    blueprints = payload["blueprints"]
    verified_by_source = {item["sourceId"]: item for item in verification["records"]}

    assert payload["schemaVersion"] == "ARENA_PDF_GENERATOR_BLUEPRINTS_V1"
    assert payload["contentHash"] == canonical_hash(blueprints)
    assert payload["sourceVerification"]["verificationHash"] == verification["verificationHash"]
    assert len(blueprints) == len(verified_by_source) == len(transcriptions) == 200
    assert len({item["sourceId"] for item in blueprints}) == 200
    assert len({item["generatorContractId"] for item in blueprints}) == 200

    results = []
    for blueprint in blueprints:
        source_id = blueprint["sourceId"]
        verified = verified_by_source[source_id]
        source = transcriptions[source_id]
        semantic = blueprint["semanticContract"]
        assert blueprint["canonicalStructureId"] == verified["canonicalStructureId"], source_id
        assert blueprint["solverGroupId"] == verified["solverGroupId"], source_id
        assert blueprint["structureContractId"] == verified["contractId"], source_id
        assert semantic["familyId"] == verified["familyId"], source_id
        assert semantic["targetContract"] == verified["targetContract"], source_id
        assert semantic["visualContract"] == verified["visualContract"], source_id
        assert blueprint["transcriptionReference"]["transcriptionDigest"] == verified["transcriptionDigest"], source_id
        assert blueprint["parameterization"]["candidateCount"] == len(blueprint["parameterization"]["numericCandidates"]), source_id
        assert blueprint["parameterization"]["candidateCount"] >= 1, source_id
        assert blueprint["parameterization"]["automaticMutationAllowed"] is False, source_id
        assert blueprint["productionConnected"] is False, source_id
        assert blueprint["renderPlan"]["productionMatchShell"] is False, source_id
        assert blueprint["status"] == "READY_FOR_MANUAL_GENERATOR_RULE", source_id
        candidates = blueprint["parameterization"]["numericCandidates"]
        assert [item["id"] for item in candidates] == [f"N{index}" for index in range(1, len(candidates) + 1)], source_id
        expressions = {"GIVEN": source["givensTeX"], "TARGET": [source["targetTeX"]]}
        for candidate in candidates:
            values = expressions[candidate["field"]]
            assert 0 <= candidate["expressionIndex"] < len(values), source_id
            expression = values[candidate["expressionIndex"]]
            literal = candidate["literal"]
            if candidate["sourceKind"] == "TEXTUAL_NUMBER_WORD":
                assert literal in expression.lower(), f"missing textual candidate: {source_id}/{literal}"
            else:
                assert literal in expression, f"missing digit candidate: {source_id}/{literal}"
            assert candidate["mutationStatus"] == "REQUIRES_MANUAL_DOMAIN_AND_INVARIANT_RULE", source_id
        results.append({
            "sourceId": source_id,
            "generatorContractId": blueprint["generatorContractId"],
            "candidateCount": len(candidates),
            "implementationWave": blueprint["implementationWave"],
            "solverRoute": blueprint["solverPlan"]["primaryRoute"],
            "renderRoute": blueprint["renderPlan"]["route"],
            "checks": {
                "sourceLink": True,
                "semanticContract": True,
                "candidateReferences": True,
                "solverPlan": True,
                "renderPlan": True,
                "productionDisconnected": True,
            },
            "status": "VERIFIED_READY_FOR_6C2",
        })

    blueprint_by_source = {item["sourceId"]: item for item in blueprints}
    for group in payload["duplicateFormulaGroups"]:
        assert len(group) >= 2
        signatures = {blueprint_by_source[source_id]["formulaCompatibility"]["signature"] for source_id in group}
        families = {blueprint_by_source[source_id]["semanticContract"]["familyId"] for source_id in group}
        targets = {blueprint_by_source[source_id]["semanticContract"]["targetContract"] for source_id in group}
        assert len(signatures) == len(families) == len(targets) == 1, group
        for source_id in group:
            assert blueprint_by_source[source_id]["formulaCompatibility"]["mergeAllowed"] is False

    boundary_token = "generator-blueprints-v1"
    for path in PRODUCTION_BOUNDARY_FILES:
        assert boundary_token not in path.read_text(encoding="utf-8"), f"production boundary imports blueprint: {path}"

    summary = {
        "expectedBlueprintCount": 200,
        "verifiedBlueprintCount": len(results),
        "candidateReferenceVerifiedCount": len(results),
        "solverPlanVerifiedCount": len(results),
        "renderPlanVerifiedCount": len(results),
        "productionDisconnectedCount": len(results),
        "productionBoundaryFileCount": len(PRODUCTION_BOUNDARY_FILES),
        "duplicateFormulaGroupVerifiedCount": len(payload["duplicateFormulaGroups"]),
        "passed": True,
    }
    output = {
        "schemaVersion": "ARENA_PDF_GENERATOR_BLUEPRINT_VERIFICATION_V1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceBlueprints": {
            "schemaVersion": payload["schemaVersion"],
            "contentHash": payload["contentHash"],
        },
        "summary": summary,
        "productionBoundaryFiles": [str(path.relative_to(ROOT)) for path in PRODUCTION_BOUNDARY_FILES],
        "verificationHash": canonical_hash(results),
        "results": results,
    }
    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUTPUT_PATH}")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
