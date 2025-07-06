#!/bin/bash
echo "Starting only the 'incighder-dev' service (and its dependencies if not running)..."
docker-compose up incighder-dev # Run in foreground to stream logs directly
echo "Incighder Dev service started. Streaming logs directly. Press Ctrl+C to stop."
