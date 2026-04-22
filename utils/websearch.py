from agents import Agent, Runner, OpenAIChatCompletionsModel, set_tracing_disabled, function_tool, ItemHelpers
from agents.run_context import RunContextWrapper
from custom_agents.wrapper import (
    UserInfo
)
import json
import pandas as pd
from openai import OpenAI
from dotenv import load_dotenv
import os
import re
from typing import Any, List
load_dotenv()

client = OpenAI(api_key=os.getenv("OpenAIWebsearch"))

def extract_urls(obj: Any) -> List[str]:
    """Recursively traverse a structure to find all URLs."""
    urls = []

    # If it's a dict
    if isinstance(obj, dict):
        for v in obj.values():
            urls.extend(extract_urls(v))

    # If it's a list or tuple
    elif isinstance(obj, (list, tuple)):
        for item in obj:
            urls.extend(extract_urls(item))

    # If it's a string, look for URLs
    elif isinstance(obj, str):
        # Basic URL regex
        urls.extend(re.findall(r'https?://[^\s\]\)]+', obj))

    # For objects with __dict__ (like your custom ResponseOutputText etc.)
    elif hasattr(obj, '__dict__'):
        urls.extend(extract_urls(vars(obj)))

    return urls

@function_tool
def execute_web_search_query(
    wrapper: "RunContextWrapper[UserInfo]",  # context wrapper
    query: str,
    step_number: int = 1
) -> str:
    """
    Execute a web search query using GPT-4o with search preview and return
    a structured JSON response.
    """
    
    response = client.responses.create(
        model="o4-mini",
        tools=[
            {
                "type": "web_search",
                "filters": {
                    "allowed_domains": ["nbcnews.com"]
                },
                "search_context_size": "low",
            }
        ],
        reasoning={"effort": "low"},
        input=[
            {
                "role": "system",
                "content": (
                    "You are an AI assistant with web search capability. "
                    "Your job is to search the web based on the user's query "
                    "and provide the most accurate and up-to-date information. "
                    "Only search nbcnews.com"
                ),
            },
            {
                "role": "user",
                "content": query,
            },
        ],
        parallel_tool_calls=False,
    )

    result = response.output_text
    
    # Extract URLs from the response
    urls = extract_urls(response)
    
    # Remove duplicates and sort
    unique_urls = sorted(list(set(urls)))

    # You may have a formatting function for markdown, otherwise just return plain text

    return json.dumps({
        "tool_type": "execute_web_search_query",
        "agent_used": "Aladdin Agent",
        "step_number": step_number,
        "Question": query,
        "response": result,
        "urls": unique_urls,
        "success": True
    })




