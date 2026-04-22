from utils.genie import GenieClient
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, List, Dict, Any
import os
import re
import json
from custom_logger import logger
from dotenv import load_dotenv


from openai import AzureOpenAI, OpenAI
from openai.types.responses import ResponseTextDeltaEvent
from agents import Agent, Runner, OpenAIChatCompletionsModel, set_tracing_disabled, function_tool, ItemHelpers
from agents.run_context import RunContextWrapper
from custom_agents.wrapper import (
    UserInfo
)
import json
import pandas as pd

load_dotenv()


# Limits to prevent oversized tables from bloating tokens
MAX_TABLE_ROWS: int = int(os.getenv("GENIE_MAX_TABLE_ROWS", "50"))
MAX_TABLE_COLS: int = int(os.getenv("GENIE_MAX_TABLE_COLS", "20"))
MAX_CELL_CHARS: int = int(os.getenv("GENIE_MAX_CELL_CHARS", "200"))


def _parse_genie_result_to_dict(results):
    json_part = str(results).split("GenieResult:", 1)[-1].strip()
    return json.loads(json_part)


def _truncate_cell(value, max_len: int):
    try:
        text = str(value)
    except Exception:
        return value
    if len(text) > max_len:
        return text[: max_len - 1] + "…"
    return text


def format_results_markdown(results):
    data = _parse_genie_result_to_dict(results)

    rows_data = data.get("sql_query_result") or []
    df_full = pd.DataFrame(rows_data)

    total_rows = len(df_full.index)
    total_cols = len(df_full.columns)

    df = df_full
    if total_cols > MAX_TABLE_COLS:
        df = df.iloc[:, :MAX_TABLE_COLS]
    if total_rows > MAX_TABLE_ROWS:
        df = df.iloc[:MAX_TABLE_ROWS, :]

    if not df.empty:
        df = df.applymap(lambda v: _truncate_cell(v, MAX_CELL_CHARS))

    markdown_table = df.to_markdown(index=False) if not df.empty else "(No rows returned)"

    intro = "### 📊 Query Results\n"
    description_text = data.get("sql_query_description") or ""
    description = f"**Description:** {description_text}\n\n"
    sql_text = data.get("sql_query") or ""
    sql_block = f"**Query Used:**\n```sql\n{sql_text}\n```\n\n"

    notes = []
    if total_rows > len(df.index):
        notes.append(f"showing top {len(df.index)} of {total_rows} rows")
    if total_cols > len(df.columns):
        notes.append(f"first {len(df.columns)} of {total_cols} columns")
    if notes:
        intro += f"_Note: {', '.join(notes)}. Cells truncated to {MAX_CELL_CHARS} chars._\n\n"

    return intro + description + sql_block + markdown_table


def summarize_result_for_context(results) -> str:
    data = _parse_genie_result_to_dict(results)
    rows_data = data.get("sql_query_result") or []
    total_rows = len(rows_data)
    columns = list(pd.DataFrame(rows_data).columns) if total_rows else []
    description_text = data.get("sql_query_description") or ""
    sql_text = data.get("sql_query") or ""
    summary = {
        "summary": "genie_query_result",
        "rows": total_rows,
        "columns": columns[:MAX_TABLE_COLS],
        "sql_preview": _truncate_cell(sql_text, 200),
        "description_preview": _truncate_cell(description_text, 200),
    }
    return json.dumps(summary)


# ── Chart generation limits ─────────────────────────────────────────────────
_CHART_MAX_ROWS = 25
_CHART_MAX_COLS = 10
_CHART_LLM_TIMEOUT = 15  # seconds — never hangs the tool call

