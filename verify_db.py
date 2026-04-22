import sqlite3
import os

db_path = "d:/Hemas/aladdin_good_UI/relay_project_manager.db"

if not os.path.exists(db_path):
    print(f"Database not found at {db_path}")
else:
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='user_login';")
        result = cursor.fetchone()
        if result:
            print("SUCCESS: Table 'user_login' exists.")
            # Check columns
            cursor.execute("PRAGMA table_info(user_login);")
            columns = cursor.fetchall()
            for col in columns:
                print(f"Column: {col[1]} ({col[2]})")
        else:
            print("FAILURE: Table 'user_login' does NOT exist.")
            # Let's try to initialize it manually to see if the util works
            try:
                print("Attempting to initialize using Utils...")
                import sys
                sys.path.append("d:/Hemas/aladdin_good_UI")
                from utils.user_login_utils import UserLoginUtilities
                utils = UserLoginUtilities(db_path)
                print("Initialized Utils.")
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='user_login';")
                if cursor.fetchone():
                     print("SUCCESS: Table 'user_login' created by Utils.")
            except Exception as e:
                print(f"Error importing/using utils: {e}")

        conn.close()
    except Exception as e:
        print(f"Error accessing database: {e}")
