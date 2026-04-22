import base64
import datetime
import io
import os
import json
import re
import traceback
import uuid
from collections import defaultdict
from datetime import datetime
from functools import wraps
import asyncio
import random
import threading
from queue import Queue
from flask import Response
import traceback
import identity
import requests
import tiktoken
import time
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
from werkzeug.datastructures import FileStorage

from custom_logger import logger
from utils.account_sql_utils import AccountSQLUtilities
from utils.auth_utils import require_login
from utils.azure_ai_search_utils import azure_search
from utils.azure_utils import AzureBlobUtilities
from utils.chat_template_utilities import chat_template_utils
from utils.file_utils import fileUtilities
from utils.helper_utils import get_greeting_message, get_model_details
from utils.llm_utils import LLMUtilities
from utils.session_group_sql_utils import session_group_sql_utils
from utils.session_items_utils import session_items_utils
from utils.sharepoint_utilities import sharepointUtilities
from utils.sharepoint.appication_permission_sharepoint_utilities import applicationPermissionSharepointUtilities

from flask import Flask, request, jsonify, send_file, Response
import azure.cognitiveservices.speech as speechsdk
import io
from . import chat_bp
from custom_agents.wrapper import UserInfo
# from utils.microsoft_search_utilities import MicrosftSearchTools

llm_utils = LLMUtilities()
file_utils = fileUtilities()
azure_utils = AzureBlobUtilities()
account_utils = AccountSQLUtilities()
# microsoft_utils = MicrosftSearchTools()
sharepoint_utils = sharepointUtilities()
app_perm_shp_utils = applicationPermissionSharepointUtilities()



@chat_bp.route("/", defaults={"session_id": None})
@chat_bp.route("/<session_id>")
@require_login
def chat_home(session_id):
    """Chat home page with optional session loading."""
    try:
        user_data = {
            "name": session.get("user"),
            "email": session.get("email"),
            "is_admin": account_utils.is_admin_user(session.get("email")),
            "profile_picture_path": session.get("profile_picture_path"),
        }
        greeting_message = get_greeting_message(session["user"])
        model_details = get_model_details()

        user_preferences = account_utils.get_user_by_user_id(session.get("user_id"))
        if user_preferences and user_preferences.get('is_dark_mode_enabled') == 1:
            theme = "dark"
        elif user_preferences and user_preferences.get('is_dark_mode_enabled') == 0:
            theme = "light"
        else:
            theme = "dark"
    

        return render_template(
            "chat_home.html",
            session_id=session_id,
            user=user_data,
            theme=theme,
            greeting_message=greeting_message,
            model_details=model_details,
            version=identity.__version__,
        )
    except Exception as e:
        logger.info(f"Error in chat_home: {str(e)}")
        return jsonify({"error": "An internal server error occurred"}), 500

@chat_bp.route("/update_session", methods=["POST"])
def update_session():
    """Updates session with new data."""
    try:
        data = request.get_json()
        session_id = data.get("session_id")
        prompt = data.get("prompt")
        images = data.get("images")
        files_json = data.get("files_json")
        session_name = data.get("session_name")
        new_messages_trace = data.get("new_messages_trace")
        logger.info(f"session_name {session_name}")
        chatbot_response = data.get("chatbot_response")
        session_item_message_id = data.get("session_item_message_id")
        session_item_id = data.get("session_item_id")
        agent_name = data.get("agent_name")
        audio_url = data.get("audio_url")

        user_content = [{"type": "input_text", "text": prompt}]

        if images:
            for image_url in images:
                user_content.append(
                    {"type": "input_image", "image_url": image_url}
                )


        user_content_str = json.dumps(user_content, ensure_ascii=False)

        user_id = session["user_id"]
        app_name = "relaychat"
        if chatbot_response != "":
            session_items_utils.insert_message(
                session_id=session_id,
                prompt=user_content_str,
                chatbot_response=chatbot_response,
                user_id=user_id,
                app_name=app_name,
                session_name=session_name,
                session_item_details={
                    "session_item_message_id": session_item_message_id,
                    "images": images,
                    "files_json": files_json,
                    "new_messages_trace": new_messages_trace,
                    "agent_name": agent_name,
                    "audio_url": audio_url
                },
                session_item_id = session_item_id
            )

        return jsonify({"success": True})
    except Exception:
        logger.info("Error in update_session function:")
        logger.info(traceback.format_exc())
        return jsonify({"error": "An internal server error occurred"}), 500


