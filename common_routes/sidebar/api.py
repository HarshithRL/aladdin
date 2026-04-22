from flask import Blueprint, request, jsonify, session
from utils.account_sql_utils import AccountSQLUtilities
from utils.session_items_utils import session_items_utils
from utils.session_group_sql_utils import session_group_sql_utils

import json
from custom_logger import logger
from . import sidebar_bp
import traceback
import base64
import os
    
from utils.llm_utils import LLMUtilities
from utils.azure_utils import AzureBlobUtilities

llm_utils = LLMUtilities()
azure_utils = AzureBlobUtilities()
account_utils = AccountSQLUtilities()

@sidebar_bp.route("/get_all_sessions_and_projects", methods=["POST"])
def get_all_sessions_and_projects():
    """Fetch previous session metadata."""
    try:
        data = request.get_json()
        app_name = data.get("app_name")
        
        user_id = session["user_id"]

        # session that are in group
        grouped_sessions = session_items_utils.get_grouped_sessions(user_id, app_name)

        # sessions that are not in any group
        ungrouped_sessions = session_items_utils.get_ungrouped_sessions(user_id, app_name)

        # names of all groups
        session_group_names_by_app = session_items_utils.get_session_group_names_by_app(user_id, app_name)

        return jsonify({
            'grouped_sessions': grouped_sessions,
            'ungrouped_sessions': ungrouped_sessions,
            'session_group_names_by_app': session_group_names_by_app,
        }), 200
    
    except Exception as e:
        logger.error(f"Error fetching previous session metadata: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": "An internal server error occurred"}), 500
    
@sidebar_bp.route("/add_session_to_group", methods=["POST"])
def add_session_to_group():
    data = request.get_json()
    session_id = data.get("session_id")
    group_name = data.get("group_name")
    session_group_color = data.get("selectedColor")
    if not session_id or not group_name:
        return jsonify(
            {"success": False, "message": "Session ID and Group name are required"}
        ), 400
    try:
        user_id = session["user_id"]
        session_group_sql_utils.insert_session_group(
            user_id=user_id,
            session_id=session_id,
            session_group_name=group_name,
            session_group_color=session_group_color,
        )
        return jsonify({"success": True}), 200
    except Exception as e:
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "message": str(e)}), 500

@sidebar_bp.route("/create_new_project", methods=["POST"])
def create_new_project():
    data = request.get_json()
    session_group_id = data.get("session_group_id")
    session_group_name = data.get("session_group_name")
    session_group_color = data.get("session_group_color")
    project_icon = data.get("project_icon")
    app_name = data.get("app_name")
    
    user_id = session["user_id"]

    logger.info(f"session_group_id: {session_group_id}")
    logger.info(f"session_group_name: {session_group_name}")
    logger.info(f"session_group_color: {session_group_color}")
    logger.info(f"project_icon: {project_icon}")
    logger.info(f"user_id: {user_id}")

    try:
        session_items_utils.create_new_project(
            session_group_id = session_group_id,
            user_id = user_id,
            session_group_name = session_group_name,
            session_group_color = session_group_color,
            session_group_details = json.dumps({
                "project_icon" : project_icon
            }),
            app_name = app_name
        )
        return jsonify({"success": True}), 200
    except Exception as e:
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "message": str(e)}), 500

@sidebar_bp.route("/update_project_metadata", methods=["POST"])
def update_project_metadata():
    data = request.get_json()
    session_group_id = data.get("session_group_id")
    session_group_name = data.get("session_group_name")
    session_group_color = data.get("session_group_color")
    project_icon = data.get("project_icon")
    
    user_id = session["user_id"]

    logger.info(f"session_group_id: {session_group_id}")
    logger.info(f"session_group_name: {session_group_name}")
    logger.info(f"session_group_color: {session_group_color}")
    logger.info(f"project_icon: {project_icon}")
    logger.info(f"user_id: {user_id}")

    try:
        session_items_utils.update_project_metadata(
            session_group_id = session_group_id,
            user_id = user_id,
            new_name = session_group_name,
            new_color = session_group_color,
            new_details = json.dumps({
                "project_icon" : project_icon
            }))
        return jsonify({"success": True}), 200
    except Exception as e:
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "message": str(e)}), 500

