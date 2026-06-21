
import psycopg2
import os

def apply_schema():
    try:
        conn = psycopg2.connect(
            host=os.getenv("PGHOST", "localhost"),
            database="incighder",
            user="postgres",
            password="password"
        )
        cur = conn.cursor()

        with open("schema.sql", "r") as f:
            sql = f.read()
            cur.execute("DROP TABLE IF EXISTS metric_snapshots, tracks, albums, artists CASCADE;")
            cur.execute(sql)

        conn.commit()
        cur.close()
        conn.close()
        print("Schema applied successfully!")

    except psycopg2.Error as e:
        print("Error applying schema:", e)

if __name__ == "__main__":
    apply_schema()
