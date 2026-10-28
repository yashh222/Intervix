FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=5000 \
    USER_DATABASE=/app/data/users.sqlite3 \
    UPLOAD_DIR=/app/data/uploads

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && useradd --create-home --uid 10001 appuser \
    && mkdir -p /app/data/uploads \
    && chown -R appuser:appuser /app

COPY --chown=appuser:appuser . ./
USER appuser

EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "from urllib.request import urlopen; urlopen('http://127.0.0.1:5000/api/topics', timeout=3)" || exit 1

CMD ["waitress-serve", "--listen=0.0.0.0:5000", "app:app"]
