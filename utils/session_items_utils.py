import datetime
import json
import re
import sqlite3
from collections import defaultdict

import pandas as pd

from custom_logger import logger

class SessionItmesUtilities:
    def __init__(self, db_name: str = "relay_project_manager.db"):
        self.db_name = db_name
        self.conn = sqlite3.connect(self.db_name, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row  # Enables dict-like access
        logger.info(f"Connected to the database: {self.db_name}")
    def _connect_db(self):
        return sqlite3.connect(self.db_name)
    def get_previous_messages(self, session_id, app_name):
        """Fetches all previous messages (prompts and chatbot responses) for a session."""
        try:
            with self._connect_db() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT prompt, chatbot_response, session_item_details
                    FROM sessions_items 
                    WHERE session_id = ?
                """, (session_id,))

                messages = []
                logger.info(len(messages))

                for row in cursor.fetchall():
                    prompt_raw = row[0]
                    response_raw = row[1]
                    session_item_details = row[2]

                    # Try to parse the prompt content
                    try:
                        prompt_content = json.loads(prompt_raw)
                        if isinstance(prompt_content, list) and all("type" in item for item in prompt_content):
                            user_content = prompt_content
                        else:
                            # Unexpected structure, wrap it
                            user_content = [{"type": "input_text", "text": prompt_raw}]
                    except (json.JSONDecodeError, TypeError):
                        # Old format, treat it as plain text
                        user_content = [{"type": "input_text", "text": prompt_raw}]

                    if app_name == "relaychat" and session_item_details:
                        session_data = json.loads(session_item_details)
                        new_trace = session_data.get("new_messages_trace")
                        logger.info(f"session item utils new_trace: {new_trace}")
                        if new_trace:
                            messages.extend([
                                {"role": "user", "content": user_content},
                            ])
                            # Handle potentially malformed JSON with multiple objects
                            try:
                                parsed_trace = json.loads(new_trace)
                                messages += parsed_trace
                            except json.JSONDecodeError as json_error:
                                logger.error(f"JSON decode error for new_trace: {json_error}")
                                logger.error(f"Problematic new_trace content: {new_trace[:500]}...")
                                
                                # Try to parse multiple JSON objects that might be concatenated
                                try:
                                    # Split on '][' pattern to separate concatenated JSON arrays
                                    if '][' in new_trace:
                                        parts = new_trace.split('][')
                                        parsed_messages = []
                                        
                                        for i, part in enumerate(parts):
                                            # Add back the brackets
                                            if i == 0:
                                                part = part + ']'
                                            elif i == len(parts) - 1:
                                                part = '[' + part
                                            else:
                                                part = '[' + part + ']'
                                            
                                            try:
                                                parsed_part = json.loads(part)
                                                if isinstance(parsed_part, list):
                                                    parsed_messages.extend(parsed_part)
                                                else:
                                                    parsed_messages.append(parsed_part)
                                            except json.JSONDecodeError:
                                                logger.warning(f"Could not parse part: {part[:100]}...")
                                                continue
                                        
                                        messages += parsed_messages
                                        logger.info(f"Successfully parsed {len(parsed_messages)} messages from concatenated JSON")
                                    else:
                                        # If no concatenation pattern, log and skip
                                        logger.warning(f"Could not parse new_trace, skipping: {new_trace[:200]}...")
                                        messages.extend([
                                            {"role": "assistant", "content": response_raw}
                                        ])
                                except Exception as e:
                                    logger.error(f"Error parsing concatenated JSON: {e}")
                                    # Fallback to basic message format
                                    messages.extend([
                                        {"role": "assistant", "content": response_raw}
                                    ])
                        else:
                            messages.extend([
                                {"role": "user", "content": user_content},
                                {"role": "assistant", "content": response_raw}
                            ])
                    else:
                        messages.extend([
                            {"role": "user", "content": user_content},
                            {"role": "assistant", "content": response_raw}
                        ])


                logger.info(len(messages))
                return messages

        except sqlite3.Error as e:
            logger.info(f"Error fetching previous messages for session {session_id}: {e}")
            return []
    
    def get_previous_audio_messages(self, session_id):
        """Fetches all previous messages (prompts and chatbot responses) for a session."""
        try:
            with self._connect_db() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT prompt, chatbot_response, session_item_details
                    FROM sessions_items 
                    WHERE session_id = ?
                """, (session_id,))

                messages = []
                logger.info(len(messages))

                for row in cursor.fetchall():
                    prompt_raw = row[0]
                    response_raw = row[1]
                    messages.extend([
                        {"role": "user", "content": prompt_raw},
                    ])
                    messages.extend([
                        {"role": "assistant", "content": response_raw}
                    ])

                logger.info(len(messages))
                return messages

        except sqlite3.Error as e:
            logger.info(f"Error fetching previous messages for session {session_id}: {e}")
            return []
    
    def add_new_transcript(self, session_id, prompt, user_id, session_item_details):
        with self.conn:
            current_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            app_name = "mom"
            session_name = "New Chat"

            # Check if session_id exists in sessions table
            cursor = self.conn.execute("SELECT session_id FROM sessions WHERE session_id = ?", (session_id,))
            if cursor.fetchone():
                self.conn.execute('''
                    UPDATE sessions
                    SET session_updated_date = ?
                    WHERE session_id = ?
                ''', (current_time, session_id))
                logger.info(f"Session '{session_id}' exists. Updated session's updated_date to {current_time}.")
            else:
                self.conn.execute('''
                    INSERT INTO sessions (session_id, user_id, session_details, session_created_date, session_updated_date, app_name, session_name)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (session_id, user_id, json.dumps({}), current_time, current_time, app_name, session_name))
                logger.info(f"Session '{session_id}' does not exist. Inserted new session with session_name '{session_name}', app_name '{app_name}', and created_date '{current_time}'.")

            # Remove all rows that have the same session_id
            self.conn.execute('''
                DELETE FROM sessions_items
                WHERE session_id = ?
            ''', (session_id,))
            logger.info(f"Deleted all rows with session_id '{session_id}' from session_items table.")

            # Insert transcript into session_items table
            self.conn.execute('''
                INSERT INTO sessions_items (user_id, session_id, prompt, chatbot_response, session_item_details, app_name)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (user_id, session_id, prompt, "", json.dumps(session_item_details), app_name))
            logger.info(f"Inserted new transcript into session_items table for session_id '{session_id}'. Prompt: '{prompt}', session_item_details: {session_item_details}.")

            # Check if session_id exists in session_groups table
            cursor = self.conn.execute("SELECT session_id FROM session_groups WHERE session_id = ?", (session_id,))
            if not cursor.fetchone():
                self.conn.execute('''
                    INSERT INTO session_groups (user_id, session_id, session_group_color, session_group_details)
                    VALUES (?, ?, ?, ?)
                ''', (user_id, session_id, '#ccc', json.dumps({})))
                logger.info(f"Session group for session_id '{session_id}' does not exist. Inserted new session group with default color '#ccc'.")
            else:
                pass
                logger.info(f"Session group for session_id '{session_id}' already exists. No changes made.")
    
    def update_last_session_item_details(self, session_id, session_item_details):
        """Updates the session_item_details in the last row where the session_id matches."""
        try:
            with self.conn:
                self.conn.execute('''
                    UPDATE sessions_items
                    SET session_item_details = ?
                    WHERE session_item_id = (
                        SELECT session_item_id
                        FROM sessions_items
                        WHERE session_id = ?
                        ORDER BY session_item_id DESC
                        LIMIT 1
                    )
                ''', (json.dumps(session_item_details), session_id))
                logger.info(f"Updated session_item_details for the last item in session {session_id}.")
        except sqlite3.Error as e:
            logger.info(f"Error updating session_item_details for session {session_id}: {e}")

    def get_last_session_item_details(self, session_id):
        """Fetches the session_item_details of the last row where the session_id matches."""
        try:
            with self.conn:
                cursor = self.conn.execute('''
                    SELECT session_item_details
                    FROM sessions_items
                    WHERE session_id = ?
                    ORDER BY session_item_id DESC
                    LIMIT 1
                ''', (session_id,))
                row = cursor.fetchone()
                if row:
                    logger.info(f"Fetched session_item_details for the last item in session {session_id}.")
                    return json.loads(row["session_item_details"])
                else:
                    logger.info(f"No session_item_details found for session {session_id}.")
                    return None
        except sqlite3.Error as e:
            logger.info(f"Error fetching session_item_details for session {session_id}: {e}")
            return None

    def update_transcript_content(self, session_id, chatbot_response, session_name):
        with self.conn:
            current_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            # Update chatbot_response and session_name in sessions_items table
            self.conn.execute('''
                UPDATE sessions_items
                SET chatbot_response = ?
                WHERE session_id = ?
            ''', (chatbot_response, session_id))
            logger.info("Updated chatbot_response for transcript.")

            # Update session updated date and session_name
            self.conn.execute('''
                UPDATE sessions
                SET session_updated_date = ?, session_name = ?
                WHERE session_id = ?
            ''', (current_time, session_name, session_id))
            logger.info("Updated session's updated_date and session_name after transcript update.")
    
    def update_document(self, user_id, session_id, app_name, document_text):
        """Update if row exists, else insert into document_builder for the given session."""
        try:
            with self._connect_db() as conn:
                cursor = conn.cursor()

                # Check if the record already exists
                cursor.execute(
                    """
                    SELECT 1 FROM document_builder
                    WHERE user_id = ? AND session_id = ?
                    """,
                    (user_id, session_id)
                )
                exists = cursor.fetchone()

                if exists:
                    # Update existing row
                    cursor.execute(
                        """
                        UPDATE document_builder
                        SET document_text = ?
                        WHERE user_id = ? AND session_id = ?
                        """,
                        (document_text, user_id, session_id)
                    )
                else:
                    # Insert new row
                    cursor.execute(
                        """
                        INSERT INTO document_builder (user_id, session_id, document_text)
                        VALUES (?, ?, ?)
                        """,
                        (user_id, session_id, document_text)
                    )

                conn.commit()
        except sqlite3.Error as e:
            logger.info(f"Error inserting/updating document_builder: {e}")
            raise e
    
    def update_audio_url_for_session_item(self, session_item_id: str, audio_url: str) -> bool:
        """
        Update the audio_url field in session_item_details for a given session_item_id.
        
        Args:
            session_item_id (str): The ID of the session item to update.
            audio_url (str): The audio URL to set.
            
        Returns:
            bool: True if update succeeded, False if not found.
        """
        try:
            with self.conn:
                # Get current session_item_details
                cursor = self.conn.execute(
                    "SELECT session_item_details FROM sessions_items WHERE session_item_id = ?",
                    (session_item_id,)
                )
                row = cursor.fetchone()
                logger.info(f"{str(row)}")
                if not row:
                    return False

                # Parse existing details
                details = json.loads(row[0]) if row[0] else {}
                logger.info(f"{str(details)}")

                # Update audio_url
                details["audio_url"] = audio_url

                # Save back to DB
                self.conn.execute(
                    "UPDATE sessions_items SET session_item_details = ? WHERE session_item_id = ?",
                    (json.dumps(details), session_item_id)
                )

                return True
        except Exception as e:
            logger.info(f"Failed to update audio_url for {session_item_id}: {str(e)}")
            return False

    def insert_message(self, session_id, prompt, chatbot_response, user_id, app_name, session_name, session_item_details, session_item_id):
        with self.conn:
            current_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            # Check if session_id exists in sessions table
            cursor = self.conn.execute("SELECT session_id FROM sessions WHERE session_id = ?", (session_id,))
            if cursor.fetchone():
                self.conn.execute('''
                    UPDATE sessions
                    SET session_updated_date = ?
                    WHERE session_id = ?
                ''', (current_time, session_id))
                logger.info(f"Session '{session_id}' found. Updated session's updated_date to {current_time}.")
            else:
                session_name = " ".join(session_name.split()[:5])
                self.conn.execute('''
                    INSERT INTO sessions (session_id, user_id, session_details, session_created_date, session_updated_date, app_name, session_name)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (session_id, user_id, json.dumps({}), current_time, current_time, app_name, session_name))
                logger.info(f"Session '{session_id}' not found. Inserted new session with name '{session_name}' and app_name '{app_name}'.")

            # Insert message into session_items table
            self.conn.execute('''
                INSERT INTO sessions_items (session_item_id, user_id, session_id, prompt, chatbot_response, session_item_details, app_name)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (session_item_id, user_id, session_id, prompt, chatbot_response, json.dumps(session_item_details), app_name))
            logger.info(f"Inserted message into session_items for session_id '{session_id}'. Prompt: '{prompt}', Chatbot Response: '{chatbot_response}'.")

            
    def delete_session(self, session_id):
        """Deletes a session and its associated group."""
        try:
            with self._connect_db() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM sessions WHERE session_id = ?", (session_id,))
                cursor.execute("DELETE FROM sessions_items WHERE session_id = ?", (session_id,))
                cursor.execute("DELETE FROM session_groups WHERE session_id = ?", (session_id,))
                conn.commit()
            logger.info(f"Session {session_id} deleted.")
        except sqlite3.Error as e:
            logger.info(f"Error deleting session {session_id}: {e}")

    def delete_all_sessions(self, user_id: str, app_name: str):
        """Deletes all records from sessions, sessions_items, and session_groups associated with a given user_id and app_name."""
        
        try:
            with self._connect_db() as conn:
                cursor = conn.cursor()
                # Delete from session_groups (by user_id and session_id from sessions)
                cursor.execute('''
                    DELETE FROM session_groups 
                    WHERE user_id = ? 
                    AND session_id IN (SELECT session_id FROM sessions WHERE user_id = ? AND app_name = ?)
                ''', (user_id, user_id, app_name))
                
                # Delete from sessions_items
                cursor.execute('''
                    DELETE FROM sessions_items 
                    WHERE user_id = ? AND app_name = ?
                ''', (user_id, app_name))

                # Delete from sessions
                cursor.execute('''
                    DELETE FROM sessions 
                    WHERE user_id = ? AND app_name = ?
                ''', (user_id, app_name))
                
                # Commit the transaction
                conn.commit()
                logger.info(f"Deleted all records for user_id={user_id} and app_name={app_name}")
        except Exception as e:
            conn.rollback()  # Rollback in case of an error
            logger.info(f"Error deleting user data: {e}")
        
        finally:
            conn.close()  # Ensure the connection is closed

    def rename_session(self, session_id: str, new_name: str):
        """Renames a session in the sessions table."""
        try:
            with self._connect_db() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    UPDATE sessions
                    SET session_name = ?, session_updated_date = datetime('now')
                    WHERE session_id = ?
                """, (new_name, session_id))
                logger.info(f"Session {session_id} renamed to {new_name}.")
        except Exception as e:
            pass
            logger.info(f"Error renaming session: {e}")


    def rename_session_group(self, old_group_name: str, new_group_name: str):
        """Renames a session group in the session_groups table."""
        try:
            with self._connect_db() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    UPDATE session_groups
                    SET session_group_name = ?
                    WHERE session_group_name = ?
                """, (new_group_name, old_group_name))
                logger.info(f"Session group '{old_group_name}' renamed to '{new_group_name}'.")
        except Exception as e:
            pass
            logger.info(f"Error renaming session group: {e}")

    def update_session_item_feedback(self, user_id, session_id, feedback, session_item_id):
        with self.conn:
            self.conn.execute('''
                UPDATE sessions_items
                SET feedback = ?
                WHERE session_id = ? AND user_id = ? AND session_item_id = ?
            ''', (feedback, session_id, user_id, session_item_id))
        logger.info("Session updated successfully.")
    
    def get_session_data(self, session_id, app_name):
        """Fetches all prompts and chatbot responses for a given session."""
        try:
            logger.info(f"Fetching session data for session_id: {session_id}, app_name: {app_name}")
            with self._connect_db() as conn:
                logger.info("Database connection established.")
                cursor = conn.cursor()
                logger.info("Cursor created.")
                cursor.execute("""
                    SELECT session_item_id, prompt, chatbot_response, session_item_details, feedback
                    FROM sessions_items
                    WHERE session_id = ?
                """, (session_id,))
                logger.info("Executed SQL query to fetch session items.")

                rows = cursor.fetchall()
                logger.info(f"Fetched {len(rows)} rows from the database.")

                session_data = []
                if (app_name == 'relaychat') or (app_name == 'docbuild'):
                    logger.info(f"Processing data for app_name: {app_name}")
                    for row in rows:
                        prompt_raw = row[1]
                        # Try to parse the prompt content
                        try:
                            prompt_content = json.loads(prompt_raw)

                            # If it's a list of message parts (like [{"type": "text", "text": "..."}])
                            if isinstance(prompt_content, list) and all("type" in item for item in prompt_content):
                                prompt_raw = [x['text'] for x in prompt_content if x.get('type') in ("text", "input_text")][0]
                            else:
                                # Unexpected structure, wrap it
                                prompt_raw = prompt_raw
                        except (json.JSONDecodeError, TypeError):
                            # Old format, treat it as plain text
                            prompt_raw = prompt_raw
                        session_data.append({
                            "session_item_id": row[0],
                            "prompt": prompt_raw, 
                            "chatbot_response": row[2],
                            "session_item_details": row[3],
                            "feedback": row[4]
                        })
                    return session_data
                
                if app_name == 'mom':
                    logger.info("Processing data for app_name: mom")
                    
                    for row in rows:
                        session_item_id = row[0]
                        prompt = row[1]
                        chatbot_response = row[2]
                        session_item_details = row[3]
                        feedback = row[4]

                        session_data.append({
                            "session_item_id": session_item_id,
                            "prompt": prompt,
                            "chatbot_response": chatbot_response,
                            "session_item_details": session_item_details,
                            "feedback": feedback,
                        })

                        logger.info(f"Appended data for prompt: {session_item_details}")
                    return session_data[-1]

        except sqlite3.Error as e:
            logger.info(f"Error fetching session data: {e}")
            return []
                

        except sqlite3.Error as e:
            logger.info(f"Error fetching session data: {e}")
            return []
    
    def change_session_group_color(self, session_group_name: str, new_color: str, user_id: str, app_name: str):
        """Changes the color of a session group in the session_groups table for a specific user and app."""
        try:
            with self._connect_db() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    UPDATE session_groups
                    SET session_group_color = ?
                    WHERE session_group_name = ? AND user_id = ? AND session_id IN (
                        SELECT session_id FROM sessions WHERE app_name = ?
                    )
                """, (new_color, session_group_name, user_id, app_name))
                logger.info(f"Color of session group '{session_group_name}' for user '{user_id}' in app '{app_name}' changed to {new_color}.")
        except Exception as e:
            pass
            logger.info(f"Error changing session group color: {e}")
    
    def remove_from_session_group(self, session_id: str, app_name: str):
        logger.info(f"Removing session {session_id} from its group in app {app_name}...")
        with self.conn:
            self.conn.execute('''
                UPDATE session_groups
                SET session_group_name = 'Unnamed Session'
                WHERE session_id = ? AND session_group_name != 'Unnamed Session';
            ''', (session_id,))
        logger.info(f"Session {session_id} has been removed from its group.")

    def delete_session_group(self, session_group_name: str, app_name: str):
        """
        Deletes all sessions that belong to a given session group name and app_name.
        """
        try:
            with self.conn:
                # Get session IDs associated with the session group name
                session_ids = [row["session_id"] for row in self.conn.execute(
                    """
                    SELECT session_id FROM session_groups
                    WHERE session_group_name = ?
                    """,
                    (session_group_name,)
                ).fetchall()]
                
                if not session_ids:
                    logger.info(f"No sessions found for session group: {session_group_name}")
                    return
                
                # Delete from session_groups table
                self.conn.execute(
                    """
                    DELETE FROM session_groups
                    WHERE session_group_name = ?
                    """,
                    (session_group_name,)
                )
                
                # Delete from sessions table
                self.conn.executemany(
                    """
                    DELETE FROM sessions
                    WHERE session_id = ? AND app_name = ?
                    """,
                    [(session_id, app_name) for session_id in session_ids]
                )
                
                # Delete from sessions_items table
                self.conn.executemany(
                    """
                    DELETE FROM sessions_items
                    WHERE session_id = ? AND app_name = ?
                    """,
                    [(session_id, app_name) for session_id in session_ids]
                )
                
                logger.info(f"Deleted all sessions for session group: {session_group_name}")
        except sqlite3.Error as e:
            pass
            logger.info(f"Database error: {e}")
        except Exception as e:
            pass
            logger.info(f"Exception: {e}")

    def create_session(self, session_id, session_name, user_id, app_name, session_type):
        """Creates a new session."""
        try:
            with self._connect_db() as conn:
                current_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO sessions (
                        session_id, session_name, user_id, 
                        session_created_date, session_updated_date, 
                        app_name, session_details
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    session_id, session_name, user_id,
                    current_time, current_time,
                    app_name, json.dumps({"type": session_type})
                ))
                
                # Create default session group entry
                cursor.execute("""
                    INSERT INTO session_groups (
                        user_id, session_id, 
                        session_group_name, session_group_color,
                        session_group_details
                    )
                    VALUES (?, ?, ?, ?, ?)
                """, (
                    user_id, session_id,
                    "Unnamed Session", "#ccc",
                    json.dumps({})
                ))
                conn.commit()
        except sqlite3.Error as e:
            logger.info(f"Error creating session: {e}")
            raise e

    def add_to_session(self, session_id, content, content_type, user_id):
        """Adds content to a session."""
        try:
            with self._connect_db() as conn:
                current_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                cursor = conn.cursor()
                
                # Update session's updated date
                cursor.execute("""
                    UPDATE sessions
                    SET session_updated_date = ?
                    WHERE session_id = ?
                """, (current_time, session_id))
                
                # Add content as a session item
                cursor.execute("""
                    INSERT INTO sessions_items (
                        user_id, session_id,
                        prompt, chatbot_response,
                        session_item_details, app_name
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    user_id, session_id,
                    "", content,  # Store content in chatbot_response field
                    json.dumps({"type": content_type}),
                    "docbuild"
                ))
                conn.commit()
        except sqlite3.Error as e:
            logger.info(f"Error adding content to session: {e}")
            raise e

    def update_session_content(self, session_id, content, user_id):
        """Inserts a new row into the document_builder table."""
        try:
            with self._connect_db() as conn:
                cursor = conn.cursor()
                
                # Insert a new row into the document_builder table
                cursor.execute("""
                    INSERT INTO document_builder (user_id, session_id, document_text)
                    VALUES (?, ?, ?)
                """, (user_id, session_id, content))
                
                conn.commit()
        except sqlite3.Error as e:
            logger.info(f"Error inserting into document_builder: {e}")
            raise e

    def get_document_text(self, session_id):
        logger.info(f"Attempting to fetch document text for session_id {session_id}.")
        with self.conn:
            cursor = self.conn.execute(
                "SELECT document_text FROM document_builder WHERE session_id = ? ORDER BY rowid DESC LIMIT 1",
                (session_id,)
            )
            logger.info(f"Executed query to fetch document text for session_id {session_id}.")
            row = cursor.fetchone()
            logger.info(f"Fetched document text for session_id {session_id}: {row[0] if row else 'No data found'}.")
            if row:
                return row[0]
            return None
    
    def is_transcript_content_already_present(self, transcript_content_url: str) -> bool:
        with self.conn:
            logger.info(f"Checking if transcript content already present for URL: {transcript_content_url}")
            cursor = self.conn.execute(
                "SELECT 1 FROM minutes_of_meeting WHERE transcript_content_url = ? LIMIT 1",
                (transcript_content_url,)
            )
            exists = cursor.fetchone() is not None
            logger.info(f"Transcript content {'found' if exists else 'not found'} for URL: {transcript_content_url}")
            return exists

    def add_meeting_notes(self, transcript_content_url: str, transcript_content: str, meeting_notes: str):
        with self.conn:
            logger.info(f"Adding meeting notes for URL: {transcript_content_url}")
            self.conn.execute(
                '''
                INSERT INTO minutes_of_meeting (transcript_content_url, transcript_content, meeting_notes)
                VALUES (?, ?, ?)
                ''',
                (transcript_content_url, transcript_content, meeting_notes)
            )
            logger.info(f"Meeting notes added for URL: {transcript_content_url}")

    def get_meeting_notes_by_url(self, transcript_content_url: str) -> str:
        with self.conn:
            logger.info(f"Fetching meeting notes for URL: {transcript_content_url}")
            cursor = self.conn.execute(
                "SELECT meeting_notes FROM minutes_of_meeting WHERE transcript_content_url = ? LIMIT 1",
                (transcript_content_url,)
            )
            row = cursor.fetchone()
            if row:
                logger.info(f"Meeting notes found for URL: {transcript_content_url}")
                return row["meeting_notes"]
            else:
                logger.info(f"No meeting notes found for URL: {transcript_content_url}")
                return None
    
    def create_new_project(self, session_group_id, user_id, session_group_name, session_group_color, session_group_details, app_name):
        with self.conn:
            self.conn.execute('''
                INSERT INTO session_groups (session_group_id, user_id, session_group_name, session_group_color, session_group_details, app_name)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (session_group_id, user_id, session_group_name, session_group_color, session_group_details, app_name))
    
    def insert_session_to_project(self, session_group_id, user_id, session_id, session_group_name, session_group_color, session_group_details, app_name):
        with self.conn:
            cursor = self.conn.execute("SELECT session_id FROM session_groups WHERE session_id = ?", (session_id,))
            if not cursor.fetchone():  
                self.conn.execute('''
                    INSERT INTO session_groups (session_group_id, user_id, session_id, session_group_name, session_group_color, session_group_details, app_name)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (session_group_id, user_id, session_id, session_group_name, session_group_color, session_group_details, app_name))


    def get_session_group_names_by_app(self, user_id: str, app_name: str) -> list:
        """
        Returns a list of session_group_name values for the given app_name.
        """
        with self.conn:
            cursor = self.conn.execute('''
                SELECT session_group_id, session_group_name, session_group_color, session_group_details
                FROM session_groups
                WHERE app_name = ? AND user_id = ?
            ''', (app_name,user_id,))
            projects = []
            for row in cursor.fetchall():
                project_id = row[0]
                project_name = row[1]
                project_group_color = row[2]
                project_group_details = row[3]
                projects.append({
                    "project_id": project_id,
                    "project_name": project_name,
                    "project_group_color": project_group_color,
                    "project_group_details": project_group_details
                })
            return projects
    
    def get_ungrouped_sessions(self, user_id, app_name):
        with self.conn:
            cursor = self.conn.execute('''
                SELECT 
                    s.session_id, 
                    s.session_name, 
                    s.session_updated_date
                FROM sessions s
                LEFT JOIN session_groups sg ON s.session_id = sg.session_id
                WHERE s.user_id = ? AND s.app_name = ? AND sg.session_group_name IS NULL
                ORDER BY s.session_updated_date DESC;
            ''', (user_id, app_name))

            sessions = []
            for row in cursor.fetchall():
                sessions.append({
                    "session_id": row["session_id"],
                    "session_name": row["session_name"],
                    "session_last_updated_date": row["session_updated_date"]
                })

            return sessions
    
    def get_grouped_sessions(self, user_id, app_name):
        with self.conn:
            cursor = self.conn.execute('''
                SELECT 
                    s.session_id,
                    s.session_name,
                    s.session_updated_date,
                    sg.session_group_name,
                    sg.session_group_color,
                    sg.session_group_id,
                    sg.session_group_details
                FROM session_groups sg
                LEFT JOIN sessions s ON s.session_id = sg.session_id
                WHERE sg.user_id = ? AND sg.app_name = ?
                ORDER BY sg.session_group_name, s.session_updated_date DESC;
            ''', (user_id, app_name))

            grouped_sessions = {}
            for row in cursor.fetchall():
                group_name = row["session_group_name"]
                if group_name not in grouped_sessions:
                    grouped_sessions[group_name] = {
                        "session_group_id": row["session_group_id"],
                        "session_group_color": row["session_group_color"],
                        "session_group_details": row["session_group_details"],
                        "sessions": []
                    }

                # Only add session details if session_id exists
                if row["session_id"]:
                    grouped_sessions[group_name]["sessions"].append({
                        "session_id": row["session_id"],
                        "session_name": row["session_name"],
                        "session_last_updated_date": row["session_updated_date"]
                    })

            return grouped_sessions
        
    def update_project_color(self, session_group_id, user_id, new_color):
        """
        Updates the color for all session_groups matching the session_group_id and user_id.
        """
        with self.conn:
            self.conn.execute(
                '''
                UPDATE session_groups
                SET session_group_color = ?
                WHERE session_group_id = ? AND user_id = ?
                ''',
                (new_color, session_group_id, user_id)
            )
    def delete_project(self, project_id: str, user_id: str) -> None:
        """
        Delete all session_groups records with the given project ID (session_group_id) for the user.

        Args:
            project_id (str): The session_group_id (i.e., project ID).
            user_id (str): The ID of the user making the request.

        Raises:
            Exception: If deletion fails.
        """
        with self.conn:
            cursor = self.conn.execute('''
                DELETE FROM session_groups 
                WHERE session_group_id = ? AND user_id = ?
            ''', (project_id, user_id))

            if cursor.rowcount == 0:
                raise Exception(f"No project found with ID {project_id} for user {user_id}")
    def update_project_metadata(self, session_group_id, user_id, new_name, new_color, new_details=None):
        """
        Updates the project name, color, and optionally details for all session_groups 
        matching the session_group_id and user_id.
        """
        with self.conn:
            if new_details is not None:
                self.conn.execute(
                    '''
                    UPDATE session_groups
                    SET session_group_name = ?, session_group_color = ?, session_group_details = ?
                    WHERE session_group_id = ? AND user_id = ?
                    ''',
                    (new_name, new_color, new_details, session_group_id, user_id)
                )
            else:
                self.conn.execute(
                    '''
                    UPDATE session_groups
                    SET session_group_name = ?, session_group_color = ?
                    WHERE session_group_id = ? AND user_id = ?
                    ''',
                    (new_name, new_color, session_group_id, user_id)
                )
            
session_items_utils = SessionItmesUtilities()