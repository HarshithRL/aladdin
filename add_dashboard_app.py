import sqlite3
import re

def add_dashboard_app():
    conn = sqlite3.connect('relay_project_manager.db')
    cursor = conn.cursor()
    
    # Check if Dashboard already exists
    cursor.execute("SELECT * FROM apps WHERE app_title = 'Dashboard'")
    existing = cursor.fetchone()
    
    if existing:
        print(f"Dashboard already exists: {existing}")
        conn.close()
        return

    # Find max app_id
    cursor.execute("SELECT app_id FROM apps")
    ids = [row[0] for row in cursor.fetchall()]
    
    max_id = 0
    for app_id in ids:
        match = re.search(r'app_(\d+)', app_id)
        if match:
            num = int(match.group(1))
            if num > max_id:
                max_id = num
    
    new_id = f"app_{max_id + 1:03d}"
    print(f"New App ID: {new_id}")
    
    # Insert Dashboard
    # Columns: app_id, app_title, app_description, app_icon, app_link
    title = "Dashboard"
    description = "View your dashboard."
    icon = "file-chart-pie.svg"
    link = "/dashboard"
    
    cursor.execute("""
        INSERT INTO apps (app_id, app_title, app_description, app_icon, app_link)
        VALUES (?, ?, ?, ?, ?)
    """, (new_id, title, description, icon, link))
    
    conn.commit()
    print("Dashboard app inserted successfully.")
    
    conn.close()

if __name__ == "__main__":
    add_dashboard_app()
