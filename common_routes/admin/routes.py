from flask import (
    Blueprint,
    Response,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)
from . import admin_bp
from custom_logger import logger
import traceback
from utils.sharepoint_utilities import sharepointUtilities
from utils.helper_utils import generate_uuid, get_model_details
import identity
from utils.account_sql_utils import AccountSQLUtilities

sharepoint_utils = sharepointUtilities()
account_utils = AccountSQLUtilities()


@admin_bp.route("/")
def admin_home():
    """Chat home page with optional session loading."""
    try:
        if session.get("is_admin_user"):
            user_data = {
                "name": session.get("user"),
                "email": session.get("email"),
                "is_admin": account_utils.is_admin_user(session.get("email")),
                "profile_picture_path": session.get("profile_picture_path"),
            }
            
            return render_template(
                "admin.html",
                user=user_data,
                version=identity.__version__,
            )
        else:
            return redirect(url_for("unauthorized_access"))
    except Exception as e:
        logger.error(f"Error in chat_home: {str(e)}")
        return jsonify({"error": "An internal server error occurred"}), 500

@admin_bp.route("/get_allowed_users", methods=["GET"])
def get_allowed_users():
    try:
        users = account_utils.get_allowed_users()
        return jsonify({"success": True, "users": users}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@admin_bp.route("/add_allowed_user", methods=["POST"])
def add_allowed_user():
    try:
        user_email = session.get("user_id")
        data = request.get_json()
        email = data.get("email")
        is_admin = data.get("is_admin")
        is_user = data.get("is_user")
        account_utils.add_allowed_user(email, user_email, is_admin, is_user)
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@admin_bp.route("/update_allowed_user_email", methods=["POST"])
def update_allowed_user_email():
    try:
        data = request.get_json()
        old_email = data.get("old_email")
        new_email = data.get("new_email")
        account_utils.update_allowed_user_email(old_email, new_email)
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@admin_bp.route("/remove_allowed_user", methods=["POST"])
def remove_allowed_user():
    try:
        data = request.get_json()
        email = data.get("email")
        account_utils.remove_allowed_user(email)
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
