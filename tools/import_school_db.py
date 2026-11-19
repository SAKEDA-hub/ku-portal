#!/usr/bin/env python3
"""Validate school.db and create private runtime JSON + one-time credential CSV.

Run on Alwaysdata after uploading the SQLite file:
  python3 ~/ku-portal/tools/import_school_db.py ~/ku-portal/data/school.db
Existing runtime data is never replaced unless --replace is explicitly supplied.
"""
import argparse
import csv
import hashlib
import json
import os
import secrets
import sqlite3
import tempfile
from pathlib import Path


def atomic_private(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temp_name = tempfile.mkstemp(prefix=path.name + ".", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp_name, path)
        os.chmod(path, 0o600)
    finally:
        try:
            os.unlink(temp_name)
        except FileNotFoundError:
            pass


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("database", type=Path)
    parser.add_argument("--data-dir", type=Path, default=Path(__file__).resolve().parents[1] / "data")
    parser.add_argument("--replace", action="store_true", help="replace existing school.json and credentials")
    args = parser.parse_args()
    source = args.database.resolve()
    target = args.data_dir.resolve() / "school.json"
    credentials = args.data_dir.resolve() / "school-credentials.csv"
    if not source.is_file():
        raise SystemExit("SQLite file not found")
    if not args.replace and (target.exists() or credentials.exists()):
        raise SystemExit("Runtime database or credentials already exist. Back them up and rerun with --replace only if replacement is intended.")

    con = sqlite3.connect(f"file:{source}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    if con.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
        raise SystemExit("SQLite integrity check failed")
    if con.execute("PRAGMA foreign_key_check").fetchone() is not None:
        raise SystemExit("Foreign key validation failed")

    users, tests, components, results, scores = [], [], [], [], []
    credentials_rows = []
    for row in con.execute("SELECT * FROM users ORDER BY id"):
        password = secrets.token_urlsafe(18)
        salt = secrets.token_hex(16)
        # Match Node's crypto.scryptSync(password, saltString, 64, ...): salt is UTF-8 text.
        digest = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=64, maxmem=64 * 1024 * 1024).hex()
        users.append({
            "id": f"school_user_{row['id']}", "username": row["username"], "role": row["role"],
            "direction": row["direction"], "year": row["year"], "group": row["grp"], "number": row["number"],
            "salt": salt, "passHash": digest, "passAlgo": "scrypt",
        })
        credentials_rows.append((row["username"], password, row["role"]))
    for row in con.execute("SELECT * FROM tests ORDER BY id"):
        tests.append({"id": f"school_test_{row['id']}", "title": row["title"], "ownerId": f"school_user_{row['owner_id']}"})
    for row in con.execute("SELECT * FROM test_components ORDER BY id"):
        components.append({
            "id": f"school_component_{row['id']}", "testId": f"school_test_{row['test_id']}",
            "skill": row["skill"], "maxPoints": row["max_points"], "docxFilename": None,
        })
    for row in con.execute("SELECT * FROM results ORDER BY id"):
        results.append({
            "id": f"school_result_{row['id']}", "userId": f"school_user_{row['user_id']}",
            "testId": f"school_test_{row['test_id']}", "totalScore": row["total_score"],
        })
    for row in con.execute("SELECT * FROM scores ORDER BY result_id, component_id"):
        scores.append({
            "resultId": f"school_result_{row['result_id']}", "componentId": f"school_component_{row['component_id']}",
            "points": row["points"],
        })
    con.close()

    data = {"version": 1, "users": users, "tests": tests, "components": components, "results": results, "scores": scores}
    if len(users) != 73 or len(tests) != 2 or len(results) != 144 or len(scores) != 288:
        raise SystemExit("Unexpected dataset counts; nothing was written")
    for test in tests:
        total = sum(c["maxPoints"] for c in components if c["testId"] == test["id"])
        if not 1 <= total <= 100:
            raise SystemExit("Test component maximum is invalid; nothing was written")
    for result in results:
        actual = sum(s["points"] for s in scores if s["resultId"] == result["id"])
        if actual != result["totalScore"]:
            raise SystemExit("Result total does not match skill scores; nothing was written")

    atomic_private(target, json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    import io
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer)
    writer.writerow(["username", "password", "role"])
    writer.writerows(credentials_rows)
    atomic_private(credentials, buffer.getvalue())
    print(f"Imported {len(users)} accounts, {len(tests)} tests, {len(results)} results.")
    print("Credentials saved privately to data/school-credentials.csv (mode 600). Retrieve it over SFTP and delete it after saving a private copy.")


if __name__ == "__main__":
    main()
