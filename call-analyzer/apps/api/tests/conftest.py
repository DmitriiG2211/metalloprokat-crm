import os
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:///./storage/test.db"
os.environ["LLM_PROVIDER"] = "mock"
os.environ["TRANSCRIPTION_PROVIDER"] = "mock"
Path("storage/test.db").unlink(missing_ok=True)
