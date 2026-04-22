import os
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional


@dataclass
class UserInfo:
    email: str
    auth_access_token: str
    entra_id_user_id: str
    user_id: str
    session_id: str
    databricks_host: Optional[str] = None
    databricks_token: Optional[str] = None
    databricks_previous_question: Optional[str] = None
    databricks_previous_response: Optional[str] = None