@sidebar_bp.route("/delete_project", methods=["POST"])
def delete_project():
    data = request.get_json()
    project_id = data.get("project_id")
    user_id = session["user_id"]

    try:
        session_items_utils.delete_project(project_id, user_id)
        return jsonify({"success": True}), 200
    except Exception as e:
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "message": str(e)}), 500


@sidebar_bp.route("/get_project_icons", methods=["POST"])
def get_project_icons():
    icons = os.listdir("static/images/lucide_icons/project_icons/")
    return jsonify({"success": True, "icons":icons}), 200




@sidebar_bp.route("/move_session_to_project", methods=["POST"])
def move_session_to_project():
    data = request.get_json()
    session_group_id = data.get("session_group_id")
    session_group_name = data.get("session_group_name")
    session_group_color = data.get("session_group_color")
    project_icon = data.get("project_icon")
    session_id = data.get("session_id")
    session_group_details = data.get("session_group_details")
    app_name = data.get("app_name")
    
    user_id = session["user_id"]

    logger.info(f"session_group_id: {session_group_id}")
    logger.info(f"session_group_name: {session_group_name}")
    logger.info(f"session_group_color: {session_group_color}")
    logger.info(f"project_icon: {project_icon}")
    logger.info(f"user_id: {user_id}")
    
    try:
        session_items_utils.insert_session_to_project(
            session_group_id = session_group_id,
            user_id = user_id,
            session_id = session_id,
            session_group_name = session_group_name,
            session_group_color = session_group_color,
            session_group_details = session_group_details,
            app_name = app_name
        )
        return jsonify({"success": True}), 200
    except Exception as e:
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "message": str(e)}), 500
    
@sidebar_bp.route("/get_app_info", methods=["POST"])
def get_app_info():
    """Fetches information about the chat application."""
    try:
        data = request.get_json()
        app_name = data.get("app_name")
        with open(f"./apps/{app_name}/app_info/app_info.md", "r") as file:
            app_info_text = file.read()
        
        with open(f"./apps/{app_name}/app_info/what_is_new.md", "r") as file:
            what_is_new = file.read()

        app_info = {"app_info_text": app_info_text, 'what_is_new': what_is_new}
        return jsonify(app_info), 200
    except Exception:
        logger.error("Error in get_app_info function:")
        logger.error(traceback.format_exc())
        return jsonify({"error": "An internal server error occurred"}), 500


@sidebar_bp.route("/get_session_name", methods=["POST"])
def get_session_name():
    """Invokes the chatbot agent."""
    try:

        data = request.get_json()
        user_input = data.get("user_input")
        model_name = data.get("model_name")
        images = data.get("images")
        files_json = data.get("files_json")

        prompt = (
            "Based on the below given information, give me a two or three word that I can use as the session name. "
            "Give me just the session name. no explanations, no questions, just the session name. "
            "do not give any special charecters, inverted commas or other symbols or numbers. "
            "Do not include the word session in the name."
        )

        prompt += user_input

        if files_json:
            prompt += str(files_json)
        
        msg = {"role": "user", "content": [{"type": "text", "text": str(prompt)}]}
        if images:
            for image in images:
                image_file = azure_utils.read_file_from_blob_url_as_binary(
                    image
                )  # returns BytesIO
                image_bytes = image_file.getvalue()  # extract bytes

                image_base64 = base64.b64encode(image_bytes).decode("utf-8")
                base64_image = f"data:image/jpeg;base64,{image_base64}"

                msg["content"].append(
                    {"type": "image_url", "image_url": {"url": base64_image}}
                )

        messages = [msg]

        session_name = llm_utils.invoke_llm(messages, model_name)

        return jsonify(
            {
                "status": "success",
                "session_name": session_name,
            }
        )

    except Exception as e:
        import traceback

        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    
