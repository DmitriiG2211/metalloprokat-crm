from collections import Counter
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import csrf_guard
from app.models import AggregateReport, AnalysisResult, Call, CriterionScore, ManagerProfile, TranscriptSegment, User
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


@router.get("/sales-insights")
def sales_insights(
    limit: int = 250,
    user: User = Depends(csrf_guard),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    limit = max(25, min(limit, 1000))
    calls = db.scalars(
        select(Call)
        .where(Call.organization_id == user.organization_id, Call.status == "completed")
        .order_by(Call.created_at.desc())
        .limit(limit)
    ).all()
    managers = {m.id: m.name for m in db.query(ManagerProfile).filter(ManagerProfile.organization_id == user.organization_id).all()}
    call_ids = [call.id for call in calls]
    criteria_rows = []
    if call_ids:
        criteria_rows = db.execute(
            select(CriterionScore, AnalysisResult.call_id)
            .join(AnalysisResult, CriterionScore.analysis_result_id == AnalysisResult.id)
            .where(AnalysisResult.organization_id == user.organization_id, AnalysisResult.call_id.in_(call_ids))
        ).all()
    return {
        "script_scorecard": build_script_scorecard(criteria_rows),
        "problem_calls": build_problem_calls(calls, managers),
        "best_phrases": build_best_phrases(db, calls, managers),
        "manager_weaknesses": build_manager_weaknesses(calls, managers, criteria_rows),
        "calls_analyzed": len(calls),
    }


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


def build_script_scorecard(criteria_rows: list[tuple[CriterionScore, str]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[CriterionScore]] = {}
    for row, _call_id in criteria_rows:
        grouped.setdefault(row.name, []).append(row)
    scorecard = []
    for name, rows in grouped.items():
        scores = [float(row.score or 0) for row in rows]
        weak_count = sum(1 for score in scores if score < 6)
        scorecard.append(
            {
                "name": name,
                "average_score": round(sum(scores) / max(1, len(scores)), 1),
                "checks": len(scores),
                "weak_count": weak_count,
                "weak_share": round(weak_count * 100 / max(1, len(scores)), 1),
                "common_comments": most_common_text([row.comment for row in rows if row.comment], 3),
            }
        )
    return sorted(scorecard, key=lambda item: (item["average_score"], -item["checks"]))


def build_problem_calls(calls: list[Call], managers: dict[str, str]) -> list[dict[str, Any]]:
    rows = []
    problem_outcomes = {"refusal", "no_answer", "auto_answer", "wrong_number", "needs_review"}
    for call in calls:
        score = float(call.overall_score or 0)
        if score > 55 and call.outcome not in problem_outcomes:
            continue
        weaknesses = call.analysis.weaknesses if call.analysis else []
        rows.append(
            {
                "call_id": call.id,
                "filename": call.file.original_filename if call.file else "",
                "manager_name": managers.get(call.manager_id or "", "Не назначен"),
                "client_company": call.client_company,
                "outcome": call.outcome,
                "score": score,
                "reason": "; ".join(weaknesses[:2]) or call.analysis.summary if call.analysis else "",
            }
        )
    return sorted(rows, key=lambda item: (item["score"], item["outcome"] or ""))[:25]


def build_best_phrases(db: Session, calls: list[Call], managers: dict[str, str]) -> list[dict[str, Any]]:
    phrases: list[dict[str, Any]] = []
    positive_markers = [
        "прайс",
        "кп",
        "коммерчес",
        "потребност",
        "закуп",
        "отправ",
        "следующ",
        "перезвон",
        "подскаж",
    ]
    for call in calls:
        if float(call.overall_score or 0) < 70 or not call.transcript:
            continue
        segments = db.scalars(
            select(TranscriptSegment)
            .where(TranscriptSegment.transcript_id == call.transcript.id)
            .order_by(TranscriptSegment.start_ms)
            .limit(80)
        ).all()
        for segment in segments:
            text = segment.text.strip()
            lowered = text.casefold()
            if len(text) < 24 or not any(marker in lowered for marker in positive_markers):
                continue
            phrases.append(
                {
                    "call_id": call.id,
                    "manager_name": managers.get(call.manager_id or "", "Не назначен"),
                    "score": call.overall_score,
                    "phrase": text[:320],
                    "why": "Сильная фраза из звонка с высоким баллом",
                }
            )
            break
    if len(phrases) < 10:
        phrases.extend(best_evidence_phrases(calls, managers, 10 - len(phrases)))
    return phrases[:20]


def best_evidence_phrases(calls: list[Call], managers: dict[str, str], limit: int) -> list[dict[str, Any]]:
    rows = []
    for call in calls:
        if float(call.overall_score or 0) < 70 or not call.analysis:
            continue
        for item in call.analysis.evidence or []:
            quote = str(item.get("quote") or "").strip() if isinstance(item, dict) else ""
            if len(quote) < 18:
                continue
            rows.append(
                {
                    "call_id": call.id,
                    "manager_name": managers.get(call.manager_id or "", "Не назначен"),
                    "score": call.overall_score,
                    "phrase": quote[:320],
                    "why": "AI отметил эту цитату как подтверждение сильного звонка",
                }
            )
            break
        if len(rows) >= limit:
            break
    return rows


def build_manager_weaknesses(
    calls: list[Call],
    managers: dict[str, str],
    criteria_rows: list[tuple[CriterionScore, str]],
) -> list[dict[str, Any]]:
    by_call = {call.id: call for call in calls}
    profile: dict[str, dict[str, Any]] = {}
    for call in calls:
        key = call.manager_id or "none"
        item = profile.setdefault(
            key,
            {
                "manager_id": call.manager_id,
                "manager_name": managers.get(call.manager_id or "", "Не назначен"),
                "calls": 0,
                "average_score": 0,
                "scores": [],
                "weaknesses": [],
                "recommendations": [],
                "criteria": [],
            },
        )
        item["calls"] += 1
        item["scores"].append(float(call.overall_score or 0))
        if call.analysis:
            item["weaknesses"].extend(call.analysis.weaknesses or [])
            item["recommendations"].extend(call.analysis.recommendations or [])
    for criterion, call_id in criteria_rows:
        call = by_call.get(call_id)
        if not call or float(criterion.score or 0) >= 6:
            continue
        key = call.manager_id or "none"
        if key in profile:
            profile[key]["criteria"].append(criterion.name)
    result = []
    for item in profile.values():
        scores = item.pop("scores")
        item["average_score"] = round(sum(scores) / max(1, len(scores)), 1)
        item["weaknesses"] = most_common_text(item["weaknesses"], 5)
        item["recommendations"] = most_common_text(item["recommendations"], 5)
        item["low_criteria"] = most_common_text(item.pop("criteria"), 5)
        result.append(item)
    return sorted(result, key=lambda item: item["average_score"])


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
