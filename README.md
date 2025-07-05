# Incighder

Incighder is an application designed to help recording artists, A&Rs, and music labels understand an artist's online traction and audience reach through data from music APIs, starting with Spotify.

## Core Functionality (Current State - MVP)

This application currently focuses on Spotify data and provides the following features:

-   **Artist Data Display:** View artist information (followers, popularity, genres, images, external URLs) in both a card-based layout and a detailed table view.
-   **Artist Search & Add:** Search for artists on Spotify and add their data to your local dataset.
-   **Artist Data Editing:** Edit specific artist data points, such as manually adding monthly listeners, on a dedicated artist detail page.
-   **Artist Removal:** Easily remove artists from your dataset via the UI.
-   **Database Integration:** Stores artist data in a PostgreSQL database.

## Technical Stack

-   **Frontend:** Next.js (React, TypeScript, Tailwind CSS)
-   **Backend (API):** Next.js API Routes (TypeScript) interacting with Python scripts.
-   **Scraping/Data Processing:** Python (with `spotipy` for Spotify API interaction and `psycopg2` for PostgreSQL).
-   **Database:** PostgreSQL (running via Docker).

## Setup and Running the Application

### Prerequisites

-   [Docker](https://www.docker.com/get-started) (for PostgreSQL database)
-   [Node.js](https://nodejs.org/en/download/) (LTS version recommended)
-   [npm](https://www.npmjs.com/get-npm) (comes with Node.js)
-   Python 3.9+ (and `pip`)

### 1. Clone the Repository

```bash
git clone [YOUR_REPOSITORY_URL]
cd incighder_gemini
```

### 2. Set up Spotify API Credentials

1.  Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2.  Log in and create a new application to get your `Client ID` and `Client Secret`.
3.  Create a `.env` file in the root of the `incighder_gemini` directory (next to `package.json`) with the following content, replacing the placeholders with your actual credentials:

    ```
    SPOTIFY_CLIENT_ID=your_spotify_client_id
    SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
    ```

### 3. Start the PostgreSQL Database

Navigate to the `incighder_gemini` directory and run Docker Compose:

```bash
docker compose up -d
```

This will start a PostgreSQL container named `incighder-db-1` on port `5432`.

### 4. Set up Python Environment and Apply Database Schema

Navigate to the `scraper` directory, create a Python virtual environment, install dependencies, and apply the database schema:

```bash
cd scraper
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt # You might need to create this file first with `pip freeze > requirements.txt`
pip install psycopg2-binary spotipy python-dotenv
python apply_schema.py
cd ..
```

### 5. Install Frontend Dependencies

Navigate to the `incighder_gemini/incighder` directory and install Node.js dependencies:

```bash
cd incighder
npm install
cd ..
```

### 6. Run the Next.js Application

Navigate to the `incighder_gemini/incighder` directory and start the development server:

```bash
cd incighder
npm run dev
```

The application will be accessible at `http://localhost:3000`.

## Usage

-   **Home Page (`/`):** Displays artist cards.
-   **Table View (`/table`):** Displays artist data in a spreadsheet-like table.
-   **Search Artists (`/search`):** Search for artists on Spotify and add them to your dataset.
-   **Artist Detail Page (`/artists/[id]`):** Click on an artist's name to view details and manually edit data like monthly listeners.

## Future Enhancements (Roadmap)

-   Customizable scoring logic.
-   Multi-platform integration (YouTube, SoundCloud, TikTok, etc.).
-   Historical data tracking.
-   AI-powered insights.

---

*This README was generated and updated by Gemini CLI.*