import sqlite3
from custom_logger import logger

class AppSQLUtilities:
    def __init__(self, db_path="relay_project_manager.db"):
        self.db_path = db_path
    
    def _connect_db(self):
        return sqlite3.connect(self.db_path)
    
    def get_all_apps(self, user_id: str):
        try:
            with self._connect_db() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT 
                        a.app_id, a.app_title, a.app_description, a.app_icon, a.app_link,
                        CASE 
                            WHEN u.is_bookmarked = 'True' THEN 'True'
                            ELSE 'False'
                        END as is_bookmarked
                    FROM apps a
                    LEFT JOIN users u 
                        ON a.app_id = u.app_id AND u.user_id = ?
                    ORDER BY a.app_id
                """, (user_id,))
                apps = cursor.fetchall()
                return [dict(zip(
                    ["app_id", "app_title", "app_description", "app_icon", "app_link", "is_bookmarked"], 
                    app)) for app in apps]
        except sqlite3.Error as e:
            return []

    def get_bookmarked_apps(self, user_id: str):
        try:
            with self._connect_db() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT 
                        a.app_id, a.app_title, a.app_description, a.app_icon, a.app_link,
                        'True' as is_bookmarked
                    FROM apps a
                    INNER JOIN users u 
                        ON a.app_id = u.app_id
                    WHERE u.user_id = ? AND u.is_bookmarked = 'True'
                    ORDER BY a.app_id
                """, (user_id,))
                apps = cursor.fetchall()
                return [dict(zip(
                    ["app_id", "app_title", "app_description", "app_icon", "app_link", "is_bookmarked"], 
                    app)) for app in apps]
        except sqlite3.Error as e:
            return []
        
        
    def add_bookmark(self, user_id, app_id):
        try:
            with self._connect_db() as conn:
                cursor = conn.cursor()
                
                # Check if the user already has this app in the users table
                cursor.execute(
                    "SELECT * FROM users WHERE user_id = ? AND app_id = ?",
                    (user_id, app_id)
                )
                existing_row = cursor.fetchone()
                
                if existing_row:
                    # If the app already exists, update the is_bookmarked column to "True"
                    cursor.execute(
                        "UPDATE users SET is_bookmarked = 'True' WHERE user_id = ? AND app_id = ?",
                        (user_id, app_id)
                    )
                    conn.commit()
                    logger.info(f"App {app_id} bookmarked for user {user_id}.")
                else:
                    # If the app doesn't exist for the user, insert a new row
                    cursor.execute(
                        "INSERT INTO users (user_id, app_id, is_bookmarked) VALUES (?, ?, 'True')",
                        (user_id, app_id)
                    )
                    conn.commit()
                    logger.info(f"App {app_id} bookmarked for user {user_id} as a new entry.")
        
        except sqlite3.Error as e:
            pass
            logger.info(f"Error bookmarking app {app_id} for user {user_id}: {e}")

    def remove_bookmark(self, user_id, app_id):
        try:
            with self._connect_db() as conn:
                cursor = conn.cursor()
                
                # Check if the user has this app bookmarked
                cursor.execute(
                    "SELECT * FROM users WHERE user_id = ? AND app_id = ? AND is_bookmarked = 'True'",
                    (user_id, app_id)
                )
                existing_row = cursor.fetchone()
                
                if existing_row:
                    # If the app is bookmarked, update the is_bookmarked column to "False"
                    cursor.execute(
                        "UPDATE users SET is_bookmarked = 'False' WHERE user_id = ? AND app_id = ?",
                        (user_id, app_id)
                    )
                    conn.commit()
                    logger.info(f"App {app_id} unbookmarked for user {user_id}.")
                else:
                    pass
                    logger.info(f"App {app_id} was not bookmarked for user {user_id}. No action taken.")
        
        except sqlite3.Error as e:
            pass
            logger.info(f"Error removing bookmark for app {app_id} and user {user_id}: {e}")

