import os
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
            for stmt in statements:
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
