import requests
import json
import pandas as pd
import time
import os
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional
import os
import time
import json
import requests
import pandas as pd
from custom_logger import logger
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Dict, Any


@dataclass
class GenieResult:
    """Data class to store Genie query results."""
    id_space: str
    conversation_id: str
    question: str
    content: Optional[str]
    sql_query: Optional[str] = None
    sql_query_description: Optional[str] = None
    sql_query_result: Optional[pd.DataFrame] = None
    error: Optional[str] = None

    def __repr__(self) -> str:
        return f"<GenieResult space={self.id_space!r} convo={self.conversation_id!r}>"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id_space": self.id_space,
            "conversation_id": self.conversation_id,
            "question": self.question,
            "content": self.content,
            "sql_query": self.sql_query,
            "sql_query_description": self.sql_query_description,
            "sql_query_result": (
                self.sql_query_result.to_dict(orient="records")
                if self.sql_query_result is not None
                else None
            ),
            "error": self.error,
        }

    def to_json(self) -> str:
        return json.dumps(
            self.to_dict(),
            indent=2,
            default=str,
            ensure_ascii=False
        )

    def __str__(self) -> str:
        base = self.to_dict()
        base["sql_query_result"] = base["sql_query_result"] or []
        return f"GenieResult:\n" + json.dumps(base, indent=2, default=str)


