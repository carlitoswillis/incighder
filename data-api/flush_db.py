import pymysql

from scrapeArtistData import get_db_connection


def flush_artists_table():
    conn = get_db_connection()
    if not conn:
        print("Error flushing artists table: could not connect to database")
        return
    try:
        with conn.cursor() as cur:
            # artists is referenced by other tables, so drop FK checks for the truncate.
            cur.execute("SET FOREIGN_KEY_CHECKS = 0")
            cur.execute("TRUNCATE TABLE artists")
            cur.execute("SET FOREIGN_KEY_CHECKS = 1")
        conn.commit()
        print("Artists table flushed successfully!")

    except pymysql.Error as e:
        print("Error flushing artists table:", e)

    finally:
        conn.close()


if __name__ == "__main__":
    flush_artists_table()
