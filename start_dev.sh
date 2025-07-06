#!/bin/bash

echo "Stopping and removing existing containers and volumes..."
docker-compose down --volumes

echo "Building and starting db and data-api services..."
docker-compose up --build -d db data-api

echo "Applying database schema..."
docker-compose run --rm data-api python apply_schema.py

echo "Starting incighder-dev service..."
docker-compose up incighder-dev

echo "Development environment started. Streaming logs..."
docker-compose logs -f
