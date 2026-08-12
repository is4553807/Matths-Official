#!/usr/bin/env python3
"""Reconcile all 200 formula transcriptions with the corrected catalog.

The transcription target is the screenshot-confirmed output projection and is
therefore more precise than broad OCR-derived canonical targets. This stage
records those refinements before IDs are rebuilt; it does not touch production.
"""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "dataAnalysis/arenaPdfSkeletonImplementation"
CATALOG_PATH = DATA_DIR / "canonical-structure-catalog-v1.json"
CONTRACTS_PATH = DATA_DIR / "structure-contracts-v1.json"
CORRECTIONS_PATH = DATA_DIR / "contract-corrections-v1.json"
OUTPUT_PATH = DATA_DIR / "transcription-reconciliation-v1.json"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def canonical_hash(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def visual_compatible(audit: str, contract: str) -> bool:
    if audit.startswith((
        "NONE_REQUIRED",
        "ILLUSTRATION_PRESENT_BUT_",
        "GRAPH_PRESENT_BUT_",
        "TABLE_PRESENT_BUT_",
    )):
        return contract == "NONE"
    if audit.startswith(("REQUIRED_GRAPH", "REQUIRED_LOG_")):
        return "GRAPH" in contract
    if audit.startswith(("REQUIRED_LINE_GRAPH", "REQUIRED_PATH_DIAGRAM_AND_GRAPH")):
        return "GRAPH" in contract
    if audit.startswith((
        "REQUIRED_GEOMETRY_DIAGRAM",
        "REQUIRED_PIECE_AND_TARGET_TILING_DIAGRAMS",
        "REQUIRED_RIGHT_TRIANGLE_AND_TANGENT_CIRCLE_DIAGRAM",
    )):
        return "GEO" in contract
    if audit.startswith("REQUIRED_DIAGRAM"):
        return contract != "NONE"
    if audit.startswith("VISUAL_CONTRACT_CORRECTION_REQUIRED"):
        return True
    return False


def main() -> None:
    catalog = load_json(CATALOG_PATH)
    contracts = load_json(CONTRACTS_PATH)
    corrections = load_json(CORRECTIONS_PATH)
    prior_payload = load_json(OUTPUT_PATH) if OUTPUT_PATH.exists() else None
    prior_by_source = {
        item["sourceId"]: item for item in (prior_payload or {}).get("records", [])
    }
    assignments = {item["sourceId"]: item for item in catalog["assignments"]}
    contract_by_source: dict[str, dict] = {}
    for contract in contracts["contracts"]:
        for source_id in contract["sourceCoverage"]["sourceIds"]:
            contract_by_source[source_id] = contract

    batch_records = []
    seen = set()
    for batch_path in sorted(DATA_DIR.glob("formula-transcriptions-batch-6b*.json")):
        payload = load_json(batch_path)
        for item in payload["records"]:
            source_id = item["sourceId"]
            if source_id in seen:
                raise AssertionError(f"duplicate transcription source: {source_id}")
            seen.add(source_id)
            batch_records.append((batch_path.stem, item))

    records = []
    for batch_name, item in sorted(batch_records, key=lambda pair: assignments[pair[1]["sourceId"]]["ledgerIndex"]):
        source_id = item["sourceId"]
        assignment = assignments[source_id]
        contract = contract_by_source[source_id]
        prior = prior_by_source.get(source_id)
        crop_path = ROOT / item["cropPath"]
        assert crop_path.is_file(), f"missing crop: {source_id}"
        assert item["cropPath"] == assignment["sourceSnapshot"]["problemCropPath"], source_id
        assert isinstance(item.get("givensTeX"), list) and item["givensTeX"], source_id
        assert all(isinstance(value, str) and value.strip() for value in item["givensTeX"]), source_id
        assert isinstance(item.get("targetTeX"), str) and item["targetTeX"].strip(), source_id
        assert isinstance(item.get("solverShape"), str) and item["solverShape"].strip(), source_id
        assert item.get("status") == "TRANSCRIBED_PENDING_SOLVER_CONTRACT", source_id
        assert contract["status"] == "FORMULA_TRANSCRIPTION_REQUIRED", source_id
        assert contract["sourceCoverage"]["sourceIds"] == [source_id], source_id
        assert assignment["solverGroupingDiscriminator"] == source_id, source_id
        assert visual_compatible(item["visualAudit"], assignment["visualContract"]), source_id

        transcription_digest = canonical_hash({
            "givensTeX": item["givensTeX"],
            "targetTeX": item["targetTeX"],
            "solverShape": item["solverShape"],
            "visualAudit": item["visualAudit"],
        })
        if prior:
            assert prior["transcriptionDigest"] == transcription_digest, source_id
            actions = prior["actions"]
            prior_batch_metadata = prior["priorBatchMetadata"]
            catalog_before = prior["catalogBeforeReconciliation"]
        else:
            actions = []
            if item["canonicalStructureId"] != assignment["canonicalStructureId"]:
                actions.append("REFRESH_CANONICAL_ID_FROM_STAGE_6B9")
            if item["familyId"] != assignment["curriculumEffective"]["familyId"]:
                actions.append("REFRESH_BATCH_FAMILY_METADATA")
            if item["targetKind"] != assignment["targetContract"]:
                actions.append("PROMOTE_SCREENSHOT_TRANSCRIBED_TARGET_CONTRACT")
            prior_batch_metadata = {
                "canonicalStructureId": item["canonicalStructureId"],
                "familyId": item["familyId"],
                "targetKind": item["targetKind"],
            }
            catalog_before = {
                "canonicalStructureId": assignment["canonicalStructureId"],
                "solverGroupId": assignment["solverGroupId"],
                "contractId": contract["contractId"],
                "familyId": assignment["curriculumEffective"]["familyId"],
                "targetContract": assignment["targetContract"],
                "visualContract": assignment["visualContract"],
            }
        records.append({
            "ledgerIndex": assignment["ledgerIndex"],
            "sourceId": source_id,
            "evidenceBatch": batch_name,
            "transcriptionDigest": transcription_digest,
            "priorBatchMetadata": prior_batch_metadata,
            "catalogBeforeReconciliation": catalog_before,
            "resolvedContract": {
                "familyId": assignment["curriculumEffective"]["familyId"],
                "targetContract": item["targetKind"],
                "visualContract": assignment["visualContract"],
                "groupingPolicy": "SOURCE_ISOLATED_UNTIL_GENERATOR_VALIDATED",
            },
            "actions": actions,
            "verification": {
                "cropExists": True,
                "formulaFieldsComplete": True,
                "visualContractCompatible": True,
                "sourceIsolated": True,
                "contractTranscriptionGated": True,
            },
        })

    assert len(records) == 200
    assert len({item["sourceId"] for item in records}) == 200
    action_counts = dict(sorted(Counter(action for item in records for action in item["actions"]).items()))
    assert action_counts == {
        "PROMOTE_SCREENSHOT_TRANSCRIBED_TARGET_CONTRACT": 91,
        "REFRESH_BATCH_FAMILY_METADATA": 25,
        "REFRESH_CANONICAL_ID_FROM_STAGE_6B9": 41,
    }, action_counts
    summary = {
        "transcribedSourceCount": len(records),
        "formulaCompleteCount": sum(item["verification"]["formulaFieldsComplete"] for item in records),
        "cropVerifiedCount": sum(item["verification"]["cropExists"] for item in records),
        "visualCompatibleCount": sum(item["verification"]["visualContractCompatible"] for item in records),
        "sourceIsolatedCount": sum(item["verification"]["sourceIsolated"] for item in records),
        "targetContractExactBeforeCount": sum(
            item["priorBatchMetadata"]["targetKind"] == item["catalogBeforeReconciliation"]["targetContract"]
            for item in records
        ),
        "actionCounts": action_counts,
        "productionRuntimeModified": False,
    }
    payload = {
        "schemaVersion": "ARENA_PDF_TRANSCRIPTION_RECONCILIATION_V1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceCatalog": (prior_payload or {}).get("sourceCatalog", {
            "schemaVersion": catalog["schemaVersion"],
            "contentHash": catalog["contentHash"],
        }),
        "sourceContracts": (prior_payload or {}).get("sourceContracts", {
            "schemaVersion": contracts["schemaVersion"],
            "contentHash": contracts["contentHash"],
        }),
        "sourceCorrections": {
            "schemaVersion": corrections["schemaVersion"],
            "correctionHash": corrections["correctionHash"],
        },
        "summary": summary,
        "reconciliationHash": canonical_hash(records),
        "records": records,
    }
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUTPUT_PATH}")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
