from __future__ import annotations

import os
import json
import re
import random
import time
from openai import OpenAI
from openai import AzureOpenAI
from dotenv import load_dotenv
from custom_logger import logger
from config import get_config
from utils.session_items_utils import session_items_utils
import traceback
import os
from agents import (
    ItemHelpers,
    Runner,
)
from dotenv import load_dotenv

from openai.types.responses import ResponseTextDeltaEvent
from custom_agents.wrapper import UserInfo

from custom_agents.all_agents import (
    get_aladdin_agent
)
load_dotenv()


def get_azure_open_ai_client_for_non_streaming_output(model_name):
    if model_name == "gpt-4o":
        azure_openai_client = AzureOpenAI(
            api_key=os.environ.get("GPT_4_O_AZURE_OPENAI_API_KEY"),
            api_version=os.environ.get("GPT_4_O_AZURE_OPENAI_API_VERSION"),
            azure_endpoint=os.environ.get("GPT_4_O_AZURE_OPENAI_API_ENDPOINT"),
        )
        return azure_openai_client
    elif model_name == "o3-mini":
        azure_openai_client = AzureOpenAI(
            api_key=os.environ.get("GPT_O_3_MINI_AZURE_OPENAI_API_KEY"),
            api_version=os.environ.get("GPT_O_3_MINI_AZURE_OPENAI_API_VERSION"),
            azure_endpoint=os.environ.get("GPT_O_3_MINI_AZURE_OPENAI_API_ENDPOINT"),
        )
        return azure_openai_client
    elif model_name == "gpt-4.1":
        azure_openai_client = AzureOpenAI(
            api_key=os.environ.get("GPT_4_1_AZURE_OPENAI_API_KEY"),
            api_version=os.environ.get("GPT_4_1_AZURE_OPENAI_API_VERSION"),
            azure_endpoint=os.environ.get("GPT_4_1_AZURE_OPENAI_API_ENDPOINT"),
        )
        return azure_openai_client
    elif model_name == "o1":
        azure_openai_client = AzureOpenAI(
            api_key=os.environ.get("GPT_O_1_AZURE_OPENAI_API_KEY"),
            api_version=os.environ.get("GPT_O_1_AZURE_OPENAI_API_VERSION"),
            azure_endpoint=os.environ.get("GPT_O_1_AZURE_OPENAI_API_ENDPOINT"),
        )
        return azure_openai_client


class LLMUtilities:
    def __init__(self):
        logger.debug("initializing utilities")
        self.config = get_config()
        self.session_items_utils = session_items_utils

    def invoke_llm(self, messages, model_name: str):

        # Extract system message if present
        sys_msg = messages[0] if messages[0]["role"] == "system" else None
        usr_input = messages[-1]
        conversations = messages[1:-1] if sys_msg else messages[:-1]

        # Keep only the last 5 conversation messages
        conversations = conversations[-5:]

        # Construct final messages list
        final_messages = [sys_msg] if sys_msg else []
        final_messages.extend(conversations)
        final_messages.append(usr_input)

        llm_params = {}
        llm_params["messages"] = final_messages
        llm_params["stream"] = False
        llm_params["model"] = model_name

        try:
            azure_openai_client = get_azure_open_ai_client_for_non_streaming_output(model_name)
            chat_completion = azure_openai_client.chat.completions.create(**llm_params)

            return chat_completion.choices[0].message.content

        except Exception as e:
            logger.error(e)
            raise ValueError(str(e))


    async def invoke_llm_stream(self, messages, model_name: str, user_selected_agent:str, user_info):
        """
        Async streaming method for LLM invocation.
        Yields chunks of response data as they arrive and collects new structured messages.
        """
        try:
            # main_agent = get_main_agent(model_name)
            aladdin_agent = get_aladdin_agent(model_name="gpt-4o-mini")
            result = Runner.run_streamed(aladdin_agent, input=messages, context=user_info)
                    
            current_agent_name = result.current_agent.name
            logger.info(f"[INITIAL AGENT] {current_agent_name}", extra={'custom_dimensions': {'user_email': user_info.email}})
            yield "[AGENT UPDATES]" + current_agent_name
            time.sleep(0.25)

            partial_message = ""

            async for event in result.stream_events():
                if event.type == "raw_response_event" and isinstance(event.data, ResponseTextDeltaEvent):
                    yield event.data.delta
                    partial_message += event.data.delta

                elif event.type == "agent_updated_stream_event":
                    logger.info(f"[AGENT UPDATES] {event.new_agent.name}", extra={'custom_dimensions': {'user_email': user_info.email}})
                    yield "[AGENT UPDATES]" + event.new_agent.name
                    time.sleep(0.25)

                elif event.type == "run_item_stream_event":
                    item = event.item
                    logger.info(item, extra={'custom_dimensions': {'user_email': user_info.email}})

                    if item.type == "tool_call_output_item":
                        yield "[TOOL OUTPUT]" + json.dumps(str(item.output))
                        time.sleep(0.25)

                    elif item.type == "message_output_delta_item":
                        delta = item.delta
                        if delta and delta.content:
                            yield delta.content
                            partial_message += delta.content

            trace = result.to_input_list()
            new_trace = []
            for item in trace[::-1]:
                if 'role' in item:
                    if item['role'] == "user":
                        break
                new_trace.append(item)
            new_message_trace = new_trace[::-1]

            final_output = partial_message
            for i in new_message_trace[::-1]:
                if i['role'] == "assistant":
                    final_output = i['content'][0]['text']
                    break


            # Send message trace first so the FINAL MESSAGE is guaranteed to be the last chunk
            yield "[NEW MESSAGES TRACE]" + json.dumps(new_message_trace)
            logger.info("==== NEW MESSAGE TRACE (Only new messages) ====", extra={'custom_dimensions': {'user_email': user_info.email}})
            logger.info(json.dumps(new_message_trace, indent=2), extra={'custom_dimensions': {'user_email': user_info.email}})

            time.sleep(0.2)
            yield "[FINAL MESSAGE]" + final_output
            logger.info("==== FINAL MESSAGE ====", extra={'custom_dimensions': {'user_email': user_info.email}})
            logger.info(json.dumps(final_output), extra={'custom_dimensions': {'user_email': user_info.email}})

        except Exception as e:
            logger.error(f"Error in invoke_llm_stream: {e}", extra={'custom_dimensions': {'user_email': user_info.email}})
            logger.error(traceback.format_exc(), extra={'custom_dimensions': {'user_email': user_info.email}})
            raise