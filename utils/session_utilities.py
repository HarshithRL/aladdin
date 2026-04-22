import sqlite3
from datetime import datetime
from custom_logger import logger

class SessionUtilities:
    def __init__(self, db_name: str = "relay_project_manager.db"):
        self.db_name = db_name
        self.conn = sqlite3.connect(self.db_name, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        logger.info(f"Connected to the database: {self.db_name}")
    
    def _connect_db(self):
        return sqlite3.connect(self.db_name)

    def _calculate_relative_date(self, date_str):
        """Calculates the relative time from a given date string (YYYY-MM-DD HH:MM:SS)"""
        if not date_str:
            return "Unknown"
        
        try:
            session_date = datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")
            now = datetime.now()
            delta = now - session_date

            if delta.days == 0:
                return "Today"
            elif delta.days == 1:
                return "Yesterday"
            elif delta.days < 7:
                return f"{delta.days} days ago"
            elif delta.days < 30:
                return "Last Week"
            elif delta.days < 365:
                return session_date.strftime("%b %d, %Y")  # Example: "Jan 15, 2025"
            else:
                return session_date.strftime("%b %d, %Y")  # Example: "Jan 15, 2024"

        except ValueError:
            return "Invalid Date"

    def get_sessions_history(self, user_id):
        """Fetches all sessions and returns a formatted list of dictionaries"""
        
        try:
            logger.info("Connecting to the database to fetch session history.")
            with self._connect_db() as conn:
                cursor = conn.cursor()
                logger.info("Executing query to fetch sessions for user_id: %s", user_id)
                cursor.execute("SELECT session_id, session_name, session_updated_date, app_name FROM sessions WHERE user_id = ?", (user_id,))
                rows = cursor.fetchall()
                logger.info("Query executed successfully, fetched %d rows.", len(rows))

                history_list = []
                for row in rows:
                    session_id = row[0]
                    session_name = row[1]
                    session_updated_date = row[2]
                    app_name = row[3]

                    url_path = f"/{app_name}/{session_id}"
                    history_list.append({
                        "title": session_name,
                        "date": self._calculate_relative_date(session_updated_date),
                        "url": url_path
                    })

                logger.info("Session history processed successfully.")
                return history_list[::-1][:6]
        except sqlite3.Error as e:
            logger.error(f"An error occurred while fetching session history: {e}")
            return []
    
    def insert_session(self, session_name: str = "Unnamed Session", session_details: str = None):
        created_at = updated_at = datetime.utcnow().isoformat()
        with self.conn:
            self.conn.execute('''
                INSERT INTO sessions (session_name, session_created_date, session_updated_date, session_details)
                VALUES (?, ?, ?, ?)
            ''', (session_name, created_at, updated_at, session_details))
        logger.info("New session inserted successfully.")
    
    def update_session(self, session_id: int, session_name: str = None, session_details: str = None):
        updated_at = datetime.utcnow().isoformat()
        with self.conn:
            self.conn.execute('''
                UPDATE sessions
                SET session_name = COALESCE(?, session_name),
                    session_details = COALESCE(?, session_details),
                    session_updated_date = ?
                WHERE session_id = ?
            ''', (session_name, session_details, updated_at, session_id))
        logger.info("Session updated successfully.")
    
    def delete_session(self, session_id: int):
        with self.conn:
            self.conn.execute('''
                DELETE FROM sessions WHERE session_id = ?
            ''', (session_id,))
        logger.info("Session deleted successfully.")
    
    def fetch_all_sessions(self):
        with self.conn:
            cursor = self.conn.execute('''
                SELECT * FROM sessions
            ''')
            return cursor.fetchall()
    
    def fetch_session_by_id(self, session_id: int):
        with self.conn:
            cursor = self.conn.execute('''
                SELECT * FROM sessions WHERE session_id = ?
            ''', (session_id,))
            return cursor.fetchone()
    