@chat_bp.route("/upload_img_to_blob", methods=["POST"])
def upload_img_to_blob():
    try:
        # Check if image is in the request
        if "image" not in request.files:
            return jsonify({"error": "No image found in request"}), 400

        image_file = request.files["image"]

        # Generate a unique filename with timestamp
        file_extension = (
            image_file.filename.split(".")[-1] if "." in image_file.filename else "png"
        )
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        unique_filename = (
            f"pasted_image_{timestamp}_{uuid.uuid4().hex[:8]}.{file_extension}"
        )

        # Create a new FileStorage with the modified filename
        file_content = image_file.read()
        image_file = FileStorage(
            stream=io.BytesIO(file_content),
            filename=unique_filename,
            content_type=image_file.content_type,
        )

        # Get user and session info (you might get these from the session or request)
        user_id = request.cookies.get("user_id") or "anonymous"
        session_id = request.form.get("session_id") or str(uuid.uuid4())

        # Upload to Azure Blob Storage
        blob_url = azure_utils.upload_file(
            file=image_file,
            user_id=user_id,
            session_id=session_id,
            folder="pasted_images",  # Folder for pasted images
        )

        if not blob_url:
            return jsonify({"error": "Failed to upload image to blob storage"}), 500

        # Return the blob URL to the client
        return jsonify(
            {
                "status": "success",
                "blob_url": blob_url,
            }
        )

    except Exception as e:
        import traceback

        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@chat_bp.route("/invoke_agent", methods=["POST"])
@require_login
def invoke_agent():
    """
    Invokes the chatbot agent to process user input and generate responses.
    
    Includes token validation with tiktoken to prevent overflow beyond 70K tokens.
    """
    try:
        # Extract data from request and session
        user_id     = session.get("user_id")
        user_name   = session.get("user")

        data = request.get_json()
        user_input              = data.get("user_input")
        session_id              = data.get("session_id")
        model_name              = data.get("model_name")
        images                  = data.get("images", [])
        files_json              = data.get("files_json")
        session_attached_files  = data.get("session_attached_files")
        current_active_tool     = data.get("current_active_tool")
        auth_access_token       = data.get("auth_access_token")

        # Get system message and conversation history
        from apps.chat.src.prompt_templates import get_messages
        default_messages = get_messages()
        previous_messages = session_items_utils.get_previous_messages(session_id, "relaychat")

        # Prepare messages for LLM
        messages = default_messages + previous_messages
        if session_attached_files:
            for key, value in session_attached_files.items():
                file_details = value['file_details_string']
                user_input += f"\n\n Attachments:\n\n- file_id:{key}\n\nfile_details:\n{file_details}\n\n---\n\n"

        msg = {"role": "user", "content": [{"type": "input_text", "text": user_input}]}
        if images:
            for image_url in images:
                msg["content"].append({"type": "input_image", "image_url": image_url})

        # Append new message
        messages.append(msg)

        # Token validation with tiktoken
        if is_too_lengthy(messages):
            return jsonify({"error": "[FAILED] Too lengthy"}), 400

        # User info and final processing for streaming response
        user_info = UserInfo(
            email=session.get("user_id"),
            auth_access_token=auth_access_token,
            user_id=user_id,
            session_id=session_id,
            entra_id_user_id= session['entra_id_user_id'],
            databricks_host=os.getenv("DATABRICKS_HOST"),
            databricks_token=os.getenv("DATABRICKS_TOKEN"),
            databricks_previous_question = None,
            databricks_previous_response = None
        )

        return Response(
            _stream_llm_response(messages, model_name, current_active_tool, user_info), 
            content_type="text/event-stream"
        )
        
    except Exception:
        logger.info("Error in invoke_agent function:")
        logger.info(traceback.format_exc())
        return jsonify({"error": "An internal server error occurred"}), 500

