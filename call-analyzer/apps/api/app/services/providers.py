from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import tempfile
from abc import ABC, abstractmethod
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import httpx

from app.config import get_settings


@dataclass
class TranscriptData:
    text: str
    segments: list[dict[str, Any]]
    provider: str
    language: str = "ru"
    confidence: float | None = None
    technical_info: dict[str, Any] | None = None


class TranscriptionProvider(ABC):
    @abstractmethod
    def transcribe(self, path: Path, filename: str) -> TranscriptData:
        raise NotImplementedError


class MockTranscriptionProvider(TranscriptionProvider):
    def transcribe(self, path: Path, filename: str) -> TranscriptData:
        seed = filename.lower()
        if path.exists() and path.stat().st_size > 64 and not any(marker in seed for marker in ["demo", "test", "bad", "poor", "auto"]):
            return TranscriptData(
                text="Речь не распознана. Файл похож на реальную аудиозапись, но включен mock-провайдер расшифровки.",
                segments=[],
                provider="mock",
                confidence=0,
                technical_info={
                    "source": str(path),
                    "no_speech": True,
                    "reason": "mock_provider_does_not_transcribe_real_audio",
                    "recommendation": "Set TRANSCRIPTION_PROVIDER=local_faster_whisper for real call transcripts.",
                },
            )
        if "bad" in seed or "poor" in seed:
            text = (
                "Менеджер: Алло, мы металл продаем, вам надо?\n"
                "Клиент: Нет, не интересно.\n"
                "Менеджер: Ну хорошо, до свидания."
            )
        elif "auto" in seed:
            text = "Автоответчик: Оставьте сообщение после сигнала."
        else:
            text = (
                "Менеджер: Добрый день, меня зовут Иван, компания Металл Сервис. "
                "Подскажите, кто занимается закупкой металлопроката?\n"
                "Клиент: Обычно закупками занимаюсь я, что предлагаете?\n"
                "Менеджер: Поставляем трубы, лист, швеллер и резку по чертежам. "
                "Могу отправить прайс и уточнить потребность на ближайший месяц?\n"
                "Клиент: Да, пришлите коммерческое предложение на почту.\n"
                "Менеджер: Отлично, сегодня отправлю и завтра уточню по позициям."
            )
        segments = []
        cursor = 0
        for index, line in enumerate(text.splitlines()):
            speaker = "Speaker 1" if line.startswith("Менеджер") else "Speaker 2"
            role = "manager" if line.startswith("Менеджер") else "client"
            segments.append(
                {
                    "speaker": speaker,
                    "role": role,
                    "start_ms": cursor,
                    "end_ms": cursor + 6000,
                    "text": line,
                    "confidence": 0.92 - index * 0.02,
                }
            )
            cursor += 6200
        return TranscriptData(
            text=text,
            segments=segments,
            provider="mock",
            confidence=0.91,
            technical_info={"source": str(path), "note": "Deterministic test transcript"},
        )


class FasterWhisperProvider(TranscriptionProvider):
    def transcribe(self, path: Path, filename: str) -> TranscriptData:
        settings = get_settings()
        model = get_whisper_model(settings.whisper_model, settings.whisper_device, settings.whisper_compute_type)
        transcription_path = path
        normalized_path: Path | None = None
        normalization_error: str | None = None
        if settings.normalize_audio_before_transcription:
            try:
                normalized_path = normalize_audio_for_transcription(path)
                transcription_path = normalized_path
            except RuntimeError as exc:
                normalization_error = str(exc)

        try:
            segments_iter, info = model.transcribe(
                str(transcription_path),
                language="ru",
                vad_filter=True,
                beam_size=5,
                best_of=5,
                temperature=0,
                condition_on_previous_text=False,
            )
            segments = []
            text_parts = []
            for index, segment in enumerate(segments_iter):
                role = None
                speaker = f"Speaker {index % 2 + 1}"
                text_parts.append(segment.text.strip())
                segments.append(
                    {
                        "speaker": speaker,
                        "role": role,
                        "start_ms": int(segment.start * 1000),
                        "end_ms": int(segment.end * 1000),
                        "text": segment.text.strip(),
                        "confidence": None,
                    }
                )
            return TranscriptData(
                text="\n".join(text_parts),
                segments=segments,
                provider="local_faster_whisper",
                language=getattr(info, "language", "ru"),
                confidence=getattr(info, "language_probability", None),
                technical_info={
                    "model": settings.whisper_model,
                    "device": settings.whisper_device,
                    "compute_type": settings.whisper_compute_type,
                    "audio_normalized": normalized_path is not None,
                    "normalization_error": normalization_error,
                },
            )
        finally:
            if normalized_path:
                normalized_path.unlink(missing_ok=True)


