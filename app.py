import logging
import os
import shutil
import uuid
from datetime import timedelta
from functools import wraps
import json
import requests
import identity
from flask import Flask, jsonify, redirect, render_template, request, session, url_for
from flask_session import Session
from werkzeug.middleware.proxy_fix import ProxyFix
from flask import request, redirect, url_for, session
from utils.auth_utils import require_login

import config.run_config as run_config
from custom_logger import logger
from utils.account_sql_utils import AccountSQLUtilities
from utils.app_sql_utils import AppSQLUtilities
from utils.session_utilities import SessionUtilities
from utils.sharepoint_utilities import sharepointUtilities
from utils.db_utilities import DbUtilities
from dotenv import load_dotenv
load_dotenv()
app = Flask(__name__)
app.secret_key = os.getenv("flask_secret_key")  # Required for session management
app.config.from_object(run_config)

# Set session to never expire
app.config["SESSION_PERMANENT"] = True
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=3)
app.permanent_session_lifetime = timedelta(days=1)
app.config["SESSION_REFRESH_EACH_REQUEST"] = True  # Extends session on activity
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"      # Or "None" if cross-site is needed

app.config["SESSION_COOKIE_SECURE"] = True
app.config["PREFERRED_URL_SCHEME"] = "https"
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)
app.permanent_session_lifetime = timedelta(days=4)

Session(app)

# Hardcoded user to bypass Microsoft SSO
# Hardcoded user to bypass Microsoft SSO
# HARDCODED_USER = {
#     "user_id": "52dc2bf0-506e-484f-807f-1d510bb1be62",
#     "name": "Harshith R",
#     "email": "harshith.r@diggibyte.com",
# }

@app.before_request
def check_login():
    """Global login enforcement."""
    # List of endpoints/prefixes that do not require login
    allowed_routes = [
        'auth.login', 
        'auth.signup', 
        'static', 
        'get_access_token',
        'health_check' # if exists
    ]
    
    # Allow static files
    if request.path.startswith('/static'):
        return

    # Allow auth routes
    if request.path.startswith('/auth/'):
        return

    # Allow specific endpoints
    if request.endpoint in allowed_routes:
        return

    if not session.get("user_is_logged_in"):
        logger.info(f"Unauthenticated access to {request.path}, redirecting to login.")
        return redirect(url_for('auth.login'))
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
####################################
#           Blue Prints           #
##################################
from apps.chat import chat_bp

app.register_blueprint(chat_bp, url_prefix="/relaychat")


from apps.docbuild import docbuild_bp

app.register_blueprint(docbuild_bp, url_prefix="/docbuild")



from common_routes.user_memory import user_memory_bp

app.register_blueprint(user_memory_bp, url_prefix="/user_memory")

from common_routes.settings import settings_bp

app.register_blueprint(settings_bp, url_prefix="/settings")

from common_routes.sidebar import sidebar_bp

app.register_blueprint(sidebar_bp, url_prefix="/sidebar")

from common_routes.templates import templates_bp

app.register_blueprint(templates_bp, url_prefix="/templates")

from common_routes.admin import admin_bp

app.register_blueprint(admin_bp, url_prefix="/admin")

from common_routes.auth import auth_bp

app.register_blueprint(auth_bp, url_prefix="/auth")
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
account_utils = AccountSQLUtilities()
app_sql_utils = AppSQLUtilities()
session_utils = SessionUtilities()
sharepoint_utils = sharepointUtilities()
db_utils = DbUtilities()

@app.route("/get_access_token", methods=["GET"])
def get_access_token():
    """SSO removed: return a placeholder token."""
    return jsonify({"access_token": "fake_token"})

@app.route("/unauthorized_access")
def unauthorized_access():
    return render_template("unauthorized_access.html")

@app.route("/session_status")
def session_status():
    logger.info("inside of session_status")
    return jsonify({"logged_in": session.get("user_is_logged_in", False)})

@app.route("/")
def home():
    """Landing page - Redirects to login if not authenticated."""
    if not session.get("user_is_logged_in"):
        return redirect(url_for('auth.login'))
        
    user_data = {
        "name": session.get("user"),
        "email": session.get("email"),
        "is_admin": account_utils.is_admin_user(session.get("email")),
        "profile_picture_path": session.get("profile_picture_path"),
    }
    try:
        user_preferences = account_utils.get_user_by_user_id(session.get("user_id"))
        theme = "light" if user_preferences and user_preferences.get('is_dark_mode_enabled') == 0 else "dark"
    except Exception:
        theme = "dark"

    return render_template("index.html", user=user_data, theme=theme, version=identity.__version__)

@app.route("/logout")
def logout():
    """Logs out the user by clearing local session and redirecting to login."""
    try:
        session.clear()
    finally:
        return redirect(url_for("auth.login"))

@app.route("/get_all_cards", methods=["GET"])
def get_all_cards():
    try:
        user_id = session.get("user_id")
        all_apps = app_sql_utils.get_all_apps(user_id)
        # Hide MOM from frontend cards while keeping backend routes active
        all_apps = [app for app in all_apps if app.get("app_link") != "mom/"]
        logger.info(f"all_apps: {all_apps}")
        return jsonify(all_apps), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
