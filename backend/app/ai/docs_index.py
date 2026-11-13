"""Tiny local retrieval over the project's Markdown docs (no vector database).

Docs are split into chunks by heading, scored with BM25 over simple word tokens, and
instruction-like lines are neutralised before any text reaches the model.
"""
import math
import re
import threading
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

TOKEN_RE = re.compile(r"[a-z0-9]+")
HEADING_RE = re.compile(r"^(#{1,4})\s+(.+?)\s*#*\s*$")
STOPWORDS = set("""a an and are as at be by can do does for from has have how i if in is it its of on or
that the this to was were what when where which who why will with you your me my we our""".split())
# Lines that look like attempts to instruct the model are removed from retrieved text.
INJECTION_RE = re.compile(
    r"(?i)(ignore|disregard|forget|override)\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier|system)?\s*"
    r"(instructions|rules|prompts?)|you are now|new instructions|system prompt|developer message|"
    r"reveal\s+.*(key|secret|password|prompt)|api[_ ]?key\s*[:=]")
MAX_CHUNK_CHARS = 1200


def tokenize(text: str) -> list[str]:
    return [t for t in TOKEN_RE.findall(text.lower()) if t not in STOPWORDS and len(t) > 1]


def neutralize(text: str) -> str:
    return "\n".join("[line removed: instruction-like text in document]" if INJECTION_RE.search(line) else line
                     for line in text.splitlines())


@dataclass(frozen=True)
class Chunk:
    source: str      # e.g. "README.md › Monitoring methodology"
    text: str
    terms: Counter


def chunk_markdown(name: str, text: str) -> list[Chunk]:
    chunks: list[Chunk] = []
    path: list[str] = []
    buf: list[str] = []

    def flush():
        body = "\n".join(buf).strip()
        buf.clear()
        if not body:
            return
        source = f"{name} › {' › '.join(path)}" if path else name
        paragraphs, piece = body.split("\n\n"), ""
        for para in paragraphs:
            if piece and len(piece) + len(para) > MAX_CHUNK_CHARS:
                chunks.append(Chunk(source, piece.strip(), Counter(tokenize(source + " " + piece))))
                piece = ""
            piece += para + "\n\n"
        if piece.strip():
            chunks.append(Chunk(source, piece.strip(), Counter(tokenize(source + " " + piece))))

    in_code = False
    for line in text.splitlines():
        if line.strip().startswith("```"):
            in_code = not in_code
        m = None if in_code else HEADING_RE.match(line)
        if m:
            flush()
            level = len(m.group(1))
            path = path[: level - 1] + [m.group(2).strip()]
        else:
            buf.append(line)
    flush()
    return chunks


class DocIndex:
    def __init__(self, chunks: list[Chunk]):
        self.chunks = chunks
        self.avg_len = sum(sum(c.terms.values()) for c in chunks) / len(chunks) if chunks else 0
        df = Counter(t for c in chunks for t in c.terms)
        n = len(chunks)
        self.idf = {t: math.log(1 + (n - f + 0.5) / (f + 0.5)) for t, f in df.items()}

    def search(self, query: str, k: int = 4) -> list[Chunk]:
        terms = tokenize(query)
        if not terms or not self.chunks:
            return []
        k1, b = 1.5, 0.75
        scored = []
        for c in self.chunks:
            length = sum(c.terms.values()) or 1
            score = sum(self.idf.get(t, 0) * c.terms[t] * (k1 + 1) /
                        (c.terms[t] + k1 * (1 - b + b * length / (self.avg_len or 1))) for t in terms if t in c.terms)
            if score > 0:
                scored.append((score, c))
        scored.sort(key=lambda x: -x[0])
        return [c for _, c in scored[:k]]


def _files(paths: list[Path]) -> list[Path]:
    out = []
    for p in paths:
        if p.is_dir():
            out += sorted(p.glob("*.md"))
        elif p.is_file():
            out.append(p)
    return out


_cache: dict[tuple, DocIndex] = {}
_lock = threading.Lock()


def load_index(paths: list[Path]) -> DocIndex:
    files = _files(paths)
    stamp = tuple((str(f), f.stat().st_mtime_ns) for f in files)
    with _lock:
        if stamp not in _cache:
            _cache.clear()
            chunks = [c for f in files for c in chunk_markdown(f.name, f.read_text(encoding="utf-8", errors="replace"))]
            _cache[stamp] = DocIndex(chunks)
        return _cache[stamp]