def normalize_audio_for_transcription(path: Path) -> Path:
    fd, target_name = tempfile.mkstemp(prefix="normalized-call-", suffix=".wav")
    os.close(fd)
    target = Path(target_name)
    command = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(path),
        "-ac",
        "1",
        "-ar",
        "16000",
        "-af",
        "loudnorm=I=-16:TP=-1.5:LRA=11,highpass=f=80,lowpass=f=7800",
        str(target),
    ]
    result = subprocess.run(command, capture_output=True, text=True, timeout=180, check=False)
    if result.returncode != 0 or not target.exists() or target.stat().st_size == 0:
        target.unlink(missing_ok=True)
        message = (result.stderr or result.stdout or "unknown ffmpeg error").strip()
        raise RuntimeError(f"Audio normalization failed: {message[:500]}")
    return target


@lru_cache(maxsize=4)
def get_whisper_model(model_name: str, device: str, compute_type: str) -> Any:
    try:
        from faster_whisper import WhisperModel  # type: ignore
    except ImportError as exc:
        raise RuntimeError("faster-whisper is not installed. Use TRANSCRIPTION_PROVIDER=mock for local tests.") from exc
    return WhisperModel(model_name, device=device, compute_type=compute_type)


class ExternalSpeechToTextProvider(TranscriptionProvider):
    def transcribe(self, path: Path, filename: str) -> TranscriptData:
        raise RuntimeError("External speech-to-text provider is a placeholder and must be implemented for a concrete API.")


def get_transcription_provider() -> TranscriptionProvider:
    provider = get_settings().transcription_provider
    if provider == "local_faster_whisper":
        return FasterWhisperProvider()
    if provider == "external_speech_to_text":
        return ExternalSpeechToTextProvider()
    return MockTranscriptionProvider()


