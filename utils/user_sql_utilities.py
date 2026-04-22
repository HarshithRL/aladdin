import sqlite3
import bcrypt
import logging
from flask import session
import sqlite3
import logging
import os
import importlib.util

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")


class UserSQLUtilities:
    def __init__(self, db_path="relay_project_manager.db"):
        self.db_path = db_path
        self._create_tables()
    
    def _connect_db(self):
        return sqlite3.connect(self.db_path)

    def _create_tables(self):
        try:
            with self._connect_db() as conn:
                cursor = conn.cursor()
                # Creating table for users if it doesn't exist
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS users (
                        user_id TEXT,
                        app_id TEXT UNIQUE,
                        is_bookmarked TEXT
                    );
                    """
                )
        except sqlite3.Error as e:
            print(f"Error creating tables: {e}")  

user_sql_utilities = UserSQLUtilities()