import sqlite3
from custom_logger import logger
class UserMemoryUtilities:
    def __init__(self, db_name: str = "relay_project_manager.db"):
        self.db_name = db_name
        self.conn = sqlite3.connect(self.db_name, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        logger.info(f"Connected to the database: {self.db_name}")

    def create_memory(self, memory_id: str, user_id: str, memory_value: str):
        """Inserts a new user memory into the table."""
        with self.conn:
            self.conn.execute('''
                INSERT INTO userMemory (memory_id, user_id, memory_value)
                VALUES (?, ?, ?)
            ''', (memory_id, user_id, memory_value))
        logger.info(f"Memory '{memory_value}' created successfully for user '{user_id}'.")

    def truncate(self):
        """Deletes all records from the userMemory table."""
        with self.conn:
            self.conn.execute('DELETE FROM userMemory')
        logger.info("Truncated the userMemory table.")

    def has_more_than_30_memories(self, user_id: str) -> bool:
        """Returns True if the user has more than 30 memories."""
        cursor = self.conn.execute('''
            SELECT COUNT(*) as count FROM userMemory WHERE user_id = ?
        ''', (user_id,))
        count = cursor.fetchone()["count"]
        return count > 30

    def get_all_memories(self, user_id: str):
        """Returns all memory_id and memory_value pairs for the given user_id."""
        cursor = self.conn.execute('''
            SELECT memory_id, memory_value FROM userMemory WHERE user_id = ?
        ''', (user_id,))
        return cursor.fetchall()

    def edit_memory(self, user_id: str, memory_id: str, new_memory_value: str):
        """Updates an existing memory's value based on user_id and memory_id."""
        with self.conn:
            self.conn.execute('''
                UPDATE userMemory
                SET memory_value = ?
                WHERE user_id = ? AND memory_id = ?
            ''', (new_memory_value, user_id, memory_id))
        logger.info(f"Updated memory '{memory_id}' for user '{user_id}'.")

    def delete_memory(self, user_id: str, memory_id: str):
        """Deletes a specific memory based on user_id and memory_id."""
        with self.conn:
            self.conn.execute('''
                DELETE FROM userMemory
                WHERE user_id = ? AND memory_id = ?
            ''', (user_id, memory_id))
        logger.info(f"Deleted memory '{memory_id}' for user '{user_id}'.")

    def delete_all_memories(self, user_id: str):
        """Deletes all memory based on user_id"""
        with self.conn:
            self.conn.execute('''
                DELETE FROM userMemory
                WHERE user_id = ?
            ''', (user_id,))
        logger.info(f"Deleted all memories for user '{user_id}'.")
