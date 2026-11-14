"""CSV and PDF exports of the active dataset.

Uploaded values are untrusted. CSV text cells are neutralized against spreadsheet formula injection, and
PDF text is reduced to the Latin-1 subset the built-in PDF fonts support.
"""
import csv
import io
import re
from dataclasses import replace
from datetime import datetime, timezone

from fpdf import FPDF

from app.schemas import ReadingStatus
from app.services.dataset import Dataset
from app.services.queries import filter_readings, query_exceedances, sort_readings
from app.services.reporting import build_summary

FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")
MAX_PDF_EXCEEDANCES = 200
MAX_PDF_MISSING = 100
COMPRESS_PDF = True          # tests turn this off to read the text


def safe_cell(value) -> object:
    """Numbers stay numbers; text that a spreadsheet would execute as a formula gets a leading apostrophe."""
    if value is None:
        return ""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value
    text = str(value)
    return "'" + text if text.startswith(FORMULA_PREFIXES) else text


def _csv(header: list[str], rows: list[list]) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\r\n")
    w.writerow(header)
    for row in rows:
        w.writerow([safe_cell(v) for v in row])
    return ("﻿" + buf.getvalue()).encode("utf-8")      # BOM so Excel reads UTF-8 (µg/m³)


def _version(ds: Dataset) -> tuple[str, str]:
    info = ds.info
    return (f"v{info.version}", info.name) if info else ("v0", "Starter dataset")


def readings_csv(ds: Dataset, **filters) -> bytes:
    version, name = _version(ds)
    rows = sort_readings(filter_readings(ds, **filters), "timestamp", "asc")
    return _csv(["dataset_version", "dataset_name", "row", "site_id", "site_name", "sensor", "sensor_label",
                 "timestamp", "value", "unit", "threshold", "status", "exceeded_by", "issues"],
                [[version, name, r.id, r.site_id, r.site_name, r.sensor, r.sensor_label, r.raw_timestamp, r.value,
                  r.unit, r.threshold, r.status.value, r.exceeded_by, "; ".join(r.issues)] for r in rows])


def exceedances_csv(ds: Dataset, **filters) -> bytes:
    version, name = _version(ds)
    rows = query_exceedances(ds, order="asc", **filters)
    return _csv(["dataset_version", "dataset_name", "row", "site_id", "site_name", "sensor", "sensor_label",
                 "timestamp", "value", "threshold", "unit", "exceeded_by", "exceeded_by_pct", "severity"],
                [[version, name, e.reading_id, e.site_id, e.site_name, e.sensor, e.sensor_label,
                  e.timestamp.isoformat(), e.value, e.threshold, e.unit, e.exceeded_by, e.exceeded_by_pct,
                  e.severity] for e in rows])


# ---------- PDF ----------

REPLACEMENTS = {"µ": "u", "³": "3", "²": "2", "–": "-", "—": "-", "‘": "'", "’": "'", "“": '"', "”": '"',
                "…": "...", "·": "-", "•": "-", "›": ">", " ": " ", " ": " "}


def pdf_text(value) -> str:
    text = "" if value is None else str(value)
    for a, b in REPLACEMENTS.items():
        text = text.replace(a, b)
    return text.encode("latin-1", "replace").decode("latin-1")


def _fmt_time(dt: datetime | None) -> str:
    return dt.strftime("%b %d, %Y %I:%M %p").replace(" 0", " ") if dt else "-"


def _num(v) -> str:
    return "-" if v is None else f"{v:g}"


class _Report(FPDF):
    footer_note = ""

    def footer(self):
        self.set_y(-14)
        self.set_font("Helvetica", size=7)
        self.set_text_color(110, 118, 135)
        self.cell(0, 4, pdf_text(self.footer_note), align="L")
        self.cell(0, 4, f"Page {self.page_no()}/{{nb}}", align="R")


