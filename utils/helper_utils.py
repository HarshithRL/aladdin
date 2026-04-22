import random
import time
import datetime
import datetime
import random


def generate_uuid():
    random_bits = random.getrandbits(128)  # Generate 128 random bits
    timestamp = int(time.time() * 1e6)  # Get a timestamp to add uniqueness

    # Format as a UUID (8-4-4-4-12)
    hex_str = f'{random_bits:032x}'
    uuid_str = f'{hex_str[:8]}-{hex_str[8:12]}-4{hex_str[13:16]}-{random.choice("89ab")}{hex_str[17:20]}-{hex_str[20:]}'
    
    return uuid_str

def get_model_details():
    return {
        "gpt-4o": (
            "Flagship multimodal model: fast, cost-efficient, "
            "natively supports text, vision, and audio with real‑time voice-to-voice, "
        ),
        "gpt-4.1": (
            "Flagship general-purpose model : "
            "excellent at coding, instruction-following, and long-context tasks (1 million tokens). "
            "Surpasses GPT‑4o in reliability on developer workflows."
        ),
        "gpt-o3-mini": (
            "Compact reasoning specialist: supports function calling, structured outputs, developer features, "
            "offers configurable reasoning effort levels, excels in coding, STEM and logical reasoning, "
            "ower latency than full reasoning models."
        ),
        "o1": (
            "Advanced chain‑of‑thought reasoning model: "
            "designed to think step-by-step, excels in complex tasks in math, coding, physics and chemistry; "
            "slower and more compute‑intensive than GPT‑4o."
        ),
    }


def get_greeting_message(username):
    first_name = username.split()[0] if username else "there"
    hour = datetime.datetime.now().hour

    greetings = {
        "morning": [
            f"Good morning Admin,", f"Morning Admin,", "Hey, early bird", f"Rise and shine Admin,", f"Top of the morning Admin,"
        ],
        "afternoon": [
            f"Good afternoon Admin,", f"Afternoon Admin,", "Hey there", f"Hope you're doing well Admin,"
        ],
        "evening": [
            f"Good evening Admin,", f"Evening Admin,"
        ]
    }

    if hour < 12:
        greeting = random.choice(greetings["morning"])
    elif hour < 18:
        greeting = random.choice(greetings["afternoon"])
    else:
        greeting = random.choice(greetings["evening"])

    return greeting
