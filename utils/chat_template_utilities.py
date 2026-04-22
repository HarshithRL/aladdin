import sqlite3

from custom_logger import logger


class ChatTemplateUtilities:
    def __init__(self, db_name: str = "relay_project_manager.db"):
        self.db_name = db_name
        self.conn = sqlite3.connect(self.db_name, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        logger.info(f"Connected to the database: {self.db_name}")

    def _connect_db(self):
        return sqlite3.connect(self.db_name)

    def create_template(
        self, template_id, user_id, app_name, template_name, template_text
    ):
        """Creates a new chat template."""
        with self.conn:
            self.conn.execute(
                """
                INSERT INTO chat_templates (template_id, user_id, app_name, template_name, template_text)
                VALUES (?, ?, ?, ?, ?)
            """,
                (template_id, user_id, app_name, template_name, template_text),
            )
        logger.info(f"Template '{template_name}' created successfully.")

    def delete_template(self, template_id, user_id):
        """Deletes a chat template by template_id and user_id."""
        with self.conn:
            self.conn.execute(
                """
                DELETE FROM chat_templates 
                WHERE template_id = ? AND user_id = ?
            """,
                (template_id, user_id),
            )
        logger.info(f"Template '{template_id}' deleted successfully for user '{user_id}'.")

    def rename_template(self, template_id, user_id, new_name):
        """Renames a chat template."""
        with self.conn:
            self.conn.execute(
                """
                UPDATE chat_templates
                SET template_name = ?
                WHERE template_id = ? AND user_id = ?
            """,
                (new_name, template_id, user_id),
            )
        logger.info(f"Template '{template_id}' renamed to '{new_name}' for user '{user_id}'.")

    def update_template(self, template_id, user_id, new_name=None, new_text=None):
        """Updates an existing chat template or inserts a new one if it does not exist."""
        with self.conn:
            existing_template = self.conn.execute(
                """
                SELECT 1 FROM chat_templates WHERE template_id = ? AND user_id = ?
            """,
                (template_id, user_id),
            ).fetchone()

            if existing_template:
                self.conn.execute(
                    """
                    UPDATE chat_templates
                    SET template_name = COALESCE(?, template_name),
                        template_text = COALESCE(?, template_text)
                    WHERE template_id = ? AND user_id = ?
                """,
                    (new_name, new_text, template_id, user_id),
                )
                logger.info(f"Template '{template_id}' updated successfully for user '{user_id}'.")
            else:
                self.conn.execute(
                    """
                    INSERT INTO chat_templates (template_id, user_id, template_name, template_text)
                    VALUES (?, ?, ?, ?)
                """,
                    (template_id, user_id, new_name, new_text),
                )
                logger.info(f"Template '{template_id}' inserted successfully for user '{user_id}'.")

    def truncate(self):
        """Deletes all records from the chat_templates table."""
        with self.conn:
            self.conn.execute("DELETE FROM chat_templates")
        logger.info("Truncated the chat_templates table.")

    def delete_table(self):
        """Deletes the chat_templates table."""
        with self.conn:
            self.conn.execute("DROP TABLE IF EXISTS chat_templates")
        logger.info("Deleted the chat_templates table.")

    def get_templates(self, user_id):
        """Fetches all templates for a specific user and app, returning a list of dictionaries."""
        with self.conn:
            cursor = self.conn.execute(
                """
                SELECT template_id, template_text, template_name, app_name
                FROM chat_templates
                WHERE user_id = ?
            """,
                (user_id,),
            )
            templates = [
                {
                    "app_name": row["app_name"],
                    "template_id": row["template_id"],
                    "template_text": row["template_text"],
                    "template_name": row["template_name"],
                }
                for row in cursor.fetchall()
            ]
        return templates
    
    
chat_template_utils = ChatTemplateUtilities()