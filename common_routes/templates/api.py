from flask import Blueprint, request, jsonify, session
from utils.account_sql_utils import AccountSQLUtilities
from custom_logger import logger


from . import templates_bp
import traceback
from utils.chat_template_utilities import chat_template_utils

account_utils = AccountSQLUtilities()

@templates_bp.route("/create_template", methods=["POST"])
def create_template():
    """Creates a new chat template."""
    try:
        user_id = session["user_id"]
        data = request.get_json()
        app_name = data.get("app_name")
        template_id = data.get("template_id")
        template_name = data.get("template_name")
        template_text = data.get("template_text")

        chat_template_utils.create_template(
            template_id, user_id, app_name, template_name, template_text
        )
        return jsonify({"success": True})
    except Exception:
        logger.error("Error in create_template function:")
        logger.error(traceback.format_exc())
        return jsonify({"error": "An internal server error occurred"}), 500


@templates_bp.route("/rename_template", methods=["POST"])
def rename_template():
    """Renames an existing chat template."""
    try:
        user_id = session["user_id"]
        data = request.get_json()
        app_name = data.get("app_name")
        template_id = data.get("template_id")
        new_name = data.get("new_name")

        chat_template_utils.rename_template(template_id, user_id, new_name)
        return jsonify({"success": True})
    except Exception:
        logger.error("Error in rename_template function:")
        logger.error(traceback.format_exc())
        return jsonify({"error": "An internal server error occurred"}), 500


@templates_bp.route("/update_template", methods=["POST"])
def update_template():
    """Updates the text of a chat template."""
    try:
        user_id = session["user_id"]
        data = request.get_json()
        template_id = data.get("template_id")

        new_name = data.get("new_name")
        new_text = data.get("new_text")
        chat_template_utils.update_template(template_id, user_id, new_name, new_text)
        return jsonify({"success": True})
    except Exception:
        logger.error("Error in update_template function:")
        logger.error(traceback.format_exc())
        return jsonify({"error": "An internal server error occurred"}), 500


@templates_bp.route("/delete_template", methods=["POST"])
def delete_template():
    """Deletes a specific chat template."""
    try:
        user_id = session["user_id"]
        data = request.get_json()
        template_id = data.get("template_id")

        chat_template_utils.delete_template(template_id, user_id)
        return jsonify({"success": True})
    except Exception:
        logger.error("Error in delete_template function:")
        logger.error(traceback.format_exc())
        return jsonify({"error": "An internal server error occurred"}), 500


@templates_bp.route("/get_template", methods=["POST"])
def get_template():
    """Fetches all template texts along with their IDs for a given app."""
    try:
        user_id = session["user_id"]
        templates = chat_template_utils.get_templates(user_id)
        return jsonify({"success": True, "templates": templates})
    except Exception:
        logger.error("Error in get_template function:")
        logger.error(traceback.format_exc())
        return jsonify({"error": "An internal server error occurred"}), 500