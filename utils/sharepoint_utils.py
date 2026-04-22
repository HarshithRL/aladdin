from datetime import datetime

import requests
from msal import ConfidentialClientApplication
from tqdm import tqdm
import requests
from io import BytesIO
from openpyxl import Workbook
from config import get_config

config = get_config()


class SharePointUtilities:
    def __init__(self):
        tenant_id = config["sharepoint"]["tenant_id"]
        client_id = config["sharepoint"]["client_id"]
        client_secret = config["sharepoint"]["client_secret"]

        authority = f"https://login.microsoftonline.com/{tenant_id}"

        self.app = ConfidentialClientApplication(
            client_id=client_id, client_credential=client_secret, authority=authority
        )

    def get_access_token(self):
        scopes = ["https://graph.microsoft.com/.default"]  # for application permissions

        result = self.app.acquire_token_for_client(scopes=scopes)
        if "access_token" in result:
            access_token = result["access_token"]
            return access_token
        else:
            raise (
                "Failed to acquire token:\n Error: "
                + result.get("error")
                + "\nDescription: "
                + result.get("error_description")
            )

    def get_endpoint(self):
        site_id = config["sharepoint"]["site_id"]["MDP"]
        resource_url = "https://graph.microsoft.com/"
        api_version = "v1.0"
        endpoint = f"{resource_url}{api_version}/sites/{site_id}"

        return endpoint

    def get_header(self):
        return {"Authorization": "Bearer " + self.get_access_token()}

    def sharepoint_is_accessible(self):
        response = requests.get(self.get_endpoint(), headers=self.get_header())
        if response.status_code == 200:
            return True
        else:
            return False

    def get_drive_id(self):
        if self.sharepoint_is_accessible():
            drives_endpoint = self.get_endpoint() + "/drives"
            response = requests.get(
                drives_endpoint, headers=self.get_header(), stream=True
            )
            if response.status_code == 200:
                drives_data = response.json()
                drive_id = drives_data["value"][-1].get("id")
                return drive_id
            else:
                print("Failed to retrieve drives:", response.status_code, response.text)
        else:
            raise "Failed to access sharepoint."

    def get_bearer_header(self):
        tenant_id = config["sharepoint"]["tenant_id"]
        client_id = config["sharepoint"]["client_id"]
        client_secret = config["sharepoint"]["client_secret"]

        url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
        headers = {"Content-Type": "application/x-www-form-urlencoded"}

        body = {
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": "https://graph.microsoft.com/.default",
        }
        response = requests.post(url, headers=headers, data=body)
        token = response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
        return headers

    def check_folder_exists(self, parent_folder_id, folder_name):
        drive_id = self.get_drive_id()
        url = (
            self.get_endpoint()
            + f"/drives/{drive_id}/items/{parent_folder_id}/children"
        )
        response = requests.get(url, headers=self.get_header())
        if response.status_code == 200:
            children = response.json().get("value", [])
            for child in children:
                if child["name"] == folder_name and "folder" in child:
                    return child["id"]

    def check_file_exists(self, parent_folder_id, file_name):
        drive_id = self.get_drive_id()
        url = (
            self.get_endpoint()
            + f"/drives/{drive_id}/items/{parent_folder_id}/children"
        )
        response = requests.get(url, headers=self.get_header())
        if response.status_code == 200:
            children = response.json().get("value", [])
            for child in children:
                if child["name"] == file_name and "file" in child:
                    return True
        return False


    def get_file_name_and_content(self, folder_url):
        response = requests.get(folder_url, headers=self.get_bearer_header())
        if response.status_code == 200:
            items = response.json()["value"]
            for item in items:
                if item.get("folder", None):
                    drives_endpoint = self.get_endpoint() + "/drives/"
                    new_folder_url = f"{drives_endpoint}{item['parentReference']['driveId']}/items/{item['id']}/children"
                    self.get_file_name_and_content(new_folder_url)
                else:  # It's a file
                    file_url = f"{drives_endpoint}{item['parentReference']['driveId']}/items/{item['id']}/content"
                    file_response = requests.get(
                        file_url, headers=self.get_bearer_header()
                    )
                    if file_response.status_code == 200:
                        file_name = item["name"]
                        file_content = file_response.content
                        print(f"File downloaded: {item['name']}")
                        return file_name, file_content
                    else:
                        print(
                            f"Failed to download file: {item['name']}, Status: {file_response.status_code}"
                        )
        else:
            print(f"Failed to access folder: {response.status_code} {response.text}")
        
    def get_or_create_folder(self, site_code, folder_id_general):
        # Check if the folder exists
        drive_id = self.get_drive_id()
        list_url = self.get_endpoint() + "/drives/" + f"{drive_id}/items/{folder_id_general}/children"


        response = requests.get(list_url, headers=self.get_bearer_header())
        if response.status_code == 200:
            folders = response.json().get('value', [])
            for folder in folders:
                if folder.get('name') == site_code and folder.get('folder') is not None:
                    return folder['id']  # Return existing folder ID

            # Folder does not exist, create it
            create_folder_data = {
                "name": site_code,
                "folder": {}
            }
            create_response = requests.post(list_url, headers=self.get_bearer_header(), json=create_folder_data)
            if create_response.status_code == 201:
                return create_response.json()['id']  # Return new folder ID
            else:
                print(f"Failed to create folder: {create_response.status_code} - {create_response.text}")
                return None
        else:
            print(f"Failed to list folders: {response.status_code} - {response.text}")
            return None
    
