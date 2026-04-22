from flask import session
from utils.user_memory_utils import UserMemoryUtilities
from utils.account_sql_utils import AccountSQLUtilities
from custom_logger import logger
from datetime import datetime

user_memory_utils = UserMemoryUtilities()
account_utils = AccountSQLUtilities()

def get_system_instructions():
    with open("prompts/system_instructions/base.md", "r", encoding="utf-8") as file:
        base_md = file.read()
        return base_md

def get_acknowledgment_instructions():
    user_id = session.get("user_id")
    user_data = account_utils.get_user_by_user_id(user_id=user_id)
    is_acknowledgement_enabled = bool(user_data.get("is_acknowledgement_enabled", 1)) if user_data else True
    logger.info(f"is_acknowledgement_enabled: {is_acknowledgement_enabled}")
    logger.info(f"user_data: {user_data}")
    if is_acknowledgement_enabled:
        with open("prompts/system_instructions/acknowledgement.md", "r", encoding="utf-8") as file:
            acknowledgement_md = file.read()
            return f"\n\n---\n\n{acknowledgement_md}"
    else:    
        with open("prompts/system_instructions/no_acknowledgement.md", "r", encoding="utf-8") as file:
            no_acknowledgement_md = file.read()
            return f"\n\n---\n\n{no_acknowledgement_md}"

def get_emoji_instructions():
    user_id = session.get("user_id")
    user_data = account_utils.get_user_by_user_id(user_id=user_id)
    is_emojis_enabled = bool(user_data.get("is_emojis_enabled", 1)) if user_data else True
    logger.info(f"is_emojis_enabled: {is_emojis_enabled}")
    logger.info(f"user_data: {user_data}")
    if is_emojis_enabled:
        with open("prompts/system_instructions/emoji.md", "r", encoding="utf-8") as file:
            emoji_md = file.read()
            return f"\n\n---\n\n{emoji_md}"
    else:    
        with open("prompts/system_instructions/no_emoji.md", "r", encoding="utf-8") as file:
            no_emoji_md = file.read()
            return f"\n\n---\n\n{no_emoji_md}"

def get_memory_instructions():
    user_id = session.get("user_id")
    rows = user_memory_utils.get_all_memories(user_id)
    if rows:
        memories = "\n\t-".join([row["memory_value"] for row in rows])
        return f"""\n\n---\n\n## Here are a few things about the user that you already know about\n\n{memories}"""
    else:
        return ""
    
def get_voice_agent_instructions():
    with open("prompts/voice_agent_instructions.md", "r", encoding="utf-8") as file:
        voice_mode_instructions_md = file.read()
        return voice_mode_instructions_md


def get_messages():
    basic_prompt = f"""
    - User email ID: {session.get("user_id")}
    - Today's date: {datetime.now().strftime("%Y-%m-%d")}
    """

    basic_prompt += get_system_instructions()
    basic_prompt += get_memory_instructions()
    basic_prompt += get_acknowledgment_instructions()
    basic_prompt += get_emoji_instructions()

    logger.info(basic_prompt)

    messages = [{
        "role": "system",
        "content": basic_prompt,
    }]
    return messages
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
#----------------------------#
#     Voice mode prompt     #
#--------------------------#
def get_voice_messages():
    basic_prompt = ""

    basic_prompt += get_voice_agent_instructions()
    basic_prompt += get_memory_instructions()

    voice_messages = [{
        "role": "system",
        "content": basic_prompt,
    }]
    return voice_messages