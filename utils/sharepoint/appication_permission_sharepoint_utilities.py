import requests
from config import get_config
from datetime import datetime, timedelta
from io import BytesIO

config = get_config()

client_id = config['sharepoint']['client_id']
tenant_id = config['sharepoint']['tenant_id']
client_secret = config['sharepoint']['client_secret']

class applicationPermissionSharepointUtilities:
    def __init__(self):
        pass

    def get_access_token(self):
        # Step 1: Get the app-only access token
        token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
        token_data = {
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": "https://graph.microsoft.com/.default",
        }

        token_r = requests.post(token_url, data=token_data)
        access_token = token_r.json().get("access_token")
        return access_token

    def format_last_modified(self, date_string):
        """
        Formats a date string into a more user-friendly format.
        
        Examples:
        - "Yesterday at 2:14 PM"
        - "Today at 3:19 AM"
        - "June 1, 2024"
        """
        # Parse the input date string to a datetime object
        date_object = datetime.strptime(date_string, '%Y-%m-%dT%H:%M:%SZ')
        
        # Get the current timestamp
        now = datetime.utcnow()
        
        # Calculate the difference between the provided date and now
        date_difference = now - date_object
        
        # Check if the date is today
        if date_object.date() == now.date():
            return date_object.strftime("Today at %I:%M %p")
        # Check if the date is yesterday
        elif date_object.date() == (now - timedelta(days=1)).date():
            return date_object.strftime("Yesterday at %I:%M %p")
        else:
            # If not today or yesterday, return the full date format
            return date_object.strftime('%B %d, %Y')
    
    def list_root_children(self, site_id: str):
        access_token = self.get_access_token()
        url = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drive/root/children"
        headers = {"Authorization": f"Bearer {access_token}"}
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        items = response.json().get("value", [])

        return self.format_items(items, site_id)

    def list_folder_children(self, drive_id: str, item_id: str, site_id: str):
        access_token = self.get_access_token()
        url = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/items/{item_id}/children"
        headers = {"Authorization": f"Bearer {access_token}"}
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        items = response.json().get("value", [])

        return self.format_items(items, site_id)

    def format_items(self, items: list, site_id: str):
        result = {"subfolders": [], "files": []}
        
        for item in items:
            if "folder" in item:
                result["subfolders"].append(
                    {
                        "name": item["name"],
                        "type": "folder",
                        "drive_id": item["parentReference"]["driveId"],
                        "site_id": site_id,
                        "item_id": item["id"],
                        "formattedLastModifiedDateTime": self.format_last_modified(item['lastModifiedDateTime']),
                        "lastModifiedDateTime": item['lastModifiedDateTime'],
                        "size_in_mb": str(item['folder']["childCount"]) + " items",
                        "lastModifiedBy": item['lastModifiedBy']['user']['displayName']
                    }
                )
            elif "file" in item:
                size = item['size'] / (1024 * 1024)
                size_in_mb = f"{size:.2f} MB"
                if '@microsoft.graph.downloadUrl' in item.keys():
                    result["files"].append(
                        {
                            "name": item["name"],
                            "url": item.get("webUrl"),
                            "drive_id": item["parentReference"]["driveId"],
                            "site_id": site_id,
                            "item_id": item["id"],
                            "download_url": item.get("@microsoft.graph.downloadUrl"),
                            "lastModifiedBy": item['lastModifiedBy']['user']['displayName'],
                            "size_in_mb": size_in_mb,
                            "formattedLastModifiedDateTime": self.format_last_modified(item['lastModifiedDateTime']),
                            "lastModifiedDateTime": item['lastModifiedDateTime'],
                        }
                    )

        return result

    def list_all_sites(self):
        access_token = self.get_access_token()
        search_url = "https://graph.microsoft.com/v1.0/sites?search="
        headers = {
            "Authorization": f"Bearer {access_token}",
        }

        response = requests.get(search_url, headers=headers)
        return [
            {"id": item["id"], "displayName": item["displayName"], "webUrl": item["webUrl"]}
            for item in response.json()["value"]
        ]
    
    def format_one_drive_my_shared_contents(self, contents):
        result = {"subfolders": [], "files": []}
        for item in contents:
            if "folder" in item:
                result["subfolders"].append(
                    {
                        "name": item["name"],
                        "type": "folder",
                        "drive_id": item['remoteItem']['parentReference']['driveId'],
                        "site_id": item['remoteItem']['parentReference']['siteId'],
                        "item_id": item["id"],
                        "formattedLastModifiedDateTime": self.format_last_modified(item['lastModifiedDateTime']),
                        "lastModifiedDateTime": item['lastModifiedDateTime'],
                        "size_in_mb": str(item['folder']["childCount"]) + " items",
                        "sharedBy": item['remoteItem']['shared']['sharedBy']['user']['displayName']
                    }
                )
            elif "file" in item:
                # drive_id = item['remoteItem']['parentReference']['driveId']
                # item_id = item['id']

                # url = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/items/{item_id}"
                # drive_item_response = requests.get(url, headers={"Authorization": f"Bearer {access_token}"}).json()

                # if '@microsoft.graph.downloadUrl' in drive_item_response.keys():
                #     graph_donwload_url = drive_item_response['@microsoft.graph.downloadUrl']

                size = item['size'] / (1024 * 1024)
                size_in_mb = f"{size:.2f} MB"
                result["files"].append(
                    {
                        "name": item["name"],
                        "url": item["webUrl"],
                        "sharedBy": item['remoteItem']['shared']['sharedBy']['user']['displayName'],
                        "size_in_mb": size_in_mb,
                        "formattedLastModifiedDateTime": self.format_last_modified(item['lastModifiedDateTime']),
                        "lastModifiedDateTime": item['lastModifiedDateTime'],
                        "drive_id": item['remoteItem']['parentReference']['driveId'],
                        "site_id": item['remoteItem']['parentReference']['siteId'],
                        "item_id": item["id"]
                    }
                )
        return result
    
    def get_my_shared_files(self, access_token):
        url = "https://graph.microsoft.com/v1.0/me/drive/sharedWithMe"
        response = requests.get(url, headers={"Authorization": f"Bearer {access_token}"})
        contents = response.json().get("value", [])
        if len(contents) >= 1:
            contents = self.format_one_drive_my_shared_contents(contents)
        return contents
    
    def get_my_one_drive_files(self, access_token):
        url = "https://graph.microsoft.com/v1.0/me/drive/root/children"
        response = requests.get(url, headers={"Authorization": f"Bearer {access_token}"})
        contents = response.json().get("value", [])
        if len(contents) >= 1:
            site_id = contents[0]['parentReference']['siteId']
            contents = self.format_items(contents, site_id)
        return contents
    def get_graph_download_url(self, site_id: str, drive_id: str, item_id: str) -> str:
        """
        Constructs and returns the Microsoft Graph download URL for a file using application permissions.

        Args:
            site_id (str): The SharePoint site ID.
            drive_id (str): The document library (drive) ID.
            item_id (str): The file item ID.

        Returns:
            str: The '@microsoft.graph.downloadUrl' to download the file.
        """
        access_token = self.get_access_token()
        headers = {
            "Authorization": f"Bearer {access_token}"
        }

        url = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drives/{drive_id}/items/{item_id}"

        response = requests.get(url, headers=headers)
        if response.status_code == 200:
            data = response.json()
            return data.get("@microsoft.graph.downloadUrl")
        else:
            raise Exception(f"Failed to get download URL: {response.status_code} {response.text}")
        
    def download_shared_file_as_binary(self, graph_download_url: str) -> bytes:
        """
        Downloads the file content from the given Graph download URL and returns it as binary.

        Args:
            graph_download_url (str): The pre-authenticated download URL.

        Returns:
            bytes: The binary content of the file.
        """
        response = requests.get(graph_download_url, stream=True)
        if response.status_code == 200:
            file_stream = BytesIO(response.content)
            file_stream.seek(0)  # Set stream pointer to start
            return file_stream
        else:
            raise Exception(f"Failed to download file: {response.status_code} {response.text}")