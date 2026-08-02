const {
  DataAnalysis,
} = require("../dataAnalysis/dataAnalysisModel");
const {
  FIRST_MONTH_ASSUMPTIONS,
  FIRST_MONTH_METRICS,
} = require("../dataAnalysis/metricCatalog");

const AUTOMATIC_MONTHLY_SOURCE =
  "monthly-authoritative-ledger-v1";

function stableDimensions(dimensions = {}) {
  const normalized = Object.fromEntries(
    Object.entries(dimensions)
      .sort(([left], [right]) =>
        left.localeCompare(right)
      )
      .map(([key, value]) => [
        key,
        String(value),
      ])
  );
  return {
    dimensions: normalized,
    dimensionKey:
      Object.keys(normalized).length > 0
        ? JSON.stringify(normalized)
        : "_all",
  };
}

async function seedFirstMonthCatalog() {
  const metricOperations =
    FIRST_MONTH_METRICS.map((metric) => ({
      updateOne: {
        filter: {
          kind: "METRIC_DEFINITION",
          metricKey: metric.key,
          periodKey: "CATALOG",
          dimensionKey: "_all",
          policyVersionCode: "",
        },
        update: {
          $set: {
            label: metric.label,
            category: metric.category,
            unit: metric.unit,
            dimensionNames:
              metric.dimensions || [],
            minimumSampleSize:
              metric.minimumSampleSize || 100,
            source:
              "docs/logic/03_SUB_DIVISION_RANKING_SYSTEM_PAYBACK.md",
          },
          $setOnInsert: {
            kind: "METRIC_DEFINITION",
            metricKey: metric.key,
            periodKey: "CATALOG",
            dimensionKey: "_all",
            policyVersionCode: "",
          },
        },
        upsert: true,
      },
    }));
  const assumptionOperations =
    FIRST_MONTH_ASSUMPTIONS.map(
      (assumption) => ({
        updateOne: {
          filter: {
            kind: "ASSUMPTION",
            metricKey: assumption.key,
            periodKey: "LAUNCH_BASELINE",
            dimensionKey: "_all",
            policyVersionCode: "",
          },
          update: {
            $set: {
              label: assumption.label,
              category: "simulation",
              unit: assumption.unit,
              numericValue:
                assumption.value,
              minimumSampleSize:
                assumption.minimumSampleSize,
              source:
                "docs/logic/09_GOAT_ARENA_PROFIT_LOSS_SIMULATION.md",
              note:
                "첫 운영월 실측 후 재검토해야 하는 시뮬레이션 가정",
            },
            $setOnInsert: {
              kind: "ASSUMPTION",
              metricKey: assumption.key,
              periodKey:
                "LAUNCH_BASELINE",
              dimensionKey: "_all",
              policyVersionCode: "",
            },
          },
          upsert: true,
        },
      })
    );

  if (
    metricOperations.length +
      assumptionOperations.length ===
    0
  ) {
    return null;
  }
  return DataAnalysis.bulkWrite([
    ...metricOperations,
    ...assumptionOperations,
  ]);
}

async function recordObservation({
  metricKey,
  label,
  category,
  unit,
  periodKey,
  value,
  numerator = null,
  denominator = null,
  sampleSize = 0,
  dimensions = {},
  policyVersionCode = "",
  source = "operator",
  note = "",
  measuredAt = new Date(),
}) {
  const dimensionData =
    stableDimensions(dimensions);
  return DataAnalysis.findOneAndUpdate(
    {
      kind: "OBSERVATION",
      metricKey,
      periodKey,
      dimensionKey:
        dimensionData.dimensionKey,
      policyVersionCode,
    },
    {
      $set: {
        label,
        category,
        unit,
        numericValue:
          value !== null &&
          value !== undefined &&
          value !== "" &&
          Number.isFinite(Number(value))
            ? Number(value)
            : null,
        numerator,
        denominator,
        sampleSize,
        dimensions:
          dimensionData.dimensions,
        source,
        note,
        measuredAt,
      },
    },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
    }
  );
}

async function upsertMonthlyObservations({
  observations,
  periodKey,
  aggregationRunId,
  calculationVersion,
  periodStartedAt,
  periodEndedAt,
  periodClosed,
  measuredAt = new Date(),
}) {
  const operations = (observations || []).map((observation) => {
    const dimensionData = stableDimensions(observation.dimensions);
    const policyVersionCode = String(
      observation.policyVersionCode || ""
    );
    return {
      updateOne: {
        filter: {
          kind: "OBSERVATION",
          metricKey: observation.metricKey,
          periodKey,
          dimensionKey: dimensionData.dimensionKey,
          policyVersionCode,
        },
        update: {
          $set: {
            label: observation.label,
            category: observation.category,
            unit: observation.unit,
            numericValue:
              observation.numericValue !== null &&
              observation.numericValue !== undefined &&
              observation.numericValue !== "" &&
              Number.isFinite(Number(observation.numericValue))
                ? Number(observation.numericValue)
                : null,
            numerator:
              observation.numerator === null ||
              observation.numerator === undefined
                ? null
                : Number(observation.numerator),
            denominator:
              observation.denominator === null ||
              observation.denominator === undefined
                ? null
                : Number(observation.denominator),
            sampleSize: Math.max(
              0,
              Number(observation.sampleSize || 0)
            ),
            dimensions: dimensionData.dimensions,
            dimensionNames: observation.dimensionNames || [],
            source: AUTOMATIC_MONTHLY_SOURCE,
            note: String(observation.note || ""),
            measuredAt,
            aggregationRunId,
            calculationVersion,
            periodStartedAt,
            periodEndedAt,
            periodClosed: Boolean(periodClosed),
          },
          $setOnInsert: {
            kind: "OBSERVATION",
            metricKey: observation.metricKey,
            periodKey,
            dimensionKey: dimensionData.dimensionKey,
            policyVersionCode,
          },
        },
        upsert: true,
      },
    };
  });
  if (!operations.length) {
    return { upsertedCount: 0, modifiedCount: 0, matchedCount: 0 };
  }
  return DataAnalysis.bulkWrite(operations, { ordered: false });
}

module.exports = {
  AUTOMATIC_MONTHLY_SOURCE,
  recordObservation,
  seedFirstMonthCatalog,
  stableDimensions,
  upsertMonthlyObservations,
};
