import os
import re
import sys

import pymysql

from scrapeArtistData import get_db_connection


def apply_schema(reset: bool = False):
    """Apply schema.sql. Idempotent by default (CREATE TABLE IF NOT EXISTS);
    existing tables and their data are left untouched.

    reset=True drops all tables first — destroys every row. Never run it from a
    startup script; it exists only for an explicit, intentional wipe:
        python apply_schema.py --reset
    """
    conn = get_db_connection()
    if not conn:
        print("Error applying schema: could not connect to database")
        sys.exit(1)
    try:
        schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")
        with open(schema_path, "r") as f:
            sql = f.read()

        # PyMySQL runs one statement per execute(), so split the file ourselves.
        # Strip -- comments first: a ';' inside a comment would otherwise cut a
        # statement in half (this bit us — TiDB rejected the truncated CREATE).
        sql = re.sub(r"--[^\n]*", "", sql)
        statements = [s.strip() for s in sql.split(";") if s.strip()]

        with conn.cursor() as cur:
            if reset:
                confirm = os.getenv("APPLY_SCHEMA_RESET_CONFIRM")
                if confirm != "yes" and sys.stdin.isatty():
                    answer = input(
                        "--reset DROPS ALL TABLES AND DATA. Type 'yes' to continue: "
                    )
                    if answer.strip().lower() != "yes":
                        print("Aborted; nothing was dropped.")
                        return
                elif confirm != "yes":
                    print(
                        "Refusing --reset in a non-interactive shell without "
                        "APPLY_SCHEMA_RESET_CONFIRM=yes"
                    )
                    sys.exit(1)
                cur.execute("SET FOREIGN_KEY_CHECKS = 0")
                for table in ("metric_snapshots", "tracks", "albums", "artists"):
                    cur.execute(f"DROP TABLE IF EXISTS {table}")
                cur.execute("SET FOREIGN_KEY_CHECKS = 1")
            # TiDB validates FK/collation compatibility on CREATE TABLE even
            # when IF NOT EXISTS would skip creation, so legacy tables whose
            # collations predate the utf8mb4_unicode_ci pinning error out with
            # 3780. Skip statements for tables that already exist.
            cur.execute("SHOW TABLES")
            existing = {list(row.values())[0] if isinstance(row, dict) else row[0]
                        for row in cur.fetchall()}
            for stmt in statements:
                m = re.match(
                    r"CREATE TABLE IF NOT EXISTS\s+`?(\w+)`?", stmt, re.IGNORECASE
                )
                if m and m.group(1) in existing:
                    continue
                cur.execute(stmt)

        conn.commit()
        print("Schema applied successfully!" + (" (reset)" if reset else ""))

    except pymysql.Error as e:
        print("Error applying schema:", e)
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    apply_schema(reset="--reset" in sys.argv[1:])
