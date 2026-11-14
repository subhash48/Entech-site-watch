"""Cheap deterministic scope check that runs before any model call.

It only rejects first messages with no SiteWatch vocabulary at all ("What's the capital of
France?"). Anything borderline goes to the model, whose system prompt also refuses
unrelated questions.
"""
import re

from app.services.dataset import Dataset
from app.services.thresholds import sensor_type

REFUSAL = ("I can only help with SiteWatch: the construction sites in this project, their vibration, noise and "
           "dust readings, thresholds, exceedances, missing data, reports, and how this application works. "
           "Try asking \"Which sites exceeded their limits?\"")

DOMAIN_TERMS = set("""
site sites sensor sensors reading readings vibration noise dust ppv pm10 dba decibel decibels particulate
threshold thresholds limit limits exceed exceeds exceeded exceeding exceedance exceedances alert alerts
missing blank data dataset csv json report reports summary summarise summarize client monitoring monitor
monitored sitewatch entech construction project api endpoint endpoints dashboard architecture feature features
chart charts trend trends highest lowest peak max maximum min minimum average mean compare comparison worst best
status normal value values unit units measurement measurements measured methodology frontend backend fastapi
nextjs next assistant tool tools rag documentation docs readme validation invalid warning warnings timestamp
timestamps period nyc york manhattan brooklyn queens filter filters pagination overview
upload uploads uploaded version versions changed change changes previous latest rollback activated active
import imported history recorded
""".split())
GREETINGS = {"hi", "hello", "hey", "help", "thanks", "thank"}
WORD_RE = re.compile(r"[a-z0-9]+")


def dataset_terms(ds: Dataset) -> set[str]:
    terms = {s.site_id.lower() for s in ds.sites}
    for s in ds.sites:
        terms |= set(WORD_RE.findall(s.site_name.lower()))
    for sensor in ds.sensors:
        terms |= {sensor, sensor_type(sensor), *sensor.split("_")}
    for t in ds.thresholds.values():
        terms |= set(WORD_RE.findall(t.unit.lower()))
    return {t for t in terms if len(t) > 1}


def in_scope(message: str, has_history: bool, ds: Dataset) -> bool:
    words = set(WORD_RE.findall(message.lower()))
    words |= {w[:-1] for w in words if w.endswith("s")}
    if words & (DOMAIN_TERMS | dataset_terms(ds)):
        return True
    if words and words <= GREETINGS | {"there", "please", "you", "can"}:
        return True
    # Follow-ups such as "and the second one?" depend on context: let the model decide.
    return has_history
