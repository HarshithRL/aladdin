import sqlite3
import requests
import bcrypt
from datetime import datetime
from custom_logger import logger
from utils.helper_utils import generate_uuid


class AccountSQLUtilities:
    def __init__(self, db_path="relay_project_manager.db"):
        self.db_path = db_path

    def _connect_db(self):
        return sqlite3.connect(self.db_path)
    
    def is_admin_user(self, email):
        try:
            email = str(email).lower()
            with self._connect_db() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    SELECT is_admin FROM allowed_users WHERE email = ? COLLATE NOCASE;
                    """,
                    (email,)
                )
                result = cursor.fetchone()
                if result is not None:
                    return bool(result[0])  # 1 → True, 0 → False
                return False  # Not found means not admin
        except Exception as e:
            print(f"❌ Error checking admin status for {email}: {e}")
            return False
    
    def is_email_allowed(self, email):
        try:
            with self._connect_db() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    SELECT 1 FROM allowed_users WHERE email = ? COLLATE NOCASE;
                    """,
                    (email,)
                )
                result = cursor.fetchone()
                return result is not None
        except Exception as e:
            print(f"❌ Error checking email existence for {email}: {e}")
            return False

    def get_allowed_users(self):
        try:
            with self._connect_db() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    SELECT email, added_by, is_admin, is_user, created_date, last_modified_date
                    FROM allowed_users;
                    """
                )
                rows = cursor.fetchall()

                users = []
                for row in rows:
                    users.append({
                        "email": row[0],
                        "added_by": row[1],
                        "is_admin": bool(row[2]),
                        "is_user": bool(row[3]),
                        "created_date": row[4],
                        "last_modified_date": row[5]
                    })

                return users

        except Exception as e:
            print(f"❌ Failed to fetch allowed users: {e}")
            return []
    def add_allowed_user(self, email, added_by, is_admin=False, is_user=True):
        try:
            with self._connect_db() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO allowed_users (email, added_by, is_admin, is_user, created_date, last_modified_date)
                    VALUES (?, ?, ?, ?, ?, ?);
                    """,
                    (
                        email,
                        added_by,
                        int(is_admin),
                        int(is_user),
                        datetime.utcnow().isoformat(),
                        datetime.utcnow().isoformat()
                    )
                )
                conn.commit()
                print(f"✅ Added user: {email}")
        except sqlite3.IntegrityError:
            print(f"⚠️ Email already exists: {email}")
        except Exception as e:
            print(f"❌ Failed to add user: {e}")

    def remove_allowed_user(self, email):
        try:
            with self._connect_db() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    DELETE FROM allowed_users WHERE email = ?;
                    """,
                    (email,)
                )
                conn.commit()
                print(f"🗑️ Removed user: {email}")
        except Exception as e:
            print(f"❌ Failed to remove user: {e}")

    def update_allowed_user_email(self, old_email, new_email):
        try:
            with self._connect_db() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    UPDATE allowed_users
                    SET email = ?, last_modified_date = ?
                    WHERE email = ?;
                    """,
                    (
                        new_email,
                        datetime.utcnow().isoformat(),
                        old_email
                    )
                )
                conn.commit()
                if cursor.rowcount == 0:
                    print(f"⚠️ No user found with email: {old_email}")
                else:
                    print(f"✏️ Updated email: {old_email} ➜ {new_email}")
        except sqlite3.IntegrityError:
            print(f"⚠️ Email already exists: {new_email}")
        except Exception as e:
            print(f"❌ Failed to update email: {e}")
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    #
    def _create_tables(self):
        try:
            with self._connect_db() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS "account" (
                        "microsoft_entra_user_id"	TEXT,
                        "username"	TEXT NOT NULL UNIQUE,
                        "email"	TEXT NOT NULL UNIQUE,
                        "is_dark_mode_enabled"	BOOLEAN DEFAULT 0,
                        "is_emojis_enabled"	BOOLEAN DEFAULT 1,
                        "is_acknowledgement_enabled"	BOOLEAN DEFAULT 1
                    );
                    """
                )
                conn.commit()
        except sqlite3.Error as e:
            pass
            logger.info(f"Error creating tables: {e}")
    
    def ensure_account_record(self, email: str, username: str, access_token: str) -> bool:
        """
        Ensures an account record exists with Microsoft Entra user ID. Handles insert or update logic.

        Args:
            email (str): Email ID of the user.
            username (str): Desired username.
            access_token (str): Microsoft Graph API token.

        Returns:
            bool: True if operation succeeded or already exists, False if any exception occurs.
        """
        try:
            with self._connect_db() as conn:
                cursor = conn.cursor()

                # Check if user exists by email
                logger.info(f"Checking if user with email '{email}' exists in DB.")
                cursor.execute("SELECT microsoft_entra_user_id FROM account WHERE email = ?", (email,))
                result = cursor.fetchone()

                if not result:
                    # No record exists, fetch Entra ID and insert new
                    logger.info(f"User with email '{email}' not found. Fetching Microsoft Entra ID.")
                    entra_id = self.fetch_entra_user_id(email, access_token)
                    if not entra_id:
                        logger.info(f"Failed to retrieve Microsoft Entra ID for '{email}'.")
                        return False, None

                    cursor.execute(
                        "INSERT INTO account (microsoft_entra_user_id, username, email) VALUES (?, ?, ?)",
                        (entra_id, username, email)
                    )
                    conn.commit()
                    logger.info(f"Inserted new user '{email}' with Entra ID '{entra_id}'.")
                    return True, entra_id

                else:
                    current_entra_id = result[0]
                    if not current_entra_id:
                        # Exists but Entra ID missing
                        logger.info(f"User '{email}' exists but Entra ID missing. Fetching now.")
                        entra_id = self.fetch_entra_user_id(email, access_token)
                        if not entra_id:
                            logger.info(f"Failed to fetch Microsoft Entra ID for '{email}'.")
                            return False, None
                        cursor.execute(
                            "UPDATE account SET microsoft_entra_user_id = ? WHERE email = ?",
                            (entra_id, email)
                        )
                        conn.commit()
                        logger.info(f"Updated user '{email}' with Entra ID '{entra_id}'.")
                        return True, entra_id

                    logger.info(f"User '{email}' already has Entra ID. Nothing to update.")
                    return True, current_entra_id

        except Exception as e:
            logger.info(f"Failed to ensure account for '{email}': {e}")
            return False, None

    def fetch_entra_user_id(self, email: str, access_token: str) -> str:
        """
        Calls Microsoft Graph API to fetch user ID based on email.

        Args:
            email (str): Email to query.
            access_token (str): Microsoft Graph API bearer token.

        Returns:
            str: User ID if found, else empty string.
        """
        try:
            url = "https://graph.microsoft.com/v1.0/me/"
            headers = {"Authorization": f"Bearer {access_token}"}
            logger.info(f"Calling Graph API to fetch user ID for email '{email}'")

            resp = requests.get(url, headers=headers)
            if resp.status_code == 200:
                user_id = resp.json().get("id")
                logger.info(f"Retrieved Entra user ID '{user_id}' for '{email}'.")
                return user_id
            else:
                logger.info(f"Graph API returned {resp.status_code} for '{email}': {resp.text}")
                return ""

        except Exception as e:
            logger.info(f"Exception occurred while calling Graph API for '{email}': {e}")
            return ""

    def update_dark_mode_status(self, user_id=None, is_dark_mode=0):
        """
        Updates the dark mode status for a specific user.

        :param user_id: The unique ID of the user (optional if username is provided).
        :param username: The username of the user (optional if user_id is provided).
        :param is_dark_mode: The new status for dark mode (0 or 1).
        :return: True if the update was successful, False otherwise.
        """
        logger.info(f"Attempting to update dark mode status for user_id={user_id} to {is_dark_mode}")
        if user_id is None:
            logger.info("No user_id provided to update_dark_mode_status")
            raise ValueError("Either user_id must be provided.")

        if is_dark_mode not in (0, 1):
            logger.info("Invalid is_dark_mode value provided")
            raise ValueError("is_dark_mode must be either 0 or 1.")

        with self._connect_db() as conn:
            cursor = conn.cursor()
            if user_id:
                cursor.execute(
                    "UPDATE account SET is_dark_mode_enabled = ? WHERE email = ?",
                    (is_dark_mode, user_id)
                )
                logger.info(f"Executed UPDATE for dark mode: user_id={user_id}, is_dark_mode={is_dark_mode}")
            conn.commit()
            updated = cursor.rowcount > 0
            logger.info(f"Dark mode update {'succeeded' if updated else 'failed'} for user_id={user_id}")
            return updated

    def update_emoji_preference(self, user_id, is_emojis_enabled):
        """
        Updates the emoji preference for a specific user.
        """
        logger.info(f"Attempting to update emoji preference for user_id={user_id} to {is_emojis_enabled}")
        if is_emojis_enabled not in (0, 1):
            logger.info("Invalid is_emojis_enabled value provided")
            raise ValueError("is_emojis_enabled must be either 0 or 1.")
        with self._connect_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE account SET is_emojis_enabled = ? WHERE email = ?",
                (is_emojis_enabled, user_id)
            )
            logger.info(f"Executed UPDATE for emoji preference: user_id={user_id}, is_emojis_enabled={is_emojis_enabled}")
            conn.commit()
            updated = cursor.rowcount > 0
            logger.info(f"Emoji preference update {'succeeded' if updated else 'failed'} for user_id={user_id}")
            return updated

    def update_acknowledgment_preference(self, user_id, is_acknowledgement_enabled):
        """
        Updates the acknowledgment preference for a specific user.
        """
        logger.info(f"Attempting to update acknowledgment preference for user_id={user_id} to {is_acknowledgement_enabled}")
        if is_acknowledgement_enabled not in (0, 1):
            logger.info("Invalid is_acknowledgement_enabled value provided")
            raise ValueError("is_acknowledgement_enabled must be either 0 or 1.")
        with self._connect_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE account SET is_acknowledgement_enabled = ? WHERE email = ?",
                (is_acknowledgement_enabled, user_id)
            )
            logger.info(f"Executed UPDATE for acknowledgment preference: user_id={user_id}, is_acknowledgement_enabled={is_acknowledgement_enabled}")
            conn.commit()
            updated = cursor.rowcount > 0
            logger.info(f"Acknowledgment preference update {'succeeded' if updated else 'failed'} for user_id={user_id}")
            return updated

    def get_dark_mode_status(self, user_id=None):
        """
        Retrieves the dark mode status for a specific user.

        :param user_id: The unique ID of the user (optional if username is provided).
        :param username: The username of the user (optional if user_id is provided).
        :return: The dark mode status (0 or 1) if found, None otherwise.
        """
        if user_id is None:
            raise ValueError("Either user_id must be provided.")

        with self._connect_db() as conn:
            cursor = conn.cursor()
            if user_id:
                cursor.execute(
                    "SELECT is_dark_mode_enabled FROM account WHERE email = ?",
                    (user_id,)
                )
            result = cursor.fetchone()
            return result[0] if result else None

    def get_user_by_user_id(self, user_id):
        try:
            with self._connect_db() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT microsoft_entra_user_id, username, email, is_dark_mode_enabled, is_emojis_enabled, is_acknowledgement_enabled FROM account WHERE email = ?",
                    (user_id,),
                )
                user = cursor.fetchone()
                logger.info(user)
                if user:
                    return {
                        "microsoft_entra_user_id": user[0],
                        "username": user[1],
                        "email": user[2],
                        "is_dark_mode_enabled": user[3],
                        "is_emojis_enabled": user[4],
                        "is_acknowledgement_enabled": user[5]
                    }
                return None
        except sqlite3.Error as e:
            logger.info(f"Error fetching user data: {e}")
            return None

    def get_user_by_email(self, email):
        """Retrieves user details based on email."""
        try:
            with self._connect_db() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT microsoft_entra_user_id, username, email, is_dark_mode_enabled, is_emojis_enabled, is_acknowledgement_enabled FROM account WHERE email = ?",
                    (email,),
                )
                user = cursor.fetchone()
                if user:
                    return {
                        "microsoft_entra_user_id": user[0],
                        "username": user[1],
                        "email": user[2],
                        "is_dark_mode_enabled": user[3],
                        "is_emojis_enabled": user[4],
                        "is_acknowledgement_enabled": user[5]
                    }
                return None
        except sqlite3.Error as e:
            logger.info(f"Error fetching user data: {e}")
            return None

    def user_exists(self, email=None):
        """Checks if a user exists in the database."""
        try:
            with self._connect_db() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT email FROM account WHERE email = ?",
                    (email,),
                )
                return cursor.fetchone() is not None
        except sqlite3.Error as e:
            logger.error(f"Database error in user_exists: {e}")
            return False

    def set_user_preferences(self, user_id, **preferences):
        """Insert or update user preferences for dark mode, emojis, and acknowledgement.
        Only updates the preferences that are provided in the preferences dict."""
        try:
            if not preferences:
                return
            
            # Build the SQL query dynamically based on provided preferences
            set_clauses = []
            values = []
            for key, value in preferences.items():
                set_clauses.append(f"{key} = ?")
                values.append(int(bool(value)))  # Convert to int for SQLite boolean
            
            values.append(user_id)  # Add user_id for WHERE clause
            
            query = f"UPDATE account SET {', '.join(set_clauses)} WHERE email = ?"
            
            with self._connect_db() as conn:
                cursor = conn.cursor()
                cursor.execute(query, values)
                conn.commit()
        except sqlite3.Error as e:
            logger.error(f"Database error in set_user_preferences: {e}")