class LLMProvider(ABC):
    @abstractmethod
    async def analyze_call(self, payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    async def compare_managers(self, payload: dict[str, Any]) -> dict[str, Any]:
        managers = payload.get("managers", [])
        return {
            "summary": "Сравнительный отчет построен по завершенным звонкам менеджеров.",
            "manager_rankings": [
                {
                    "manager_id": item.get("manager_id"),
                    "manager_name": item.get("manager_name"),
                    "rank": index + 1,
                    "average_score": item.get("average_score", 0),
                    "calls_analyzed": item.get("calls_analyzed", 0),
                    "summary": item.get("local_summary", ""),
                }
                for index, item in enumerate(sorted(managers, key=lambda row: row.get("average_score", 0), reverse=True))
            ],
            "comparative_findings": [
                "Сравните менеджеров по среднему баллу, исходам звонков, слабым местам и предложенным услугам.",
            ],
            "service_gaps": build_mock_service_gaps(managers),
            "weaknesses_by_manager": [
                {
                    "manager_id": item.get("manager_id"),
                    "manager_name": item.get("manager_name"),
                    "weaknesses": item.get("top_weaknesses", [])[:5],
                    "recommendations": item.get("top_recommendations", [])[:5],
                }
                for item in managers
            ],
            "recommendations": [
                "Использовать лучшие формулировки сильных менеджеров как шаблон для команды.",
                "Проверять, что менеджер предлагает ключевые услуги компании и фиксирует следующий шаг.",
            ],
        }


class MockLLMProvider(LLMProvider):
    async def analyze_call(self, payload: dict[str, Any]) -> dict[str, Any]:
        transcript = payload["transcript"].lower()
        criteria = payload.get("criteria", [])
        auto_answer = "автоответчик" in transcript
        good_markers = ["прайс", "коммерческое", "потребность", "закуп", "завтра", "предложение"]
        bad_markers = ["вам надо", "не интересно", "до свидания"]
        score = 20 if auto_answer else 55
        score += min(35, sum(7 for item in good_markers if item in transcript))
        score -= min(30, sum(10 for item in bad_markers if item in transcript))
        score = max(0, min(100, score))
        outcome = "auto_answer" if auto_answer else ("next_step_agreed" if score >= 75 else "refusal")
        criterion_scores = []
        if not criteria:
            criteria = [
                {"name": "Приветствие", "weight": 1},
                {"name": "Выявление потребности", "weight": 1.4},
                {"name": "Следующее действие", "weight": 1.2},
            ]
        for item in criteria:
            criterion_scores.append(
                {
                    "name": item["name"],
                    "score": round(score / 10, 1),
                    "weight": item.get("weight", 1),
                    "comment": "Оценка рассчитана по тестовой эвристике mock-провайдера.",
                    "evidence": [{"quote": _short_quote(payload["transcript"]), "timecode": "00:00"}],
                }
            )
        return {
            "summary": "Клиентский звонок классифицирован и оценен по критериям продаж металлопроката.",
            "outcome": outcome,
            "overall_score": score,
            "strengths": ["Есть представление компании", "Есть попытка договориться о следующем шаге"] if score >= 70 else [],
            "weaknesses": ["Слабое выявление потребности", "Нет ценностного предложения"] if score < 70 else [],
            "recommendations": [
                "Уточнять роль собеседника и текущие закупочные позиции.",
                "Фиксировать конкретный следующий шаг: КП, дата созвона, ответственный.",
            ],
            "evidence": [{"quote": _short_quote(payload["transcript"]), "timecode": "00:00"}],
            "criteria": criterion_scores,
            "usage": {"prompt_tokens": len(payload["transcript"].split()), "completion_tokens": 120, "cost_rub": 0},
        }


def _short_quote(text: str) -> str:
    compact = re.sub(r"\s+", " ", text).strip()
    return compact[:180]


class OpenAICompatibleProvider(LLMProvider):
    def __init__(self, base_url: str, api_key: str, model: str, path: str = "") -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.path = path.strip("/") or "v1/chat/completions"

    async def analyze_call(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.base_url or not self.api_key or not self.model:
            raise RuntimeError("LLM provider is not configured")
        prompt = build_analysis_prompt(payload)
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{self.base_url}/{self.path}",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": self.model,
                    "temperature": 0.1,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": "Return strict JSON only."},
                        {"role": "user", "content": prompt},
                    ],
                },
            )
            response.raise_for_status()
            data = response.json()
        content = data["choices"][0]["message"]["content"]
        parsed = normalize_analysis_result(payload, parse_json_content(content))
        usage = data.get("usage") or {}
        parsed["usage"] = {
            "prompt_tokens": usage.get("prompt_tokens", 0),
            "completion_tokens": usage.get("completion_tokens", 0),
            "cost_rub": 0,
        }
        return parsed


