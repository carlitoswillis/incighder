
import psycopg2

def flush_artists_table():
    try:
        conn = psycopg2.connect(
            host="localhost",
            database="incighder",
            user="postgres",
            password="password"
        )
        cur = conn.cursor()

        cur.execute("TRUNCATE TABLE artists RESTART IDENTITY CASCADE;")
        conn.commit()
        print("Artists table flushed successfully!")

    except psycopg2.Error as e:
        print("Error flushing artists table:", e)

    finally:
        if conn:
            cur.close()
            conn.close()

if __name__ == "__main__":
    flush_artists_table()
