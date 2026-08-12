#!/usr/bin/env python3
"""Aggregate isolated stage-6C generator implementation progress."""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "dataAnalysis/arenaPdfSkeletonImplementation"
BLUEPRINTS_PATH = DATA_DIR / "generator-blueprints-v1.json"
OUTPUT_PATH = DATA_DIR / "generator-implementation-ledger-v1.json"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def canonical_hash(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def main() -> None:
    blueprints = load_json(BLUEPRINTS_PATH)
    implemented = {}
    for path in sorted(DATA_DIR.glob("generator-verification-6c2-*.json")):
        report = load_json(path)
        assert report["acceptance"]["passed"] is True, path.name
        assert report["productionConnected"] is False, path.name
        for result in report["results"]:
            source_id = result["sourceReferenceId"]
            if source_id in implemented:
                raise AssertionError(f"source implemented twice: {source_id}")
            implemented[source_id] = {
                "verificationArtifact": path.name,
                "verificationHash": report["verificationHash"],
                "sampleCount": result["samples"],
                "parameterVariantCount": result["parameterVariantCount"],
                "answerVariantCount": result["answerVariantCount"],
            }

    records = []
    for blueprint in blueprints["blueprints"]:
        evidence = implemented.get(blueprint["sourceId"])
        records.append({
            "sourceId": blueprint["sourceId"],
            "generatorContractId": blueprint["generatorContractId"],
            "canonicalStructureId": blueprint["canonicalStructureId"],
            "implementationWave": blueprint["implementationWave"],
            "status": "IMPLEMENTED_DUAL_ORACLE_VERIFIED" if evidence else "QUEUED_FOR_GENERATOR_RULE",
            "verificationEvidence": evidence,
            "productionConnected": False,
        })

    status_counts = dict(sorted(Counter(item["status"] for item in records).items()))
    wave_summary = {}
    for wave in sorted({item["implementationWave"] for item in records}):
        wave_records = [item for item in records if item["implementationWave"] == wave]
        wave_summary[wave] = {
            "total": len(wave_records),
            "implemented": sum(item["status"] == "IMPLEMENTED_DUAL_ORACLE_VERIFIED" for item in wave_records),
            "queued": sum(item["status"] == "QUEUED_FOR_GENERATOR_RULE" for item in wave_records),
        }
    summary = {
        "blueprintCount": len(records),
        "implementedCount": status_counts.get("IMPLEMENTED_DUAL_ORACLE_VERIFIED", 0),
        "queuedCount": status_counts.get("QUEUED_FOR_GENERATOR_RULE", 0),
        "statusCounts": status_counts,
        "byImplementationWave": wave_summary,
        "productionConnected": False,
    }
    assert len(records) == 200
    payload = {
        "schemaVersion": "ARENA_PDF_GENERATOR_IMPLEMENTATION_LEDGER_V1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceBlueprints": {
            "schemaVersion": blueprints["schemaVersion"],
            "contentHash": blueprints["contentHash"],
        },
        "summary": summary,
        "contentHash": canonical_hash(records),
        "records": records,
    }
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUTPUT_PATH}")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