def is_too_lengthy(messages):
    """
    Utility to calculate token count using tiktoken and validate within limits.
    """
    # Initialize tiktoken encoder for the model
    tokenizer = tiktoken.get_encoding("cl100k_base")  # Adjust encoding for your model
    all_text = ""

    # Concatenate all message contents
    for msg in messages:
        if 'content' in msg.keys():
            content = msg.get("content", "")
            if isinstance(content, list):  # Handle structured content
                for part in content:
                    all_text += part.get("text", "")
            else:
                all_text += str(content)

    # Token count
    token_count = len(tokenizer.encode(all_text))
    logger.info(f"Total token count: {token_count}")
    return token_count > 70000


def _stream_llm_response(messages, model_name, current_active_tool, user_info):
    """
    Bridge function to handle async streaming in a synchronous Flask context.
    Uses a queue-based approach to stream data from async function.
    
    If any error occurs during streaming, the function raises the error and logs the traceback.
    It does not yield error messages to the client — it crashes cleanly for Flask to catch and handle.
    """
    from queue import Queue
    import threading
    import asyncio
    import traceback

    response_queue = Queue()
    exception_container = [None]

    def run_async_stream():
        """Run the async streaming function in a separate thread."""
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

            async def stream_data():
                try:
                    async for chunk in llm_utils.invoke_llm_stream(messages, model_name, current_active_tool, user_info):
                        response_queue.put(('data', chunk))
                except Exception as e:
                    exception_container[0] = e
                    response_queue.put(('error', None))
                finally:
                    response_queue.put(('done', None))

            loop.run_until_complete(stream_data())

        except Exception as e:
            exception_container[0] = e
            response_queue.put(('error', None))
        finally:
            response_queue.put(('done', None))

    thread = threading.Thread(target=run_async_stream)
    thread.daemon = True
    thread.start()

    # Yield data or raise error immediately
    while True:
        try:
            event_type, data = response_queue.get(timeout=300)

            if event_type == 'data':
                yield data
            elif event_type == 'error':
                if exception_container[0]:
                    logger.info("Exception during streaming:")
                    logger.info(traceback.format_exc())
                    raise exception_container[0]
            elif event_type == 'done':
                break

        except Exception as e:
            logger.info("Unexpected error in streaming loop:")
            logger.info(traceback.format_exc())
            time.sleep(0.25)
            yield "[FAILED]"
            raise  # Let Flask catch and respond with 500






