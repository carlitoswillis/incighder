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

### 3. Development Workflow Scripts

To streamline the development process, several helper scripts are provided in the project root:

-   **`./start_dev.sh`**: This script performs a full cleanup, rebuilds all services (database, data API, and Next.js development server), applies the latest database schema, and then starts all services. Use this for a fresh start or after significant changes to `docker-compose.yml` or database schema.

    ```bash
    ./start_dev.sh
    ```

-   **`./start_db.sh`**: Starts only the PostgreSQL database service.

    ```bash
    ./start_db.sh
    ```

-   **`./start_data_api.sh`**: Starts the Python data API service. It will automatically start the `db` service if it's not already running.

    ```bash
    ./start_data_api.sh
    ```

-   **`./start_incighder_dev.sh`**: Starts the Next.js development server. It will automatically start the `db` and `data-api` services if they are not already running. This script runs in the foreground to stream logs directly to your terminal.

    ```bash
    ./start_incighder_dev.sh
    ```

### 4. Initial Setup and Running the Application

For the first-time setup or after significant changes (e.g., to `docker-compose.yml` or `schema.sql`), use the comprehensive `start_dev.sh` script:

```bash
./start_dev.sh
```

This command will:
-   Stop and remove any existing containers and volumes (ensuring a clean database state).
-   Build and start the Docker images for all services.
-   Apply the latest database schema.
-   Start the Next.js development server, accessible at `http://localhost:3000`.

For subsequent development, you can use the individual `start_*.sh` scripts to start only the services you need to restart, speeding up your workflow.

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