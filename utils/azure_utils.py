import io
import os
import time
from datetime import datetime, timedelta
from urllib.parse import urlparse

from azure.storage.blob import (
    BlobClient,
    BlobSasPermissions,
    BlobServiceClient,
    ContainerClient,
    ContentSettings,
    generate_blob_sas,
)
from dotenv import load_dotenv

from config import get_config
from custom_logger import logger

config = get_config()
load_dotenv()


class AzureBlobUtilities:
    def __init__(self):
        """Initialize Azure Blob Service Client"""
        storage_account_name = config["AZURE_STORAGE_ACCOUNT"]["STORAGE_ACCOUNT_NAME"]
        access_key = config["AZURE_STORAGE_ACCOUNT"]["STORAGE_ACCOUNT_KEY"]
        container_name = config["AZURE_STORAGE_ACCOUNT"]["CONTAINER_NAME"]

        self.access_key = access_key

        connection_string = f"DefaultEndpointsProtocol=https;AccountName={storage_account_name};AccountKey={access_key};EndpointSuffix=core.windows.net"
        self.container_name = container_name

        self.blob_service_client = BlobServiceClient.from_connection_string(
            connection_string
        )
        self.container_client = self.blob_service_client.get_container_client(
            self.container_name
        )

    def upload_file(self, file, user_id, session_id, folder):
        """
        Upload a file to Azure Blob Storage under user_id/session_id/
        Returns the public URL of the uploaded file.
        """
        blob_path = f"{folder}/{user_id}/{session_id}/{file.filename}"  # Folder structure in Blob
        blob_client = self.container_client.get_blob_client(blob_path)

        try:
            # Set the content type based on the file extension
            content_type = "application/octet-stream"
            if file.filename.lower().endswith(".pdf"):
                content_type = "application/pdf"
            elif file.filename.lower().endswith(
                ".jpg"
            ) or file.filename.lower().endswith(".jpeg"):
                content_type = "image/jpeg"
            elif file.filename.lower().endswith(".png"):
                content_type = "image/png"

            blob_client.upload_blob(
                file,
                overwrite=True,
                content_settings=ContentSettings(content_type=content_type),
            )  # Upload with overwrite enabled
            logger.info(f"File {file.filename} uploaded successfully.")
        except Exception as e:
            logger.info(f"Error uploading file {file.filename}: {str(e)}")
            return None

        return blob_client.url

    def upload_audio_to_blob(self, audio_file_path):
        """Uploads audio to Azure Blob Storage and returns SAS URL"""

        # blob_name = os.path.basename(audio_file_path)
        blob_name = f"audio/{os.path.basename(audio_file_path)}"

        container_client = self.container_client
        blob_client = container_client.get_blob_client(blob_name)

        with open(audio_file_path, "rb") as data:
            blob_client.upload_blob(
                data,
                overwrite=True,
                content_settings=ContentSettings(content_type="audio/wav"),
                timeout=6000,  # Increased timeout
                max_concurrency=2,  # Optional: Reduce threads if network is unstable
            )

        sas_token = generate_blob_sas(
            account_name=blob_client.account_name,
            container_name=self.container_name,
            blob_name=blob_name,
            account_key=self.access_key,
            permission=BlobSasPermissions(read=True),
            expiry=datetime.utcnow() + timedelta(hours=2),
        )

        sas_url = f"{blob_client.url}?{sas_token}"
        return sas_url

    def read_file_from_blob_url_as_binary(self, blob_url):
        """
        Reads a file from Azure Blob Storage using its URL as a binary stream.
        :param blob_url: The full URL to the blob
        :return: io.BytesIO() containing the binary file content
        """
        try:
            logger.info(f"Reading file from Blob Storage URL: {blob_url}")

            # Create a BlobClient using the blob URL
            blob_client = BlobClient.from_blob_url(blob_url)

            # Download file into memory
            file_binary = io.BytesIO()
            blob_client.download_blob().download_to_stream(file_binary)

            file_binary.seek(0)  # Move to the beginning for reading
            return file_binary

        except Exception as e:
            logger.error(f"Error reading file from Blob Storage URL: {str(e)}")
            return None

    def read_file_from_blob_as_binary(self, blob_path):
        """
        Reads a file from Azure Blob Storage as a binary stream.
        :param blob_path: The relative path to the blob (not full URL)
        :return: io.BytesIO() containing the binary file content
        """
        try:
            logger.info(f"Reading file from Blob Storage: {blob_path}")

            blob_client = self.blob_service_client.get_blob_client(
                self.container_name, blob_path
            )

            # Download file into memory
            file_binary = io.BytesIO()
            blob_client.download_blob().download_to_stream(file_binary)

            file_binary.seek(0)  # Move to the beginning for reading
            return file_binary

        except Exception as e:
            logger.error(f"Error reading file from Blob Storage: {str(e)}")
            return None

    def upload_file_to_repo(self, file):
        """
        Upload a file to Azure Blob Storage under user_id/session_id/
        Returns the public URL of the uploaded file.
        """
        blob_path = f"repo/{file.filename}"  # Folder structure in Blob
        blob_client = self.container_client.get_blob_client(blob_path)

        try:
            # Set the content type based on the file extension
            content_type = "application/octet-stream"
            if file.filename.lower().endswith(".pdf"):
                content_type = "application/pdf"
            elif file.filename.lower().endswith(
                ".jpg"
            ) or file.filename.lower().endswith(".jpeg"):
                content_type = "image/jpeg"
            elif file.filename.lower().endswith(".png"):
                content_type = "image/png"

            blob_client.upload_blob(
                file,
                overwrite=True,
                content_settings=ContentSettings(content_type=content_type),
            )  # Upload with overwrite enabled
            logger.info(f"File {file.filename} uploaded successfully.")
        except Exception as e:
            logger.info(f"Error uploading file {file.filename}: {str(e)}")
            return None

        return blob_client.url  # Return the public URL of the uploaded file

    def copy_file_to_user_session(self, file_details, user_id, session_id):
        """
        Copy a blob from file_url to pdfs/user_id/session_id in Azure Blob Storage.

        :param file_url: Public URL of the source file.
        :param user_id: User ID to organize files.
        :param session_id: Session ID to group files.
        :return: Public URL of the copied file if successful, None otherwise.
        """
        try:
            file_url = file_details["url"]
            logger.info(f"Starting copy operation from {file_url} to user {user_id}, session {session_id}" )

            # Validate and ensure correct URL format
            parsed_url = urlparse(file_url)
            if not parsed_url.scheme:
                raise ValueError(f"Invalid URL format: {file_url}")
            logger.info(f"URL {file_url} is valid")

            # Extract the file name from the URL
            file_name = file_details["name"]
            logger.info(f"Extracted filename: {file_name}")

            # Define the destination path in Azure Blob Storage
            destination_path = f"pdfs/{user_id}/{session_id}/{file_name}"
            logger.info(f"Destination path: {destination_path}")

            # Create destination blob client
            destination_blob = self.container_client.get_blob_client(destination_path)
            logger.info(f"Destination blob client created for path: {destination_path}")

            # Start the copy operation
            destination_blob.start_copy_from_url(file_url)
            logger.info(f"Copying blob from {file_url} to {destination_path} initiated.")

            # Wait for the copy to complete
            while True:
                props = destination_blob.get_blob_properties()
                if props.copy.status != "pending":
                    break
                logger.info("Copy status is pending, waiting...")
                time.sleep(1)  # Sleep to avoid excessive requests

            if props.copy.status == "success":
                copied_url = f"https://{self.blob_service_client.account_name}.blob.core.windows.net/{self.container_name}/{destination_path}"
                logger.info(f"Copy operation completed successfully: {copied_url}")
                return copied_url
            else:
                logger.error(f"Copy failed with status: {props.copy.status}")
                return None

        except Exception as e:
            logger.error(f"Error copying blob from {file_url}: {str(e)}")
            return None

    def get_repo_files(self):
        """
        Retrieve all file URLs and names stored in the 'repo' directory in Azure Blob Storage.
        """
        files = []
        blob_prefix = "repo/"

        try:
            blobs = self.container_client.list_blobs(name_starts_with=blob_prefix)
            for blob in blobs:
                blob_url = f"https://{self.blob_service_client.account_name}.blob.core.windows.net/{self.container_name}/{blob.name}"
                files.append({"name": blob.name.strip("repo/"), "url": blob_url})
        except Exception as e:
            pass
            logger.info(f"Error retrieving repo files: {str(e)}")

        return files

    def get_files(self, user_id, session_id):
        """
        Retrieve all file URLs stored under user_id/session_id in Azure Blob Storage.
        """
        files = []
        blob_prefix = f"pdfs/{user_id}/{session_id}/"

        try:
            blobs = self.container_client.list_blobs(name_starts_with=blob_prefix)
            for blob in blobs:
                blob_url = f"https://{self.blob_service_client.account_name}.blob.core.windows.net/{self.container_name}/{blob.name}"
                files.append(blob_url)
        except Exception as e:
            pass
            logger.info(f"Error retrieving files: {str(e)}")

        return files

    def delete_files(self, user_id, session_id):
        """
        Delete all files stored under user_id/session_id in Azure Blob Storage.
        """
        blob_prefix = f"pdfs/{user_id}/{session_id}/"

        try:
            blobs = self.container_client.list_blobs(name_starts_with=blob_prefix)
            for blob in blobs:
                blob_client = self.container_client.get_blob_client(blob)
                blob_client.delete_blob()
                logger.info(f"Deleted blob: {blob.name}")
        except Exception as e:
            pass
            logger.info(f"Error deleting files: {str(e)}")

    def delete_all_sessions(self, user_id):
        """
        Delete all sessions stored under user_id in Azure Blob Storage.
        """
        blob_prefix = f"pdfs/{user_id}/"

        try:
            blobs = self.container_client.list_blobs(name_starts_with=blob_prefix)
            for blob in blobs:
                blob_client = self.container_client.get_blob_client(blob)
                blob_client.delete_blob()
                logger.info(f"Deleted blob: {blob.name}")
        except Exception as e:
            pass
            logger.info(f"Error deleting sessions: {str(e)}")



            
azure_blob_utils = AzureBlobUtilities()