FROM python:3.11-slim

COPY requirements.txt .
RUN pip install --upgrade pip setuptools wheel \
    && pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY main.py ./main.py
COPY config ./config
COPY frontend_dist ./frontend_dist

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
