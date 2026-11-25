"""Regenerate test/golden/ from Provbana's own summariser.

The JavaScript in src/ is a port of the Python summariser in Provbana
(https://github.com/vadi2/Provbana, provbana/app.py). The golden files are that
summariser's output for every bundle in samples/ and test/fixtures/, and
test/parity.test.js holds the port to them.

    cd /path/to/Provbana/provbana
    DATA_DIR=/tmp/provbana-golden .venv/bin/python /path/to/tools/golden.py
"""
import datetime
import json
import pathlib
import sys

sys.path.insert(0, ".")
import app  # noqa: E402 - Provbana's app.py, from the working directory

ROOT = pathlib.Path(__file__).resolve().parent.parent
TODAY = datetime.datetime.now(datetime.timezone.utc).date().isoformat()

for folder in ("samples", "test/fixtures"):
    for path in sorted((ROOT / folder).glob("*.json")):
        bundle = json.loads(path.read_text(encoding="utf-8"))
        golden = {
            "today": TODAY,
            "doc_type": app.detect_document(bundle)["id"],
            "summary": app.safe_summary(bundle),
        }
        out = ROOT / "test" / "golden" / path.name
        out.write_text(json.dumps(golden, ensure_ascii=False, indent=1) + "\n",
                       encoding="utf-8")
        print(out.relative_to(ROOT))
