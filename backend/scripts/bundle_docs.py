"""Vercel build step: copy the project docs into backend/project_docs/.

The assistant's search_project_docs tool reads README.md and docs/*.md from the repository root.
On Vercel the Python function bundle only contains the backend/ service root, so this script copies
those files inside it. Locally the API reads the originals and this folder is not needed.
Stdlib only, compatible with the build image's system Python.
"""
import shutil
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
REPO = BACKEND.parent
OUT = BACKEND / "project_docs"


def main():
    if OUT.exists():
        shutil.rmtree(str(OUT))
    OUT.mkdir()
    sources = [REPO / "README.md"] + sorted((REPO / "docs").glob("*.md"))
    copied = 0
    for src in sources:
        if src.is_file():
            shutil.copy2(str(src), str(OUT / src.name))
            copied += 1
    if copied == 0:
        # Not fatal: the dashboard and data tools still work, only doc search returns nothing.
        print("bundle_docs: WARNING no project docs found next to backend/", file=sys.stderr)
    print("bundle_docs: copied {} file(s) into {}".format(copied, OUT))


if __name__ == "__main__":
    main()
