from utils.user_memory_utils import UserMemoryUtilities
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
from . import user_memory_bp
from custom_logger import logger
import traceback
import uuid
from utils.llm_utils import LLMUtilities


user_memory_utils = UserMemoryUtilities()
llm_utils = LLMUtilities()

@user_memory_bp.route("/has_more_than_30_memories", methods=["GET"])
def has_more_than_30_memories():
    try:
        user_id = session["user_id"]
        result = user_memory_utils.has_more_than_30_memories(user_id)
        return jsonify({"hasMoreThan30": result})
    except Exception:
        logger.error("Error in has_more_than_30_memories:")
        logger.error(traceback.format_exc())
        return jsonify({"error": "An internal server error occurred"}), 500

@user_memory_bp.route("/get_all_memories", methods=["GET"])
def get_all_memories():
    try:
        user_id = session["user_id"]
        rows = user_memory_utils.get_all_memories(user_id)
        memories = [{"memory_id": row["memory_id"], "memory_value": row["memory_value"]} for row in rows]
        return jsonify({"memories": memories})
    except Exception:
        logger.error("Error in get_all_memories:")
        logger.error(traceback.format_exc())
        return jsonify({"error": "An internal server error occurred"}), 500

@user_memory_bp.route("/edit_memory", methods=["POST"])
def edit_memory():
    try:
        user_id = session["user_id"]
        data = request.get_json()
        memory_id = data.get("memory_id")
        new_value = data.get("memory_value")

        user_memory_utils.edit_memory(user_id = user_id, memory_id = memory_id, new_value = new_value)
        return jsonify({"success": True})
    except Exception:
        logger.error("Error in edit_memory:")
        logger.error(traceback.format_exc())
        return jsonify({"error": "An internal server error occurred"}), 500
    

@user_memory_bp.route("/add_memory", methods=["POST"])
def add_memory():
    try:
        user_id = session["user_id"]
        data = request.get_json()
        memory_id = str(uuid.uuid4())
        memory_value = data.get("memory_value")
        user_memory_utils.create_memory(user_id = user_id, memory_id = memory_id, memory_value = memory_value)
        return jsonify({"success": True})
    except Exception:
        logger.error("Error in edit_memory:")
        logger.error(traceback.format_exc())
        return jsonify({"error": "An internal server error occurred"}), 500
    
@user_memory_bp.route("/delete_memory", methods=["POST"])
def delete_memory():
    try:
        user_id = session["user_id"]
        data = request.get_json()
        memory_id = data.get("memory_id")

        user_memory_utils.delete_memory(user_id = user_id, memory_id = memory_id)
        return jsonify({"success": True})
    except Exception:
        logger.error("Error in delete_memory:")
        logger.error(traceback.format_exc())
        return jsonify({"error": "An internal server error occurred"}), 500
    
@user_memory_bp.route("/delete_all_memories", methods=["POST"])
def delete_all_memories():
    try:
        user_id = session["user_id"]

        user_memory_utils.delete_all_memories(user_id = user_id)
        return jsonify({"success": True})
    except Exception:
        logger.error("Error in delete_memory:")
        logger.error(traceback.format_exc())
        return jsonify({"error": "An internal server error occurred"}), 500

@user_memory_bp.route("/classify_message_for_user_memory", methods=["POST"])
def classify_message_for_user_memory():
    try:
        data = request.get_json()
        message = data.get("message")
        model_name = data.get("model_name")
        user_name = session["user"]
        user_id = session["user_id"]
        rows = user_memory_utils.get_all_memories(user_id)
        memories = "\n- ".join([row["memory_value"] for row in rows])
        
        prompt = f"""
Should the chatbot remember this user input? Reply with:

- "yes" and a one-sentence bullet point summary of what to remember, starting with "{user_name} ..."
- or "no" if it doesn't contain personal, project-related, or preference-specific information.

Examples:

Input: "I'm building a chatbot using LangChain and Pinecone."
Output: yes - {user_name} is building a chatbot using LangChain and Pinecone.

Input: "Can you help me deploy my Flask app to Heroku?"
Output: yes - {user_name} needs help deploying a Flask app to Heroku.

Input: "Remember that I prefer markdown tables in your replies."
Output: yes - {user_name} prefers replies formatted with markdown tables.

Input: "Tell me a joke."
Output: no

Input: "Compare BERT with GPT."
Output: no

These are the things that we already know about the user:
{memories}
If the input is already present in the above list, then return "no"

Use the following criteria to decide:

Reply **yes** if any of these are true:
- The user explicitly asks to remember something (e.g., "Remember this", "From now on...").
- The input reveals stable information about the user such as:
  * Name, role, title, team, company, or background.
  * Ongoing projects, responsibilities, or goals.
  * Tooling preferences, tech stacks, or workflows.
  * Desired tone, formatting, or interface style.
- The user is correcting or refining a previously stated preference or fact.
- The input implies persistence based on repetition or long-term relevance, even without an explicit request.

Reply **no** if any of these are true:
- The input is temporary, situational, or one-off (e.g., quick questions, file uploads).
- The input is hypothetical, vague, or exploratory (e.g., “What if I…”).
- It does not include identity, preference, or project context.
- The information is already known and unchanged.

Input: "{message}"
"""

        messages = [
            {"role": "user", "content": prompt}
        ]

        result = llm_utils.invoke_llm(messages, model_name)

        if result.startswith("yes"):
            summary = result.split("yes - ", 1)[1].strip() if " - " in result else ""
            return jsonify({"result": result, "is_worthy": True, "summary_text": summary})
        else:
            return jsonify({"result": result, "is_worthy": False, "summary_text": ""})
        
    except Exception:
        logger.error("Error in classify_message_for_user_memory:")
        logger.error(traceback.format_exc())
        return jsonify({"error": "An internal server error occurred"}), 500