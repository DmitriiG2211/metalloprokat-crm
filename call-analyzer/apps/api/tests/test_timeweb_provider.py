from app.services.providers import TimewebAgentProvider, build_analysis_prompt, normalize_analysis_result, parse_json_content


def test_timeweb_endpoint_uses_agent_id(monkeypatch) -> None:
    monkeypatch.setenv("TIMEWEB_AI_BASE_URL", "https://agent.timeweb.cloud")
    monkeypatch.setenv("TIMEWEB_AI_AGENT_ID", "agent-123")
    monkeypatch.setenv("TIMEWEB_AI_API_KEY", "secret")
    from app.config import get_settings

    get_settings.cache_clear()
    provider = TimewebAgentProvider()
    assert provider.endpoint() == "https://agent.timeweb.cloud/api/v1/cloud-ai/agents/agent-123/v1/chat/completions"
    get_settings.cache_clear()


def test_timeweb_endpoint_accepts_agent_v1_base_url(monkeypatch) -> None:
    monkeypatch.setenv("TIMEWEB_AI_BASE_URL", "https://agent.timeweb.cloud/api/v1/cloud-ai/agents/agent-123/v1")
    monkeypatch.setenv("TIMEWEB_AI_AGENT_ID", "agent-123")
    monkeypatch.setenv("TIMEWEB_AI_API_KEY", "secret")
    from app.config import get_settings

    get_settings.cache_clear()
    provider = TimewebAgentProvider()
    assert provider.endpoint() == "https://agent.timeweb.cloud/api/v1/cloud-ai/agents/agent-123/v1/chat/completions"
    get_settings.cache_clear()


def test_parse_json_content_strips_markdown() -> None:
    payload = parse_json_content('```json\n{"summary":"ok","overall_score":90}\n```')
    assert payload["summary"] == "ok"


def test_analysis_prompt_treats_price_offer_as_next_step() -> None:
    prompt = build_analysis_prompt(
        {
            "business_context": "Металлопрокат",
            "metadata": {},
            "criteria": [{"name": "Следующий шаг", "weight": 1.5}],
            "transcript": "Клиент: пришлите прайс на почту.",
        }
    )
    assert "Не требуй факта продажи" in prompt
    assert "client_agreed_to_receive_price_or_offer" in prompt
    assert "next_step_agreed" in prompt


def test_normalize_analysis_result_corrects_price_request() -> None:
    result = normalize_analysis_result(
        {"transcript": "Клиент: Я занимаюсь. Пришлите прайс на почту."},
        {
            "summary": "Нужна проверка",
            "outcome": "needs_review",
            "overall_score": 35,
            "recommendations": [],
            "evidence": [],
        },
    )
    assert result["outcome"] == "next_step_agreed"
    assert result["overall_score"] >= 70