def _heading(pdf: FPDF, text: str) -> None:
    pdf.ln(3)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(15, 27, 61)
    pdf.cell(0, 7, pdf_text(text), new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(30, 41, 59)


def _table(pdf: FPDF, header: list[str], rows: list[list], widths: list[int]) -> None:
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_fill_color(234, 240, 251)
    for h, w in zip(header, widths):
        pdf.cell(w, 6, pdf_text(h), border="B", fill=True)
    pdf.ln()
    pdf.set_font("Helvetica", size=8)
    for row in rows:
        if pdf.get_y() > pdf.h - 24:
            pdf.add_page()
        for value, w in zip(row, widths):
            text = pdf_text(value)
            while text and pdf.get_string_width(text) > w - 1.5:
                text = text[:-2] + "~"
            pdf.cell(w, 5.5, text, border="B")
        pdf.ln()


def summary_pdf(ds: Dataset, site_id: str | None = None, start: datetime | None = None,
                end: datetime | None = None) -> bytes:
    scoped = replace(ds, readings=filter_readings(ds, site_id=site_id, start=start, end=end))
    s = build_summary(scoped, site_id)
    version, name = _version(ds)
    info = ds.info

    pdf = _Report(format="A4")
    pdf.set_compression(COMPRESS_PDF)
    pdf.footer_note = ("SiteWatch - static dataset, not a live feed. Exceeding a configured monitoring threshold "
                       "does not by itself mean a regulatory violation.")
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(True, margin=20)
    pdf.set_margins(15, 15, 15)
    pdf.add_page()

    pdf.set_fill_color(15, 27, 61)
    pdf.rect(0, 0, pdf.w, 26, "F")
    pdf.set_xy(15, 7)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 7, "SiteWatch monitoring summary", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", size=9)
    pdf.cell(0, 5, pdf_text(f"Construction-site vibration, noise and dust monitoring - {s.scope}"),
             new_x="LMARGIN", new_y="NEXT")
    pdf.set_y(32)
    pdf.set_text_color(30, 41, 59)

    meta = [
        ("Dataset", f"{version} - {name}" + ("" if not info or info.source == "starter" else
                                             f" (uploaded {_fmt_time(info.created_at)})")),
        ("Files", f"{info.readings_filename}, {info.thresholds_filename}" if info else "readings.csv, thresholds.json"),
        ("Analyzed period", f"{_fmt_time(s.period_start)} to {_fmt_time(s.period_end)}"),
        ("Filters", ", ".join(x for x in [f"site {site_id}" if site_id else "", f"from {_fmt_time(start)}" if start else "",
                                           f"to {_fmt_time(end)}" if end else ""] if x) or "None (full dataset)"),
        ("Generated", datetime.now(timezone.utc).strftime("%b %d, %Y %H:%M UTC")),
    ]
    for label, value in meta:
        pdf.set_font("Helvetica", "B", 9)
        pdf.cell(38, 5.5, pdf_text(label))
        pdf.set_font("Helvetica", size=9)
        pdf.multi_cell(0, 5.5, pdf_text(value), new_x="LMARGIN", new_y="NEXT")

    t = s.totals
    _heading(pdf, "Totals")
    _table(pdf, ["Sites", "Readings", "Normal", "Exceedances", "Missing data", "Sites with alerts"],
           [[t.total_sites, t.total_readings, t.normal_readings, t.exceeded_readings, t.missing_data_readings,
             t.sites_with_alerts]], [28, 30, 28, 32, 30, 32])

    _heading(pdf, "Sites")
    _table(pdf, ["Site", "Name", "Status", "Readings", "Exceeded", "Missing", "Last exceedance"],
           [[x.site_id, x.site_name, x.status.value.replace("_", " ").title(), x.total_readings, x.exceeded_count,
             x.missing_data_count, _fmt_time(x.last_exceedance_at)] for x in s.sites],
           [16, 52, 24, 20, 20, 18, 30])

    _heading(pdf, "Sensors and configured thresholds")
    sensors = sorted({r.sensor for r in scoped.readings if r.sensor})
    rows = []
    for sensor in sensors:
        mine = [r for r in scoped.readings if r.sensor == sensor]
        first = next((r for r in mine if r.threshold is not None), None)
        rows.append([sensor, mine[0].sensor_label, f"{_num(first.threshold)} {first.unit}" if first else "-",
                     len(mine), sum(r.status == ReadingStatus.EXCEEDED for r in mine),
                     sum(r.status == ReadingStatus.MISSING_DATA for r in mine)])
    _table(pdf, ["Sensor", "Label", "Limit", "Readings", "Exceeded", "Missing"], rows, [34, 46, 30, 24, 24, 22])

    _heading(pdf, f"Exceedances ({len(s.exceedances)})")
    if s.exceedances:
        _table(pdf, ["Time", "Site", "Sensor", "Value", "Limit", "Over", "Severity"],
               [[_fmt_time(e.timestamp), f"{e.site_id} {e.site_name}", e.sensor_label, f"{_num(e.value)} {e.unit}",
                 f"{_num(e.threshold)} {e.unit}",
                 f"{e.exceeded_by_pct:g}%" if e.exceeded_by_pct is not None else "-", e.severity.title()]
                for e in s.exceedances[:MAX_PDF_EXCEEDANCES]], [32, 42, 28, 24, 24, 14, 16])
        if len(s.exceedances) > MAX_PDF_EXCEEDANCES:
            pdf.set_font("Helvetica", "I", 8)
            pdf.cell(0, 5, f"Showing the first {MAX_PDF_EXCEEDANCES}; download exceedances.csv for all.",
                     new_x="LMARGIN", new_y="NEXT")
    else:
        pdf.set_font("Helvetica", size=9)
        pdf.cell(0, 6, "No readings exceeded their configured thresholds.", new_x="LMARGIN", new_y="NEXT")

    missing = [r for r in scoped.readings if r.status == ReadingStatus.MISSING_DATA]
    _heading(pdf, f"Missing-data warnings ({len(missing)})")
    pdf.set_font("Helvetica", size=8.5)
    if not missing and not ds.warnings:
        pdf.cell(0, 6, "No missing measurements or data-quality warnings.", new_x="LMARGIN", new_y="NEXT")
    for r in missing[:MAX_PDF_MISSING]:
        pdf.multi_cell(0, 4.8, pdf_text(f"- Row {r.id}: {r.site_id} {r.sensor} at {r.raw_timestamp or 'unknown time'}"
                                        f" - {'; '.join(r.issues) or 'no value'} (not treated as zero)"),
                       new_x="LMARGIN", new_y="NEXT")
    for w in ds.warnings[:50]:
        pdf.multi_cell(0, 4.8, pdf_text(f"- {w}"), new_x="LMARGIN", new_y="NEXT")

    _heading(pdf, "Report")
    pdf.set_font("Helvetica", size=8.5)
    for para in s.report.split("\n"):
        if para.strip():
            pdf.multi_cell(0, 4.6, pdf_text(para), new_x="LMARGIN", new_y="NEXT")
    return bytes(pdf.output())


def export_filename(ds: Dataset, kind: str, ext: str) -> str:
    version, _ = _version(ds)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    return re.sub(r"[^A-Za-z0-9._-]", "_", f"sitewatch-{kind}-{version}-{stamp}.{ext}")