class GenieClient:
    """
    Client for interacting with Databricks Genie AI service.
    Generates and executes SQL queries based on natural-language questions.
    """

    def __init__(
        self,
        host: Optional[str] = None,
        token: Optional[str] = None,
        api_prefix: str = "/api/2.0/genie/spaces",
        max_retries: int = 300,
        retry_delay: int = 1
    ):
        self.host = host or os.getenv("GENIE_HOST")
        self.token = token or os.getenv("GENIE_TOKEN")

        if not self.host or not self.token:
            raise ValueError("Both GENIE_HOST and GENIE_TOKEN must be set or passed explicitly.")
        if not self.host.startswith(("http://", "https://")):
            self.host = "https://" + self.host

        self.api_prefix = api_prefix
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self._session = self._init_session()

    def _init_session(self) -> requests.Session:
        sess = requests.Session()
        sess.headers.update({
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        })
        return sess

    def _make_url(self, path: str) -> str:
        return f"{self.host.rstrip('/')}/{path.lstrip('/')}"

    def start_conversation(self, id_space: str, start_message: str = "Starting Conversation") -> str:
        url = self._make_url(f"{self.api_prefix}/{id_space}/start-conversation")
        resp = self._session.post(url, json={"content": start_message})
        resp.raise_for_status()
        return resp.json().get("conversation_id")

    def ask_question(
        self,
        id_space: str,
        conversation_id: str,
        question: str,
        contextual_history: str = ""
    ) -> GenieResult:
        full_question = (
            f"Use the contextual history to answer the question.\n"
            f"Contextual history: {contextual_history}\n"
            f"Question to answer: {question}"
            if contextual_history else question
        )
        url = self._make_url(f"{self.api_prefix}/{id_space}/conversations/{conversation_id}/messages")
        print("DEBUG URL:", url)
        try:
            resp = self._session.post(url, json={"content": full_question})
            resp.raise_for_status()
            payload = resp.json()
            msg_id = payload.get("message_id") or payload.get("id")
            if not msg_id:
                return self._error_result(id_space, conversation_id, question, "No message_id returned")
            return self._poll_for_result(id_space, conversation_id, msg_id, question)

        except requests.RequestException as e:
            return self._error_result(id_space, conversation_id, question, f"Ask failed: {e}")

    def _poll_for_result(
        self, id_space: str, conversation_id: str, message_id: str, question: str
    ) -> GenieResult:
        for _ in range(self.max_retries):
            try:
                status_payload = self._get_message_status(id_space, conversation_id, message_id)
                status = status_payload.get("status")

                if status == "COMPLETED":
                    return self._extract_completed_result(status_payload, id_space, conversation_id, message_id, question)
                if status in {"FAILED", "CANCELLED"}:
                    return self._error_result(id_space, conversation_id, question, f"Query status: {status}")
                if status == "EXECUTING_QUERY":
                    self._trigger_result_fetch(id_space, conversation_id, message_id)

            except requests.RequestException:
                pass

            time.sleep(self.retry_delay)

        return self._error_result(id_space, conversation_id, question, "Query timed out")

    def _get_message_status(self, id_space: str, conversation_id: str, message_id: str) -> dict:
        url = self._make_url(f"{self.api_prefix}/{id_space}/conversations/{conversation_id}/messages/{message_id}")
        resp = self._session.get(url)
        resp.raise_for_status()
        return resp.json()

    def _trigger_result_fetch(self, id_space: str, conversation_id: str, message_id: str) -> None:
        url = self._make_url(f"{self.api_prefix}/{id_space}/conversations/{conversation_id}/messages/{message_id}/query-result")
        self._session.get(url)

    def _extract_completed_result(
        self,
        payload: dict,
        id_space: str,
        conversation_id: str,
        message_id: str,
        question: str
    ) -> GenieResult:
        try:
            attach = payload.get("attachments", [{}])[0]
            query_info = attach.get("query", {})
            sql = query_info.get("query")
            df = None
            if sql:
                df = self._fetch_query_results(id_space, conversation_id, message_id)

            return GenieResult(
                id_space=id_space,
                conversation_id=conversation_id,
                question=question,
                content=attach.get("text", {}).get("content"),
                sql_query=sql,
                sql_query_description=query_info.get("description"),
                sql_query_result=df
            )

        except Exception as e:
            return self._error_result(id_space, conversation_id, question, f"Extract failed: {e}")

    def _fetch_query_results(self, id_space: str, conversation_id: str, message_id: str) -> pd.DataFrame:
        url = self._make_url(f"{self.api_prefix}/{id_space}/conversations/{conversation_id}/messages/{message_id}/query-result")
        resp = self._session.get(url)
        resp.raise_for_status()
        result = resp.json()

        cols = result["statement_response"]["manifest"]["schema"]["columns"]
        data = result["statement_response"]["result"].get("data_typed_array", [])

        rows = [
            [
                self._parse_column_value(col, val)
                for col, val in zip(cols, item["values"])
            ]
            for item in data
        ]

        return pd.DataFrame(rows, columns=[c["name"] for c in cols])

    def _parse_column_value(self, col: dict, val: dict):
        s = val.get("str")
        if s is None:
            return None
        t = col["type_name"]
        try:
            if t in {"INT", "LONG", "SHORT", "BYTE"}:
                return int(s)
            if t in {"FLOAT", "DOUBLE", "DECIMAL"}:
                return float(s)
            if t == "BOOLEAN":
                return s.lower() == "true"
            if t == "DATE":
                return datetime.strptime(s, "%Y-%m-%d").date()
            if t == "TIMESTAMP":
                return datetime.strptime(s, "%Y-%m-%d %H:%M:%S")
            if t == "BINARY":
                return bytes(s, "utf-8")
        except Exception:
            pass
        return s

    def _error_result(self, id_space: str, conversation_id: str, question: str, error_msg: str) -> GenieResult:
        return GenieResult(
            id_space=id_space,
            conversation_id=conversation_id,
            question=question,
            content=None,
            error=error_msg
        )

    def query(self, id_space: str, question: str, contextual_history: str = "") -> GenieResult:
        """Start a conversation and ask a question in one call."""
        convo = self.start_conversation(id_space)
        return self.ask_question(id_space, convo, question, contextual_history)

    def get_json_response(self, id_space: str, question: str, contextual_history: str = "") -> str:
        """Shortcut to get the result as a JSON string."""
        return self.query(id_space, question, contextual_history).to_json()