@chat_bp.route("/invoke_audio", methods=["POST"])
def invoke_audio():
    try:
        import requests
        import tempfile
        from apps.chat.src.prompt_templates import get_voice_messages
        default_messages = get_voice_messages()

        data = request.get_json()

        user_input = data.get("user_input", "")
        session_id = data.get("session_id")
        model_name = data.get("model_name")

        previous_messages = session_items_utils.get_previous_audio_messages(session_id)
        messages = default_messages + previous_messages

        msg = {"role": "user", "content": user_input}
        text = llm_utils.invoke_llm(messages=messages + [msg], model_name=model_name)

        # Azure OpenAI TTS
        AZURE_OPENAI_TTS_API_KEY = os.getenv("AZURE_OPENAI_TTS_API_KEY")
        AZURE_OPENAI_TTS_ENDPOINT = os.getenv("AZURE_OPENAI_TTS_ENDPOINT")
        AZURE_OPENAI_TTS_DEPLOYMENT_ID = os.getenv("AZURE_OPENAI_TTS_DEPLOYMENT_ID")
        AZURE_OPENAI_TTS_API_VERSION = os.getenv("AZURE_OPENAI_TTS_API_VERSION")
        AZURE_OPENAI_TTS_VOICE = os.getenv("AZURE_OPENAI_TTS_VOICE")

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {AZURE_OPENAI_TTS_API_KEY}"
        }
        payload = {
            "model": AZURE_OPENAI_TTS_DEPLOYMENT_ID,
            "input": text,
            "voice": AZURE_OPENAI_TTS_VOICE
        }


        # Start total timing
        start_total = time.time()

        # Step 1: Generate TTS
        start_tts = time.time()
        tts_url = f"{AZURE_OPENAI_TTS_ENDPOINT}/openai/deployments/{AZURE_OPENAI_TTS_DEPLOYMENT_ID}/audio/speech?api-version={AZURE_OPENAI_TTS_API_VERSION}"
        response = requests.post(tts_url, headers=headers, json=payload)
        end_tts = time.time()

        if response.status_code != 200:
            return jsonify({'error': 'TTS generation failed', 'details': response.text}), 500

        # Step 2: Save audio to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp_audio:
            tmp_audio.write(response.content)
            tmp_audio_path = tmp_audio.name

        # Step 3: Upload to Blob
        start_upload = time.time()
        audio_url = azure_utils.upload_audio_to_blob(tmp_audio_path)
        end_upload = time.time()

        os.remove(tmp_audio_path)  # Clean up local temp file

        # Final total time
        end_total = time.time()

        # Return results + timing info
        logger.info(f"tts_generation_sec: {str(round(end_tts - start_tts, 3))}")
        logger.info(f"upload_to_blob_sec: {str(round(end_upload - start_upload, 3))}")
        logger.info(f"total_elapsed_sec: {str(round(end_total - start_total, 3))}")
        return jsonify({
            "audio_url": audio_url,
            "spoken_text": text,
            "timing": {
                "tts_generation_sec": round(end_tts - start_tts, 3),
                "upload_to_blob_sec": round(end_upload - start_upload, 3),
                "total_elapsed_sec": round(end_total - start_total, 3)
            }
        })

    except Exception:
        logger.info("Error in invoke_audio_url:")
        logger.info(traceback.format_exc())
        return jsonify({"error": "Internal server error"}), 500


@chat_bp.route("/generate_audio_from_text", methods=["POST"])
def generate_audio_from_text():
    try:
        import requests
        import tempfile
        data = request.get_json()

        text = data.get("content", "")
        session_item_id = data.get("session_item_id")
        logger.info(f"session_item_id: {session_item_id}")
        logger.info(f"text: {text}")

        text = re.sub(r'[^\w\s.,!?;:\'-]', '', text)

        # Azure OpenAI TTS
        AZURE_OPENAI_TTS_API_KEY = os.getenv("AZURE_OPENAI_TTS_API_KEY")
        AZURE_OPENAI_TTS_ENDPOINT = os.getenv("AZURE_OPENAI_TTS_ENDPOINT")
        AZURE_OPENAI_TTS_DEPLOYMENT_ID = os.getenv("AZURE_OPENAI_TTS_DEPLOYMENT_ID")
        AZURE_OPENAI_TTS_API_VERSION = os.getenv("AZURE_OPENAI_TTS_API_VERSION")
        AZURE_OPENAI_TTS_VOICE = os.getenv("AZURE_OPENAI_TTS_VOICE")

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {AZURE_OPENAI_TTS_API_KEY}"
        }
        payload = {
            "model": AZURE_OPENAI_TTS_DEPLOYMENT_ID,
            "input": text,
            "voice": AZURE_OPENAI_TTS_VOICE
        }

        tts_url = f"{AZURE_OPENAI_TTS_ENDPOINT}/openai/deployments/{AZURE_OPENAI_TTS_DEPLOYMENT_ID}/audio/speech?api-version={AZURE_OPENAI_TTS_API_VERSION}"
        response = requests.post(tts_url, headers=headers, json=payload)

        if response.status_code != 200:
            return jsonify({'error': 'TTS generation failed', 'details': response.text}), 500

        # Save the audio to a temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp_audio:
            tmp_audio.write(response.content)
            tmp_audio_path = tmp_audio.name

        audio_url = azure_utils.upload_audio_to_blob(tmp_audio_path)

        os.remove(tmp_audio_path)  # Clean up local temp file
        logger.info("adding audio url to sesison")
        session_items_utils.update_audio_url_for_session_item(session_item_id, audio_url)
        logger.info("added audio url to sesison")

        return jsonify({
            "audio_url": audio_url,
            "spoken_text": text
        })

    except Exception:
        logger.info("Error in invoke_audio_url:")
        logger.info(traceback.format_exc())
        return jsonify({"error": "Internal server error"}), 500

