let source = "";
process.stdin.on("data", (chunk) => { source += chunk; });
process.stdin.on("end", () => {
  const report = JSON.parse(source);
  const failures = report.networkEntries.filter(
    (entry) => entry.status >= 400 || entry.status < 200 || entry.error
  );
  const browserProblems = report.browserEntries.filter(
    (entry) => !["page-hook-ready", "layout-metrics"].includes(entry.kind)
  );
  const layouts = report.browserEntries.filter(
    (entry) => entry.kind === "layout-metrics" && entry.detail?.phase === "settled-500ms"
  );
  const layoutProblems = layouts
    .filter((entry) => (
      entry.detail.document.horizontalOverflow
      || entry.detail.brokenImages.length
      || entry.detail.rawMathLines.length
      || entry.detail.overflow.length
      || entry.detail.clipped.length
    ))
    .map((entry) => ({
      href: entry.href,
      viewport: entry.detail.viewport,
      document: entry.detail.document,
      broken: entry.detail.brokenImages,
      rawMath: entry.detail.rawMathLines,
      overflow: entry.detail.overflow.slice(0, 8),
      clipped: entry.detail.clipped.slice(0, 8),
    }));
  const duplicates = Object.entries(
    report.networkEntries.reduce((result, entry) => {
      const key = `${entry.method} ${entry.target}`;
      (result[key] ||= []).push(entry);
      return result;
    }, {})
  )
    .filter(([, entries]) => entries.length > 1)
    .map(([key, entries]) => ({
      key,
      count: entries.length,
      statuses: entries.map((entry) => entry.status),
    }));

  console.log(JSON.stringify({
    networkCount: report.networkEntries.length,
    failures,
    browserProblems,
    layoutCount: layouts.length,
    layoutProblems,
    duplicates,
  }, null, 2));
});
