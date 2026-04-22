import base64
import datetime
import io
import json
import logging
import os
import traceback
import urllib.parse
from datetime import datetime
import requests
from urllib.parse import parse_qs, quote, unquote, urlparse

import html2text
import msal
import requests
from flask import session
from msal import ConfidentialClientApplication

from config import get_config
from utils.auth_utils import get_auth_access_token

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class sharepointUtilities:
    def __init__(self):
        self.app = None

    def get_client(self):
        if self.app is None:
            config = get_config()
            tenant_id = config["sharepoint"]["tenant_id"]
            client_id = config["sharepoint"]["client_id"]
            client_secret = config["sharepoint"]["client_secret"]
            
            authority = f"https://login.microsoftonline.com/{tenant_id}"
            self.app = ConfidentialClientApplication(
                client_id, client_credential=client_secret, authority=authority
            )
        return self.app

    def get_video_details(self, sharepoint_link, user_header):
        try:
            logger.info(f"Starting get_video_details for link: {sharepoint_link}")

            # Step 1: Try to get meeting info (optional, for logging)
            # join_link = sharepoint_link
            # meetings_url = f"https://graph.microsoft.com/v1.0/me/onlineMeetings?$filter=JoinWebUrl eq '{join_link}'"
            # meetings_response = requests.get(meetings_url, headers=user_header)

            # Step 2: Extract SharePoint site and file info
            logger.info("Extracting site ID from SharePoint link...")
            site_id = self.get_site_id(sharepoint_link)
            logger.info("fetched site id")
            logger.info(f"Site ID: {site_id}")

            logger.info("Extracting file path from SharePoint link...")
            file_path = self.extract_file_path_from_link(sharepoint_link)
            logger.info(f"File path: {file_path}")

            logger.info("Getting drive ID for site...")
            drive_id = self.get_drive_id(site_id)
            logger.info(f"Drive ID: {drive_id}")

            encoded_path = file_path.replace(" ", "%20")
            file_url = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/root:/{encoded_path}"
            logger.info(f"Requesting file details from: {file_url}")

            file_response = requests.get(file_url, headers=self.get_header())
            logger.info(f"File details response: {file_response.status_code}")

            if file_response.status_code != 200:
                logger.info(f"Failed to fetch file details: {file_response.status_code} - {file_response.text}")
                raise Exception(
                    f"Failed to fetch file details: {file_response.status_code} - {file_response.text}"
                )

            file_data = file_response.json()
            logger.info(f"File data: {json.dumps(file_data, indent=2)}")

            if "@microsoft.graph.downloadUrl" not in file_data:
                logger.info(f"Download URL not found in file data: {file_data}")
                raise Exception(f"Download URL not found in response: {file_data}")

            # Step 3: Parse file metadata
            createdDateTime = file_data.get("fileSystemInfo", {}).get("createdDateTime")
            if createdDateTime:
                createdDateTime = datetime.strptime(
                    createdDateTime, "%Y-%m-%dT%H:%M:%SZ"
                ).strftime("%b %d %Y")
            else:
                createdDateTime = ""

            externalId = file_data.get("source", {}).get("externalId")
            meetingOrganizerId = file_data.get("source", {}).get("meetingOrganizerId")
            threadId = file_data.get("source", {}).get("threadId")

            transcript_is_available = isinstance(threadId, str) and threadId.endswith(
                "@thread.v2"
            )
            logger.info(f"Transcript available: {transcript_is_available}")

            # Step 4: Prepare result
            result = {
                "video_src": file_data["@microsoft.graph.downloadUrl"],
                "name": file_data.get("name"),
                "webUrl": file_data.get("webUrl"),
                "createdDateTime": createdDateTime,
                "threadId": threadId,
                "meetingOrganizerId": meetingOrganizerId,
                "stream_link": sharepoint_link,
                "embed_url": self.get_embed_iframe_url(file_data),
                "response": file_data,
                "externalId": externalId,
                "transcript_is_available": transcript_is_available,
            }
            logger.info(f"Returning video details: {json.dumps(result, indent=2, default=str)}")
            return result

        except Exception as e:
            logger.info(f"Error in get_video_details: {str(e)}")
            raise

    def get_user_token(self):
        """Get Delegated token (On-Behalf-Of Flow)."""
        try:
            from app import auth

            scopes = [
                "OnlineMeetingTranscript.Read.All",
                "OnlineMeetingRecording.Read.All",
                "OnlineMeetings.ReadWrite",
                "OnlineMeetingRecording.Read",
            ]
            access_token = None
            for scope in scopes:
                logger.info(f"Checking for scope: {scope}")
                try:
                    token_result = auth.get_token_for_user([scope])
                    access_token = token_result.get("access_token")
                    if access_token:
                        logger.info(f"Successfully acquired token for scope: {scope}")
                        break
                except Exception as e:
                    logger.warning(
                        f"Failed to acquire token for scope {scope}: {str(e)}"
                    )

            if not access_token:
                raise Exception("Unable to acquire Delegated access token.")
            return access_token
        except Exception as e:
            logger.info(f"Error acquiring user token: {str(e)}")
            raise

    def get_meeting_id_from_join_link(self, join_link, user_header):
        try:
            url = f"https://graph.microsoft.com/v1.0/me/onlineMeetings?$filter=JoinWebUrl eq '{join_link}'"
            logger.info(f"Sending request to URL: {url}")
            response = requests.get(url, headers=user_header)

            logger.info(f"Response Content: {response.json()}")

            if response.status_code == 200:
                meetings_res = response.json()
                meetings = meetings_res.get("value", [])
                if meetings:
                    meeting_id = meetings[0]["id"]
                    meeting_name = meetings[0]["subject"]
                    logger.info(f"Meeting ID found: {meeting_id}")
                    logger.info(f"Meeting name found: {meeting_name}")
                    return meeting_id, meeting_name
                else:
                    logger.info("No meetings found for the provided JoinWebUrl.")
                    return None, None
            else:
                raise Exception(
                    f"Failed to fetch meeting ID: {response.status_code} - {response.text}"
                )
        except Exception as e:
            logger.info(f"Error occurred in get_meeting_id_from_join_link: {str(e)}")
            raise

    def get_transcripts_from_meeting_link(self, join_link, user_id, user_header):
        logger.info("Starting get_transcripts_from_meeting_link method.")

        meeting_id, meeting_name = self.get_meeting_id_from_join_link(
            join_link, user_header
        )
        logger.info(f"Extracted meeting_id: {meeting_id}, user_id: {user_id}")

        if not meeting_id or not user_id:
            logger.info("No meeting ID or user ID found; cannot download transcript.")
            return False, None

        url = f"https://graph.microsoft.com/v1.0/me/onlineMeetings/{meeting_id}/transcripts"

        logger.info(f"Constructed URL for transcript download: {url}")
        logger.info("Sending GET request to download transcript.")
        response = requests.get(url, headers=user_header)
        logger.info(f"Response Status: {response.status_code}, Content: {response.text}")

        all_transcripts = []
        transcript_content_urls = [
            x["transcriptContentUrl"] for x in response.json()["value"]
        ]
        logger.info(f"Constructed URLs for transcript download: {transcript_content_urls}")

        for transcript_content_url in transcript_content_urls:
            logger.info("Sending GET request to download transcript.")
            logger.info(f"GET request url: {transcript_content_url}")
            header = user_header
            header["Accept"] = "text/vtt"
            response = requests.get(transcript_content_url, headers=header)
            logger.info(f"response: {response.json()}")

            transcript = response.content
            logger.info(f"downloaded transcript: {str(transcript)[:30]}")
            all_transcripts.append(str(transcript))

        return all_transcripts, meeting_name

    def generate_join_link(
        self, thread_id, oid, capitalize_keys=False, add_spaces=True
    ):
        # Prepare thread id
        config = get_config()

        encoded_thread_id = urllib.parse.quote_plus(thread_id)
        tid = config["sharepoint"]["tenant_id"]

        # Prepare context dict
        context_dict = {
            "Tid" if capitalize_keys else "tid": tid,
            "Oid" if capitalize_keys else "oid": oid,
        }

        # JSON serialization: control spaces
        if add_spaces:
            context_json = json.dumps(context_dict, separators=(", ", ": "))
        else:
            context_json = json.dumps(context_dict, separators=(",", ":"))

        encoded_context = urllib.parse.quote(context_json)

        final_url = f"https://teams.microsoft.com/l/meetup-join/{encoded_thread_id}/0?context={encoded_context}"

        return final_url

    def get_meeting_details_from_sharepoint_url(self, threadId, user_id, user_header):
        urls = [
            self.generate_join_link(
                threadId, user_id, capitalize_keys=True, add_spaces=True
            ),
            self.generate_join_link(
                threadId, user_id, capitalize_keys=False, add_spaces=False
            ),
            self.generate_join_link(
                threadId, user_id, capitalize_keys=False, add_spaces=True
            ),
            self.generate_join_link(
                threadId, user_id, capitalize_keys=True, add_spaces=False
            ),
        ]
        logger.info(f"threadId: {threadId}")
        logger.info(f"user_id: {user_id}")
        logger.info(f"user_header: {user_header}")
        logger.info(f"generate_join_link urls:-> {urls}")
        for join_link in urls:
            logger.info(f"checking for the url: {join_link}")
            try:
                url = f"https://graph.microsoft.com/v1.0/me/onlineMeetings?$filter=JoinWebUrl eq '{join_link}'"
                logger.info(f"Sending request to URL: {url}")
                response = requests.get(url, headers=user_header)

                logger.info(f"Response Content: {response.json()}")

                if response.status_code == 200:
                    meetings = response.json().get("value", [])
                    logger.info(f"---->meetings: {response.json()}")
                    if meetings:
                        meeting_id = meetings[0]["id"]
                        meeting_name = meetings[0]["subject"]
                        logger.info(f"Meeting ID found: {meeting_id}")
                        logger.info(f"Meeting name found: {meeting_name}")
                        return meeting_id, meeting_name
                    else:
                        logger.info("No meeting were found for the given link")
                        return None, None
            except Exception as e:
                logger.info(f"Error occurred in get_meeting_id_from_sharepoint_url: {str(e)}")
                return None, None

    def get_transcript_urls_from_meeting_id(
        self, meeting_id, user_header, meetingOrganizerId, user_id
    ):
        try:
            logger.info("trying to get the available transcripts for the given meeting id")
            url = f"https://graph.microsoft.com/v1.0/me/onlineMeetings/{meeting_id}/transcripts"
            logger.info(f"Constructed URL for transcript check: {url}")
            response = requests.get(url, headers=user_header)
            logger.info(f"Response Status: {response.status_code}, Content: {response.text}")
            transcripts = response.json().get("value", [])
            logger.info(f"---------->transcripts:  {response.json()}")
            logger.info(f"meetingOrganizerId = {meetingOrganizerId}")
            logger.info(f"user_id = {user_id}")
            logger.info(f"user_header = {user_header}")

            parts = []
            for t in transcripts:
                parts.append(
                    {
                        "createdDateTime": t.get("createdDateTime"),
                        "transcriptContentUrl": t.get("transcriptContentUrl").replace(
                            f"/users/{meetingOrganizerId}/", "/me/"
                        ),
                    }
                )

            return True, parts
        except Exception as e:
            logger.info("Failed to get transcript urls from the meeting IDs")
            logger.info(f"rror: {e}")
            return False, e

    def get_transcript_content_from_url(self, transcript_content_url, user_header):
        try:
            logger.info("getting transcript content from transcript url")
            header = user_header
            header["Accept"] = "text/vtt"
            transcript_response = requests.get(transcript_content_url, headers=header)
            logger.info(f"Downloaded transcript: {transcript_response.content[:100]}...")
            return True, transcript_response.content.decode("utf-8", errors="replace")
        except Exception as e:
            return False, e

    def get_transcript_from_sharepoint_video(
        self, threadId, meetingOrganizerId, user_id, user_header
    ):
        """
        Retrieves the transcript for a SharePoint video using threadId, meetingOrganizerId, and user_id.

        Args:
            threadId (str): The thread ID of the meeting.
            meetingOrganizerId (str): The organizer's user ID.
            user_id (str): The current user's ID.

        Returns:
            str: The transcript content as a string.

        Raises:
            Exception: If transcript is not found or any error occurs.
        """
        logger.info("Starting get_transcript_from_sharepoint_video method.")

        meeting_id, meeting_name = self.get_join_url_from_sharepoint_url(
            threadId, meetingOrganizerId, user_header
        )

        if not meeting_id or not user_id:
            logger.info("No meeting ID or user ID found; cannot check transcript.")
            raise Exception("No meeting ID or user ID found; cannot check transcript.")

        url = f"https://graph.microsoft.com/v1.0/me/onlineMeetings/{meeting_id}/transcripts"
        logger.info(f"Constructed URL for transcript check: {url}")
        response = requests.get(url, headers=user_header)
        logger.info(f"Response Status: {response.status_code}, Content: {response.text}")

        try:
            transcripts = response.json().get("value", [])
            logger.info(f"---------->transcripts:  {response.json()}")
            if not transcripts:
                logger.info("No transcripts found for the meeting.")
                raise Exception("No transcripts found for the meeting.")
            logger.info(f"meetingOrganizerId = {meetingOrganizerId}")
            logger.info(f"user_id = {user_id}")
            logger.info(f"user_header = {user_header}")
            transcript_content_url = (
                transcripts[-1]
                .get("transcriptContentUrl")
                .replace(f"/users/{meetingOrganizerId}/", "/me/")
            )
            logger.info(f"Transcript content URL: {transcript_content_url}")

            if not transcript_content_url:
                logger.info("Transcript content URL not found.")
                raise Exception("Transcript content URL not found.")

            header = user_header
            header["Accept"] = "text/vtt"
            transcript_response = requests.get(transcript_content_url, headers=header)
            logger.info(f"Downloaded transcript: {transcript_response.content[:100]}...")

            return transcript_response.content.decode("utf-8", errors="replace")
        except Exception as e:
            logger.error(f"Error retrieving transcript: {str(e)}")
            raise

    def download_video(self, video_details, save_as):
        video_src = video_details["video_src"]
        logger.info(f"Starting download for video: {video_src}")

        try:
            response = requests.get(video_src, stream=True)
            logger.info(f"Received response with status code: {response.status_code}")

            if response.status_code != 200:
                raise Exception(
                    f"Failed to download file: {response.status_code} - {response.text}"
                )

            with open(save_as, "wb") as file:
                logger.info(f"Saving video to: {save_as}")
                for chunk in response.iter_content(
                    chunk_size=10 * 1024 * 1024
                ):  # 10MB chunks
                    file.write(chunk)
                    logger.info(f"Written chunk of size: {len(chunk)} bytes")

            logger.info(f"File downloaded successfully: {save_as}")
            return video_src

        except Exception as e:
            logger.info(f"An error occurred while downloading the video: {str(e)}")
            raise

    def get_access_token(self):
        scopes = ["https://graph.microsoft.com/.default"]
        result = self.get_client().acquire_token_for_client(scopes=scopes)

        if "access_token" in result:
            return result["access_token"]
        else:
            raise Exception(
                f"Failed to acquire token: {result.get('error_description')}"
            )

    def get_header(self):
        return {"Authorization": f"Bearer {self.get_access_token()}"}

    def get_drive_id(self, site_id):
        url = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drives"
        response = requests.get(url, headers=self.get_header())

        logger.info(f"Drive ID request URL: {url}")
        logger.info(f"Drive ID response JSON: {response.json()}")

        if response.status_code == 200:
            drives = response.json().get("value", [])

            drive_id = None
            for drive in drives:
                if (
                    "/Documents" in drive.get("webUrl", "")
                    or drive.get("name", "").lower() == "documents"
                ):
                    drive_id = drive["id"]
                    break

            if not drive_id:
                raise Exception(
                    "No 'Documents' drive found in site. Please verify site ID and permissions."
                )

            logger.info(f"Drive ID: {drive_id}")
            return drive_id
        else:
            raise Exception(
                f"Failed to get Drive ID: {response.status_code} - {response.text}"
            )

    def extract_site_info(self, sharepoint_url):
        try:
            logger.info(f"Extracting site info from SharePoint URL: {sharepoint_url}")
            parsed_url = urlparse(sharepoint_url)
            domain = parsed_url.netloc
            path_parts = parsed_url.path.strip("/").split("/")

            site_path = f"{domain}:/{'/'.join(path_parts[:2])}"
            logger.info(f"Extracted domain: {domain}, site_path: {site_path}")
            return domain, site_path
        except Exception as e:
            logger.info(f"error: {e}")
            return None, None

    def get_site_id(self, sharepoint_url):
        logger.info(f"Extracting site ID from SharePoint URL: {sharepoint_url}")
        domain, site_path = self.extract_site_info(sharepoint_url)
        url = f"https://graph.microsoft.com/v1.0/sites/{site_path}"
        logger.info(f"Site ID request URL: {url}")
        response = requests.get(url, headers=self.get_header())
        logger.info(f"Site ID response status: {response.status_code}, content: {response.text}")
        if response.status_code == 200:
            site_id = response.json()["id"]
            logger.info(f"Extracted site ID: {site_id}")
            return site_id
        else:
            logger.error(f"Failed to get Site ID: {response.text}")
            raise Exception(f"Failed to get Site ID: {response.text}")

    def extract_file_path_from_link(self, sharepoint_link):
        parsed_url = urlparse(sharepoint_link)
        query_params = parse_qs(parsed_url.query)

        if "id" in query_params:
            raw_path = unquote(query_params["id"][0]).lstrip("/")
            file_name = raw_path.split("_com/Documents/")[-1]
            logger.info(f"Extracted File Name: {file_name}")
            return file_name
        else:
            raise Exception("Invalid SharePoint link: Unable to extract file path.")

    def get_embed_iframe_url(self, graph_response):
        # Get webUrl
        web_url = graph_response["webUrl"]
        parsed_url = urlparse(web_url)

        # Extract tenant domain and user path
        tenant_domain = parsed_url.netloc
        user_path = parsed_url.path.split("/Documents")[
            0
        ]  # everything before /Documents

        # Extract UniqueId from downloadUrl
        download_url = graph_response["@microsoft.graph.downloadUrl"]
        download_parsed = urlparse(download_url)
        download_qs = parse_qs(download_parsed.query)
        unique_id = download_qs["UniqueId"][0]

        # Construct embed URL
        embed_url = f"https://{tenant_domain}{user_path}/_layouts/15/embed.aspx?UniqueId={unique_id}&embed=%7B%22ust%22%3Atrue%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create"

        return embed_url

    def get_teams_meeting_iframe(self, meeting_dict):
        join_url = meeting_dict["joinWebUrl"]  # or meeting_dict["joinUrl"]
        encoded_url = quote(join_url, safe="")
        iframe_url = f'https://teams.microsoft.com/embed?context={{"subPageId":"meeting","meetingJoinUrl":"{encoded_url}"}}'

        iframe_tag = f'<iframe src="{iframe_url}" width="100%" height="600" frameborder="0" allowfullscreen></iframe>'
        return iframe_url

    def get_participants_list(self, meeting_id, sharepoint_link, access_token):
        """
        Checks recent activities on the SharePoint file to see if any transcription-related activity exists.
        """
        try:
            logger.info(f"Starting get_participants_list for meeting_id: {meeting_id}, sharepoint_link: {sharepoint_link}")

            url = f"https://graph.microsoft.com/v1.0/me/onlineMeetings/{meeting_id}"
            logger.info(f"Constructed URL for participants: {url}")

            logger.info("Sending GET request to get participants.")
            response = requests.get(url, headers={"Authorization": f"Bearer {access_token}"})
            logger.info(f"Response Status: {response.status_code}, Content: {response.text}")

            meeting_data = response.json()

            all_participants = []

            logger.info("Extracting participants from meeting data.")
            participants = meeting_data.get("participants", {})
            logger.info(f"Participants object: {participants}")

            # Get organizer email
            organizer_email = participants.get("organizer", {}).get("upn")
            logger.info(f"Organizer email: {organizer_email}")
            all_participants.append({"userPrincipalName": organizer_email})

            # Get attendees emails
            attendees = participants.get("attendees", [])
            logger.info(f"Attendees list: {attendees}")
            attendee_emails = [
                {"userPrincipalName": attendee.get("upn")}
                for attendee in attendees
                if "upn" in attendee
            ]
            logger.info(f"Attendee emails: {attendee_emails}")

            all_participants += attendee_emails
            logger.info(f"Returning all participants: {all_participants}")

            logger.info("Fetching profile pictures for all participants.")
            for i in all_participants:
                logger.info(f"Fetching profile picture for: {i['userPrincipalName']}")
                path = self.get_user_profile_picture(i["userPrincipalName"], access_token)
                i["profile_picture_path"] = path

            for i in all_participants:
                logger.info(f"Fetching profile picture for: {i['userPrincipalName']}")
                user_url = (
                    f"https://graph.microsoft.com/v1.0/users/{i['userPrincipalName']}"
                )
                user_response = requests.get(user_url, headers={"Authorization": f"Bearer {access_token}"})
                name = (
                    user_response.json().get("displayName")
                    if user_response.status_code == 200
                    else i["userPrincipalName"]
                )
                i["displayName"] = name

            logger.info(f"Returning all participants: {all_participants}")
            return all_participants
        except Exception as e:
            logger.info(f"Error checking transcript in activities: {str(e)}")
            raise

    def get_user_profile_picture(self, email, access_token):
        """
        Fetches the profile picture of a user by their email ID.
        Returns a base64-encoded data URI for direct use in <img src="">.
        Returns "[NOT AVAILABLE]" on failure.
        """

        try:
            url = f"https://graph.microsoft.com/v1.0/users/{email}/photo/$value"
            response = requests.get(url, headers={"Authorization": f"Bearer {access_token}"}, stream=True)

            if response.status_code == 200:
                image_bytes = response.content
                encoded = base64.b64encode(image_bytes).decode("utf-8")
                data_uri = f"data:image/jpeg;base64,{encoded}"
                return data_uri
            else:
                return "[NOT AVAILABLE]"
        except Exception:
            return "[NOT AVAILABLE]"

    # === 1. Get OneDrive Files (User's Personal Files) ===
    def get_onedrive_files(self, access_token):
        url = "https://graph.microsoft.com/v1.0/me/drive/root/children"
        response = requests.get(url, headers={"Authorization": f"Bearer {access_token}"})
        return response.json().get("value", [])

    # === 2. Get Shared With Me Files (Shared by Others) ===
    def get_shared_files(self, access_token):
        url = "https://graph.microsoft.com/v1.0/me/drive/sharedWithMe"
        response = requests.get(url, headers={"Authorization": f"Bearer {access_token}"})
        return response.json().get("value", [])

    def download_graph_file_as_binary(self, file_url: str, access_token: str) -> bytes:
        """
        Downloads a file from Microsoft Graph using the file's URL and returns the binary content.

        Args:
            file_url (str): The Microsoft Graph URL for the file's content.
            access_token (str): The user's access token for Graph API authentication.

        Returns:
            bytes: The binary content of the file.
        """
        headers = {
            "Authorization": f"Bearer {access_token}",
        }

        logger.info(f"Downloading file from: {file_url}")
        logger.info(f"Headers: {headers}")

        response = requests.get(file_url, headers=headers)

        if response.status_code == 200:
            return response.content  # Binary content of the file
        else:
            raise Exception(
                f"Failed to download file. Status: {response.status_code}, Message: {response.text}"
            )


    def get_mails_by_keyword(self, query, auth_access_token):
        logger.info(f"Searching mails by keyword: {query}")
        url = f'https://graph.microsoft.com/v1.0/me/messages?$search="{query}"'
        headers = {
            "Authorization": f"Bearer {auth_access_token}",
            "Content-Type": "application/json",
            "Prefer": 'outlook.body-content-type="text"',  # Optional: to ensure plain text in bodyPreview
        }
        logger.info(f"Requesting URL: {url}")
        response = requests.get(url, headers=headers)
        logger.info(f"Response status code: {response.status_code}")

        if response.status_code != 200:
            logger.info(f"Graph API request failed: {response.status_code} - {response.text}")
            raise Exception(
                f"Graph API request failed: {response.status_code} - {response.text}"
            )

        messages = response.json().get("value", [])
        logger.info(f"Found {len(messages)} messages matching keyword.")

        result = []

        for msg in messages:
            subject = msg.get("subject", "No Subject")
            body_preview = msg.get("bodyPreview", "")
            web_url = msg.get("webLink", "#")
            received_date = msg.get("lastModifiedDateTime", "")
            sender = (
                msg.get("sender", {}).get("emailAddress", {}).get("name", "Unknown")
            )
            to_recipients = msg.get("toRecipients", [])
            to_names = ", ".join(
                [
                    r.get("emailAddress", {}).get("name", "Unknown")
                    for r in to_recipients
                ]
            )

            logger.info(f"Processing message: Subject='{subject}', From='{sender}', To='{to_names}', Date='{received_date}'")
            markdown = f"""### Subject: [{subject}]({web_url})\n- **From:** {sender}\n- **To:** {to_names}\n- **Received Date:** {received_date}\n- **Body Preview:** {body_preview}"""
            result.append(markdown)

        logger.info(f"Returning {len(result)} formatted messages.")
        return result
    
    def get_mails_by_sender_emails(self, sender_emails, auth_access_token):
        logger.info(f"Searching mails by sender emails: {sender_emails}")
        result = []

        for user_email in sender_emails:
            url = f"https://graph.microsoft.com/v1.0/me/messages?$filter=(from/emailAddress/address) eq '{user_email}'"
            headers = {
                "Authorization": f"Bearer {auth_access_token}",
                "Content-Type": "application/json",
                "Prefer": 'outlook.body-content-type="text"',  # Optional: to ensure plain text in bodyPreview
            }
            logger.info(f"Requesting URL: {url} for sender: {user_email}")
            response = requests.get(url, headers=headers)
            logger.info(f"Response status code: {response.status_code} for sender: {user_email}")

            if response.status_code != 200:
                logger.info(f"Graph API request failed: {response.status_code} - {response.text}")
                raise Exception(
                    f"Graph API request failed: {response.status_code} - {response.text}"
                )

            messages = response.json().get("value", [])
            logger.info(f"Found {len(messages)} messages for sender: {user_email}")

            for msg in messages:
                subject = msg.get("subject", "No Subject")
                body_preview = msg.get("bodyPreview", "")
                web_url = msg.get("webLink", "#")
                received_date = msg.get("lastModifiedDateTime", "")
                sender = (
                    msg.get("sender", {}).get("emailAddress", {}).get("name", "Unknown")
                )
                to_recipients = msg.get("toRecipients", [])
                to_names = ", ".join(
                    [
                        r.get("emailAddress", {}).get("name", "Unknown")
                        for r in to_recipients
                    ]
                )

                logger.info(f"Processing message: Subject='{subject}', From='{sender}', To='{to_names}', Date='{received_date}'")
                markdown = f"""### Subject: [{subject}]({web_url})\n- **From:** {sender}\n- **To:** {to_names}\n- **Received Date:** {received_date}\n- **Body Preview:** {body_preview}"""
                result.append(markdown)

        logger.info(f"Returning {len(result)} formatted messages for all senders.")
        return result

    def format_shared_insight_documents_summary(self, documents):
        summaries = []

        for doc in documents:
            name = doc.get("name", "Untitled")
            mime = doc.get("file", {}).get("mimeType", "unknown/unknown")
            web_url = doc.get("webUrl", "#")
            last_modified = doc.get("lastModifiedDateTime", "Unknown Date")
            creator = (
                doc.get("createdBy", {})
                .get("user", {})
                .get("displayName", "Unknown Author")
            )

            # Attempt to extract a friendlier doc type from MIME
            type_map = {
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word Document",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel Spreadsheet",
                "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint Presentation",
            }
            doc_type = type_map.get(mime, "Unknown File Type")

            # Format the date
            try:
                last_modified_fmt = datetime.fromisoformat(
                    last_modified.replace("Z", "+00:00")
                ).strftime("%B %d, %Y")
            except:
                last_modified_fmt = last_modified

            summary = (
                f"The file **{name}** is a **{doc_type}**, created by **{creator}**, and last modified on **{last_modified_fmt}**. "
                f"You can access it [here]({web_url})."
            )
            summaries.append(summary)

        return summaries

    def format_insight_documents_summary(self, documents):
        paragraphs = []

        for item in documents:
            title = item.get("resourceVisualization", {}).get(
                "title", "Untitled Document"
            )
            doc_type = item.get("resourceVisualization", {}).get("type", "Unknown Type")
            web_url = item.get("resourceReference", {}).get("webUrl", "#")
            last_modified = item.get("lastUsed", {}).get(
                "lastModifiedDateTime", "Unknown Date"
            )

            # Format ISO date to readable
            try:
                last_modified = datetime.fromisoformat(
                    last_modified.replace("Z", "+00:00")
                ).strftime("%B %d, %Y")
            except:
                pass

            paragraph = (
                f"The document titled **{title}** is a **{doc_type}** file, "
                f"last modified on **{last_modified}**. "
                f"You can view it [here]({web_url})."
            )

            paragraphs.append(paragraph)

        return paragraphs

    def get_user_insights_data(self, endpoint_type, auth_access_token):
        logger.info(f"Fetching top items from Graph API insights: {endpoint_type}")

        valid_types = {
            "used": "https://graph.microsoft.com/v1.0/me/insights/used",
            "trending": "https://graph.microsoft.com/v1.0/me/insights/trending",
            "shared": "https://graph.microsoft.com/v1.0/me/insights/shared",
            "recent": "https://graph.microsoft.com/v1.0/me/drive/recent",
        }

        if endpoint_type not in valid_types:
            logger.info(f"Invalid endpoint_type: {endpoint_type}")
            return "Invalid endpoint type."

        url = valid_types[endpoint_type]
        headers = {
            "Authorization": f"Bearer {auth_access_token}",
            "Accept": "application/json",
        }

        response = requests.get(url, headers=headers)
        logger.info(f"Received response from {url} with status code: {response.status_code}")

        if response.status_code != 200:
            logger.info(f"Failed to fetch data from {endpoint_type}: {response.text}")
            return "Failed to fetch data."

        data = response.json().get("value", [])[:10]

        if endpoint_type == "recent":
            return self.format_shared_insight_documents_summary(data)
        return self.format_insight_documents_summary(data)

    def search_drive_items(
        self, query_string, search_type, auth_access_token
    ):
        

        def format_date(date_str):
            try:
                if date_str and date_str != "N/A":
                    dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                    return [dt.strftime("%B %d, %Y")]
            except:
                pass
            return ["N/A"]

        url = "https://graph.microsoft.com/v1.0/search/query"
        headers = {
            "Authorization": f"Bearer {auth_access_token}",
            "Content-Type": "application/json",
        }

        body = {
            "requests": [
                {
                    "entityTypes": ["drive", "driveItem", "site", "list", "listItem"],
                    "query": {"queryString": query_string},
                    "sortProperties": [
                        {"name": "lastModifiedDateTime", "isDescending": "true"}
                    ],
                }
            ]
        }

        response = requests.post(url, headers=headers, json=body)
        if response.status_code != 200:
            return [f"Search failed. {response.json()}"]

        data = response.json()
        hits_containers = data.get("value", [])[0].get("hitsContainers", [])

        lines = []
        for container in hits_containers:
            for hit in container.get("hits", []):
                resource = hit.get("resource", {})
                name = resource.get("name", "Unnamed File")
                url = (
                    resource.get("webUrl", "#")
                    .replace(" ", "%20")
                    .replace("(", "%28")
                    .replace(")", "%29")
                )
                modified = format_date(resource.get("lastModifiedDateTime", "N/A"))
                creator = (
                    resource.get("createdBy", {})
                    .get("user", {})
                    .get("displayName", "Unknown")
                )
                modified_by = (
                    resource.get("lastModifiedBy", {})
                    .get("user", {})
                    .get("displayName", creator)
                )
                summary = hit.get("summary", "").strip()

                parts = [f'[{name}]({url} "{name}")']
                details = []
                if modified != "N/A":
                    details.append(f"last modified by {modified_by} on {modified}")
                if summary and summary.lower() != "no summary available":
                    details.append(f"summary: {summary}")

                if details:
                    parts.append(" — " + ", ".join(details))

                lines.append(" ".join(parts))

        return lines

    def get_file_location(self, file_name, webURL):
        urls = webURL.split("/")[:-1]
        url = "/".join(urls)
        return url

    def search_email_items(self, query_string, auth_access_token):
        entity_list = ["message"]
        search_type = "Teams Messages"
        logger.info(f"Starting search_drive_items with query_string: {query_string}, entity_list: {entity_list}, search_type: {search_type}")

        url = "https://graph.microsoft.com/v1.0/search/query"
        headers = {
            "Authorization": f"Bearer {auth_access_token}",
            "Content-Type": "application/json",
        }

        body = {
            "requests": [
                {
                    "entityTypes": entity_list,
                    "query": {"queryString": query_string},
                }
            ]
        }

        logger.info("Sending POST request to Microsoft Graph API...")
        response = requests.post(url, headers=headers, json=body)
        logger.info(f"Response status code: {response.status_code}")

        if response.status_code != 200:
            pass
            logger.info(f"Search failed. Response: {response.text}")

        data = response.json()
        logger.info("Response JSON received.")

        hits_containers = data.get("value", [])[0].get("hitsContainers", [])
        logger.info(f"Found {len(hits_containers)} hitsContainers.")

        lines = []
        for container in hits_containers:
            logger.info(f"Processing container with {len(container.get('hits', []))} hits.")
            for hit_item in container["hits"]:
                from_email = hit_item["resource"]["sender"]
                to_email = hit_item["resource"]["replyTo"]
                summary = hit_item["summary"]
                subject = hit_item["resource"]["subject"]
                body_preview = hit_item["resource"]["bodyPreview"]
                web_link = hit_item["resource"]["webLink"]
                last_modified_data = hit_item["resource"]["lastModifiedDateTime"]

                markdown = f"""### Subject: [{subject}]({web_link})\n- **From:** {from_email}\n- **To:** {to_email}\n- **Received Date:** {last_modified_data}\n- **Summary:** {summary}\n- **Body Preview:** {body_preview}"""
                lines.append(markdown)
        return "\n".join("- " + line for line in lines)

    def search_recent_teams_messages(
        self,
        access_token: str,
        sender_display_name: str = None,
        key_words: list[str] = None,
        top_n_messages_per_chat: int = 20,
        messages_per_chat_order_by: str = "lastModifiedDateTime desc",
        message_per_chat_filter_condition: str = None,
        max_chat_count: int = 10,
        chat_order: str = "desc",
    ) -> tuple[list[str], list[dict], list[list[dict]]]:
        logger.info("Starting optimized search_recent_teams_messages method.")
        headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}

        results = []
        chat_resp_results = []
        messages_resp_results = []

        if chat_order not in ["asc", "desc"]:
            logger.info("Invalid chat_order value provided.")
            raise ValueError("chat_order must be either 'asc' or 'desc'")

        # --- Step 1: Optimized Fetching of Chats ---
        chats = []
        try:
            url = "https://graph.microsoft.com/v1.0/me/chats?$top=50"
            logger.info(f"Fetching chats from: {url}")
            while url and len(chats) < max_chat_count:
                resp = requests.get(url, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                logger.info(f"Fetched {len(data.get('value', []))} chats from current page.")
                chats.extend(data.get("value", []))
                url = data.get("@odata.nextLink")
            # Sort manually by lastUpdatedDateTime
            chats = [c for c in chats if "lastUpdatedDateTime" in c]
            chats.sort(
                key=lambda c: c["lastUpdatedDateTime"], reverse=(chat_order == "desc")
            )
            chats = chats[:max_chat_count]
            chat_resp_results.extend(chats)
            logger.info(f"Total chats fetched and sorted: {len(chats)}")
        except Exception as e:
            logger.info(f"❌ Failed to fetch chats: {e}")
            return results, chat_resp_results, messages_resp_results

        # Pre-compile keyword checks for efficiency
        lower_case_key_words = [kw.lower() for kw in key_words] if key_words else None
        lower_case_sender_display_name = sender_display_name.lower() if sender_display_name else None

        for chat in chats:
            try:
                chat_id = chat["id"]
                chat_name = chat.get("topic", "Unknown Chat Session")
                logger.debug(f"Processing chat: {chat_id} - {chat_name}") # Use debug for frequent logs

                # --- Optimized: Fetch chat members directly in the chat object if possible or batch ---
                # Unfortunately, Graph API /chats endpoint does not return members directly.
                # However, for 1-on-1 chats, 'chatType' is 'oneOnOne' and 'members' array exists.
                # For group chats, 'members' is typically not in the initial chat object.
                # Still, making one request per chat for members is often unavoidable unless
                # you pre-fetch all user profiles and map IDs, which adds complexity.
                # Keep this as a separate call for now, but acknowledge it's a per-chat overhead.
                members_resp = requests.get(
                    f"https://graph.microsoft.com/v1.0/chats/{chat_id}/members",
                    headers=headers,
                )
                members_resp.raise_for_status()
                members = members_resp.json().get("value", [])
                participants = [m.get("displayName", "Unknown") for m in members]
                logger.debug(f"Participants in chat {chat_id}: {participants}")

                # --- Optimized: Build messages URL with correct $top for messages ---
                # Request exactly top_n_messages_per_chat + a small buffer to ensure we get enough
                # and then truncate. Graph API's $top limit is 50 for messages, so we stick to that for now.
                # If top_n_messages_per_chat is > 50, we'll still need pagination.
                messages_query_parts = [f"$top={min(top_n_messages_per_chat, 50)}"]
                if messages_per_chat_order_by:
                    messages_query_parts.append(f"$orderby={messages_per_chat_order_by}")
                if message_per_chat_filter_condition:
                    messages_query_parts.append(f"$filter={message_per_chat_filter_condition}")
                
                base_messages_url = (
                    f"https://graph.microsoft.com/v1.0/chats/{chat_id}/messages?"
                    + "&".join(messages_query_parts)
                )
                logger.debug(f"Fetching messages from: {base_messages_url}")

                messages = []
                url = base_messages_url
                fetched_count = 0
                while url and fetched_count < top_n_messages_per_chat:
                    resp = requests.get(url, headers=headers)
                    resp.raise_for_status()
                    data = resp.json()
                    current_page_messages = data.get("value", [])
                    logger.debug(f"Fetched {len(current_page_messages)} messages from current page for chat {chat_id}.")
                    
                    for msg in current_page_messages:
                        if fetched_count >= top_n_messages_per_chat:
                            break # Stop processing if we have enough messages
                        messages.append(msg)
                        fetched_count += 1
                    
                    url = data.get("@odata.nextLink")
                
                messages_resp_results.append(messages)
                logger.debug(f"Total messages fetched for chat {chat_id}: {len(messages)}")

                for msg in messages:
                    try:
                        # Skip early if essential data is missing
                        if not msg.get("body") or not msg.get("from"):
                            logger.debug(f"Skipping message with missing body or sender in chat {chat_id}.")
                            continue

                        sender_info = msg.get("from", {}).get("user", {})
                        sender = sender_info.get("displayName", "Unknown")
                        
                        # Apply sender filter early
                        if lower_case_sender_display_name and lower_case_sender_display_name not in sender.lower():
                            logger.debug("Sender does not match sender_display_name, skipping message.")
                            continue

                        # Convert HTML to text only for messages that pass initial filters
                        body_content = html2text.html2text(msg["body"]["content"]).strip()

                        # Apply keyword filter early before full markdown construction
                        if lower_case_key_words:
                            message_text_for_search = f"{sender} {body_content}".lower() # Optimize search to sender + body
                            if not any(kw in message_text_for_search for kw in lower_case_key_words):
                                logger.debug("Message does not match keywords, skipping.")
                                continue
                            logger.debug("Message matches keywords.")

                        reactions = [r.get("displayName", "") for r in msg.get("reactions", [])]
                        attachments = [
                            f"[{a['name']}]({a['contentUrl']})"
                            for a in msg.get("attachments", [])
                        ]
                        last_edited = msg.get("lastModifiedDateTime", "Never")

                        web_url = f"https://teams.microsoft.com/l/message/{chat_id}/{msg['id']}?context=%7B%22contextType%22%3A%22chat%22%7D"

                        markdown = (
                            f"#### {chat_name}\n"
                            f"- **Sender:** {sender}\n"
                            f"- **Recipients:** {', '.join(participants)}\n"
                            f"- **Body:** {body_content}\n"
                            f"- **Reactions:** {', '.join(reactions) or 'None'}\n"
                            f"- **Attachments:** {', '.join(attachments) or 'None'}\n"
                            f"- **Last Modified:** {last_edited}\n"
                            f"- **Web URL:** {web_url}\n"
                        )
                        results.append(markdown)
                        logger.debug("✅ Message processed and added to results")
                    except Exception as msg_err:
                        logger.warning(
                            f"⚠️ Error processing message {msg.get('id', '?')} in chat {chat_id}: {msg_err}"
                        )
            except Exception as chat_err:
                logger.warning(f"⚠️ Skipped chat {chat.get('id', '?')}: {chat_err}")

        logger.info("Completed search_recent_teams_messages method.")
        return results
