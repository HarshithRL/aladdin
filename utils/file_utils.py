import os

from flask import jsonify, request

from utils.azure_utils import AzureBlobUtilities
from custom_logger import logger

azure_utils = AzureBlobUtilities()


class fileUtilities:
    def __init__(self):
        pass

    def add_to_repo(self, file):
        try:
            if file.filename == "":
                logger.error("No selected file")
                return jsonify({"message": "No selected file"}), 400

            # Use azure_utils to upload the file
            file_url = azure_utils.upload_file_to_repo(file)
            if file_url is None:
                logger.error("Error uploading file to Azure")
                return jsonify({"message": "Error uploading file to Azure"}), 500

            logger.info(f"File {file.filename} uploaded successfully to {file_url}")
            return jsonify(
                {"message": "File uploaded successfully", "file_url": file_url}
            ), 200

        except Exception as e:
            logger.error(f"Error uploading file: {e}")
            return jsonify({"message": "Error uploading file"}), 500

    def upload_file(self, user_id, session_id, file):
        try:
            if file.filename == "":
                logger.error("No selected file")
                return jsonify({"message": "No selected file"}), 400

            # Use azure_utils to upload the file
            file_url = azure_utils.upload_file(file, user_id, session_id, folder="pdfs")
            
            if file_url is None:
                logger.error("Error uploading file to Azure")
                return jsonify({"message": "Error uploading file to Azure"}), 500

            logger.info(f"File {file.filename} uploaded successfully to {file_url}")
            return True

        except Exception as e:
            logger.error(f"Error uploading file: {e}")
            return False

    def get_files(self, user_id, session_id):
        """Retrieve the list of file URLs stored in Azure Blob Storage."""
        logger.info(user_id, session_id)
        logger.info(f"files from azure {azure_utils.get_files(user_id, session_id)}")
        return azure_utils.get_files(user_id, session_id)

    def delete_file(self, user_id, session_id, file_name):
        """Delete a file from Azure Blob Storage."""
        try:
            result = azure_utils.delete_file(user_id, session_id, file_name)
            if result:
                logger.info(f"File {file_name} deleted successfully.")
                return jsonify({"message": "File deleted successfully"}), 200
            else:
                logger.error(f"Failed to delete file {file_name}.")
                return jsonify({"message": "Failed to delete file"}), 500
        except Exception as e:
            logger.error(f"Error deleting file: {e}")
            return jsonify({"message": "Error deleting file"}), 500
