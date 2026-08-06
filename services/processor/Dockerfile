FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

WORKDIR /opt/engicite

RUN groupadd --system engicite && useradd --system --gid engicite --home /opt/engicite engicite

COPY pyproject.toml ./
COPY app ./app
RUN python -m pip install --upgrade pip && python -m pip install .

USER engicite
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.getenv('PORT','8000')+'/internal/v1/health/ready', timeout=4)" || exit 1

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
