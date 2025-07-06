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
-   **Data API:** Python (with `spotipy` for Spotify API interaction and `psycopg2` for PostgreSQL) providing data ingestion and Spotify search functionality.
-   **Database:** PostgreSQL (running via Docker).

## Setup and Running the Application

### Prerequisites

-   [Docker Desktop](https://www.docker.com/products/docker-desktop) (includes Docker Engine and Docker Compose)
-   Git

### 1. Clone the Repository

```bash
git clone [YOUR_REPOSITORY_URL]
cd incighder_gemini
```

### 2. Set up Spotify API Credentials

1.  Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2.  Log in and create a new application to get your `Client ID` and `Client Secret`.
3.  Create a `.env` file in the root of the `incighder_gemini` directory (next to `docker-compose.yml`) with the following content, replacing the placeholders with your actual credentials:

    ```
    SPOTIFY_CLIENT_ID=your_spotify_client_id
    SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
    ```

### 3. Start the Application Services (Database, Data API, and Next.js Development Server)

Navigate to the root of the `incighder_gemini` directory and run:

```bash
docker-compose up --build -d db data-api
```
This command will:
-   Build the Docker images for the `db` (PostgreSQL) and `data-api` (Python Flask API) services.
-   Start these services in detached mode (`-d`).
-   The `data-api` service will automatically start its Flask API, which exposes endpoints for data insertion and Spotify search.

### 4. Apply Database Schema

Once the `db` service is healthy, apply the database schema using a one-off command:

```bash
docker-compose run --rm data-api python apply_schema.py
```
This command will:
-   Create a temporary container from the `data-api` image.
-   Run the `apply_schema.py` script, which will set up the necessary tables in your PostgreSQL database.
-   Automatically remove the temporary container (`--rm`) after execution.

### 5. Start the Next.js Development Server with Live-Reloading

Now, start the Next.js development server. This service is configured for live-reloading, so changes you make to your local files will automatically update in the browser.

```bash
docker-compose up -d incighder-dev
```
The application will be accessible at `http://localhost:3000`. Any changes you make to the files in the `incighder` directory on your local machine will be reflected in the running container.

### 6. Stopping the Services

To stop all running services, navigate to the `incighder_gemini` directory and run:

```bash
docker-compose down
```

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