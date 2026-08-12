#!/usr/bin/env python3
"""Attach the final stage-6B-10 IDs and contracts to all eight batches."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "dataAnalysis/arenaPdfSkeletonImplementation"
CATALOG_PATH = DATA_DIR / "canonical-structure-catalog-v1.json"
CONTRACTS_PATH = DATA_DIR / "structure-contracts-v1.json"
RECONCILIATION_PATH = DATA_DIR / "transcription-reconciliation-v1.json"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def canonical_hash(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def transcription_digest(item: dict) -> str:
    return canonical_hash({
        "givensTeX": item["givensTeX"],
        "targetTeX": item["targetTeX"],
        "solverShape": item["solverShape"],
        "visualAudit": item["visualAudit"],
    })


def main() -> None:
    catalog = load_json(CATALOG_PATH)
    contracts = load_json(CONTRACTS_PATH)
    reconciliation = load_json(RECONCILIATION_PATH)
    assignments = {item["sourceId"]: item for item in catalog["assignments"]}
    recon_by_source = {item["sourceId"]: item for item in reconciliation["records"]}
    contract_by_source: dict[str, dict] = {}
    for contract in contracts["contracts"]:
        for source_id in contract["sourceCoverage"]["sourceIds"]:
            contract_by_source[source_id] = contract

    migrated_count = 0
    id_refresh_count = 0
    family_refresh_count = 0
    for batch_path in sorted(DATA_DIR.glob("formula-transcriptions-batch-6b*.json")):
        payload = load_json(batch_path)
        prior_reconciliation = payload.get("reconciliation", {})
        prior_verified = (
            prior_reconciliation.get("reconciliationHash") == reconciliation["reconciliationHash"]
            and prior_reconciliation.get("status") == "VERIFIED"
        )
        batch_id_refresh = 0
        batch_family_refresh = 0
        for item in payload["records"]:
            source_id = item["sourceId"]
            assignment = assignments[source_id]
            contract = contract_by_source[source_id]
            recon = recon_by_source[source_id]
            assert transcription_digest(item) == recon["transcriptionDigest"], source_id
            assert item["targetKind"] == assignment["targetContract"], source_id
            if item["canonicalStructureId"] != assignment["canonicalStructureId"]:
                id_refresh_count += 1
                batch_id_refresh += 1
            if item["familyId"] != assignment["curriculumEffective"]["familyId"]:
                family_refresh_count += 1
                batch_family_refresh += 1
            item["canonicalStructureId"] = assignment["canonicalStructureId"]
            item["solverGroupId"] = assignment["solverGroupId"]
            item["contractId"] = contract["contractId"]
            item["familyId"] = assignment["curriculumEffective"]["familyId"]
            item["resolvedVisualContract"] = assignment["visualContract"]
            item["correctionFlags"] = (
                assignment["contractCorrection"]["flags"]
                if assignment["contractCorrectionApplied"] else []
            )
            item["reconciliationStatus"] = "VERIFIED_AGAINST_STAGE_6B10_CONTRACT"
            migrated_count += 1
        historical_id_refresh = (
            prior_reconciliation.get("canonicalIdRefreshCount", 0)
            if prior_verified else batch_id_refresh
        )
        historical_family_refresh = (
            prior_reconciliation.get("familyMetadataRefreshCount", 0)
            if prior_verified else batch_family_refresh
        )
        payload["reconciliation"] = {
            "schemaVersion": reconciliation["schemaVersion"],
            "reconciliationHash": reconciliation["reconciliationHash"],
            "catalogContentHash": catalog["contentHash"],
            "contractContentHash": contracts["contentHash"],
            "recordCount": len(payload["records"]),
            "canonicalIdRefreshCount": historical_id_refresh,
            "familyMetadataRefreshCount": historical_family_refresh,
            "status": "VERIFIED",
        }
        batch_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"updated {batch_path.name}: records={len(payload['records'])} ids={batch_id_refresh} families={batch_family_refresh}")

        if prior_verified:
            id_refresh_count += historical_id_refresh
            family_refresh_count += historical_family_refresh

    assert migrated_count == 200, migrated_count
    assert id_refresh_count == 116, id_refresh_count
    assert family_refresh_count == 25, family_refresh_count
    print(json.dumps({
        "migratedRecordCount": migrated_count,
        "canonicalIdRefreshCount": id_refresh_count,
        "familyMetadataRefreshCount": family_refresh_count,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
