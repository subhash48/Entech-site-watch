"""Read-only view of dataset versions for the AI assistant.

The assistant's tools receive this object, never the DatasetService or the store: it exposes only
listing versions and loading an immutable version for reading. There is no code path from a tool to
uploading, storing or activating a dataset.
"""
from app.datasets.models import DatasetVersion
from app.services.dataset import Dataset


class ReadOnlyCatalog:
    __slots__ = ("_list", "_load")

    def __init__(self, service):
        self._list = service.list_versions
        self._load = service.version_dataset

    def versions(self) -> list[DatasetVersion]:
        """Newest first; the starter dataset (version 0) is last."""
        return self._list().versions

    def dataset(self, dataset_id: str) -> Dataset:
        return self._load(dataset_id)
