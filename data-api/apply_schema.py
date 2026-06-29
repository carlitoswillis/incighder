import os
import pymysql

from scrapeArtistData import get_db_connection


def apply_schema():
    conn = get_db_connection()
    if not conn:
        print("Error applying schema: could not connect to database")
        return
    try:
        schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")
        with open(schema_path, "r") as f:
            sql = f.read()

        # PyMySQL runs one statement per execute(), so split the file ourselves.
        statements = [s.strip() for s in sql.split(";") if s.strip()]

        with conn.cursor() as cur:
            cur.execute("SET FOREIGN_KEY_CHECKS = 0")
            for table in ("metric_snapshots", "tracks", "albums", "artists"):
                cur.execute(f"DROP TABLE IF EXISTS {table}")
            for stmt in statements:
                cur.execute(stmt)
            cur.execute("SET FOREIGN_KEY_CHECKS = 1")

        conn.commit()
        print("Schema applied successfully!")

    except pymysql.Error as e:
        print("Error applying schema:", e)
    finally:
        conn.close()


if __name__ == "__main__":
    apply_schema()
