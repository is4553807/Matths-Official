#!/usr/bin/env python3
"""Verify stage-4 PDF structure implementation contracts."""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "dataAnalysis/arenaPdfSkeletonImplementation/canonical-structure-catalog-v1.json"
CONTRACTS_PATH = ROOT / "dataAnalysis/arenaPdfSkeletonImplementation/structure-contracts-v1.json"
CORRECTIONS_PATH = ROOT / "dataAnalysis/arenaPdfSkeletonImplementation/contract-corrections-v1.json"
RECONCILIATION_PATH = ROOT / "dataAnalysis/arenaPdfSkeletonImplementation/transcription-reconciliation-v1.json"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def canonical_hash(value: Any) -> str:
    serialized = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def assert_rule_list(items: list[dict], label: str, structure_id: str, minimum: int) -> None:
    require(len(items) >= minimum, f"too few {label}: {structure_id}")
    ids = [item.get("id") for item in items]
    require(all(ids), f"missing {label} id: {structure_id}")
    require(len(ids) == len(set(ids)), f"duplicate {label} id: {structure_id}")
    for item in items:
        require(bool(item.get("predicate")), f"missing {label} predicate: {structure_id}/{item.get('id')}")
        require(bool(item.get("rationale")), f"missing {label} rationale: {structure_id}/{item.get('id')}")


def forbidden_key_present(value: Any) -> bool:
    if isinstance(value, dict):
        for key, child in value.items():
            if key in {"rawText", "scanText", "problemText", "solutionText", "verbatimProblem"}:
                return True
            if forbidden_key_present(child):
                return True
    elif isinstance(value, list):
        return any(forbidden_key_present(child) for child in value)
    return False


