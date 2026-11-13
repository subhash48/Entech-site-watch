"""Site-level rollups, exceedance list, and the client-ready summary report."""
from datetime import datetime, timezone

from app.schemas import (Exceedance, Reading, ReadingStatus, Site, SiteStatus, SiteSummary, Summary,
                         Totals)
from app.services.dataset import Dataset


def site_summary(site: Site, readings: list[Reading]) -> SiteSummary:
    mine = [r for r in readings if r.site_id == site.site_id]
    count = lambda status: sum(r.status == status for r in mine)
    exceeded, missing = count(ReadingStatus.EXCEEDED), count(ReadingStatus.MISSING_DATA)
    times = [r.timestamp for r in mine if r.timestamp]
    exceed_times = [r.timestamp for r in mine if r.status == ReadingStatus.EXCEEDED]
    return SiteSummary(
        site_id=site.site_id, site_name=site.site_name,
        status=SiteStatus.ALERT if exceeded else SiteStatus.NEEDS_REVIEW if missing else SiteStatus.OK,
        total_readings=len(mine), normal_count=count(ReadingStatus.NORMAL),
        exceeded_count=exceeded, missing_data_count=missing,
        sensors=sorted({r.sensor for r in mine if r.sensor}),
        first_reading_at=min(times, default=None), last_reading_at=max(times, default=None),
        last_exceedance_at=max(exceed_times, default=None),
    )


HIGH_PCT, MEDIUM_PCT = 20.0, 5.0


def severity_for(pct: float | None) -> str:
    """Display priority only: high >= 20% over the limit, medium >= 5%, low < 5%.
    With a limit of 0 any excess is treated as high. Not a regulatory classification."""
    if pct is None or pct >= HIGH_PCT:
        return "high"
    return "medium" if pct >= MEDIUM_PCT else "low"


def to_exceedance(r: Reading) -> Exceedance:
    pct = round(r.exceeded_by / r.threshold * 100, 1) if r.threshold else None
    return Exceedance(reading_id=r.id, site_id=r.site_id, site_name=r.site_name, sensor=r.sensor,
                      sensor_label=r.sensor_label, timestamp=r.timestamp, value=r.value,
                      threshold=r.threshold, unit=r.unit, exceeded_by=r.exceeded_by, exceeded_by_pct=pct,
                      severity=severity_for(pct))


def totals(sites: list[SiteSummary], readings: list[Reading]) -> Totals:
    count = lambda status: sum(r.status == status for r in readings)
    return Totals(total_sites=len(sites), total_readings=len(readings),
                  normal_readings=count(ReadingStatus.NORMAL),
                  exceeded_readings=count(ReadingStatus.EXCEEDED),
                  missing_data_readings=count(ReadingStatus.MISSING_DATA),
                  sites_with_alerts=sum(s.exceeded_count > 0 for s in sites))


# ---------- report text ----------

def _num(v: float) -> str:
    return f"{v:g}"


def _time(dt: datetime) -> str:
    return f"{dt.hour % 12 or 12}:{dt.minute:02d} {'AM' if dt.hour < 12 else 'PM'}"


def _date(dt: datetime) -> str:
    return f"{dt:%B} {dt.day}, {dt.year}"


def _plural(n: int, word: str, plural: str | None = None) -> str:
    return f"{n} {word if n == 1 else plural or word + 's'}"


def _period(start: datetime | None, end: datetime | None) -> str:
    if not start or not end:
        return "No timestamped readings"
    if start.date() == end.date():
        return f"{_date(start)}, {_time(start)} – {_time(end)}"
    return f"{_date(start)}, {_time(start)} – {_date(end)}, {_time(end)}"


