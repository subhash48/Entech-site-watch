"""Dataset service: validated uploads -> immutable stored versions."""
from datetime import datetime

from app.datasets.preview import dataset_from, stats_for
from app.datasets.store import NewVersion
from app.datasets.validation import ValidatedDataset
from app.services.readings import to_naive_utc


def new_version_from(validated: ValidatedDataset, name: str, actor: str) -> NewVersion:
    """Everything needed to store one validated upload. Only valid uploads can be stored."""
    if not validated.valid:
        raise ValueError("Only a dataset without blocking errors can be stored.")
    stats = stats_for(dataset_from(validated.rows, validated.thresholds))
    return NewVersion(
        name=name, created_by=actor,
        readings_filename=validated.readings_file.filename, thresholds_filename=validated.thresholds_file.filename,
        readings_sha256=validated.readings_file.sha256, thresholds_sha256=validated.thresholds_file.sha256,
        readings_csv=validated.readings_text, thresholds_json=validated.thresholds_text,
        stats=stats.model_dump(mode="json"), validation=validated.report.model_dump(mode="json"),
        rows=validated.rows, thresholds=validated.thresholds,
        measured_at={r.row_number: to_naive_utc(datetime.fromisoformat(r.timestamp)) for r in validated.rows},
        values={r.row_number: (float(r.value) if r.value else None) for r in validated.rows},
    )
