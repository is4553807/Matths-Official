#!/usr/bin/env python3
"""Verify all 200 reconciled formula transcriptions and write the 6-B-10 audit."""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "dataAnalysis/arenaPdfSkeletonImplementation"
CATALOG_PATH = DATA_DIR / "canonical-structure-catalog-v1.json"
CONTRACTS_PATH = DATA_DIR / "structure-contracts-v1.json"
CORRECTIONS_PATH = DATA_DIR / "contract-corrections-v1.json"
RECONCILIATION_PATH = DATA_DIR / "transcription-reconciliation-v1.json"
OUTPUT_PATH = DATA_DIR / "formula-transcription-verification-v1.json"
REPORT_PATH = DATA_DIR / "step-6b10-formula-transcription-verification.md"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def canonical_hash(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def tex_balanced(value: str) -> bool:
    depth = 0
    for index, char in enumerate(value):
        escaped = index > 0 and value[index - 1] == "\\"
        if escaped:
            continue
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth < 0:
                return False
    return depth == 0


def verify_tex(value: str, source_id: str, field: str) -> None:
    assert value.strip(), f"empty TeX: {source_id}/{field}"
    assert tex_balanced(value), f"unbalanced TeX braces: {source_id}/{field}"
    assert "�" not in value, f"replacement glyph in TeX: {source_id}/{field}"
    assert not re.search(r"\b(?:TODO|TBD|UNKNOWN|UNRESOLVED)\b", value, re.IGNORECASE), f"placeholder in TeX: {source_id}/{field}"


def build_report(payload: dict) -> str:
    summary = payload["summary"]
    lines = [
        "# PDF 스켈레톤 구현 6-B-10 - 200개 전사 문항 전수 재검증",
        "",
        f"- 검증 문항: {summary['verifiedSourceCount']} / {summary['expectedSourceCount']}개",
        f"- 수식 필드 완전성: {summary['formulaCompleteCount']}개",
        f"- TeX 기본 무결성: {summary['texIntegrityCount']}개",
        f"- 원문 캡처 존재·연결: {summary['cropVerifiedCount']}개",
        f"- canonical/solver/contract ID 일치: {summary['identifierVerifiedCount']}개",
        f"- 계열·목표값·시각자료 계약 일치: {summary['semanticContractVerifiedCount']}개",
        f"- 캡처 전사 기준 목표값 정밀화: {summary['targetContractPromotionCount']}개",
        f"- 배치 canonical ID 갱신: {summary['batchCanonicalIdRefreshCount']}개",
        f"- 배치 계열 메타데이터 갱신: {summary['batchFamilyRefreshCount']}개",
        f"- 격리 solver 유지: {summary['sourceIsolatedCount']}개",
        f"- 운영 코드·문제은행 변경: {str(summary['productionRuntimeModified']).lower()}",
        f"- 검증 해시: `{payload['verificationHash']}`",
        "",
        "## 추가 발견 및 처리",
        "",
        "6-B-9의 명시적 오류 41개를 다시 연결하는 과정에서, OCR 기반 canonical 목표값보다 캡처 전사 목표값이 더 정확한 문항 91개를 추가로 확인했다. `SCALAR_VALUE`, `PROBABILITY`, `COUNT` 같은 넓은 라벨을 분자·분모 합, 배율 적용값, 계수 합, 정적분값 등 실제 답 투영으로 교체했고 이에 따라 최종 ID를 재발급했다.",
        "",
        "## 배치별 결과",
        "",
        "| 배치 | 문항 | ID 갱신 | 계열 갱신 | 상태 |",
        "|---|---:|---:|---:|---|",
    ]
    for batch in payload["batchResults"]:
        lines.append(
            f"| `{batch['batchId']}` | {batch['recordCount']} | {batch['canonicalIdRefreshCount']} | "
            f"{batch['familyMetadataRefreshCount']} | `{batch['status']}` |"
        )
    lines.extend([
        "",
        "## 6-C 진입 조건",
        "",
        "200개 모두 전사·ID·계열·목표값·시각자료 계약 검증을 통과했다. 다음 단계에서는 이 자료를 생성기 입력 계약으로 변환하고, 독립 솔버 검산과 실제 1대1 매치 렌더 규격 검증을 통과한 구조만 구현 가능 상태로 승격한다. 현재 운영 출제 풀에는 아직 연결하지 않는다.",
        "",
    ])
    return "\n".join(lines)


def main() -> None:
    catalog = load_json(CATALOG_PATH)
    contracts = load_json(CONTRACTS_PATH)
    corrections = load_json(CORRECTIONS_PATH)
    reconciliation = load_json(RECONCILIATION_PATH)
    assignments = {item["sourceId"]: item for item in catalog["assignments"]}
    recon_by_source = {item["sourceId"]: item for item in reconciliation["records"]}
    contract_by_source: dict[str, dict] = {}
    for contract in contracts["contracts"]:
        for source_id in contract["sourceCoverage"]["sourceIds"]:
            contract_by_source[source_id] = contract

    assert catalog["sourceTranscriptionReconciliation"]["reconciliationHash"] == reconciliation["reconciliationHash"]
    assert contracts["sourceTranscriptionReconciliation"]["reconciliationHash"] == reconciliation["reconciliationHash"]
    formula_contract_sources = {
        source_id
        for contract in contracts["contracts"]
        if contract["status"] == "FORMULA_TRANSCRIPTION_REQUIRED"
        for source_id in contract["sourceCoverage"]["sourceIds"]
    }
    assert len(formula_contract_sources) == 200

    batch_results = []
    verification_records = []
    seen = set()
    for batch_path in sorted(DATA_DIR.glob("formula-transcriptions-batch-6b*.json")):
        batch = load_json(batch_path)
        meta = batch["reconciliation"]
        assert len(batch["records"]) == 25, batch_path.name
        assert meta["reconciliationHash"] == reconciliation["reconciliationHash"], batch_path.name
        assert meta["catalogContentHash"] == catalog["contentHash"], batch_path.name
        assert meta["contractContentHash"] == contracts["contentHash"], batch_path.name
        assert meta["status"] == "VERIFIED", batch_path.name
        for item in batch["records"]:
            source_id = item["sourceId"]
            assert source_id not in seen, f"duplicate source: {source_id}"
            seen.add(source_id)
            assignment = assignments[source_id]
            contract = contract_by_source[source_id]
            recon = recon_by_source[source_id]
            assert source_id in formula_contract_sources, source_id
            assert item["canonicalStructureId"] == assignment["canonicalStructureId"], source_id
            assert item["solverGroupId"] == assignment["solverGroupId"], source_id
            assert item["contractId"] == contract["contractId"], source_id
            assert item["familyId"] == assignment["curriculumEffective"]["familyId"], source_id
            assert item["targetKind"] == assignment["targetContract"], source_id
            assert item["resolvedVisualContract"] == assignment["visualContract"], source_id
            assert item["correctionFlags"] == (
                assignment["contractCorrection"]["flags"] if assignment["contractCorrectionApplied"] else []
            ), source_id
            assert item["reconciliationStatus"] == "VERIFIED_AGAINST_STAGE_6B10_CONTRACT", source_id
            assert assignment["solverGroupingDiscriminator"] == source_id, source_id
            assert contract["sourceCoverage"]["sourceIds"] == [source_id], source_id
            assert assignment["transcriptionReconciliationApplied"] is True, source_id
            digest = canonical_hash({
                "givensTeX": item["givensTeX"],
                "targetTeX": item["targetTeX"],
                "solverShape": item["solverShape"],
                "visualAudit": item["visualAudit"],
            })
            assert digest == recon["transcriptionDigest"], source_id
            for index, value in enumerate(item["givensTeX"]):
                verify_tex(value, source_id, f"givensTeX[{index}]")
            verify_tex(item["targetTeX"], source_id, "targetTeX")
            assert (ROOT / item["cropPath"]).is_file(), source_id
            verification_records.append({
                "ledgerIndex": assignment["ledgerIndex"],
                "sourceId": source_id,
                "batchId": batch_path.stem,
                "canonicalStructureId": item["canonicalStructureId"],
                "solverGroupId": item["solverGroupId"],
                "contractId": item["contractId"],
                "familyId": item["familyId"],
                "targetContract": item["targetKind"],
                "visualContract": item["resolvedVisualContract"],
                "transcriptionDigest": digest,
                "checks": {
                    "formulaComplete": True,
                    "texIntegrity": True,
                    "cropVerified": True,
                    "identifierVerified": True,
                    "semanticContractVerified": True,
                    "sourceIsolated": True,
                },
                "status": "VERIFIED_PENDING_GENERATOR_CONTRACT",
            })
        batch_results.append({
            "batchId": batch_path.stem,
            "recordCount": len(batch["records"]),
            "canonicalIdRefreshCount": meta["canonicalIdRefreshCount"],
            "familyMetadataRefreshCount": meta["familyMetadataRefreshCount"],
            "status": meta["status"],
        })

    assert len(seen) == len(verification_records) == 200
    assert seen == formula_contract_sources == set(recon_by_source)
    assert len({item["canonicalStructureId"] for item in verification_records}) == 200
    assert len({item["solverGroupId"] for item in verification_records}) == 200
    assert len({item["contractId"] for item in verification_records}) == 200
    summary = {
        "expectedSourceCount": 200,
        "verifiedSourceCount": len(verification_records),
        "formulaCompleteCount": sum(item["checks"]["formulaComplete"] for item in verification_records),
        "texIntegrityCount": sum(item["checks"]["texIntegrity"] for item in verification_records),
        "cropVerifiedCount": sum(item["checks"]["cropVerified"] for item in verification_records),
        "identifierVerifiedCount": sum(item["checks"]["identifierVerified"] for item in verification_records),
        "semanticContractVerifiedCount": sum(item["checks"]["semanticContractVerified"] for item in verification_records),
        "sourceIsolatedCount": sum(item["checks"]["sourceIsolated"] for item in verification_records),
        "targetContractPromotionCount": reconciliation["summary"]["actionCounts"]["PROMOTE_SCREENSHOT_TRANSCRIBED_TARGET_CONTRACT"],
        "batchCanonicalIdRefreshCount": sum(item["canonicalIdRefreshCount"] for item in batch_results),
        "batchFamilyRefreshCount": sum(item["familyMetadataRefreshCount"] for item in batch_results),
        "priorExplicitCorrectionCount": corrections["summary"]["correctedSourceCount"],
        "byFamily": dict(sorted(Counter(item["familyId"] for item in verification_records).items())),
        "byTargetContract": dict(sorted(Counter(item["targetContract"] for item in verification_records).items())),
        "byVisualContract": dict(sorted(Counter(item["visualContract"] for item in verification_records).items())),
        "productionRuntimeModified": False,
    }
    assert summary["batchCanonicalIdRefreshCount"] == 116
    assert summary["batchFamilyRefreshCount"] == 25
    payload = {
        "schemaVersion": "ARENA_PDF_FORMULA_TRANSCRIPTION_VERIFICATION_V1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceReconciliation": {
            "schemaVersion": reconciliation["schemaVersion"],
            "reconciliationHash": reconciliation["reconciliationHash"],
        },
        "sourceCatalog": {"contentHash": catalog["contentHash"]},
        "sourceContracts": {"contentHash": contracts["contentHash"]},
        "summary": summary,
        "batchResults": batch_results,
        "verificationHash": canonical_hash(verification_records),
        "records": verification_records,
    }
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    REPORT_PATH.write_text(build_report(payload), encoding="utf-8")
    print(f"wrote {OUTPUT_PATH}")
    print(f"wrote {REPORT_PATH}")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
