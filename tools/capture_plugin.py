import datetime, hashlib, json, os
OUT = os.environ["CAPTURE_OUT"]
seen = set()

def pytest_configure(config):
    import app
    real_sum, real_det = app.summarize_bundle, app.detect_document
    def record(kind, bundle, result):
        try:
            src = json.dumps(bundle, ensure_ascii=False)
            res = json.dumps(result, ensure_ascii=False)
        except Exception:
            return
        key = hashlib.sha1((kind + src).encode()).hexdigest()
        if key in seen:
            return
        seen.add(key)
        today = datetime.datetime.now(datetime.timezone.utc).date().isoformat()
        with open(OUT, "a", encoding="utf-8") as f:
            f.write('{"kind":"%s","today":"%s","bundle":%s,"result":%s}\n' % (kind, today, src, res))
    def summarize_bundle(bundle):
        try:
            result = real_sum(bundle)
        except Exception:
            record("summary-raises", bundle, None)
            raise
        record("summary", bundle, result)
        return result
    def detect_document(bundle):
        result = real_det(bundle)
        record("detect", bundle, result["id"])
        return result
    app.summarize_bundle = summarize_bundle
    app.detect_document = detect_document
