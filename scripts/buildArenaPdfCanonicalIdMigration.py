#!/usr/bin/env python3
"""Finalize stage-6B-9 canonical/solver/contract ID migrations."""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "dataAnalysis/arenaPdfSkeletonImplementation"
CORRECTIONS_PATH = DATA_DIR / "contract-corrections-v1.json"
CATALOG_PATH = DATA_DIR / "canonical-structure-catalog-v1.json"
CONTRACTS_PATH = DATA_DIR / "structure-contracts-v1.json"
OUTPUT_PATH = DATA_DIR / "canonical-id-migration-v1.json"
REPORT_PATH = DATA_DIR / "step-6b9-contract-corrections.md"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def canonical_hash(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def build_report(payload: dict) -> str:
    summary = payload["summary"]
    lines = [
        "# PDF 스켈레톤 구현 6-B-9 - 오류 원장·계약 교정·canonical ID 이관",
        "",
        f"- 전사 완료 문항: {summary['transcribedSourceCount']}개",
        f"- 교정 문항: {summary['correctedSourceCount']}개 (기존 집계 40개 → 누락 1개 복구 후 41개)",
        f"- 오류 플래그: 계열 {summary['flagCounts']['FAMILY']} / 목표 {summary['flagCounts']['TARGET']} / 시각 {summary['flagCounts']['VISUAL']} / 맥락 {summary['flagCounts']['CONTEXT']}",
        f"- 새 canonical structure ID: {summary['canonicalStructureIdMigrationCount']}개",
        f"- 새 solver group ID: {summary['solverGroupIdMigrationCount']}개",
        f"- 새 contract ID: {summary['contractIdMigrationCount']}개",
        f"- 기존 공유 구조 분리: {summary['sharedStructureSplitCount']}개",
        f"- 운영 코드·문제은행 변경: {str(summary['productionRuntimeModified']).lower()}",
        f"- 이관 해시: `{payload['migrationHash']}`",
        "",
        "## 판정",
        "",
        "41개 오류 문항은 모두 교정 전부터 문항별로 격리된 단독 구조였다. 따라서 정상 문항이 들어 있는 공유 구조를 쪼갤 필요는 없고, 각 문항의 계열·목표·시각자료 계약을 고친 뒤 canonical/solver/contract ID를 새로 발급했다. 2016년 9월 평가원 나형 26번과 가형 24번은 전사 수식이 같은 중복 후보지만, 독립 솔버 검증 전 병합하지 않고 6-C로 이관한다.",
        "",
        "## 문항별 ID 이관",
        "",
        "| sourceId | 교정 | 이전 structureId | 새 structureId |",
        "|---|---|---|---|",
    ]
    for item in payload["migrations"]:
        lines.append(
            f"| `{item['sourceId']}` | {', '.join(item['flags'])} | "
            f"`{item['priorIdentifiers']['canonicalStructureId']}` | "
            f"`{item['replacementIdentifiers']['canonicalStructureId']}` |"
        )
    lines.extend([
        "",
        "## 다음 단계",
        "",
        "6-B-10에서 200개 전사 레코드를 새 ID와 다시 연결하고, 각 문항의 수식·목표·계열·시각자료 계약이 교정 원장과 일치하는지 전수 재검증한다. 그 검증이 끝날 때까지 교정 구조는 운영 출제 풀에 연결하지 않는다.",
        "",
    ])
    return "\n".join(lines)


def main() -> None:
    corrections = load_json(CORRECTIONS_PATH)
    catalog = load_json(CATALOG_PATH)
    contracts = load_json(CONTRACTS_PATH)
    assignments = {item["sourceId"]: item for item in catalog["assignments"]}
    clusters = {item["canonicalStructureId"]: item for item in catalog["clusters"]}
    contract_by_structure = {item["canonicalStructureId"]: item for item in contracts["contracts"]}

    migrations = []
    for correction in corrections["records"]:
        source_id = correction["sourceId"]
        assignment = assignments[source_id]
        cluster = clusters[assignment["canonicalStructureId"]]
        contract = contract_by_structure[assignment["canonicalStructureId"]]
        resolution = correction["resolution"]
        assert assignment["curriculumEffective"]["familyId"] == resolution["familyId"], source_id
        assert assignment["targetContract"] == resolution["targetContract"], source_id
        assert assignment["visualContract"] == resolution["visualContract"], source_id
        assert assignment["contractCorrectionApplied"] is True, source_id
        assert cluster["recordCount"] == 1 and cluster["sourceIds"] == [source_id], source_id
        assert contract["sourceCoverage"]["sourceIds"] == [source_id], source_id
        replacement = {
            "canonicalStructureId": assignment["canonicalStructureId"],
            "solverGroupId": assignment["solverGroupId"],
            "contractId": contract["contractId"],
        }
        prior = correction["priorIdentifiers"]
        changed_dimensions = [
            name
            for name, prior_key, new_value in [
                ("FAMILY", "familyId", resolution["familyId"]),
                ("TARGET", "targetContract", resolution["targetContract"]),
                ("VISUAL", "visualContract", resolution["visualContract"]),
            ]
            if correction["priorContract"][prior_key] != new_value
        ]
        assert changed_dimensions, f"no structural ID dimension changed: {source_id}"
        assert prior["canonicalStructureId"] != replacement["canonicalStructureId"], source_id
        assert prior["contractId"] != replacement["contractId"], source_id
        migrations.append({
            "ledgerIndex": correction["ledgerIndex"],
            "sourceId": source_id,
            "flags": correction["flags"],
            "changedIdDimensions": changed_dimensions,
            "priorIdentifiers": prior,
            "replacementIdentifiers": replacement,
            "identifierChanged": {
                key: prior[key] != replacement[key] for key in prior
            },
            "resolvedContract": {
                "familyId": assignment["curriculumEffective"]["familyId"],
                "algorithmVariant": assignment["algorithmVariant"],
                "targetContract": assignment["targetContract"],
                "branchContract": assignment["branchContract"],
                "visualContract": assignment["visualContract"],
                "groupingDiscriminator": assignment["solverGroupingDiscriminator"],
                "status": contract["status"],
            },
            "contextAugmentation": resolution["contextAugmentation"],
            "migrationDecision": correction["migrationDecision"],
        })

    assert len(migrations) == 41
    prior_structures = {item["priorIdentifiers"]["canonicalStructureId"] for item in migrations}
    replacement_structures = {item["replacementIdentifiers"]["canonicalStructureId"] for item in migrations}
    active_structures = set(clusters)
    assert not (prior_structures & active_structures), "retired structure ID still active"
    assert len(replacement_structures) == len(migrations), "replacement structure collision"
    assert all(item["resolvedContract"]["status"] == "FORMULA_TRANSCRIPTION_REQUIRED" for item in migrations)

    flag_counts = dict(sorted(Counter(flag for item in migrations for flag in item["flags"]).items()))
    summary = {
        "transcribedSourceCount": corrections["scope"]["transcribedSourceCount"],
        "correctedSourceCount": len(migrations),
        "flagCounts": flag_counts,
        "canonicalStructureIdMigrationCount": len({item["priorIdentifiers"]["canonicalStructureId"] for item in migrations}),
        "solverGroupIdMigrationCount": sum(item["identifierChanged"]["solverGroupId"] for item in migrations),
        "contractIdMigrationCount": len({item["priorIdentifiers"]["contractId"] for item in migrations}),
        "replacementStructureCount": len(replacement_structures),
        "sharedStructureSplitCount": corrections["summary"]["sharedStructureSplitCount"],
        "deferredDuplicateCandidateCount": corrections["summary"]["deferredDuplicateCandidateCount"],
        "productionRuntimeModified": False,
    }
    payload = {
        "schemaVersion": "ARENA_PDF_CANONICAL_ID_MIGRATION_V1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceCorrections": {
            "schemaVersion": corrections["schemaVersion"],
            "correctionHash": corrections["correctionHash"],
        },
        "sourceCatalog": {
            "schemaVersion": catalog["schemaVersion"],
            "contentHash": catalog["contentHash"],
        },
        "sourceContracts": {
            "schemaVersion": contracts["schemaVersion"],
            "contentHash": contracts["contentHash"],
        },
        "summary": summary,
        "migrationHash": canonical_hash(migrations),
        "migrations": migrations,
    }
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    REPORT_PATH.write_text(build_report(payload), encoding="utf-8")
    print(f"wrote {OUTPUT_PATH}")
    print(f"wrote {REPORT_PATH}")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
