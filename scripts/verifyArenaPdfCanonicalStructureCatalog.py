#!/usr/bin/env python3
"""Verify stage-3 canonical structure and solver-group assignments."""

from __future__ import annotations

import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DECOMPOSITION_PATH = ROOT / "dataAnalysis/arenaPdfSkeletonImplementation/structure-decomposition-v1.json"
CATALOG_PATH = ROOT / "dataAnalysis/arenaPdfSkeletonImplementation/canonical-structure-catalog-v1.json"
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


def main() -> None:
    decomposition = load_json(DECOMPOSITION_PATH)
    catalog = load_json(CATALOG_PATH)
    corrections = load_json(CORRECTIONS_PATH)
    reconciliation = load_json(RECONCILIATION_PATH)
    assignments = catalog["assignments"]
    clusters = catalog["clusters"]
    require(catalog["schemaVersion"] == "ARENA_PDF_CANONICAL_STRUCTURE_CATALOG_V1", "schema mismatch")
    require(catalog["sourceDecomposition"]["contentHash"] == decomposition["contentHash"], "source hash mismatch")
    require(catalog["sourceCorrections"]["correctionHash"] == corrections["correctionHash"], "correction hash mismatch")
    require(catalog["sourceCorrections"]["recordCount"] == len(corrections["records"]) == 41, "correction count mismatch")
    require(
        catalog["sourceTranscriptionReconciliation"]["reconciliationHash"] == reconciliation["reconciliationHash"],
        "transcription reconciliation hash mismatch",
    )
    require(catalog["sourceTranscriptionReconciliation"]["recordCount"] == 200, "transcription reconciliation count mismatch")
    require(len(assignments) == len(decomposition["records"]) == 629, "assignment count mismatch")
    require([item["sourceId"] for item in assignments] == [item["sourceId"] for item in decomposition["records"]], "source order mismatch")
    require(len({item["sourceId"] for item in assignments}) == 629, "duplicate source assignment")
    require(catalog["contentHash"] == canonical_hash({"clusters": clusters, "assignments": assignments}), "content hash mismatch")
    require(catalog["summary"]["visuallyReviewedRepresentativeCount"] == 12, "top-12 review count mismatch")
    require(
        all(cluster["review"]["representativeScreenshotReviewed"] for cluster in clusters[:12]),
        "unreviewed representative in top 12",
    )
    require(
        not any(cluster["review"]["representativeScreenshotReviewed"] for cluster in clusters[12:]),
        "review marker outside final top 12",
    )

    cluster_by_id = {cluster["canonicalStructureId"]: cluster for cluster in clusters}
    require(len(cluster_by_id) == len(clusters), "duplicate canonicalStructureId")
    assignment_groups: dict[str, list[dict]] = defaultdict(list)
    for assignment in assignments:
        require(assignment["canonicalStructureId"] in cluster_by_id, f"unknown cluster: {assignment['sourceId']}")
        require(assignment["canonicalStructureId"].startswith("STR-"), "invalid structure id")
        require(assignment["solverGroupId"].startswith("SOL-"), "invalid solver id")
        snapshot = assignment["sourceSnapshot"]
        if int(snapshot["year"]) >= 2021 and int(snapshot["questionNumber"]) >= 29:
            if snapshot["form"] == "CALCULUS":
                require(assignment["curriculumEffective"]["courseId"] == "calculus-1", f"calculus course mismatch: {assignment['sourceId']}")
                require(assignment["curriculumEffective"]["familyId"].startswith("C1-"), f"calculus family mismatch: {assignment['sourceId']}")
            if snapshot["form"] == "PROBABILITY_STATISTICS":
                require(assignment["curriculumEffective"]["courseId"] == "probability-statistics", f"probability course mismatch: {assignment['sourceId']}")
                require(assignment["curriculumEffective"]["familyId"].startswith("PS-"), f"probability family mismatch: {assignment['sourceId']}")
            if snapshot["form"] in {"CALCULUS", "PROBABILITY_STATISTICS"}:
                require(assignment["featureContractBasis"] == "PROBLEM_PDF_REDECOMPOSITION", f"selection feature basis mismatch: {assignment['sourceId']}")
        assignment_groups[assignment["canonicalStructureId"]].append(assignment)

    assignment_by_source = {item["sourceId"]: item for item in assignments}
    reconciliation_by_source = {item["sourceId"]: item for item in reconciliation["records"]}
    for correction in corrections["records"]:
        assignment = assignment_by_source[correction["sourceId"]]
        resolution = correction["resolution"]
        final_target = reconciliation_by_source[assignment["sourceId"]]["resolvedContract"]["targetContract"]
        require(assignment["contractCorrectionApplied"] is True, f"correction not applied: {assignment['sourceId']}")
        require(assignment["contractCorrection"]["flags"] == correction["flags"], f"correction flags mismatch: {assignment['sourceId']}")
        require(assignment["curriculumEffective"]["familyId"] == resolution["familyId"], f"corrected family mismatch: {assignment['sourceId']}")
        require(assignment["targetContract"] == final_target, f"corrected target mismatch: {assignment['sourceId']}")
        require(assignment["visualContract"] == resolution["visualContract"], f"corrected visual mismatch: {assignment['sourceId']}")
        require(assignment["canonicalStructureId"] != correction["priorIdentifiers"]["canonicalStructureId"], f"structure id not migrated: {assignment['sourceId']}")

    for item in reconciliation["records"]:
        assignment = assignment_by_source[item["sourceId"]]
        require(assignment["transcriptionReconciliationApplied"] is True, f"transcription reconciliation not applied: {assignment['sourceId']}")
        require(assignment["targetContract"] == item["resolvedContract"]["targetContract"], f"reconciled target mismatch: {assignment['sourceId']}")
        require(assignment["solverGroupingDiscriminator"] == assignment["sourceId"], f"reconciled source not isolated: {assignment['sourceId']}")

    for structure_id, group in assignment_groups.items():
        cluster = cluster_by_id[structure_id]
        require(cluster["recordCount"] == len(group), f"cluster size mismatch: {structure_id}")
        require(cluster["sourceIds"] == [item["sourceId"] for item in group], f"cluster sources mismatch: {structure_id}")
        require(len({item["solverGroupId"] for item in group}) == 1, f"mixed solver groups: {structure_id}")
        require(cluster["familyId"] == group[0]["curriculumEffective"]["familyId"], f"cluster family mismatch: {structure_id}")
        require(
            cluster["conditionTopologyCounts"] == dict(sorted(Counter(item["conditionTopology"] for item in group).items())),
            f"condition topology counts mismatch: {structure_id}",
        )
        algorithm_ids = {item["algorithmVariant"]["id"] for item in group}
        require(len(algorithm_ids) == 1, f"mixed algorithmVariant ids: {structure_id}")
        equal_fields = [
            "targetContract", "branchContract", "visualContract", "operationTopology",
            "solverGroupingDiscriminator", "solverGroupId"
        ]
        for field in equal_fields:
            values = {json.dumps(item[field], sort_keys=True, ensure_ascii=False) for item in group}
            require(len(values) == 1, f"mixed {field}: {structure_id}")
        effective_families = {item["curriculumEffective"]["familyId"] for item in group}
        require(len(effective_families) == 1, f"mixed corrected families: {structure_id}")
        require(
            cluster["groupingDiscriminator"] == group[0]["solverGroupingDiscriminator"],
            f"grouping discriminator mismatch: {structure_id}",
        )
        if cluster["groupingDiscriminator"] != "SHARED":
            require(len(group) == 1, f"source-isolated solver merged: {structure_id}")

    source_union = [source_id for cluster in clusters for source_id in cluster["sourceIds"]]
    require(len(source_union) == len(set(source_union)) == 629, "cluster source coverage mismatch")
    require(set(source_union) == {item["sourceId"] for item in assignments}, "cluster/assignment source mismatch")
    require(
        catalog["summary"]["sourceIsolatedSolverCount"]
        == sum(item["solverGroupingDiscriminator"] != "SHARED" for item in assignments),
        "source-isolated summary mismatch",
    )
    require(
        catalog["summary"]["selectionCurriculumCorrectionCount"]
        == sum(
            item["curriculumCorrectionApplied"]
            and int(item["sourceSnapshot"]["year"]) >= 2021
            and int(item["sourceSnapshot"]["questionNumber"]) >= 29
            and item["sourceSnapshot"]["form"] in {"CALCULUS", "PROBABILITY_STATISTICS"}
            for item in assignments
        ),
        "selection curriculum correction summary mismatch",
    )
    require(
        catalog["summary"]["problemPdfFeatureRedecompositionCount"]
        == sum(item["featureContractBasis"] == "PROBLEM_PDF_REDECOMPOSITION" for item in assignments),
        "problem PDF feature summary mismatch",
    )
    require(catalog["summary"]["contractCorrectionCount"] == 41, "contract correction summary mismatch")
    require(
        catalog["summary"]["contractCorrectionFlagCounts"] == corrections["summary"]["flagCounts"],
        "contract correction flag summary mismatch",
    )
    require(catalog["summary"]["transcriptionReconciliationCount"] == 200, "transcription reconciliation summary mismatch")
    require(catalog["summary"]["transcriptionTargetPromotionCount"] == 91, "target promotion summary mismatch")
    size_counts = Counter(cluster["recordCount"] for cluster in clusters)
    print(
        "Arena PDF canonical structure catalog verified: "
        f"assignments={len(assignments)} structures={len(clusters)} "
        f"solverGroups={len({item['solverGroupId'] for item in assignments})} "
        f"singletons={size_counts.get(1, 0)} hash={catalog['contentHash']}"
    )


if __name__ == "__main__":
    main()
