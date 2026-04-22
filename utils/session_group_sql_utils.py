import sqlite3
import json
from custom_logger import logger


class SessionGroupSQLUtilities:
    def __init__(self, db_name: str = "relay_project_manager.db"):
        self.db_name = db_name
        self.conn = sqlite3.connect(self.db_name, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        logger.info(f"Connected to the database: {self.db_name}")

    def move_session_to_group(self, user_id, session_id: str, session_group_name: str):
        logger.info(f"Moving session {session_id} to group {session_group_name} for user {user_id}.")
        with self.conn:
            self.conn.execute(
                """
                UPDATE session_groups
                SET session_group_name = ?
                WHERE user_id = ? AND session_id = ?
            """,
                (session_group_name, user_id, session_id),
            )
        logger.info("Session moved to new group successfully.")

    def insert_session_group(
        self,
        user_id: str,
        session_id: str,
        session_group_name: str,
        session_group_color: str = "#ccc",
        session_group_details: str = json.dumps({}),
    ):
        logger.info(f"Updating session group {session_group_name} for user {user_id} for session {session_id}.")
        with self.conn:
            self.conn.execute(
                """
                UPDATE session_groups
                SET session_group_name = ?, session_group_color = ?, session_group_details = ?
                WHERE user_id = ? AND session_id = ?
                """,
                (
                    session_group_name,
                    session_group_color,
                    session_group_details,
                    user_id,
                    session_id,
                ),
            )
        logger.info("Session group updated successfully.")


        
session_group_sql_utils = SessionGroupSQLUtilities()