class TimewebAgentProvider(LLMProvider):
    def __init__(self) -> None:
        settings = get_settings()
        self.base_url = (settings.timeweb_ai_base_url or "https://agent.timeweb.cloud").rstrip("/")
        self.api_key = settings.timeweb_ai_api_key
        self.agent_id = settings.timeweb_ai_agent_id
        self.model = settings.timeweb_ai_model or "gpt-4.1"
        self.path = settings.timeweb_ai_chat_completions_path.strip("/")
        self.max_completion_tokens = settings.llm_max_completion_tokens

    def endpoint(self) -> str:
        if self.path:
            return f"{self.base_url}/{self.path}"
        if self.base_url.endswith("/chat/completions"):
            return self.base_url
        if re.search(r"/api/v1/cloud-ai/agents/[^/]+/v1$", self.base_url):
            return f"{self.base_url}/chat/completions"
        if not self.agent_id:
            raise RuntimeError("TIMEWEB_AI_AGENT_ID is not configured")
        return f"{self.base_url}/api/v1/cloud-ai/agents/{self.agent_id}/v1/chat/completions"

    async def analyze_call(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.api_key:
            raise RuntimeError("TIMEWEB_AI_API_KEY is not configured")
        prompt = build_analysis_prompt(payload)
        async with httpx.AsyncClient(timeout=90) as client:
            response = await client.post(
                self.endpoint(),
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.model,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "Ты анализируешь холодные звонки менеджеров. "
                                "Ответ должен быть только валидным JSON без markdown и пояснений."
                            ),
                        },
                        {"role": "user", "content": prompt},
                    ],
                    "max_tokens": self.max_completion_tokens,
                    "stream": False,
                },
            )
            response.raise_for_status()
            data = response.json()
        content = data["choices"][0]["message"]["content"]
        parsed = normalize_analysis_result(payload, parse_json_content(content))
        usage = data.get("usage") or {}
        parsed["usage"] = {
            "prompt_tokens": usage.get("prompt_tokens", 0),
            "completion_tokens": usage.get("completion_tokens", 0),
            "cost_rub": 0,
        }
        return parsed

    async def compare_managers(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.api_key:
            raise RuntimeError("TIMEWEB_AI_API_KEY is not configured")
        prompt = build_manager_comparison_prompt(payload)
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                self.endpoint(),
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.model,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "Ты сравниваешь работу менеджеров по продажам металлопроката. "
                                "Ответ должен быть только валидным JSON без markdown и пояснений."
                            ),
                        },
                        {"role": "user", "content": prompt},
                    ],
                    "max_tokens": self.max_completion_tokens,
                    "stream": False,
                },
            )
            response.raise_for_status()
            data = response.json()
        return normalize_manager_comparison(parse_json_content(data["choices"][0]["message"]["content"]))


def parse_json_content(content: str) -> dict[str, Any]:
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start >= 0 and end > start:
            return json.loads(cleaned[start : end + 1])
        raise


