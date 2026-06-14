from io import BytesIO

import pandas as pd
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import csrf_guard
from app.models import Call, CriterionScore, ManagerProfile, TranscriptSegment, User

router = APIRouter(prefix="/exports", tags=["exports"])


@router.get("/calls.xlsx")
def export_calls(user: User = Depends(csrf_guard), db: Session = Depends(get_db)) -> StreamingResponse:
    managers = {m.id: m.name for m in db.query(ManagerProfile).filter(ManagerProfile.organization_id == user.organization_id).all()}
    calls = db.scalars(select(Call).where(Call.organization_id == user.organization_id).order_by(Call.created_at.desc())).all()
    rows = [
        {
            "id": call.id,
            "filename": call.file.original_filename if call.file else "",
            "manager": managers.get(call.manager_id, ""),
            "client_company": call.client_company,
            "client_phone": call.client_phone,
            "call_date": call.call_date,
            "status": call.status,
            "outcome": call.outcome,
            "overall_score": call.overall_score,
            "summary": call.analysis.summary if call.analysis else "",
        }
        for call in calls
    ]
    output = BytesIO()
    with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
        pd.DataFrame(rows).to_excel(writer, index=False, sheet_name="Calls")
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=call-analytics.xlsx"},
    )


@router.get("/calls-dialogues.xlsx")
def export_calls_with_dialogues(user: User = Depends(csrf_guard), db: Session = Depends(get_db)) -> StreamingResponse:
    managers = {m.id: m.name for m in db.query(ManagerProfile).filter(ManagerProfile.organization_id == user.organization_id).all()}
    calls = db.scalars(select(Call).where(Call.organization_id == user.organization_id).order_by(Call.created_at.desc())).all()
    rows = []
    for call in calls:
        rows.append(
            {
                "id": call.id,
                "filename": call.file.original_filename if call.file else "",
                "manager": managers.get(call.manager_id, ""),
                "client_company": call.client_company,
                "client_phone": call.client_phone,
                "call_date": call.call_date,
                "status": call.status,
                "outcome": call.outcome,
                "overall_score": call.overall_score,
                "summary": call.analysis.summary if call.analysis else "",
                "strengths": "\n".join(call.analysis.strengths) if call.analysis else "",
                "weaknesses": "\n".join(call.analysis.weaknesses) if call.analysis else "",
                "recommendations": "\n".join(call.analysis.recommendations) if call.analysis else "",
                "dialogue": call_dialogue(call),
            }
        )
    output = BytesIO()
    with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
        frame = pd.DataFrame(rows)
        frame.to_excel(writer, index=False, sheet_name="Calls")
        worksheet = writer.sheets["Calls"]
        worksheet.set_column("A:A", 36)
        worksheet.set_column("B:D", 24)
        worksheet.set_column("J:M", 48)
        worksheet.set_column("N:N", 90)
        wrap = writer.book.add_format({"text_wrap": True, "valign": "top"})
        worksheet.set_column("J:N", None, wrap)
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=call-analytics-dialogues.xlsx"},
    )


@router.get("/calls/{call_id}.xlsx")
def export_single_call(call_id: str, user: User = Depends(csrf_guard), db: Session = Depends(get_db)) -> StreamingResponse:
    call = db.get(Call, call_id)
    if not call or call.organization_id != user.organization_id:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Call not found")

    manager = db.get(ManagerProfile, call.manager_id) if call.manager_id else None
    criteria = []
    if call.analysis:
        criteria = db.scalars(select(CriterionScore).where(CriterionScore.analysis_result_id == call.analysis.id)).all()
    report_rows = [
        {"field": "Файл", "value": call.file.original_filename if call.file else ""},
        {"field": "Менеджер", "value": manager.name if manager else ""},
        {"field": "Компания", "value": call.client_company or ""},
        {"field": "Телефон", "value": call.client_phone or ""},
        {"field": "Дата звонка", "value": call.call_date or ""},
        {"field": "Статус", "value": call.status},
        {"field": "Исход", "value": call.outcome or ""},
        {"field": "Оценка", "value": call.overall_score if call.overall_score is not None else ""},
        {"field": "Краткое резюме", "value": call.analysis.summary if call.analysis else ""},
        {"field": "Сильные стороны", "value": "\n".join(call.analysis.strengths) if call.analysis else ""},
        {"field": "Слабые места", "value": "\n".join(call.analysis.weaknesses) if call.analysis else ""},
        {"field": "Рекомендации", "value": "\n".join(call.analysis.recommendations) if call.analysis else ""},
    ]
    dialogue_rows = [
        {
            "timecode": format_timecode(segment.start_ms),
            "speaker": segment_role(segment),
            "text": segment.text,
        }
        for segment in transcript_segments(call)
    ]
    criteria_rows = [
        {
            "criterion": item.name,
            "score": item.score,
            "weight": item.weight,
            "comment": item.comment,
            "evidence": evidence_text(item.evidence),
        }
        for item in criteria
    ]
    output = BytesIO()
    with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
        pd.DataFrame(report_rows).to_excel(writer, index=False, sheet_name="Отчет")
        pd.DataFrame(dialogue_rows).to_excel(writer, index=False, sheet_name="Диалог")
        pd.DataFrame(criteria_rows).to_excel(writer, index=False, sheet_name="Критерии")
        wrap = writer.book.add_format({"text_wrap": True, "valign": "top"})
        for sheet in ["Отчет", "Диалог", "Критерии"]:
            worksheet = writer.sheets[sheet]
            worksheet.set_column("A:A", 18)
            worksheet.set_column("B:B", 28)
            worksheet.set_column("C:E", 80, wrap)
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=call-report-{call.id}.xlsx"},
    )


def transcript_segments(call: Call) -> list[TranscriptSegment]:
    if not call.transcript:
        return []
    return sorted(call.transcript.segments, key=lambda segment: (segment.start_ms, segment.created_at))


def call_dialogue(call: Call) -> str:
    segments = transcript_segments(call)
    if not segments and call.transcript:
        return call.transcript.text
    return "\n".join(f"{format_timecode(segment.start_ms)} {segment_role(segment)}: {segment.text}" for segment in segments)


def segment_role(segment: TranscriptSegment) -> str:
    if segment.role == "manager":
        return "Менеджер"
    if segment.role == "client":
        return "Клиент"
    return segment.speaker


def evidence_text(value: object) -> str:
    if not isinstance(value, list):
        return ""
    quotes = []
    for item in value:
        if isinstance(item, dict):
            quotes.append(str(item.get("quote", item)))
        elif isinstance(item, str):
            quotes.append(item)
    return "\n".join(quotes)


def format_timecode(ms: int) -> str:
    seconds = max(0, ms // 1000)
    minutes, rest = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours:02d}:{minutes:02d}:{rest:02d}"
    return f"{minutes:02d}:{rest:02d}"
