#!/usr/bin/env python3
"""Build the stage-6B correction ledger from the eight transcription batches.

This is research tooling only. It records the contract defects found while the
200 formula-loss sources were transcribed. Production problem-bank and Arena
runtime files are intentionally outside this script's scope.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "dataAnalysis/arenaPdfSkeletonImplementation"
CATALOG_PATH = DATA_DIR / "canonical-structure-catalog-v1.json"
CONTRACTS_PATH = DATA_DIR / "structure-contracts-v1.json"
OUTPUT_PATH = DATA_DIR / "contract-corrections-v1.json"


FAMILY_CORRECTIONS: dict[str, str] = {
    "2020-05-EDUCATION_OFFICE-NA-Q26": "C1-VELOCITY-DISTANCE",
    "2022-03-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q17": "C1-INTEGRAL-DEFINED",
    "2018-04-EDUCATION_OFFICE-GA-Q27": "C1-INTEGRAL-DEFINED",
    "2024-05-EDUCATION_OFFICE-PROBABILITY_STATISTICS-Q18": "C1-INTEGRAL-DEFINED",
    "2023-06-KICE-PROBABILITY_STATISTICS-Q19": "ALG-TRIG-GRAPH",
    "2018-03-EDUCATION_OFFICE-GA-Q24": "PS-COUNTING",
    "2018-03-EDUCATION_OFFICE-GA-Q27": "C1-INTEGRAL-DEFINED",
    "2016-03-EDUCATION_OFFICE-NA-Q29": "CM2-SETS-PROPOSITIONS",
    "2020-06-KICE-NA-Q26": "C1-DERIVATIVE",
    "2019-04-EDUCATION_OFFICE-GA-Q27": "C1-INTEGRAL-DEFINED",
    "2017-09-KICE-GA-Q26": "PS-NORMAL-SAMPLE",
    "2022-06-KICE-PROBABILITY_STATISTICS-Q19": "C1-TANGENT-EXTREMA",
    "2018-10-EDUCATION_OFFICE-NA-Q25": "C1-INTEGRAL-DEFINED",
    "2018-09-KICE-GA-Q25": "C1-INTEGRAL-DEFINED",
    "2017-07-EDUCATION_OFFICE-NA-Q25": "C1-DERIVATIVE",
    "2020-09-KICE-GA-Q27": "ALG-SEQUENCE-SUM",
    "2018-07-EDUCATION_OFFICE-NA-Q25": "ALG-SEQUENCE-SUM",
    "2018-09-KICE-NA-Q26": "ALG-SEQUENCE-SUM",
    "2020-07-EDUCATION_OFFICE-GA-Q25": "C1-VELOCITY-DISTANCE",
    "2016-04-EDUCATION_OFFICE-GA-Q25": "C1-INTEGRAL-DEFINED",
    "2016-09-KICE-NA-Q23": "C1-INTEGRAL-DEFINED",
    "2017-07-EDUCATION_OFFICE-GA-Q25": "C1-DERIVATIVE",
    "2016-09-KICE-GA-Q24": "PS-PROBABILITY-AXIOMS",
    "2017-06-KICE-GA-Q24": "C1-INTEGRAL-DEFINED",
    "2026-06-KICE-PROBABILITY_STATISTICS-Q17": "C1-INTEGRAL-DEFINED",
}


VISUAL_CORRECTIONS: dict[str, str] = {
    "2017-09-KICE-NA-Q30": "GRAPH",
    "2017-03-EDUCATION_OFFICE-GA-Q29": "LAYOUT",
    "2017-10-EDUCATION_OFFICE-NA-Q29": "NONE",
    "2017-10-EDUCATION_OFFICE-NA-Q26": "NONE",
    "2016-03-EDUCATION_OFFICE-GA-Q26": "GEO",
    "2018-04-EDUCATION_OFFICE-GA-Q24": "NONE",
    "2020-07-EDUCATION_OFFICE-GA-Q25": "NONE",
    "2018-09-KICE-GA-Q26": "NONE",
    "2017-07-EDUCATION_OFFICE-GA-Q24": "NONE",
}


CONTEXT_CORRECTIONS: dict[str, dict[str, Any]] = {
    "2018-03-EDUCATION_OFFICE-GA-Q24": {
        "required": True,
        "semanticDefinitions": [
            "integer partition count P(n,r)",
            "unlabeled nonempty set-partition count S(n,r)",
        ],
        "evidence": "OFFICIAL_SOLUTION_CONFIRMED",
    },
}


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def canonical_hash(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def is_visual_correction(note: str) -> bool:
    return "existing canonical visual contract" in note or "VISUAL_CONTRACT_CORRECTION_REQUIRED" in note


def main() -> None:
    catalog = load_json(CATALOG_PATH)
    contracts = load_json(CONTRACTS_PATH)
    assignments = {item["sourceId"]: item for item in catalog["assignments"]}
    contract_by_source: dict[str, dict] = {}
    for contract in contracts["contracts"]:
        for source_id in contract["sourceCoverage"]["sourceIds"]:
            contract_by_source[source_id] = contract

    prior_records = {}
    if OUTPUT_PATH.exists():
        prior_records = {item["sourceId"]: item for item in load_json(OUTPUT_PATH)["records"]}

    batch_records: dict[str, tuple[str, dict]] = {}
    for batch_path in sorted(DATA_DIR.glob("formula-transcriptions-batch-6b*.json")):
        payload = load_json(batch_path)
        for item in payload["records"]:
            source_id = item["sourceId"]
            if source_id in batch_records:
                raise AssertionError(f"duplicate batch source: {source_id}")
            batch_records[source_id] = (batch_path.stem, item)

    flagged: dict[str, tuple[str, dict, list[str]]] = {}
    for source_id, (batch_name, item) in batch_records.items():
        flags = []
        if (
            item.get("familyAudit", "").startswith("FAMILY_CONTRACT_CORRECTION_REQUIRED")
            or item.get("contractAudit", "").startswith("FAMILY_CONTRACT_CORRECTION_REQUIRED")
        ):
            flags.append("FAMILY")
        if item.get("targetAudit", "").startswith("TARGET_CONTRACT_CORRECTION_REQUIRED"):
            flags.append("TARGET")
        if is_visual_correction(item.get("visualAudit", "")):
            flags.append("VISUAL")
        if item.get("contextAudit", "").startswith("SOURCE_CONTEXT_AUGMENTATION_REQUIRED"):
            flags.append("CONTEXT")
        if flags:
            flagged[source_id] = (batch_name, item, flags)

    flag_counts = {name: sum(name in entry[2] for entry in flagged.values()) for name in ["FAMILY", "TARGET", "VISUAL", "CONTEXT"]}
    assert len(batch_records) == 200, len(batch_records)
    assert len(flagged) == 41, len(flagged)
    assert flag_counts == {"FAMILY": 25, "TARGET": 15, "VISUAL": 9, "CONTEXT": 1}, flag_counts
    assert set(FAMILY_CORRECTIONS) == {source_id for source_id, (_, _, flags) in flagged.items() if "FAMILY" in flags}
    assert set(VISUAL_CORRECTIONS) == {source_id for source_id, (_, _, flags) in flagged.items() if "VISUAL" in flags}
    assert set(CONTEXT_CORRECTIONS) == {source_id for source_id, (_, _, flags) in flagged.items() if "CONTEXT" in flags}

    records = []
    for source_id, (batch_name, item, flags) in sorted(flagged.items(), key=lambda entry: assignments[entry[0]]["ledgerIndex"]):
        assignment = assignments[source_id]
        contract = contract_by_source[source_id]
        prior = prior_records.get(source_id, {})
        prior_identifiers = prior.get("priorIdentifiers", {
            "canonicalStructureId": assignment["canonicalStructureId"],
            "solverGroupId": assignment["solverGroupId"],
            "contractId": contract["contractId"],
        })
        prior_contract = prior.get("priorContract", {
            "familyId": assignment["curriculumEffective"]["familyId"],
            "targetContract": assignment["targetContract"],
            "visualContract": assignment["visualContract"],
            "recordCount": contract["sourceCoverage"]["recordCount"],
            "groupingDiscriminator": assignment["solverGroupingDiscriminator"],
        })
        assert prior_contract["recordCount"] == 1, f"flagged source was not isolated: {source_id}"
        target = item["targetKind"] if "TARGET" in flags else prior_contract["targetContract"]
        resolution = {
            "familyId": FAMILY_CORRECTIONS.get(source_id, prior_contract["familyId"]),
            "targetContract": target,
            "visualContract": VISUAL_CORRECTIONS.get(source_id, prior_contract["visualContract"]),
            "contextAugmentation": CONTEXT_CORRECTIONS.get(source_id, {"required": False}),
            "groupingPolicy": "SOURCE_ISOLATED_UNTIL_GENERATOR_VALIDATED",
        }
        audits = {
            key: item[key]
            for key in ["familyAudit", "contractAudit", "targetAudit", "visualAudit", "contextAudit"]
            if key in item and (key != "visualAudit" or "VISUAL" in flags)
        }
        duplicate_note = None
        if source_id in {"2016-09-KICE-NA-Q26", "2016-09-KICE-GA-Q24"}:
            duplicate_note = {
                "candidateGroup": "2016-09-KICE-URN-TWO-WHITE-FOUR-RED-DRAW-TWO",
                "decision": "DEFER_EXACT_DUPLICATE_MERGE_TO_STAGE_6C_SOLVER_VALIDATION",
            }
        records.append({
            "ledgerIndex": assignment["ledgerIndex"],
            "sourceId": source_id,
            "evidenceBatch": batch_name,
            "flags": flags,
            "auditEvidence": audits,
            "priorIdentifiers": prior_identifiers,
            "priorContract": prior_contract,
            "resolution": resolution,
            "migrationDecision": {
                "action": "REISSUE_SOURCE_ISOLATED_CANONICAL_SOLVER_AND_CONTRACT_IDS",
                "sharedStructureSplitRequired": False,
                "reason": "the audited source already occupied a one-record source-isolated contract",
                "duplicateCandidate": duplicate_note,
            },
        })

    payload = {
        "schemaVersion": "ARENA_PDF_CONTRACT_CORRECTIONS_V1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "scope": {
            "productionRuntimeModified": False,
            "transcriptionBatchCount": 8,
            "transcribedSourceCount": len(batch_records),
        },
        "summary": {
            "correctedSourceCount": len(records),
            "flagCounts": flag_counts,
            "sharedStructureSplitCount": 0,
            "sourceIsolatedReissueCount": len(records),
            "deferredDuplicateCandidateCount": 1,
        },
        "correctionHash": canonical_hash(records),
        "records": records,
    }
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUTPUT_PATH}")
    print(json.dumps(payload["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