_CHART_SYSTEM_PROMPT = """You are a data visualization expert and Chart.js v4 specialist.
Given table data (CSV) and a logistics analytics query, generate ONE valid Chart.js v4 config JSON.
Output ONLY raw JSON — no markdown, no code fences, no explanation whatsoever.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHART TYPE SELECTION (pick exactly one)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bar       → comparing values across named categories (carriers, lanes, modes)
line      → time-series or sequential numeric trends
doughnut  → proportional shares, percentage breakdowns, ratios
pie       → only when ≤6 slices and data sums to a meaningful whole
scatter   → correlation between two numeric variables

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REQUIRED JSON STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "type": "<bar|line|doughnut|pie|scatter>",
  "data": {
    "labels": ["<label1>", "<label2>", ...],
    "datasets": [{
      "label": "<short descriptive series name>",
      "data": [<numeric values>],
      "backgroundColor": ["rgba(59,130,246,0.75)", "rgba(16,185,129,0.75)", "rgba(245,158,11,0.75)", "rgba(239,68,68,0.75)", "rgba(139,92,246,0.75)", "rgba(236,72,153,0.75)", "rgba(20,184,166,0.75)"],
      "borderColor": ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"],
      "borderWidth": 1
    }]
  },
  "options": {
    "responsive": true,
    "maintainAspectRatio": true,
    "plugins": {
      "title": {
        "display": true,
        "text": "<concise data-driven chart title, e.g. Top 5 Carriers by Late Delivery %>",
        "font": { "size": 15, "weight": "600" },
        "padding": { "bottom": 16 }
      },
      "legend": { "display": true, "position": "top" },
      "tooltip": { "mode": "index", "intersect": false }
    },
    "scales": {
      "x": {
        "title": {
          "display": true,
          "text": "<actual column name being plotted on X, with units if applicable>",
          "font": { "size": 12, "weight": "500" }
        },
        "grid": { "display": false }
      },
      "y": {
        "title": {
          "display": true,
          "text": "<actual column name being plotted on Y, with units if applicable>",
          "font": { "size": 12, "weight": "500" }
        },
        "beginAtZero": true,
        "grid": { "color": "rgba(0,0,0,0.05)" }
      }
    }
  }
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Title: data-driven sentence (NOT generic like "Chart" or "Data")
- Axis titles: describe the actual column plotted, include units (%, days, count) where applicable
- For pie/doughnut: OMIT the "scales" key entirely from options
- For bar/line/scatter: ALWAYS include scales.x and scales.y with display titles
- For single-dataset bar: apply the full 7-color array so each bar gets a distinct color
- For multi-dataset: use one solid color per dataset
- Truncate long string labels to 25 chars max
- Return ONLY the JSON — nothing else"""


def _generate_chart_spec(df: pd.DataFrame, query: str) -> Optional[dict]:
    """
    Ask Azure OpenAI to generate a Chart.js v4 config from the DataFrame.
    Returns a dict on success, None on any failure (non-critical path).
    """
    # Guard 1: skip if df too small to be worth charting
    if df is None or df.empty or len(df) < 2:
        return None

    try:
        # Cap rows and columns before serialising to CSV
        df_trimmed = df.iloc[:_CHART_MAX_ROWS, :_CHART_MAX_COLS].copy()
        csv_data = df_trimmed.to_csv(index=False)

        client = AzureOpenAI(
            api_key=os.getenv("AZURE_OPENAI_API_KEY"),
            api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-08-01-preview"),
            azure_endpoint=os.getenv("AZURE_OPENAI_API_ENDPOINT", ""),
        )
        model = os.getenv("AZURE_OPENAI_API_MODEL_NAME", "gpt-4o")

        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": _CHART_SYSTEM_PROMPT},
                {"role": "user", "content": f"User query: {query}\n\nTable data (CSV):\n{csv_data}"},
            ],
            temperature=0,
            timeout=_CHART_LLM_TIMEOUT,
        )

        raw = response.choices[0].message.content or ""

        # Strip potential markdown fences (```json ... ``` or ``` ... ```)
        raw = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.IGNORECASE)
        raw = re.sub(r"\s*```$", "", raw.strip())

        chart_spec = json.loads(raw)

        # Schema validation — must be a dict with "type" and "data.datasets"
        if not isinstance(chart_spec, dict):
            return None
        if "type" not in chart_spec or chart_spec["type"] not in {"bar", "line", "doughnut", "pie", "scatter"}:
            return None
        if "data" not in chart_spec or not isinstance(chart_spec["data"].get("datasets"), list):
            return None

        # Enforce responsive options before handing to frontend
        chart_spec.setdefault("options", {})
        chart_spec["options"]["responsive"] = True
        chart_spec["options"]["maintainAspectRatio"] = True

        return chart_spec

    except Exception as exc:
        logger.warning(f"[chart_spec] Generation failed (non-critical): {exc}")
        return None


@function_tool
def execute_sales_insights_query(
    wrapper: RunContextWrapper[UserInfo], 
    query: str,
    step_number: int = 1
) -> str:
    """
    Execute sales insights query. Returns sales, order, and customer data.
    """
    
    # Only log the question being asked
    logger.info(f"Question to answer: {query}")

    client = GenieClient(
        host=wrapper.context.databricks_host,
        token=wrapper.context.databricks_token
    )
    
    try:
        # Send only the current question without any contextual history
        result = client.query(
            id_space=os.getenv('DATABRICKS_ID_SPACE_SALES'),
            question=query,
            contextual_history=None
        )

        # Generate chart spec only when the query returned actual rows
        chart_spec = None
        if result.sql_query_result is not None and not result.sql_query_result.empty:
            chart_spec = _generate_chart_spec(result.sql_query_result, query)

        return json.dumps({
            "tool_type": "execute_sales_insights_query",
            "agent_used": "Aladdin Agent",
            "step_number": step_number,
            "query": query,
            "response": format_results_markdown(result),
            "chart_spec": chart_spec,
            "success": True
        })

    except Exception as e:
        logger.info(f"Error executing sales insights query: {str(e)}")
        return json.dumps({
            "tool_type": "execute_sales_insights_query",
            "agent_used": "Relay Image Generator Agent",
            "step_number": step_number,
            "query": query,
            "response": "",
            "chart_spec": None,
            "success": False,
            "error_msg": str(e)
        })




