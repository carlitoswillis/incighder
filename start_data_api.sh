#!/bin/bash
echo "Starting only the 'data-api' service (and 'db' if not running)..."
docker-compose up -d data-api
echo "Data API service started. Run 'docker-compose logs -f data-api' to stream logs."
