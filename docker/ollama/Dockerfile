FROM ollama/ollama:0.30.10

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /usr/local/bin/ollama-entrypoint.sh
RUN chmod +x /usr/local/bin/ollama-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/ollama-entrypoint.sh"]