@chat_bp.route("/update_feedback", methods=["POST"])
def update_feedback():
    """Retrieves session data."""
    try:
        data = request.get_json()
        session_id = data.get("session_id")
        feedback = data.get("feedback")
        session_item_id = data.get("session_item_id")

        user_id = session["user_id"]

        session_items_utils.update_session_item_feedback(user_id, session_id, feedback, session_item_id)
        return jsonify({"success": True})
    except Exception:
        logger.info("Error in update_feedback function:")
        logger.info(traceback.format_exc())
        return jsonify({"error": "An internal server error occurred"}), 500

@chat_bp.route("/send_email", methods=["POST"])
def send_email():
    """Sends an email using Microsoft Graph API."""
    logger.info("Received POST request at /send_email endpoint.")
    
    try:
        data = request.get_json()
        logger.info(f"Request JSON payload: {data}")

        toList = data.get("toList")
        ccList = data.get("ccList")
        subject = data.get("subject")
        body_html = data.get("body_html")
        body_html = body_html.replace('\n', '<br>')
        access_token = data.get("access_token")

        logger.info(f"Extracted fields - toList: {toList}, ccList: {ccList}, subject: {subject}")
        logger.info(f"Body: {body_html}")
        
        user_id = session.get("user_id")
        logger.info(f"Retrieved sender user_id from session: {user_id}")

        logger.info("Calling microsoft_utils.send_email()...")
        microsoft_utils.send_email(subject, body_html, toList, ccList, user_id, access_token)
        logger.info("Email sent successfully via Microsoft Graph API.")

        return jsonify({"success": True})
    
    except Exception as e:
        logger.error("Error occurred in /send_email endpoint:")
        logger.error(str(e))
        logger.error(traceback.format_exc())
        return jsonify({"error": "An internal server error occurred"}), 500

        
@chat_bp.route("/get_session_data", methods=["POST"])
def get_session_data():
    """Retrieves session data."""
    try:
        data = request.get_json()
        session_id = data.get("sessionId")

        session_data = session_items_utils.get_session_data(session_id, "relaychat")
        return jsonify(session_data)
    except Exception:
        logger.info("Error in get_session_data function:")
        logger.info(traceback.format_exc())
        return jsonify({"error": "An internal server error occurred"}), 500
 

@chat_bp.route("/upload_file_to_azure_ai_search", methods=["POST"])
def upload_file_to_azure_ai_search():
    session_id = request.form.get("session_id")
    file_id = request.form.get("file_id")
    user_id = session.get("user_id")

    logger.info(f"Received upload request | user_id={user_id}, session_id={session_id}, file_id={file_id}")

    if not user_id or not session_id or not file_id:
        logger.info("Missing required fields (user_id, session_id, model_name, or file_id)")
        return jsonify({"message": "Missing required fields", "upload_status": "failed"}), 400

    if 'file' not in request.files:
        logger.info("No file found in request")
        return jsonify({"message": "No file found", "upload_status": "failed"}), 400

    file = request.files['file']

    if file.filename == '':
        logger.info("No selected file")
        return jsonify({"message": "No selected file", "upload_status": "failed"}), 400

    try:
        upload_status, file_details_string = azure_search.insert_document(
            user_id=user_id,
            session_id=session_id,
            filename=file.filename,
            file_stream=file,
            file_id=file_id,
        )
        logger.info(f"File upload status: {upload_status} | file_id={file_id}, filename={file.filename}")

        return jsonify({
            "file_id": file_id,
            "upload_status": upload_status,
            "file_details_string": file_details_string,
            "message": f"File {file.filename} upload status: {upload_status}."
        }), 200

    except ValueError as e:
        logger.info(f"ValueError during file upload: {str(e)}")
        return jsonify({
            "file_id": file_id,
            "upload_status": "failed",
            "error": str(e),
            "message": f"Failed to upload {file.filename} due to value error."
        }), 400

    except Exception as e:
        logger.exception(f"Upload failed for file: {file.filename} with file_id: {file_id}")
        return jsonify({
            "file_id": file_id,
            "upload_status": "failed",
            "error": str(e),
            "message": f"Failed to upload {file.filename}."
        }), 500

