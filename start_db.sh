#!/bin/bash
echo "Starting only the 'db' service..."
docker-compose up -d db
echo "Database service started. Run 'docker-compose logs -f db' to stream logs."
