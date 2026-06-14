from __future__ import annotations

import hashlib
import shutil
import zipfile
from pathlib import Path
from typing import BinaryIO

import pandas as pd
from fastapi import HTTPException, UploadFile, status

from app.config import get_settings


AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".ogg", ".opus", ".aac", ".flac", ".amr"}
METADATA_EXTENSIONS = {".csv", ".xlsx"}


def safe_filename(name: str) -> str:
    keep = [ch if ch.isalnum() or ch in "._- " else "_" for ch in Path(name).name]
    return "".join(keep).strip() or "file"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def save_upload(upload: UploadFile, destination: Path) -> Path:
    settings = get_settings()
    destination.parent.mkdir(parents=True, exist_ok=True)
    size = 0
    with destination.open("wb") as out:
        while chunk := upload.file.read(1024 * 1024):
            size += len(chunk)
            if size > settings.max_upload_mb * 1024 * 1024:
                raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File is too large")
            out.write(chunk)
    return destination


def is_audio(path: Path) -> bool:
    return path.suffix.lower() in AUDIO_EXTENSIONS


def is_metadata(path: Path) -> bool:
    return path.suffix.lower() in METADATA_EXTENSIONS


def read_metadata(path: Path) -> dict[str, dict[str, str]]:
    if path.suffix.lower() == ".csv":
        frame = pd.read_csv(path)
    elif path.suffix.lower() == ".xlsx":
        frame = pd.read_excel(path)
    else:
        return {}
    rows: dict[str, dict[str, str]] = {}
    for record in frame.fillna("").to_dict(orient="records"):
        filename = str(record.get("filename", "")).strip()
        if filename:
            rows[Path(filename).name] = {str(k): str(v) for k, v in record.items()}
    return rows


def extract_zip_safely(zip_path: Path, destination: Path) -> list[Path]:
    settings = get_settings()
    destination.mkdir(parents=True, exist_ok=True)
    extracted: list[Path] = []
    total_size = 0
    with zipfile.ZipFile(zip_path) as archive:
        members = archive.infolist()
        if len(members) > settings.max_zip_files:
            raise HTTPException(status_code=400, detail="ZIP contains too many files")
        for member in members:
            if member.is_dir():
                continue
            total_size += member.file_size
            if total_size > settings.max_zip_uncompressed_mb * 1024 * 1024:
                raise HTTPException(status_code=400, detail="ZIP uncompressed size is too large")
            target = destination / safe_filename(member.filename)
            if not str(target.resolve()).startswith(str(destination.resolve())):
                raise HTTPException(status_code=400, detail="Unsafe ZIP path")
            with archive.open(member) as src, target.open("wb") as out:
                shutil.copyfileobj(src, out)
            extracted.append(target)
    return extracted


def copy_fileobj(fileobj: BinaryIO, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("wb") as out:
        shutil.copyfileobj(fileobj, out)