def build_report(scope: str, t: Totals, sites: list[SiteSummary], exceedances: list[Exceedance],
                 missing: list[Reading], warnings: list[str],
                 start: datetime | None, end: datetime | None) -> str:
    multi_day = bool(start and end and start.date() != end.date())
    when = lambda dt: f"{_date(dt)}, {_time(dt)}" if multi_day else _time(dt)

    lines = ["SiteWatch Monitoring Summary", f"Scope: {scope}", f"Monitoring period: {_period(start, end)}", "",
             "Overview"]
    reviewed = (f"{_plural(t.total_readings, 'sensor reading')} from "
                f"{_plural(t.total_sites, 'construction site')} {'was' if t.total_readings == 1 else 'were'} "
                f"reviewed against the configured thresholds.")
    if t.exceeded_readings:
        pct = round(t.exceeded_readings / t.total_readings * 100)
        result = (f"{_plural(t.exceeded_readings, 'reading')} ({pct}%) exceeded "
                  f"{'its limit' if t.exceeded_readings == 1 else 'their limits'} at "
                  f"{_plural(t.sites_with_alerts, 'site')}, {t.normal_readings} "
                  f"{'was' if t.normal_readings == 1 else 'were'} within limits")
    else:
        result = f"No readings exceeded their limits; {t.normal_readings} {'was' if t.normal_readings == 1 else 'were'} within limits"
    if t.missing_data_readings:
        result += (f", and {t.missing_data_readings} could not be evaluated because of missing or invalid data.")
    else:
        result += "."
    lines += [f"{reviewed} {result}", "", "Threshold exceedances"]

    if not exceedances:
        lines.append("None recorded in this period.")
    for site in sites:
        site_exc = [e for e in exceedances if e.site_id == site.site_id]
        if not site_exc:
            continue
        lines.append(f"{site.site_name} ({site.site_id}): {_plural(len(site_exc), 'exceedance')}")
        for e in site_exc:
            over = f", {_num(e.exceeded_by_pct)}% over" if e.exceeded_by_pct is not None else ""
            lines.append(f"  • {when(e.timestamp)} – {e.sensor_label}: {_num(e.value)} {e.unit} against a limit of "
                         f"{_num(e.threshold)} {e.unit} (+{_num(e.exceeded_by)} {e.unit}{over})")

    lines += ["", "Data quality"]
    for r in missing:
        at = when(r.timestamp) if r.timestamp else f"recorded time '{r.raw_timestamp or 'blank'}'"
        reasons = "; ".join(r.issues)
        lines.append(f"  • {r.site_name} ({r.site_id or 'no site ID'}) – {r.sensor_label} at {at}: {reasons}. "
                     f"This reading was not evaluated and was not treated as zero.")
    lines += [f"  • {w}" for w in warnings]
    if not missing and not warnings:
        lines.append("All readings were complete and valid.")

    lines += ["", "Recommended follow-up"]
    if exceedances:
        lines.append("  • Review site activity at the times listed above and confirm that the relevant "
                     "mitigation measures were in place.")
    if missing:
        lines.append(f"  • Verify the {_plural(len(missing), 'reading')} flagged under Data quality with the "
                     f"monitoring equipment provider and resubmit corrected values.")
    if not exceedances and not missing:
        lines.append("  • No action required. Continue routine monitoring.")
    lines += ["", "Times are shown as recorded by the site sensors."]
    return "\n".join(lines)


def build_summary(dataset: Dataset, site_id: str | None = None) -> Summary:
    sites = [s for s in dataset.sites if not site_id or s.site_id == site_id]
    readings = [r for r in dataset.readings if not site_id or r.site_id == site_id]
    summaries = [site_summary(s, readings) for s in sites]
    exceedances = [to_exceedance(r) for r in readings if r.status == ReadingStatus.EXCEEDED]
    missing = [r for r in readings if r.status == ReadingStatus.MISSING_DATA]
    t = totals(summaries, readings)
    times = [r.timestamp for r in readings if r.timestamp]
    start, end = min(times, default=None), max(times, default=None)
    scope = f"{sites[0].site_name} ({sites[0].site_id})" if site_id else f"All sites ({len(sites)})"
    warnings = [] if site_id else dataset.warnings
    data_quality = [f"{r.site_name} – {r.sensor_label} (row {r.id}): {'; '.join(r.issues)}" for r in missing]
    return Summary(
        generated_at=datetime.now(timezone.utc).replace(microsecond=0), scope=scope,
        period_start=start, period_end=end, totals=t, sites=summaries, exceedances=exceedances,
        data_quality=data_quality + warnings,
        report=build_report(scope, t, summaries, exceedances, missing, warnings, start, end),
    )
