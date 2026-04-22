import json
from typing import List, Dict

from agents import function_tool
from custom_logger import logger

@function_tool
def write_outlook_email_draft(
    to_list: List[str],
    cc_list: List[str],
    subject: str,
    content: str
) -> str:
    """
    Create an Outlook email draft with specified recipients and content.
    
    This function prepares an email draft structure that can be used to compose
    an email in Outlook with the specified recipients, subject, and body content.
    The draft is formatted but not sent - it needs to be processed by the email system.
    
    Args:
        to_list (List[str]): List of primary recipient email addresses.
            Example: ["recipient1@company.com", "recipient2@partner.com"].
        cc_list (List[str]): List of CC (carbon copy) recipient email addresses.
            Can be empty list if no CC recipients needed.
        subject (str): Subject line for the email.
        content (str): Body content of the email. Can include HTML formatting.
    
    Returns:
        str: JSON string containing the email draft structure with:
            - tool_type: Type of operation ("write_email_draft_for_outlook")
            - agent_used: Name of the agent performing the operation
            - inputs_provided: Dictionary of all input parameters
            - draft_email: Formatted email object with recipients, subject, and body
    """
    try:
        # Prepare email payload
        email_draft = {
            "toRecipients": to_list,
            "ccRecipients": cc_list,
            "emailSubject": subject,
            "emailBody": content
        }

        return json.dumps({
            "tool_type": "write_email_draft_for_outlook",
            "agent_used": "Relay Project Manager Agent",
            "source":"Microsoft Teams",
            "inputs_provided": {
                "to_list": to_list,
                "cc_list": cc_list,
                "subject": subject,
                "content": content
            },
            "draft_email": email_draft
        })
    except Exception as e:
        logger.exception("Error preparing email draft with manual inputs")
        return json.dumps({
            "error": str(e), 
            "tool_type": "write_email_draft_for_outlook", 
            "agent_used": "Relay Project Manager Agent",
            "inputs_provided": {}
        })
    
@function_tool
def get_work_items_by_id(work_item_id: str) -> str:
    """
    Fetches work items by their unique ID.
    
    Args:
        work_item_id (str): The unique ID of the work item.

    Returns:
        str: A JSON string containing the tool type, agent used, results, and results count.
    """
    try:
        # Simulated results
        results: List[Dict] = [
            {"work_item_id": work_item_id, "title": "Fix login bug", "status": "In Progress"}
        ]
        return json.dumps({
            "tool_type": "relay_project_manager_tool_output",
            "agent_used": "Relay Project Manager Agent",
            "results": results,
            "results_count": len(results)
        })
    except Exception as e:
        return json.dumps({"error": str(e)})

@function_tool
def get_all_work_items(project_id: str) -> str:
    """
    Fetches all work items for a given project.

    Args:
        project_id (str): The unique ID of the project.

    Returns:
        str: A JSON string containing the tool type, agent used, results, and results count.
    """
    try:
        # Simulated results
        results: List[Dict] = [
            {"work_item_id": "1234", "title": "Fix login bug", "status": "In Progress"},
            {"work_item_id": "5678", "title": "Update FAQ page", "status": "To Do"}
        ]
        return json.dumps({
            "tool_type": "relay_project_manager_tool_output",
            "agent_used": "Relay Project Manager Agent",
            "results": results,
            "results_count": len(results)
        })
    except Exception as e:
        return json.dumps({"error": str(e)})

@function_tool
def get_all_available_repos() -> str:
    """
    Fetches all available repositories in the system.

    Returns:
        str: A JSON string containing the tool type, agent used, results, and results count.
    """
    try:
        # Simulated results
        results: List[Dict] = [
            {"repo_id": "repo123", "repo_name": "BackendServiceAPI"},
            {"repo_id": "repo456", "repo_name": "FrontendWebApp"}
        ]
        return json.dumps({
            "tool_type": "relay_project_manager_tool_output",
            "agent_used": "Relay Project Manager Agent",
            "results": results,
            "results_count": len(results)
        })
    except Exception as e:
        return json.dumps({"error": str(e)})

@function_tool
def get_repo_details(repo_id: str) -> str:
    """
    Fetches details for a specific repository by its unique ID.

    Args:
        repo_id (str): The unique ID of the repository.

    Returns:
        str: A JSON string containing the tool type, agent used, results, and results count.
    """
    try:
        # Simulated results
        results: List[Dict] = [
            {"repo_id": repo_id, "repo_name": "BackendServiceAPI", "branch_count": 5}
        ]
        return json.dumps({
            "tool_type": "relay_project_manager_tool_output",
            "agent_used": "Relay Project Manager Agent",
            "results": results,
            "results_count": len(results)
        })
    except Exception as e:
        return json.dumps({"error": str(e)})

@function_tool
def get_all_projects() -> str:
    """
    Fetches details of all active projects in the system.

    Returns:
        str: A JSON string containing the tool type, agent used, results, and results count.
    """
    try:
        # Simulated results
        results: List[Dict] = [
            {"project_id": "proj123", "project_name": "Customer Portal Redesign"},
            {"project_id": "proj456", "project_name": "AI Chat Assistant"}
        ]
        return json.dumps({
            "tool_type": "relay_project_manager_tool_output",
            "agent_used": "Relay Project Manager Agent",
            "results": results,
            "results_count": len(results)
        })
    except Exception as e:
        return json.dumps({"error": str(e)})

@function_tool
def get_project_details(project_id: str) -> str:
    """
    Fetches details for a specific project by its unique ID.

    Args:
        project_id (str): The unique ID of the project.

    Returns:
        str: A JSON string containing the tool type, agent used, results, and results count.
    """
    try:
        # Simulated results
        results: List[Dict] = [
            {"project_id": project_id, "project_name": "AI Chat Assistant", "active_sprints": 3}
        ]
        return json.dumps({
            "tool_type": "relay_project_manager_tool_output",
            "agent_used": "Relay Project Manager Agent",
            "results": results,
            "results_count": len(results)
        })
    except Exception as e:
        return json.dumps({"error": str(e)})
