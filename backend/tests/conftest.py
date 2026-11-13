import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import REPO_DIR, Settings
from app.main import create_app

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
ORIGIN = "http://localhost:3100"
HEADER = "site_id,site_name,sensor,timestamp,value\n"
THRESHOLDS = {"vibration_ppv": {"limit": 0.5, "unit": "in/s"},
              "noise_dba": {"limit": 85, "unit": "dBA"},
              "dust_pm10": {"limit": 150, "unit": "ug/m3"}}


def settings_for(readings: Path, thresholds: Path) -> Settings:
    return Settings(readings_path=readings, thresholds_path=thresholds, cors_origins=[ORIGIN],
                    environment="test", docs_paths=[REPO_DIR / "README.md", REPO_DIR / "docs"])


@pytest.fixture
def client():
    """Client over the real readings.csv and thresholds.json."""
    with TestClient(create_app(settings_for(DATA_DIR / "readings.csv", DATA_DIR / "thresholds.json"))) as c:
        yield c


@pytest.fixture
def make_client(tmp_path):
    """Client over custom data, for edge cases. Rows are CSV lines without the header."""
    def _make(rows: list[str], thresholds: dict | str = THRESHOLDS, header: str = HEADER) -> TestClient:
        readings = tmp_path / "readings.csv"
        readings.write_text(header + "\n".join(rows) + "\n", encoding="utf-8")
        rules = tmp_path / "thresholds.json"
        rules.write_text(thresholds if isinstance(thresholds, str) else json.dumps(thresholds), encoding="utf-8")
        return TestClient(create_app(settings_for(readings, rules)))
    return _make
