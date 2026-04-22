import sqlite3
import bcrypt
from datetime import datetime
from custom_logger import logger

class UserLoginUtilities:
    def __init__(self, db_path="relay_project_manager.db"):
        self.db_path = db_path
        self._create_table()

    def _connect_db(self):
        return sqlite3.connect(self.db_path)

    def _create_table(self):
        try:
            with self._connect_db() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS user_login (
                        email TEXT PRIMARY KEY,
                        password TEXT NOT NULL,
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP
                    );
                """)
                conn.commit()
        except sqlite3.Error as e:
            logger.error(f"Error creating user_login table: {e}")

    def signup_user(self, email, password):
        """
        Registers a new user.
        Returns: (success: bool, message: str)
        """
        try:
            # Hash the password
            salt = bcrypt.gensalt()
            hashed_password = bcrypt.hashpw(password.encode('utf-8'), salt)

            with self._connect_db() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "INSERT INTO user_login (email, password, created_at) VALUES (?, ?, ?)",
                    (email, hashed_password, datetime.utcnow().isoformat())
                )
                conn.commit()
                return True, "User registered successfully."
        except sqlite3.IntegrityError:
            return False, "User with this email already exists."
        except Exception as e:
            logger.error(f"Error signing up user: {e}")
            return False, f"An error occurred: {str(e)}"

    def verify_user(self, email, password):
        """
        Verifies user credentials.
        Returns: (success: bool, message: str)
        """
        try:
            with self._connect_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT password FROM user_login WHERE email = ?", (email,))
                result = cursor.fetchone()

                if result:
                    stored_hash = result[0]
                    if bcrypt.checkpw(password.encode('utf-8'), stored_hash):
                        return True, "Login successful."
                    else:
                        return False, "Invalid password."
                else:
                    return False, "User not found."
        except Exception as e:
            logger.error(f"Error verifying user: {e}")
            return False, f"An error occurred: {str(e)}"

    def user_exists(self, email):
        try:
            with self._connect_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT 1 FROM user_login WHERE email = ?", (email,))
                return cursor.fetchone() is not None
        except Exception as e:
            logger.error(f"Error checking if user exists: {e}")
            return False
