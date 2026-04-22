from openai import AsyncAzureOpenAI
from custom_logger import logger
import os
from agents import (
    Agent,
    HandoffInputData,
    OpenAIChatCompletionsModel,
    handoff,
    set_default_openai_client,
    function_tool,
    set_tracing_disabled,
)
from agents.extensions import handoff_filters
from custom_agents.tools.document_analyst_agent import (
    search_document,
    search_excel,
    create_chart
)
from custom_agents.wrapper import UserInfo, UserInfo
from custom_agents.tools.aladdin_tools import (
    execute_sales_insights_query,
    execute_ml_model_query
)
from openai import OpenAI,AsyncOpenAI
from utils.websearch import execute_web_search_query

def get_agent_client(model_name):
    openai_client = AsyncAzureOpenAI(
        api_key=os.getenv("GPT_4_O_AZURE_OPENAI_API_KEY"),
        api_version=os.getenv("GPT_4_O_AZURE_OPENAI_API_VERSION"),
        azure_endpoint=os.getenv("GPT_4_O_AZURE_OPENAI_API_ENDPOINT"),
        azure_deployment=os.getenv("GPT_4_O_AZURE_OPENAI_API_MODEL_NAME"),
    )
    # openai_client = AsyncOpenAI(
    # api_key="",
    # base_url="https://adb-3382613004075847.7.azuredatabricks.net/serving-endpoints",
    
    #     )

    set_default_openai_client(client=openai_client, use_for_tracing=False)
    set_default_openai_api("chat_completions")
    set_tracing_disabled(disabled=True)
    return openai_client
from openai import OpenAI,AsyncOpenAI
import os
from agents import (
    Agent,
    Runner,
    function_tool,
    set_default_openai_api,
    set_default_openai_client,
    set_tracing_disabled,
)

# How to get your Databricks token: https://docs.databricks.com/en/dev-tools/auth/pat.html
# DATABRICKS_TOKEN = os.getenv("token")
# Alternatively in a Databricks notebook you can use this:
# DATABRICKS_TOKEN = dbutils.notebook.entry_point.getDbutils().notebook().getContext().apiToken().get()

# client = AsyncOpenAI(
#   api_key=DATABRICKS_TOKEN,
#   base_url="https://adb-7488500312027058.18.azuredatabricks.net/serving-endpoints"
# )

# model_databricks=OpenAIChatCompletionsModel(model="databricks-claude-sonnet-4", openai_client=client)

# set_default_openai_client(client=client, use_for_tracing=False)
# set_default_openai_api("chat_completions")
# set_tracing_disabled(disabled=True)

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
# 
# 
# 
# 
# 
# 
# 
#########################################
#              Main Agent               #
#########################################

@function_tool
def get_information_about_self():
    with open("prompts/system_instructions/self_aware.md", "r", encoding="utf-8") as file:
        self_aware_md = file.read()
        return f"\n\n---\n\n{self_aware_md}"
    
def get_main_agent(model_name):
    # model_name = "databricks-claude-sonnet-4"
    agent_client = get_agent_client(model_name)

    with open("prompts/main_agent_instructions.md", "r", encoding="utf-8") as file:
        main_agent_instructions = file.read()

    relay_project_manager_agent = get_relay_project_manager_agent(model_name)
    image_specialist_agent = get_image_specialist_agent(model_name)
    document_search_agent = get_document_search_agent(model_name)
    relay_search_agent = get_relay_search_agent(model_name)
    
    main_agent = Agent[UserInfo](
        name="Relay Chat Agent",
        instructions=main_agent_instructions,
        model=OpenAIChatCompletionsModel(model=model_name, openai_client=agent_client),
        handoffs=[
            handoff(relay_project_manager_agent),
            handoff(image_specialist_agent),
            handoff(document_search_agent),
            handoff(relay_search_agent),
        ],
        tools=[
            get_information_about_self,
            write_outlook_email_draft
        ],
    )

    return main_agent
                
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
# 
# 
# 
# 
# 
# 
# 
##########################################
#         Document Search Agent          #
##########################################