@chat_bp.route("/upload_cloud_files_to_azure_ai_search", methods=["POST"])
def upload_cloud_files_to_azure_ai_search():
    session_id = request.form.get("session_id")
    file_id = request.form.get("file_id")
    filename = request.form.get("filename")
    user_id = session.get("user_id")
    graph_download_url = session.get("graph_download_url")

    logger.info(f"Received upload request | user_id={user_id}, session_id={session_id}, file_id={file_id}")
    logger.info(f"Received upload request | graph_download_url={graph_download_url}")

    if str(graph_download_url) == "None":
        site_id = request.form.get("site_id")
        drive_id = request.form.get("drive_id")
        item_id = request.form.get("item_id")
        graph_download_url = app_perm_shp_utils.get_graph_download_url(site_id, drive_id, item_id)
        
    file_binary = app_perm_shp_utils.download_shared_file_as_binary(graph_download_url)

    try:
        upload_status, file_details_string = azure_search.insert_document(
            user_id=user_id,
            session_id=session_id,
            filename=filename,
            file_stream=file_binary,
            file_id=file_id,
        )
        logger.info(f"File upload status: {upload_status} | file_id={file_id}, filename={filename}")

        return jsonify({
            "file_id": file_id,
            "upload_status": upload_status,
            "file_details_string": file_details_string,
            "message": f"File {filename} upload status: {upload_status}."
        }), 200

    except ValueError as e:
        logger.info(f"ValueError during file upload: {str(e)}")
        return jsonify({
            "file_id": file_id,
            "upload_status": "failed",
            "error": str(e),
            "message": f"Failed to upload {filename} due to value error."
        }), 400

    except Exception as e:
        logger.exception(f"Upload failed for file: {filename} with file_id: {file_id}")
        return jsonify({
            "file_id": file_id,
            "upload_status": "failed",
            "error": str(e),
            "message": f"Failed to upload {filename}."
        }), 500

@chat_bp.route("/delete_uploaded_file_from_azure_ai_search/<file_id>", methods=["DELETE"])
def delete_uploaded_file_from_azure_ai_search(file_id):
    """
    Delete an uploaded file from Azure AI Search by file_id.
    Assumes file_id is unique enough to identify the file for the current user/session.
    """
    try:
        user_id = session.get("user_id")
        session_id = request.args.get("session_id")  # Optional, if needed for deletion
        logger.info(f"Delete request for file_id={file_id}, user_id={user_id}, session_id={session_id}")

        if not user_id or not file_id:
            return jsonify({"success": False, "message": "Missing user_id or file_id"}), 400

        # If session_id is required for deletion, pass it; otherwise, just use user_id and file_id
        deleted_count = azure_search.delete_documents(user_id, session_id, file_id)
        logger.info(f"Deleted {deleted_count} chunks for file_id={file_id}")

        return jsonify({
            "success": True,
            "deleted_chunks": deleted_count,
            "file_id": file_id,
            "message": f"Deleted file {file_id} from Azure AI Search"
        }), 200

    except Exception as e:
        logger.info(f"Error deleting uploaded file from Azure AI Search: {e}")
        logger.info(traceback.format_exc())
        return jsonify({
            "success": False,
            "file_id": file_id,
            "message": f"Error deleting file: {str(e)}"
        }), 500