def main() -> None:
    catalog = load_json(CATALOG_PATH)
    payload = load_json(CONTRACTS_PATH)
    corrections = load_json(CORRECTIONS_PATH)
    reconciliation = load_json(RECONCILIATION_PATH)
    contracts = payload["contracts"]
    clusters = catalog["clusters"]

    require(payload["schemaVersion"] == "ARENA_PDF_STRUCTURE_CONTRACTS_V1", "schema mismatch")
    require(payload["sourceCatalog"]["contentHash"] == catalog["contentHash"], "source catalog hash mismatch")
    require(payload["sourceCorrections"]["correctionHash"] == corrections["correctionHash"], "source correction hash mismatch")
    require(
        payload["sourceTranscriptionReconciliation"]["reconciliationHash"] == reconciliation["reconciliationHash"],
        "source transcription reconciliation hash mismatch",
    )
    require(payload["sourceCatalog"]["structureCount"] == len(clusters) == 572, "source structure count mismatch")
    require(len(contracts) == len(clusters), "contract count mismatch")
    require(payload["contentHash"] == canonical_hash(contracts), "contract content hash mismatch")
    require(not forbidden_key_present(payload), "verbatim source text key found")

    require(
        [item["canonicalStructureId"] for item in contracts]
        == [item["canonicalStructureId"] for item in clusters],
        "contract order mismatch",
    )
    require(len({item["contractId"] for item in contracts}) == len(contracts), "duplicate contractId")
    require(len({item["canonicalStructureId"] for item in contracts}) == len(contracts), "duplicate structure contract")

    allowed_statuses = {
        "PILOT_READY_MANUAL",
        "STRUCTURE_TEMPLATE_READY",
        "FORMULA_TRANSCRIPTION_REQUIRED",
        "MANUAL_FORMULA_REVIEW_REQUIRED",
    }
    for index, (contract, cluster) in enumerate(zip(contracts, clusters)):
        structure_id = contract["canonicalStructureId"]
        require(contract["status"] in allowed_statuses, f"invalid status: {structure_id}")
        require(contract["solverGroupId"] == cluster["solverGroupId"], f"solver id mismatch: {structure_id}")
        require(contract["familyId"] == cluster["familyId"], f"family mismatch: {structure_id}")
        require(contract["algorithmVariant"] == cluster["algorithmVariant"], f"variant mismatch: {structure_id}")
        require(contract["targetContract"] == cluster["targetContract"], f"target mismatch: {structure_id}")
        require(contract["branchContract"] == cluster["branchContract"], f"branch mismatch: {structure_id}")
        require(contract["visualContract"] == cluster["visualContract"], f"visual mismatch: {structure_id}")
        require(contract["correctionAudit"] == cluster["correctionAudit"], f"correction audit mismatch: {structure_id}")
        require(contract["transcriptionAudit"] == cluster["transcriptionAudit"], f"transcription audit mismatch: {structure_id}")
        require(contract["sourceCoverage"]["recordCount"] == cluster["recordCount"], f"coverage size mismatch: {structure_id}")
        require(contract["sourceCoverage"]["sourceIds"] == cluster["sourceIds"], f"coverage source mismatch: {structure_id}")
        require(
            contract["sourceCoverage"]["representativeSourceId"] == cluster["representativeSourceId"],
            f"representative mismatch: {structure_id}",
        )

        params = contract["parameterSchema"]
        require(len(params) >= 3, f"too few parameters: {structure_id}")
        param_names = [item.get("name") for item in params]
        require(all(param_names), f"missing parameter name: {structure_id}")
        require(len(param_names) == len(set(param_names)), f"duplicate parameter name: {structure_id}")
        for item in params:
            require(bool(item.get("dataType")), f"missing parameter type: {structure_id}/{item.get('name')}")
            require(bool(item.get("domain")), f"missing parameter domain: {structure_id}/{item.get('name')}")
            require(bool(item.get("role")), f"missing parameter role: {structure_id}/{item.get('name')}")
            require(isinstance(item.get("mutable"), bool), f"missing mutable flag: {structure_id}/{item.get('name')}")

        assert_rule_list(contract["invariants"], "invariant", structure_id, 4)
        assert_rule_list(contract["constraints"], "constraint", structure_id, 4)
        assert_rule_list(contract["degeneracyGuards"], "degeneracy guard", structure_id, 5)

        solver = contract["solverContract"]
        require(solver["arithmeticPolicy"] == "EXACT_FIRST_NO_FLOAT_DECISIONS", f"arithmetic policy mismatch: {structure_id}")
        require(solver["inputParameters"] == param_names, f"solver input mismatch: {structure_id}")
        require(bool(solver["method"]), f"missing solver method: {structure_id}")
        require(bool(solver["independentCrossCheck"]), f"missing independent cross-check: {structure_id}")
        require(bool(solver["complexityBound"]), f"missing complexity bound: {structure_id}")
        require(solver["outputContract"]["uiType"] == "NONNEGATIVE_INTEGER", f"output UI mismatch: {structure_id}")

        verification = contract["verificationContract"]
        assert_rule_list(verification["requiredChecks"], "verification check", structure_id, 5)
        require(len(verification["acceptanceCriteria"]) >= 4, f"too few acceptance criteria: {structure_id}")
        render = contract["renderContract"]
        require(render["visualMode"] == cluster["visualContract"], f"render visual mismatch: {structure_id}")
        require(render["required"] == (cluster["visualContract"] != "NONE"), f"render required mismatch: {structure_id}")

        if index < 12:
            require(contract["status"] == "PILOT_READY_MANUAL", f"top-12 not pilot ready: {structure_id}")
            require(verification["requiredGeneratedSamples"] == 1000, f"pilot sample count mismatch: {structure_id}")
            require(render["representativeScreenshotReviewed"], f"pilot screenshot not reviewed: {structure_id}")
            require(len(verification["metamorphicRelations"]) >= 1, f"pilot missing metamorphic relation: {structure_id}")
            require(
                all(item.get("origin") == "MANUAL_SCREENSHOT_REVIEW" for item in params),
                f"pilot parameter not manually sourced: {structure_id}",
            )
        else:
            require(contract["status"] != "PILOT_READY_MANUAL", f"pilot outside top 12: {structure_id}")
            if cluster["groupingDiscriminator"] != "SHARED":
                require(
                    contract["status"] == "FORMULA_TRANSCRIPTION_REQUIRED",
                    f"isolated formula-loss structure promoted: {structure_id}",
                )
                require(verification["requiredGeneratedSamples"] == 0, f"formula-loss samples enabled: {structure_id}")

    status_counts = dict(sorted(Counter(item["status"] for item in contracts).items()))
    require(payload["summary"]["byStatus"] == status_counts, "status summary mismatch")
    require(status_counts.get("PILOT_READY_MANUAL") == 12, "pilot count mismatch")
    require(
        payload["summary"]["pilotRequiredSamples"] == 12000,
        "total pilot sample count mismatch",
    )
    require(payload["summary"]["allHaveIndependentCrossCheck"], "independent cross-check summary mismatch")
    require(payload["summary"]["correctedContractCount"] == 41, "corrected contract count mismatch")
    require(payload["summary"]["correctedSourceCount"] == 41, "corrected source count mismatch")
    require(payload["summary"]["reconciledContractCount"] == 200, "reconciled contract count mismatch")
    require(payload["summary"]["targetPromotedContractCount"] == 91, "target-promoted contract count mismatch")
    require(payload["contractPolicy"]["productionRuntimeModified"] is False, "runtime mutation policy mismatch")
    require(payload["contractPolicy"]["verbatimProblemTextStored"] is False, "verbatim policy mismatch")

    print(
        "Arena PDF structure contracts verified: "
        f"contracts={len(contracts)} pilots={status_counts.get('PILOT_READY_MANUAL', 0)} "
        f"transcription={status_counts.get('FORMULA_TRANSCRIPTION_REQUIRED', 0)} "
        f"hash={payload['contentHash']}"
    )


if __name__ == "__main__":
    main()