def get_document_search_agent(model_name):
    agent_client = get_agent_client(model_name)

    with open("prompts/document_analyst_agent_instructions.md", "r", encoding="utf-8") as file:
        document_analyst_agent_instructions = file.read()

    document_search_agent = Agent[UserInfo](
        name="Relay Document Analyst Agent",
        instructions=document_analyst_agent_instructions,
        model=OpenAIChatCompletionsModel(model=model_name, openai_client=agent_client),
        tools=[search_document, search_excel, create_chart],
    )

    return document_search_agent
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
# 
# 
# 
# 
# 
# 
# 
##########################################
#         Image Specialist Agent         #
##########################################

def get_image_specialist_agent(model_name):
    agent_client = get_agent_client(model_name)
    with open("prompts/image_generation_agent_instructions.md", "r", encoding="utf-8") as file:
        image_generation_agent_instructions = file.read()

    image_specialist_agent = Agent[UserInfo](
        name="Relay Image Generator Agent",
        instructions=image_generation_agent_instructions,
        model=OpenAIChatCompletionsModel(model=model_name, openai_client=agent_client),
        tools=[generate_image],
    )
    
    return image_specialist_agent
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
# 
# 
# 
# 
# 
# 
# 
#########################################
#           relay Search Agent           #
#########################################

def get_relay_search_agent(model_name):
    agent_client = get_agent_client(model_name)
    with open("prompts/relay_search_agent_instructions.md", "r", encoding="utf-8") as file:
        relay_search_agent_instructions = file.read()

    relay_search_agent = Agent[UserInfo](
        name="relay Mate Microsoft 365 Agent",
        instructions=relay_search_agent_instructions,
        model=OpenAIChatCompletionsModel(model=model_name, openai_client=agent_client),
        tools = [
                search_sharepoint_files_by_keyword,
                search_teams_chats_by_keyword,
                search_outlook_emails_by_keyword,
                get_recent_teams_chats_along_with_messages,
                get_teams_chat_messages_by_chat_id,
                get_recent_teams_chat_details,
                get_recent_outlook_calendar_events,
                get_recent_outlook_emails,
                get_recent_sharepoint_files,
                get_outlook_calendar_events_by_date_range,
                get_outlook_emails_by_date_range,
                get_outlook_calendar_events_by_organizer,
                get_outlook_emails_by_sender,
            ]
    )
    return relay_search_agent
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
# 
# 
# 
# 
# 
# 
# 
#########################################
#      Relay Project Manager Agent      #
#########################################

def get_relay_project_manager_agent(model_name):
    agent_client = get_agent_client(model_name)
    with open("prompts/relay_project_manager_instructions.md", "r", encoding="utf-8") as file:
        relay_project_manager_instructions = file.read()

    relay_project_manager_agent = Agent[UserInfo](
        name="Relay Project Manager Agent",
        instructions=relay_project_manager_instructions,
        model=OpenAIChatCompletionsModel(model=model_name, openai_client=agent_client),
        tools = [
            get_work_items_by_id,
            get_all_work_items,
            get_all_available_repos,
            get_repo_details,
            get_all_projects,
            get_project_details
        ]
    )
    return relay_project_manager_agent


#########################################
#            Aladdin Agent             #
#########################################

def get_aladdin_agent(model_name):
    agent_client = get_agent_client(model_name)
    with open("prompts/aladdin_orchestrator_instructions.MD", "r", encoding="utf-8") as file:
        aladdin_orchestrator_instructions = file.read()

    aladdin_agent = Agent[UserInfo](
        name="Aladdin Agent",
        instructions=aladdin_orchestrator_instructions,
        model=OpenAIChatCompletionsModel(model=model_name, openai_client=agent_client),
        tools=[
            execute_sales_insights_query,
            execute_ml_model_query,
        ]
    )
    return aladdin_agent