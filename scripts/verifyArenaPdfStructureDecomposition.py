#!/usr/bin/env python3
"""Verify the stage-2 PDF structure decomposition artifact."""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
LEDGER_PATH = ROOT / "dataAnalysis/arenaPdfSkeletonImplementation/source-ledger-v1.json"
DECOMPOSITION_PATH = ROOT / "dataAnalysis/arenaPdfSkeletonImplementation/structure-decomposition-v1.json"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def canonical_hash(value: Any) -> str:
    serialized = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    ledger = load_json(LEDGER_PATH)
    artifact = load_json(DECOMPOSITION_PATH)
    ledger_records = ledger["records"]
    records = artifact["records"]
    require(artifact["schemaVersion"] == "ARENA_PDF_STRUCTURE_DECOMPOSITION_V1", "unexpected schema version")
    require(artifact["sourceLedger"]["contentHash"] == ledger["contentHash"], "source ledger hash mismatch")
    require(len(records) == len(ledger_records) == 629, "record count must remain frozen at 629")
    require(artifact["contentHash"] == canonical_hash(records), "decomposition content hash mismatch")
    require([item["sourceId"] for item in records] == [item["sourceId"] for item in ledger_records], "source order mismatch")
    require(len({item["sourceId"] for item in records}) == len(records), "duplicate sourceId")
    for item in records:
        decomposition = item["decomposition"]
        require(decomposition["target"]["kind"], f"missing target: {item['sourceId']}")
        require(decomposition["conditions"], f"missing conditions: {item['sourceId']}")
        require(decomposition["operations"], f"missing operations: {item['sourceId']}")
        require(decomposition["branching"]["kind"], f"missing branching: {item['sourceId']}")
        require(decomposition["parameterRoles"], f"missing parameter roles: {item['sourceId']}")
        require(decomposition["visualization"]["requirement"], f"missing visualization: {item['sourceId']}")
        require(decomposition["solverSignatureDraft"], f"missing solver signature: {item['sourceId']}")
        require(item["review"]["canonicalStructureId"] is None, "canonical structure assigned before step 3")
        require(item["review"]["solverGroupId"] is None, "solver group assigned before step 3")
        require(item["review"]["manualScreenshotReviewRequired"] is True, "manual screenshot review flag lost")
        require(item["evidence"]["problemScreenshot"]["status"] == "AVAILABLE", f"missing screenshot: {item['sourceId']}")
    target_counts = Counter(item["decomposition"]["target"]["kind"] for item in records)
    risk_counts = Counter(item["decomposition"]["implementationRisk"]["level"] for item in records)
    manual_target_count = sum(
        item["decomposition"]["target"].get("origin") == "MANUAL_SCREENSHOT_REVIEW"
        for item in records
    )
    require("UNRESOLVED_NUMERIC_TARGET" not in target_counts, "unresolved targets remain after screenshot review")
    require(manual_target_count == 30, "manual target review count changed")
    print(
        "Arena PDF structure decomposition verified: "
        f"records={len(records)} hash={artifact['contentHash']} "
        f"targets={dict(sorted(target_counts.items()))} risks={dict(sorted(risk_counts.items()))}"
    )


if __name__ == "__main__":
    main()
