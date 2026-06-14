from collections import Counter
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import csrf_guard
from app.models import AggregateReport, AnalysisResult, Call, ManagerProfile, TranscriptSegment, User
from app.schemas import ReportOut
from app.services.providers import get_llm_provider

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/manager-performance", response_model=ReportOut)
def manager_performance(period: str = "all", user: User = Depends(csrf_guard), db: Session = Depends(get_db)) -> ReportOut:
    rows = db.execute(
        select(Call.manager_id, func.count(Call.id), func.avg(Call.overall_score))
        .where(Call.organization_id == user.organization_id)
        .group_by(Call.manager_id)
    ).all()
    managers = {m.id: m.name for m in db.query(ManagerProfile).filter(ManagerProfile.organization_id == user.organization_id).all()}
    weak_rows = db.scalars(select(AnalysisResult).where(AnalysisResult.organization_id == user.organization_id).limit(100)).all()
    weak_points: list[str] = []
    recommendations: list[str] = []
    for row in weak_rows:
        weak_points.extend(row.weaknesses[:2])
        recommendations.extend(row.recommendations[:2])
    return ReportOut(
        period=period,
        managers=[
            {"manager_id": row[0], "manager_name": managers.get(row[0], "Не назначен"), "calls": row[1], "average_score": round(float(row[2] or 0), 1)}
            for row in rows
        ],
        weak_points=dedupe(weak_points)[:10],
        recommendations=dedupe(recommendations)[:10],
        calls=sum(int(row[1]) for row in rows),
    )


@router.post("/manager-comparison")
async def manager_comparison(
    calls_per_manager: int = 100,
    user: User = Depends(csrf_guard),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    calls_per_manager = max(10, min(calls_per_manager, 100))
    payload = {"managers": build_manager_profiles(db, user.organization_id, calls_per_manager)}
    result = await get_llm_provider().compare_managers(payload)
    report = AggregateReport(
        organization_id=user.organization_id,
        period="all",
        scope="manager_comparison",
        data={
            **result,
            "generated_at": datetime.utcnow().isoformat(),
            "calls_per_manager": calls_per_manager,
            "source": payload,
        },
    )
    db.add(report)
    db.commit()
    return report.data


def build_manager_profiles(db: Session, organization_id: str, calls_per_manager: int) -> list[dict[str, Any]]:
    managers = db.scalars(
        select(ManagerProfile)
        .where(ManagerProfile.organization_id == organization_id, ManagerProfile.is_active == True)  # noqa: E712
        .order_by(ManagerProfile.name)
    ).all()
    profiles = []
    for manager in managers:
        calls = db.scalars(
            select(Call)
            .where(Call.organization_id == organization_id, Call.manager_id == manager.id, Call.status == "completed")
            .order_by(Call.created_at.desc())
            .limit(calls_per_manager)
        ).all()
        if not calls:
            profiles.append(
                {
                    "manager_id": manager.id,
                    "manager_name": manager.name,
                    "department": manager.department,
                    "calls_analyzed": 0,
                    "average_score": 0,
                    "outcomes": {},
                    "services_mentioned": [],
                    "top_strengths": [],
                    "top_weaknesses": [],
                    "top_recommendations": [],
                    "local_summary": "Нет завершенных звонков для сравнения.",
                    "call_examples": [],
                }
            )
            continue
        scores = [float(call.overall_score or 0) for call in calls]
        outcomes = Counter(call.outcome or "unknown" for call in calls)
        strengths: list[str] = []
        weaknesses: list[str] = []
        recommendations: list[str] = []
        combined_text = []
        examples = []
        for call in calls:
            if call.analysis:
                strengths.extend(call.analysis.strengths or [])
                weaknesses.extend(call.analysis.weaknesses or [])
                recommendations.extend(call.analysis.recommendations or [])
                combined_text.append(call.analysis.summary or "")
            if call.transcript:
                combined_text.append(call.transcript.text[:2000])
            examples.append(call_example(db, call))
        services = detect_services("\n".join(combined_text))
        profiles.append(
            {
                "manager_id": manager.id,
                "manager_name": manager.name,
                "department": manager.department,
                "calls_analyzed": len(calls),
                "average_score": round(sum(scores) / len(scores), 1),
                "outcomes": dict(outcomes),
                "services_mentioned": services,
                "top_strengths": most_common_text(strengths, limit=8),
                "top_weaknesses": most_common_text(weaknesses, limit=8),
                "top_recommendations": most_common_text(recommendations, limit=8),
                "local_summary": local_manager_summary(manager.name, len(calls), scores, outcomes, services),
                "call_examples": examples[:12],
            }
        )
    return profiles


SERVICE_KEYWORDS = {
    "трубы": ["труб", "профильн"],
    "листы": ["лист"],
    "круг": ["круг"],
    "балки": ["балк"],
    "швеллер": ["швеллер"],
    "уголок": ["уголок"],
    "арматура": ["арматур"],
    "нержавейка": ["нержав"],
    "цветной металл": ["цветн"],
    "резка": ["резк", "пореж"],
    "изготовление по чертежам": ["чертеж", "изготов"],
    "прайс": ["прайс"],
    "коммерческое предложение": ["кп", "коммерческ"],
    "доставка": ["достав"],
}


def detect_services(text: str) -> list[str]:
    lowered = text.casefold()
    services = [service for service, keywords in SERVICE_KEYWORDS.items() if any(keyword in lowered for keyword in keywords)]
    return sorted(services)


def call_example(db: Session, call: Call) -> dict[str, Any]:
    segments = []
    if call.transcript:
        segments = db.scalars(
            select(TranscriptSegment).where(TranscriptSegment.transcript_id == call.transcript.id).order_by(TranscriptSegment.start_ms).limit(6)
        ).all()
    dialogue = "\n".join(f"{segment.role or segment.speaker}: {segment.text}" for segment in segments)
    return {
        "call_id": call.id,
        "filename": call.file.original_filename if call.file else "",
        "score": call.overall_score,
        "outcome": call.outcome,
        "summary": call.analysis.summary if call.analysis else "",
        "dialogue_excerpt": dialogue[:1200],
    }


def most_common_text(items: list[str], limit: int) -> list[str]:
    normalized = [item.strip() for item in items if item and item.strip()]
    return [item for item, _count in Counter(normalized).most_common(limit)]


def local_manager_summary(name: str, calls_count: int, scores: list[float], outcomes: Counter[str], services: list[str]) -> str:
    avg = round(sum(scores) / max(1, len(scores)), 1)
    positive = outcomes.get("next_step_agreed", 0)
    return (
        f"{name}: проанализировано {calls_count} звонков, средний балл {avg}, "
        f"успешных следующих шагов {positive}, упомянутые услуги: {', '.join(services) if services else 'не выявлены'}."
    )


def dedupe(items: list[str]) -> list[str]:
    seen = set()
    result = []
    for item in items:
        if item and item not in seen:
            seen.add(item)
            result.append(item)
    return result