@app.route("/get_bookmarked_cards", methods=["GET"])
def get_bookmarked_cards():
    try:
        user_id = session.get("user_id")
        bookmarked_cards = app_sql_utils.get_bookmarked_apps(user_id)
        # Hide MOM from frontend cards while keeping backend routes active
        bookmarked_cards = [app for app in bookmarked_cards if app.get("app_link") != "mom/"]
        logger.info(f"bookmarked_cards: {bookmarked_cards}")
        return jsonify(bookmarked_cards), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/add_bookmark", methods=["POST"])
def add_bookmark():
    try:
        app_id = request.json.get("app_id")
        if app_id:
            user_id = session.get("user_id")
            app_sql_utils.add_bookmark(user_id, app_id)
            return jsonify({"success": True}), 200
        return jsonify({"error": "Missing card-link"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/remove_bookmark", methods=["POST"])
def remove_bookmark():
    try:
        app_id = request.json.get("app_id")
        if app_id:
            user_id = session.get("user_id")
            app_sql_utils.remove_bookmark(user_id, app_id)
            return jsonify({"success": True}), 200
        return jsonify({"error": "Missing card-link"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/get_home_history", methods=["GET", "POST"])
def get_home_history():
    try:
        user_id = session.get("user_id")  # Ensure session is active
        history_data = session_utils.get_sessions_history(user_id)
        return jsonify(history_data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    

def get_user_photo(email, access_token):
    """Fetch photo binary and return a data URL or fallback"""
    logger.info(f"Fetching photo for user: {email}")
    
    headers = {
        "Authorization": f"Bearer {access_token}"
    }
    # Using 'v1.0' and direct photo endpoint
    photo_url = f"https://graph.microsoft.com/v1.0/users/{email}/photo/$value"
    
    try:
        response = requests.get(photo_url, headers=headers, stream=True) # Use stream=True for large files
        logger.info(f"Photo fetch response status for {email}: {response.status_code}")
        
        if response.status_code == 200:
            import base64
            mime_type = response.headers.get("Content-Type", "image/jpeg")
            # Read content in chunks to handle large photos
            photo_content = b''
            for chunk in response.iter_content(chunk_size=8192):
                photo_content += chunk
            encoded = base64.b64encode(photo_content).decode('utf-8')
            logger.info(f"User photo successfully fetched and encoded for {email}")
            return f"data:{mime_type};base64,{encoded}"
        elif response.status_code == 404:
            logger.info(f"User photo not found for {email} (404)")
            return "[NOT AVAILABLE]"
        else:
            logger.warning(f"Failed to fetch user photo for {email}: Status {response.status_code}, Response: {response.text}")
            return "[NOT AVAILABLE]"
    except requests.exceptions.RequestException as e:
        logger.error(f"Network or request error while fetching user photo for {email}: {e}")
        return "[NOT AVAILABLE]"
    except Exception as e:
        logger.error(f"Unexpected error while processing user photo for {email}: {e}")
        return "[NOT AVAILABLE]"
@app.route('/search_users', methods=['GET'])
def search_users():
    query = request.args.get('q', '').lower()
    logger.info(f"Searching users with query: '{query}'")

    try:
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            logger.warning("Missing or invalid Authorization header.")
            return jsonify({"error": "Missing or invalid Authorization header"}), 401

        access_token = auth_header.split(" ")[1]
        headers = {"Authorization": f"Bearer {access_token}"}
        logger.info("Access token received and parsed from Authorization header.")

        if not query:
            logger.info("Empty query received. Returning empty list.")
            return jsonify([])

        params = {
            "$filter": f"startswith(displayName,'{query}') or startswith(mail,'{query}')",
            "$select": "displayName,userPrincipalName,mail,id"
        }

        response = requests.get("https://graph.microsoft.com/v1.0/users", headers=headers, params=params)
        response.raise_for_status()

        data = response.json()
        logger.info(f"Graph API returned {len(data.get('value', []))} users.")

        results = []
        for person in data.get("value", [])[:10]:
            email = person.get("userPrincipalName") or person.get("mail")
            display_name = person.get("displayName")

            if not email or not display_name:
                logger.warning(f"Skipping user with missing email/displayName: {person}")
                continue

            logger.debug(f"Processing user: {display_name} ({email})")

            photo_data_url = get_user_photo(email, access_token)

            results.append({
                "displayName": display_name,
                "email": email,
                "photo": photo_data_url
            })

        return jsonify(results)

    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 429:
            logger.warning("Rate limit hit (429).")
            return jsonify({"error": "Too many requests, please try again later."}), 429
        logger.error(f"Graph API HTTP Error: {e.response.status_code} - {e.response.text}")
        return jsonify({"error": f"Graph API error: {e.response.text}"}), e.response.status_code
    except requests.exceptions.RequestException as e:
        logger.error(f"Network error during Graph API call: {e}")
        return jsonify({"error": "Network error contacting Microsoft Graph API"}), 503
    except Exception as e:
        logger.exception(f"Unexpected error during user search: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/dashboard")
def dashboard():
    return redirect(url_for('auth.login'))

if __name__ == "__main__":
    app.run(host="::", port=5000, debug=True)
