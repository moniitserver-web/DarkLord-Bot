FROM python:3.13-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY inspect_reference.py test_inspect_reference.py ./
RUN python -m unittest discover -p 'test_*.py' -v

USER 65532:65532
ENTRYPOINT ["python", "/app/inspect_reference.py"]
CMD ["--input", "/input", "--output", "/output/report.json"]
