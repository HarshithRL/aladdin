import sqlite3
from custom_logger import logger

class DbUtilities:
    def __init__(self, db_path="relay_project_manager.db"):
        self.db_path = db_path
        self.create_tables()
        self.load_apps()

    def _connect_db(self):
        return sqlite3.connect(self.db_path)

    def create_tables(self):
        table_creation_queries = [
            """
            CREATE TABLE IF NOT EXISTS account (
                microsoft_entra_user_id TEXT,
                username TEXT NOT NULL UNIQUE,
                email TEXT NOT NULL UNIQUE,
                is_dark_mode_enabled BOOLEAN DEFAULT 0,
                is_emojis_enabled BOOLEAN DEFAULT 1,
                is_acknowledgement_enabled BOOLEAN DEFAULT 1
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS allowed_users (
                email TEXT PRIMARY KEY,
                added_by TEXT,
                is_admin INTEGER DEFAULT 0,
                is_user INTEGER DEFAULT 1,
                created_date TEXT DEFAULT CURRENT_TIMESTAMP,
                last_modified_date TEXT DEFAULT CURRENT_TIMESTAMP
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS apps (
                app_id TEXT PRIMARY KEY,
                app_title TEXT NOT NULL UNIQUE,
                app_description TEXT NOT NULL,
                app_icon TEXT NOT NULL,
                app_link TEXT NOT NULL
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS chat_templates (
                template_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                app_name TEXT NOT NULL,
                template_name TEXT NOT NULL,
                template_text TEXT NOT NULL
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS document_builder (
                user_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                document_text TEXT,
                PRIMARY KEY(user_id, session_id)
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS minutes_of_meeting (
                transcript_content_url TEXT,
                transcript_content TEXT,
                meeting_notes TEXT
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS session_groups (
                session_group_id TEXT,
                user_id TEXT,
                session_id TEXT UNIQUE,
                session_group_name TEXT,
                session_group_color TEXT,
                session_group_details TEXT,
                app_name TEXT
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                session_name TEXT DEFAULT 'New Chat',
                session_created_date TEXT,
                user_id TEXT,
                session_updated_date TEXT,
                app_name TEXT,
                session_details TEXT
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS sessions_items (
                session_item_id TEXT,
                user_id TEXT,
                session_id TEXT,
                prompt TEXT,
                chatbot_response TEXT,
                app_name TEXT,
                session_item_details TEXT,
                feedback INTEGER DEFAULT 0
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS userMemory (
                memory_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                memory_value TEXT NOT NULL
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT,
                app_id TEXT,
                is_bookmarked TEXT
            );
            """
        ]

        try:
            with self._connect_db() as conn:
                cursor = conn.cursor()
                for query in table_creation_queries:
                    cursor.execute(query)
                conn.commit()
                logger.info("All tables created successfully.")
        except sqlite3.Error as e:
            logger.error(f"Error creating tables: {e}")

    def truncate(self):
        try:
            with self._connect_db() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM apps")
                conn.commit()
                logger.info("Apps table truncated.")
        except sqlite3.Error as e:
            logger.error(f"Error truncating apps table: {e}")

    def load_apps(self):
        apps_to_insert = [
            ('app_001', 'Aladdin', 'aladin.svg',
             'Ask questions, generate insights, and receive AI-powered support to enhance your work.', 'relaychat/'),
            ('app_002', 'Minutes Of Meeting', 'notebook-pen.svg',
             'Convert discussions into structured meeting notes with AI-generated summaries.', 'mom/'),
            ('app_003', 'Document Builder', 'file-text.svg',
             'Upload, merge, translate, and generate documents instantly with AI-driven precision.', 'docbuild/')
        ]

        try:
            with self._connect_db() as conn:
                cursor = conn.cursor()
                for app in apps_to_insert:
                    # Check if app already exists by app_id (primary key)
                    cursor.execute("SELECT COUNT(*) FROM apps WHERE app_id = ?", (app[0],))
                    if cursor.fetchone()[0] == 0:
                        cursor.execute(
                            """
                            INSERT INTO apps (app_id, app_title, app_icon, app_description, app_link) 
                            VALUES (?, ?, ?, ?, ?)
                            """, app
                        )
                        logger.info(f"App '{app[1]}' (ID: {app[0]}) inserted.")
                    else:
                        logger.info(f"App '{app[1]}' (ID: {app[0]}) already exists, skipping.")
                conn.commit()
        except sqlite3.Error as e:
            logger.error(f"Error loading apps: {e}")
