import sqlite3

def list_apps():
    conn = sqlite3.connect('relay_project_manager.db')
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM apps")
    apps = cursor.fetchall()
    
    # Get column names
    names = [description[0] for description in cursor.description]
    print(f"Columns: {names}")
    
    for app in apps:
        print(app)
    conn.close()

if __name__ == "__main__":
    list_apps()
