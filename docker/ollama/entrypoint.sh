#!/bin/sh
set -e

MODEL="${OLLAMA_MODEL:-llama3.1:8b}"

# Start Ollama server in background
ollama serve &
OLLAMA_PID=$!

# Wait for Ollama server to be ready
echo "Waiting for Ollama server to start..."
until curl -s http://localhost:11434/api/tags > /dev/null 2>&1; do
  sleep 1
done
echo "Ollama server is ready."

# Check if model already exists
if ! ollama list 2>/dev/null | grep -q "$MODEL"; then
  echo "Pulling model: $MODEL (this may take a while)..."
  ollama pull "$MODEL"
  echo "Model $MODEL pulled successfully."
else
  echo "Model $MODEL already exists."
fi

wait $OLLAMA_PID