@chat_bp.route("/delete_file_from_session", methods=["POST"])
def delete_file_from_session():
    """Delete a file from blob storage and Azure AI Search for a given session."""
    try:
        logger.info("Received request to delete file from session.")

        user_id = session.get("user_id")
        data = request.get_json()
        session_id = data.get("session_id")
        filename = data.get("filename")

        if not session_id or not filename:
            logger.warning("Missing session_id or filename in request.")
            return jsonify({"message": "Missing session_id or filename"}), 400

        logger.info(f"Deleting file: {filename} from session: {session_id}")

        deleted_count = azure_search.delete_documents(user_id, session_id, filename)
        logger.info(f"Deleted {deleted_count} chunks from Azure AI Search.")

        return jsonify(
            {"message": f"Successfully deleted file: {filename}", "deleted_chunks": 2}
        ), 200

    except Exception as e:
        logger.info(f"Error deleting file from session: {e}")
        logger.info(traceback.format_exc())
        return jsonify({"message": "Error deleting file from session"}), 500


@chat_bp.route("/get_my_one_drive_files", methods=["POST"])
def get_my_one_drive_files():
    """Delete a file from blob storage and Azure AI Search for a given session."""
    try:
        logger.info("Received request to delete file from session.")

        data = request.get_json()
        access_token = data.get("access_token")

        my_one_drive_files = app_perm_shp_utils.get_my_one_drive_files(access_token)
        return jsonify(
            {
                "success": "true",
                "my_one_drive_files": my_one_drive_files,
            }
        ), 200
    except Exception as e:
        logger.info(f"Error accessing onedrive files: {e}")
        logger.info(traceback.format_exc())
        return jsonify({"success": "false"}), 500


@chat_bp.route("/get_my_shared_files", methods=["POST"])
def get_my_shared_files():
    """Delete a file from blob storage and Azure AI Search for a given session."""
    try:
        logger.info("Received request to delete file from session.")

        data = request.get_json()
        access_token = data.get("access_token")

        my_shared_files = app_perm_shp_utils.get_my_shared_files(access_token)
        return jsonify(
            {
                "success": "true",
                "my_shared_files": my_shared_files,
            }
        ), 200
    except Exception as e:
        logger.info(f"Error accessing onedrive files: {e}")
        logger.info(traceback.format_exc())
        return jsonify({"success": "false"}), 500


@chat_bp.route("/get_sharepoint_site_root_children", methods=["POST"])
def get_sharepoint_site_root_children():
    try:
        logger.info("Received request to get SharePoint files.")

        data = request.get_json()
        site_id = data.get("id")
        site_name = data.get("name")
        site_url = data.get("webUrl")

        logger.info(f"site id: {site_id}")
        logger.info(f"site id: {site_name}")
        logger.info(f"site id: {site_url}")

        contents = app_perm_shp_utils.list_root_children(site_id)

        return jsonify({"success": True, "contents": contents}), 200
    except Exception as e:
        logger.info(f"Error accessing sharepoint files: {e}")
        logger.info(traceback.format_exc())
        return jsonify({"success": False, "message": f"Error: {str(e)}"}), 500
    
@chat_bp.route("/get_sharepoint_folder_children", methods=["POST"])
def get_sharepoint_folder_children():
    try:
        logger.info("Received request to get SharePoint files.")

        data = request.get_json()
        drive_id = data.get("drive_id")
        item_id = data.get("item_id")
        site_id = data.get("site_id")

        logger.info(f"drive_id: {drive_id}")
        logger.info(f"item_id: {item_id}")
        logger.info(f"site_id: {site_id}")

        contents = app_perm_shp_utils.list_folder_children(drive_id, item_id, site_id)

        return jsonify({"success": True, "contents": contents}), 200
    except Exception as e:
        logger.info(f"Error accessing sharepoint files: {e}")
        logger.info(traceback.format_exc())
        return jsonify({"success": False, "message": f"Error: {str(e)}"}), 500


@chat_bp.route("/get_sharepoint_sites", methods=["POST"])
def get_sharepoint_sites():
    """Get all SharePoint sites the user has access to."""
    try:
        logger.info("Received request to get SharePoint sites.")

        sites = app_perm_shp_utils.list_all_sites()
        return jsonify({"success": True, "sites": sites}), 200
    except Exception as e:
        logger.info(f"Error accessing SharePoint sites: {e}")
        logger.info(traceback.format_exc())
        return jsonify({"success": False, "message": f"Error: {str(e)}"}), 500