@sidebar_bp.route("/delete_session", methods=["POST"])
def delete_session():
    """Deletes a session."""
    try:
        data = request.get_json()
        session_id = data.get("session_id")
        session_items_utils.delete_session(session_id)
        return jsonify({"success": True})
    except Exception:
        logger.error("Error in delete_session function:")
        logger.error(traceback.format_exc())
        return jsonify({"error": "An internal server error occurred"}), 500


@sidebar_bp.route("/rename_session_group", methods=["POST"])
def rename_session_group():
    """Deletes a session."""
    try:
        data = request.get_json()
        old_group_name = data.get("old_group_name")
        new_group_name = data.get("new_group_name")
        session_items_utils.rename_session_group(old_group_name, new_group_name)
        return jsonify({"success": True})
    except Exception:
        logger.error("Error in delete_session function:")
        logger.error(traceback.format_exc())
        return jsonify({"error": "An internal server error occurred"}), 500


@sidebar_bp.route("/change_session_group_color", methods=["POST"])
def change_session_group_color():
    """Changes the color of a session group."""
    try:
        data = request.get_json()
        session_group_name = data.get("session_group_name")
        new_color = data.get("new_color")
        user_id = session["user_id"]
        app_name = data.get("app_name")
        session_items_utils.change_session_group_color(
            session_group_name, new_color, user_id, app_name
        )
        return jsonify({"success": True})
    except Exception:
        logger.error("Error in change_session_group_color function:")
        logger.error(traceback.format_exc())
        return jsonify({"error": "An internal server error occurred"}), 500


@sidebar_bp.route("/delete_session_group", methods=["POST"])
def delete_session_group():
    """Deletes a session group."""
    try:
        data = request.get_json()
        session_group_name = data.get("session_group_name")
        app_name = data.get("app_name")
        session_items_utils.delete_session_group(session_group_name, app_name)
        return jsonify({"success": True})
    except Exception:
        logger.error("Error in delete_session_group function:")
        logger.error(traceback.format_exc())
        return jsonify({"error": "An internal server error occurred"}), 500


@sidebar_bp.route("/remove_from_session_group", methods=["POST"])
def remove_from_session_group():
    """Deletes a session group."""
    try:
        data = request.get_json()
        session_id = data.get("session_id")
        app_name = data.get("app_name")
        session_items_utils.remove_from_session_group(session_id, app_name)
        return jsonify({"success": True})
    except Exception:
        logger.error("Error in delete_session_group function:")
        logger.error(traceback.format_exc())
        return jsonify({"error": "An internal server error occurred"}), 500


@sidebar_bp.route("/rename_session", methods=["POST"])
def rename_session():
    """Deletes a session."""
    try:
        data = request.get_json()
        session_id = data.get("session_id")
        new_name = data.get("sessionName")
        session_items_utils.rename_session(session_id, new_name)
        return jsonify({"success": True})
    except Exception:
        logger.error("Error in delete_session function:")
        logger.error(traceback.format_exc())
        return jsonify({"error": "An internal server error occurred"}), 500


@sidebar_bp.route("/delete_all_sessions", methods=["POST"])
def delete_all_sessions():
    """Deletes a session."""
    try:
        user_id = session["user_id"]
        data = request.get_json()
        app_name = data.get("app_name")
        logger.info(f"Deleting all sessions for user {user_id} in app {app_name}")
        session_items_utils.delete_all_sessions(user_id, app_name)
        return jsonify({"success": True})
    except Exception:
        logger.error("Error in delete_session function:")
        logger.error(traceback.format_exc())
        return jsonify({"error": "An internal server error occurred"}), 500