@function_tool
def execute_ml_model_query(
    wrapper: RunContextWrapper[UserInfo],
    query: str,
    step_number: int = 1,
    model: str = "mas-a158e4cf-endpoint"
) -> str:
    """
    Execute an LLM query against a Databricks-hosted OpenAI endpoint.
    Returns model-generated text without maintaining conversational context.
    """

    # Log only the question being asked
    logger.info(f"Question to answer: {query}")

    try:
        client = OpenAI(
            api_key=wrapper.context.databricks_token,
            base_url="https://adb-7488500312027058.18.azuredatabricks.net/serving-endpoints"
        )

        response = client.responses.create(
            model=model,
            input=[
                {
                    "role": "user",
                    "content": query
                }
            ]
        )
        # response.output contains mixed items: messages, function_calls, function_call_outputs
        # Filter to type='message' with non-null content; take the last one (final answer)
        message_outputs = [
            o for o in (response.output or [])
            if getattr(o, "type", "") == "message" and getattr(o, "content", None)
        ]
        if message_outputs:
            output_text = " ".join(
                getattr(c, "text", "")
                for c in message_outputs[-1].content
                if getattr(c, "text", None)
            ).strip()
        else:
            output_text = ""

        return json.dumps({
            "tool_type": "execute_llm_query",
            "agent_used": "Aladdin Agent",
            "step_number": step_number,
            "query": query,
            "response": output_text,
            "success": True,
            "model": model
        })

    except Exception as e:
        logger.info(f"Error executing LLM query: {str(e)}")

        return json.dumps({
            "tool_type": "execute_llm_query",
            "agent_used": "Aladdin Agent",
            "step_number": step_number,
            "query": query,
            "response": "",
            "success": False,
            "error_msg": str(e),
            "model": model
        })

# @function_tool
# def execute_inventry_insights_query(
#     wrapper: RunContextWrapper[UserInfo], 
#     query: str,
#     step_number: int = 1
# ) -> str:
#     """
#     Execute sales insights query. Returns sales, order, and customer data.
#     """
    
#     # Only log the question being asked
#     logger.info(f"Question to answer: {query}")

#     client = GenieClient(
#         host=wrapper.context.databricks_host,
#         token=wrapper.context.databricks_token
#     )
    
#     try:
#         # Send only the current question without any contextual history
#         result = client.query(
#             id_space=os.getenv('DATABRICKS_ID_SPACE_INVENTORY'),
#             question=query,
#             contextual_history=None
#         )


        
        # Don't store context for future queries - only send current question
        
    #     return json.dumps({
    #         "tool_type": "execute_sales_insights_query",
    #         "agent_used": "Aladdin Agent",
    #         "step_number": step_number,
    #         "query": query,
    #         "response": format_results_markdown(result),
    #         "success": True
    #     })
        
    # except Exception as e:
    #     logger.info(f"Error executing sales insights query: {str(e)}")
    #     return json.dumps({
    #         "tool_type": "execute_sales_insights_query",
    #         "agent_used": "Relay Image Generator Agent",
    #         "step_number": step_number,
    #         "query": query,
    #         "response": "",
    #         "success": False,
    #         "error_msg": str(e)
    #     })

# @function_tool
# def execute_Production_Insights(
#     wrapper: RunContextWrapper[UserInfo], 
#     query: str,
#     step_number: int = 1
# ) -> str:
#     """
#     Execute inventory query. Returns stock levels and supply chain data.
#     """
#     client = GenieClient(
#         host=wrapper.context.databricks_host,
#         token=wrapper.context.databricks_token
#     )
    
#     try:
#         previous_question = wrapper.context.databricks_previous_question
#         previous_response = wrapper.context.databricks_previous_response
        
#         result = client.query(
#             id_space=os.getenv('DATABRICKS_ID_SPACE'),
#             question=query,
#             contextual_history=[previous_question, previous_response] if previous_question else None
#         )
#         wrapper.context.databricks_previous_question = query
#         wrapper.context.databricks_previous_response = summarize_result_for_context(result)
        
#         return json.dumps({
#             "tool_type": "execute_inventory_query",
#             "agent_used": "Relay Image Generator Agent",
#             "step_number": step_number,
#             "query": query,
#             "response": format_results_markdown(result),
#             "success": True
#         })
        
#     except Exception as e:
#         logger.info(f"Error executing inventory query: {str(e)}")
#         return json.dumps({
#             "tool_type": "execute_inventory_query",
#             "agent_used": "Aladdin Agent",
#             "step_number": step_number,
#             "query": query,
#             "response": "",
#             "success": False,
#             "error_msg": str(e)
#         })