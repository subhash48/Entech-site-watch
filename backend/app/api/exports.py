"""Downloads of the active dataset: filtered readings CSV, exceedances CSV and a PDF monitoring summary."""
from typing import Annotated

from fastapi import APIRouter, Query
from fastapi.responses import Response

from app.api.routes import ERRORS, DatasetDep, EndQ, SensorQ, SiteQ, StartQ
from app.schemas import ReadingStatus
from app.services import exports
from app.services.queries import check_site

router = APIRouter(responses=ERRORS)


def _download(content: bytes, media_type: str, filename: str) -> Response:
    return Response(content, media_type=media_type, headers={
        "Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"})


@router.get("/api/exports/readings.csv", tags=["reports"], response_class=Response,
            responses={200: {"content": {"text/csv": {}}}})
def export_readings(ds: DatasetDep, site_id: SiteQ = None, sensor: SensorQ = None,
                    status: Annotated[ReadingStatus | None, Query(description="NORMAL, EXCEEDED or MISSING_DATA")] = None,
                    start: StartQ = None, end: EndQ = None,
                    q: Annotated[str | None, Query(max_length=100)] = None):
    """Readings of the active dataset with the same filters as /api/readings, as CSV."""
    body = exports.readings_csv(ds, site_id=site_id, sensor=sensor, status=status, start=start, end=end, q=q)
    return _download(body, "text/csv; charset=utf-8", exports.export_filename(ds, "readings", "csv"))


@router.get("/api/exports/exceedances.csv", tags=["reports"], response_class=Response,
            responses={200: {"content": {"text/csv": {}}}})
def export_exceedances(ds: DatasetDep, site_id: SiteQ = None, sensor: SensorQ = None, start: StartQ = None,
                       end: EndQ = None):
    """Confirmed exceedances of the active dataset as CSV."""
    body = exports.exceedances_csv(ds, site_id=site_id, sensor=sensor, start=start, end=end)
    return _download(body, "text/csv; charset=utf-8", exports.export_filename(ds, "exceedances", "csv"))


@router.get("/api/reports/summary.pdf", tags=["reports"], response_class=Response,
            responses={200: {"content": {"application/pdf": {}}}})
def summary_pdf(ds: DatasetDep, site_id: SiteQ = None, start: StartQ = None, end: EndQ = None):
    """A printable monitoring summary: dataset version, analyzed period, sites, sensors, exceedances and
    missing-data warnings."""
    check_site(ds, site_id)
    body = exports.summary_pdf(ds, site_id=site_id, start=start, end=end)
    return _download(body, "application/pdf", exports.export_filename(ds, "summary", "pdf"))
