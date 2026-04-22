
import os
from openai import AzureOpenAI
from agents import (
    Agent,
    HandoffInputData,
    ItemHelpers,
    OpenAIChatCompletionsModel,
    Runner,
    add_trace_processor,
    function_tool,
    handoff,
    set_default_openai_client,
    set_tracing_disabled,
    set_tracing_export_api_key,
    trace,
    RunContextWrapper
)
import json
from custom_logger import logger
import requests
import tempfile
import os
from werkzeug.datastructures import FileStorage
from utils.azure_utils import AzureBlobUtilities
import uuid
from custom_agents.wrapper import UserInfo




dalle_api_version = os.environ.get('AZURE_DALLE_API_VERSION')
dalle_endpoint = os.environ.get('AZURE_DALLE_ENDPOINT')
dalle_api_key = os.environ.get('AZURE_DALLE_API_KEY')
dalle_model = os.environ.get('DALLE_MODEL')




dalle_client = AzureOpenAI(
    api_version=dalle_api_version,
    azure_endpoint=dalle_endpoint,
    api_key=dalle_api_key
)
azure_blob_utils = AzureBlobUtilities()



@function_tool
def generate_image(wrapper: RunContextWrapper[UserInfo], prompt: str, style: str = "realistic", size: str = "1024x1024") -> str:
    """Generate an image using DALL·E, save to Azure Blob Storage, and return blob URL."""
    
    logger.info(f"Generating image with prompt: {prompt}, style: {style}, size: {size}")
    
    valid_sizes = ["1024x1024", "1792x1024", "1024x1792"]
    if size not in valid_sizes:
        raise ValueError(f"Size must be one of {valid_sizes}. Got: {size}")
    
    # Step 1: Generate image from OpenAI (DALL·E)
    response = dalle_client.images.generate(
        model=dalle_model,
        prompt=prompt,
        size=size,
        n=1,
        quality="hd"
    )
    openai_image_url = response.data[0].url
    logger.info(f"Image generated. OpenAI URL: {openai_image_url}")
    
    # Step 2: Download the image
    download_response = requests.get(openai_image_url)
    if download_response.status_code != 200:
        raise Exception(f"Failed to download image from OpenAI: {download_response.status_code}")
    
    # Step 3: Save to a temporary file with a UUID at the end
    unique_id = uuid.uuid4().hex
    chart_filename = f"generated_{wrapper.context.user_id}_{wrapper.context.session_id}_{unique_id}.png"
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_file:
        tmp_file.write(download_response.content)
        tmp_file_path = tmp_file.name
    
    # Step 4: Upload to blob
    try:
        with open(tmp_file_path, "rb") as f:
            file_obj = FileStorage(stream=f, filename=chart_filename, content_type="image/png")
            blob_url = azure_blob_utils.upload_file(
                file=file_obj,
                user_id=wrapper.context.user_id,
                session_id=wrapper.context.session_id,
                folder="relaychat"
            )
        logger.info(f"Image uploaded to blob: {blob_url}")
    finally:
        os.unlink(tmp_file_path)

    # Step 5: Return structured result with blob URL
    return json.dumps({
        "tool_type": "image_generator",
        "agent_used": "Relay Image Generator Agent",
        "tool_text": prompt,
        "image_url": blob_url,
        "size": size
    })