def normalize_analysis_result(payload: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    transcript = str(payload.get("transcript") or "").casefold().replace("ё", "е")
    price_request_markers = [
        "пришлите прайс",
        "скиньте прайс",
        "отправьте прайс",
        "пришлите кп",
        "отправьте кп",
        "коммерческое предложение",
        "на почту",
        "на email",
        "на e-mail",
    ]
    hard_refusal_markers = [
        "не интересно",
        "не надо",
        "не нужно",
        "не звоните",
        "не закупаем",
        "не покупаем",
    ]
    no_answer_markers = ["речь не распознана", "гудки", "не дозвони", "нет ответа", "mock_provider_does_not_transcribe_real_audio"]
    auto_answer_markers = ["автоответчик", "оставьте сообщение", "после сигнала"]
    wrong_number_markers = ["не туда попали", "ошиблись номером", "неверный номер"]

    if any(marker in transcript for marker in no_answer_markers):
        result["outcome"] = "no_answer"
        result["overall_score"] = min(float(result.get("overall_score") or 0), 10)
        return result
    if any(marker in transcript for marker in auto_answer_markers):
        result["outcome"] = "auto_answer"
        result["overall_score"] = min(float(result.get("overall_score") or 0), 20)
        return result
    if any(marker in transcript for marker in wrong_number_markers):
        result["outcome"] = "wrong_number"
        result["overall_score"] = min(float(result.get("overall_score") or 0), 15)
        return result
    has_next_step = any(marker in transcript for marker in price_request_markers)
    has_hard_refusal = any(marker in transcript for marker in hard_refusal_markers)
    if has_next_step and not has_hard_refusal:
        original_score = float(result.get("overall_score") or 0)
        if result.get("outcome") != "next_step_agreed" or original_score < 70:
            result["outcome"] = "next_step_agreed"
            result["overall_score"] = max(original_score, 70)
            result.setdefault("recommendations", [])
            result["recommendations"].append(
                "Серверная проверка: клиент согласился получить прайс, КП или письмо, поэтому исход засчитан как следующий шаг."
            )
            result.setdefault("evidence", [])
            result["evidence"].append({"quote": "Клиент попросил прайс, КП или письмо", "timecode": "00:00"})
    return result


def normalize_manager_comparison(result: dict[str, Any]) -> dict[str, Any]:
    return {
        "summary": str(result.get("summary") or ""),
        "manager_rankings": list(result.get("manager_rankings") or []),
        "comparative_findings": list(result.get("comparative_findings") or []),
        "service_gaps": list(result.get("service_gaps") or []),
        "weaknesses_by_manager": list(result.get("weaknesses_by_manager") or []),
        "recommendations": list(result.get("recommendations") or []),
    }


def build_mock_service_gaps(managers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    all_services = sorted({service for manager in managers for service in manager.get("services_mentioned", [])})
    gaps = []
    for service in all_services:
        offered_by = [manager.get("manager_name") for manager in managers if service in manager.get("services_mentioned", [])]
        missing = [manager.get("manager_name") for manager in managers if service not in manager.get("services_mentioned", [])]
        if missing:
            gaps.append({"service": service, "offered_by": offered_by, "missing_managers": missing})
    return gaps


def build_analysis_prompt(payload: dict[str, Any]) -> str:
    return json.dumps(
        {
            "task": (
                "Оцени холодный звонок менеджера по продаже металлопроката. "
                "Верни только валидный JSON без markdown. Не требуй факта продажи: для холодного звонка "
                "успехом считается выход на ответственного, выявление потребности, согласие получить прайс/КП "
                "или договоренность о следующем контакте."
            ),
            "scoring_policy": {
                "strict_transcript_integrity": [
                    "Use only facts explicitly present in transcript.",
                    "Do not invent secretary, call interruption, silence, refusal, missing phrases, or hidden context.",
                    "Every weakness and outcome must be supported by a quote from transcript.",
                    "If client asks to send price list, offer, email, or commercial proposal, outcome must be next_step_agreed and score must be at least 70 unless there is an explicit hard refusal.",
                ],
                "important_rule": (
                    "Не ставь низкую оценку только потому, что клиент пока не купил. "
                    "Если клиент согласился получить прайс, КП, письмо, контакт или продолжить разговор позже, "
                    "это положительный исход next_step_agreed."
                ),
                "score_ranges": {
                    "85_100": "Сильный звонок: есть приветствие, представление, ЛПР/закупщик, потребность, ценность и конкретный следующий шаг.",
                    "70_84": "Хороший звонок: есть контакт с ответственным и следующий шаг, но не все вопросы/ценность раскрыты.",
                    "50_69": "Средний звонок: разговор состоялся, но потребность или следующий шаг сформулированы слабо.",
                    "25_49": "Слабый звонок: мало структуры, нет ясного следующего действия, но это не автоответчик и не неверный номер.",
                    "0_24": "Технический или почти бесполезный контакт: автоответчик, неверный номер, короткий жесткий отказ без информации.",
                },
                "outcome_definitions": {
                    "no_answer": "Речь не распознана, слышны только гудки, тишина или менеджер не дозвонился.",
                    "next_step_agreed": (
                        "Клиент согласился получить прайс/КП/письмо, дал контакт, подтвердил роль закупщика/ЛПР "
                        "или согласился на следующий созвон/действие."
                    ),
                    "refusal": "Клиент явно отказался и не согласился ни на какое следующее действие.",
                    "auto_answer": "В разговоре только автоответчик/голосовая почта/сигнал.",
                    "wrong_number": "Неверный номер или компания/человек не тот.",
                    "needs_review": "Не хватает данных или исход неоднозначен.",
                },
                "minimum_scores": {
                    "client_agreed_to_receive_price_or_offer": 70,
                    "responsible_person_identified": 60,
                    "only_auto_answer": 10,
                    "wrong_number": 5,
                },
                "few_shot_positive_case": {
                    "transcript_fragment": "Клиент: Я занимаюсь. Пришлите прайс на почту.",
                    "correct_outcome": "next_step_agreed",
                    "minimum_score": 70,
                },
            },
            "required_schema": {
                "summary": "string",
                "outcome": "next_step_agreed|refusal|no_answer|auto_answer|wrong_number|needs_review",
                "overall_score": "number 0..100",
                "strengths": ["string"],
                "weaknesses": ["string"],
                "recommendations": ["string"],
                "evidence": [{"quote": "string", "timecode": "mm:ss"}],
                "criteria": [{"name": "string", "score": "number 0..10", "weight": "number", "comment": "string", "evidence": []}],
            },
            "business_context": payload.get("business_context"),
            "metadata": payload.get("metadata"),
            "criteria": payload.get("criteria"),
            "transcript": payload.get("transcript"),
            "criterion_scoring_rules": (
                "Для каждого критерия score ставь 0..10. Если критерий не применим из-за автоответчика или неверного номера, "
                "ставь 0..2 и объясняй. Если есть фраза-доказательство, добавляй короткую цитату в evidence."
            ),
        },
        ensure_ascii=False,
    )


def build_manager_comparison_prompt(payload: dict[str, Any]) -> str:
    return json.dumps(
        {
            "task": (
                "Сравни менеджеров между собой по завершенным звонкам. Нужно найти, кто сильнее и слабее, "
                "в чем конкретно слабее, какие услуги/продукты/сервисы предлагает один менеджер, а другие не предлагают. "
                "Используй только переданные данные, не выдумывай факты. Если данных мало, явно напиши это."
            ),
            "business_context": (
                "Компания продает металлопрокат: трубы, листы, круги, балки, швеллеры, уголки, арматуру, "
                "нержавеющий и цветной металл, металлоизделия, резку и изготовление по чертежам."
            ),
            "required_schema": {
                "summary": "string",
                "manager_rankings": [
                    {
                        "manager_id": "string|null",
                        "manager_name": "string",
                        "rank": "number",
                        "average_score": "number",
                        "calls_analyzed": "number",
                        "summary": "string",
                    }
                ],
                "comparative_findings": ["string"],
                "service_gaps": [
                    {
                        "service": "string",
                        "offered_by": ["manager name"],
                        "missing_managers": ["manager name"],
                        "comment": "string",
                    }
                ],
                "weaknesses_by_manager": [
                    {
                        "manager_id": "string|null",
                        "manager_name": "string",
                        "weaknesses": ["string"],
                        "recommendations": ["string"],
                    }
                ],
                "recommendations": ["string"],
            },
            "comparison_rules": [
                "Сравнивай только менеджеров, у которых есть calls_analyzed > 0.",
                "Опирайся на средний балл, долю успешных исходов, повторяющиеся слабые места и примеры из звонков.",
                "Для service_gaps указывай только услуги, которые реально встречаются в данных одного менеджера и отсутствуют у других.",
                "Не называй менеджера слабым без конкретной причины.",
            ],
            "manager_profiles": payload.get("managers", []),
        },
        ensure_ascii=False,
    )


def get_llm_provider() -> LLMProvider:
    settings = get_settings()
    if settings.llm_provider == "openai_compatible":
        return OpenAICompatibleProvider(
            settings.openai_compatible_base_url,
            settings.openai_compatible_api_key,
            settings.openai_compatible_model,
        )
    if settings.llm_provider == "timeweb_agent":
        return TimewebAgentProvider()
    return MockLLMProvider()


def analysis_cache_key(transcript: str, criteria: list[dict[str, Any]], prompt_version: str = "v1") -> str:
    raw = json.dumps({"transcript": transcript, "criteria": criteria, "prompt_version": prompt_version}, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
