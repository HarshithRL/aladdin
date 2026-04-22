import concurrent.futures
import hashlib
import io
import json
import os
import re
import time
import traceback
from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import uuid
import re
import time
import traceback
import pandas as pd
from typing import Dict, List, Any, Optional
from io import BytesIO
import logging

from azure.core.credentials import AzureKeyCredential
from azure.search.documents import SearchClient
from azure.search.documents.indexes import SearchIndexClient
from azure.search.documents.models import VectorizedQuery
from azure.search.documents.indexes.models import (
    SearchIndex,
    # SearchField,
    SearchFieldDataType,
    SimpleField,
    SearchableField,
    # SemanticConfiguration,
    # SemanticField,
    # SemanticPrioritizedFields,
    # SemanticSettings
)
from azure.ai.formrecognizer import DocumentAnalysisClient
from azure.storage.blob import BlobServiceClient
from azure.core.exceptions import ServiceRequestError, HttpResponseError
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from langchain.text_splitter import RecursiveCharacterTextSplitter
import requests
import tiktoken
from azure.ai.formrecognizer import DocumentAnalysisClient
from azure.core.credentials import AzureKeyCredential
from azure.core.exceptions import (
    HttpResponseError,
    ResourceExistsError,
    ServiceRequestError,
)
from azure.search.documents import SearchClient
from azure.search.documents.indexes import SearchIndexClient
from azure.search.documents.indexes.models import (
    SearchableField,
    SearchFieldDataType,
    SearchIndex,
    SimpleField,
)
from azure.storage.blob import (
    BlobClient,
    BlobServiceClient,
    ContainerClient,
    ContentSettings,
)
from langchain.text_splitter import RecursiveCharacterTextSplitter
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)
from datetime import datetime
from config import get_config
from custom_logger import logger
from utils.azure_utils import AzureBlobUtilities
# from utils.llm_utils import LLMUtilities
from utils.sharepoint_utilities import sharepointUtilities

config = get_config()
# llm_utils = LLMUtilities()
azure_utils = AzureBlobUtilities()
sharepoint_utils = None

def get_sharepoint_utils():
    global sharepoint_utils
    if sharepoint_utils is None:
        sharepoint_utils = sharepointUtilities()
    return sharepoint_utils


@dataclass
class DocumentMetadata:
    """Structured container for document metadata"""

    file_name: str
    user_id: str
    session_id: str
    total_chunks: int
    processing_timestamp: str
    document_size_bytes: Optional[int] = None
    mime_type: Optional[str] = None
    processing_status: str = "pending"


class AzureAiSearchUtilities:
    def __init__(self):
        """
        Initialize the Azure AI Search utilities with enhanced configuration.
        
        Args:
            config: Configuration dictionary containing all Azure service credentials
        """
        logger.info("Initializing Enhanced AzureAiSearchUtilities")
        
        # Azure AI Search configuration
        self.service_endpoint = config["AZURE_AI_SEARCH"]["SERVICE_ENDPOINT"]
        self.index_name = config["AZURE_AI_SEARCH"]["INDEX_NAME"]
        self.api_key = config["AZURE_AI_SEARCH"]["API_KEY"]
        self.credential = AzureKeyCredential(self.api_key)
        
        # Initialize clients
        self.index_client = SearchIndexClient(
            endpoint=self.service_endpoint, 
            credential=self.credential
        )
        self.search_client = SearchClient(
            endpoint=self.service_endpoint, 
            index_name=self.index_name, 
            credential=self.credential
        )
        
        # Document Intelligence configuration
        self.document_analysis_client = DocumentAnalysisClient(
            endpoint=config["AZURE_DOCUMENT_INTELLIGENCE"]["ENDPOINT"],
            credential=AzureKeyCredential(config["AZURE_DOCUMENT_INTELLIGENCE"]["KEY"])
        )
        
        # Azure Storage configuration
        storage_connection_string = (
            f"DefaultEndpointsProtocol=https;"
            f"AccountName={config['AZURE_STORAGE_ACCOUNT']['STORAGE_ACCOUNT_NAME']};"
            f"AccountKey={config['AZURE_STORAGE_ACCOUNT']['STORAGE_ACCOUNT_KEY']};"
            f"EndpointSuffix=core.windows.net"
        )
        self.container_name = config["AZURE_STORAGE_ACCOUNT"]["CONTAINER_NAME"]
        self.blob_service_client = BlobServiceClient.from_connection_string(storage_connection_string)
        self.container_client = self.blob_service_client.get_container_client(self.container_name)
        
        # Initialize index
        try:
            self._create_index_if_not_exists()
        except Exception as e:
            logger.warning(f"Azure AI Search index check failed (app will still start): {e}")

    def _create_index_if_not_exists(self) -> None:
        """
        Create Azure AI Search index with comprehensive schema and semantic configuration.
        """
        logger.info("Checking if index exists")
        existing_indexes = [index.name for index in self.index_client.list_indexes()]
        
        if self.index_name in existing_indexes:
            logger.info("Index already exists")
            return

        logger.info("Creating new index with enhanced schema")
        
        # Define comprehensive field schema
        fields = [
            # Core identification fields
            SimpleField(name="id", type=SearchFieldDataType.String, key=True),
            SimpleField(name="user_id", type=SearchFieldDataType.String, filterable=True),
            SimpleField(name="session_id", type=SearchFieldDataType.String, filterable=True),
            SimpleField(name="file_id", type=SearchFieldDataType.String, filterable=True, searchable=True),
            SimpleField(name="chunk_id", type=SearchFieldDataType.String, filterable=True, searchable=True),
            
            # File metadata fields
            SearchableField(name="file_name", type=SearchFieldDataType.String, filterable=True, retrievable=True),
            SimpleField(name="page_number", type=SearchFieldDataType.Int32, filterable=True, retrievable=True, sortable=True),
            SimpleField(name="sheet_name", type=SearchFieldDataType.String, filterable=True, retrievable=True),
            
            # Content fields
            SearchableField(
                name="content",
                type=SearchFieldDataType.String,
                searchable=True,
                retrievable=True,
                analyzer_name="en.microsoft"
            ),
            
            # Processing metadata
            SimpleField(name="type", type=SearchFieldDataType.String, filterable=True),
            SimpleField(name="total_chunks", type=SearchFieldDataType.Int32, filterable=True),
            SimpleField(name="created_at", type=SearchFieldDataType.DateTimeOffset, filterable=True, sortable=True),
            SimpleField(name="file_size", type=SearchFieldDataType.Int64, filterable=True, sortable=True),
            SimpleField(name="language", type=SearchFieldDataType.String, filterable=True)
        ]
        
        # # Define semantic configuration
        # semantic_config = SemanticConfiguration(
        #     name="semantic-config",
        #     prioritized_fields=SemanticPrioritizedFields(
        #         content_fields=[SemanticField(field_name="content")],
        #         keywords_fields=[SemanticField(field_name="file_name")],
        #         title_fields=[SemanticField(field_name="file_name")]
        #     )
        # )
        
        # semantic_settings = SemanticSettings(configurations=[semantic_config])
        
        # Create index
        index = SearchIndex(
            name=self.index_name,
            fields=fields,
            # semantic_settings=semantic_settings
        )
        
        self.index_client.create_index(index)
        logger.info("Enhanced index created successfully with semantic configuration")

    def _validate_file(self, file_stream, filename: str) -> Dict[str, Any]:
        """
        Validate uploaded file for security and compatibility.
        
        Args:
            file_stream: File stream object
            filename: Name of the file
            
        Returns:
            Dictionary with validation results
        """
        validation_result = {
            "is_valid": True,
            "error_message": "",
            "file_size": 0,
            "file_type": "",
        }
        
        # Check file size
        file_stream.seek(0, 2)  # Seek to end
        file_size = file_stream.tell()
        file_stream.seek(0)  # Reset to beginning
        
        validation_result["file_size"] = file_size
        
        if file_size == 0:
            validation_result["is_valid"] = False
            validation_result["error_message"] = "File is empty"
            return validation_result
        
        # Check file size limit (100MB)
        if file_size > 100 * 1024 * 1024:
            validation_result["is_valid"] = False
            validation_result["error_message"] = "File size exceeds 100MB limit"
            return validation_result
        
        # Determine file type
        file_extension = filename.lower().split('.')[-1]
        supported_extensions = ['pdf', 'docx', 'txt', 'csv', 'xlsx', 'xls', 'pptx']
        
        if file_extension not in supported_extensions:
            validation_result["is_valid"] = False
            validation_result["error_message"] = f"Unsupported file type: {file_extension}"
            return validation_result
        
        validation_result["file_type"] = file_extension
        
        # TODO: Add password protection check for PDFs/Office docs
        # This would require additional libraries like PyPDF2 or python-docx
        
        return validation_result
    
    def _extract_content_with_metadata(self, file_binary: bytes, filename: str, file_type: str) -> Dict[str, Any]:
        """
        Extract content from file with proper metadata tracking and generate file details string.
        Returns a dictionary with chunks and a human-readable file_details_string.
        """
        content_chunks = []
        file_details = []
        created_date = datetime.now().strftime("%Y-%m-%d")

        file_details.append(f"# 📄 {filename}") 
        file_details.append(f"- **Type:** {file_type}")  
        file_details.append(f"- **Uploaded on:** {created_date}")

        try:
            logger.info(f"Starting content extraction for file: {filename} (type: {file_type})")
                        
            if file_type in ['csv', 'xlsx', 'xls']:
                logger.info(f"Processing {file_type.upper()} with pandas for file: {filename}")

                if file_type == 'csv':
                    logger.info(f"Reading CSV file: {filename}")
                    df = pd.read_csv(BytesIO(file_binary))
                    logger.info(f"CSV loaded: {filename} (rows: {len(df)}, columns: {len(df.columns)})")
                    file_details.append(f"### 📊 Sheet: `sheet1`")
                    file_details.append(f"- {len(df)} rows, {len(df.columns)} columns ")
                    file_details.append(f"- Columns: {', '.join([str(x) for x in df.columns])}")
                    file_details.append("- Sample Rows:")
                    file_details.append(df.head(4).to_markdown(index=False))
                    file_details.append("\n---\n")

                    content_chunks.append({
                    "content": df.to_json(orient='records'),
                    "page_number": 1,
                    "sheet_name": "Sheet1",
                    "metadata": {"source": "csv", "rows": len(df), "columns": len(df.columns)}
                    })
                    logger.info(f"CSV content chunk created for {filename}")

                else:
                    logger.info(f"Reading Excel file: {filename}")
                    excel_file = pd.ExcelFile(BytesIO(file_binary))
                    logger.info(f"Excel file loaded: {filename} (sheets: {excel_file.sheet_names})")
                    for sheet_name in excel_file.sheet_names:
                        logger.info(f"Parsing sheet: {sheet_name} in {filename}")
                        df = excel_file.parse(sheet_name)
                        if not df.empty:
                            logger.info(f"Sheet {sheet_name} in {filename} has {len(df)} rows and {len(df.columns)} columns")
                            file_details.append(f"### 📊 Sheet: `{sheet_name}`")
                            file_details.append(f"- {len(df)} rows, {len(df.columns)} columns ")
                            file_details.append(f"- Columns: {', '.join([str(x) for x in df.columns])}")
                            file_details.append("- Sample Rows:")
                            file_details.append(df.head(4).to_markdown(index=False))
                            file_details.append("\n---\n")

                            content_chunks.append({
                            "content": df.to_json(orient='records'),
                            "page_number": 1,
                            "sheet_name": sheet_name,
                            "metadata": {"source": "excel_sheet", "rows": len(df), "columns": len(df.columns)}
                            })
                            logger.info(f"Excel content chunk created for sheet {sheet_name} in {filename}")
                        else:
                            logger.info(f"Sheet {sheet_name} in {filename} is empty, skipping.")
                            raise ValueError(f"Sheet {sheet_name} in {filename} is empty, no content to extract.")

            elif file_type == 'txt':
                logger.info(f"Processing TXT file: {filename}")
                content = file_binary.decode('utf-8', errors='replace')
                logger.info(f"Decoded TXT file: {filename} (length: {len(content)})")
                content_chunks.append({
                    "content": content,
                    "page_number": 1,
                    "sheet_name": None,
                    "metadata": {"source": "text"}
                })
                preview = content.replace("\n", " ")[:100]
                file_details.append(f"📄 Page 1: \"{preview}...\"")
                logger.info(f"TXT content chunk created for {filename}")

                logger.info(f"Content extraction completed for file: {filename}. Total chunks: {len(content_chunks)}")
            else:
                logger.info(f"Processing {file_type.upper()} with Document Intelligence for file: {filename}")
                poller = self.document_analysis_client.begin_analyze_document(
                    "prebuilt-read", file_binary
                )
                logger.info(f"Document Intelligence analysis started for {filename}")
                result = poller.result()
                logger.info(f"Document Intelligence analysis completed for {filename}")

                if result.pages:
                    logger.info(f"Found {len(result.pages)} pages in {filename}")
                    any_page_had_content = False

                    for page_num, page in enumerate(result.pages, 1):
                        page_content = "\n".join([line.content for line in page.lines]) if page.lines else ""
                        if page_content.strip():
                            any_page_had_content = True
                            logger.info(f"Extracted content for page {page_num} in {filename} (length: {len(page_content)})")
                            content_chunks.append({
                                "content": page_content,
                                "page_number": page_num,
                                "sheet_name": None,
                                "metadata": {
                                    "source": "page",
                                    "page_count": len(result.pages)
                                }
                            })
                            preview = page_content.replace("\n", " ")[:100]
                            file_details.append(f"📄 Page {page_num}: \"{preview}...\"")

                    if not any_page_had_content:
                        document_text = result.content.strip() if result.content else ""
                        if document_text:
                            logger.info(f"Falling back to document-level content for {filename} (length: {len(document_text)})")
                            content_chunks.append({
                                "content": document_text,
                                "page_number": 1,
                                "sheet_name": None,
                                "metadata": {
                                    "source": "document",
                                    "page_count": len(result.pages)
                                }
                            })
                            preview = document_text.replace("\n", " ")[:100]
                            file_details.append(f"📄 Document Content Preview: \"{preview}...\"")
                        else:
                            raise ValueError(f"No content found in any page or at the document level for {filename}")
                # No pages at all — fallback to document.content
                document_text = result.content.strip() if result.content else None
                if document_text:
                    logger.info(f"No pages found. Using document-level content for {filename}")
                    content_chunks.append({
                        "content": document_text,
                        "page_number": 1,
                        "sheet_name": None,
                        "metadata": {
                            "source": "document",
                            "page_count": 1
                        }
                    })
                    preview = document_text.replace("\n", " ")[:100]
                    file_details.append(f"📄 Document Content Preview: \"{preview}...\"")
                else:
                    raise ValueError(f"No content found in document {filename}")
        except Exception as e:
            logger.info(f"Error processing file: {filename} | {e}\n{traceback.format_exc()}")
            logger.error(traceback.format_exc())
            raise ValueError(str(e))

        return {
            "chunks": content_chunks,
            "file_details_string": "\n\n".join(file_details)
        }

    def _split_text_into_chunks(self, text: str, chunk_size: int = 800, overlap: int = 400) -> List[str]:
        """
        Split text into overlapping chunks with enhanced configuration.
        
        Args:
            text: Text to split
            chunk_size: Size of each chunk in characters
            overlap: Overlap between chunks
            
        Returns:
            List of text chunks
        """
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=overlap,
            separators=["\n\n", "\n", ". ", "? ", "! ", " ", ""],
            length_function=len,
        )
        
        chunks = text_splitter.split_text(text)
        
        # Filter out very small chunks
        filtered_chunks = [chunk for chunk in chunks if len(chunk.strip()) > 50]
        
        logger.info(f"Text split into {len(filtered_chunks)} chunks (filtered from {len(chunks)})")
        return filtered_chunks

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=60),
        retry=retry_if_exception_type((ServiceRequestError, HttpResponseError, ConnectionError, TimeoutError))
    )
    def _upload_document_batch(self, batch: List[Dict[str, Any]]) -> bool:
        """
        Upload a batch of documents to Azure AI Search with enhanced retry logic.
        
        Args:
            batch: List of documents to upload
            
        Returns:
            True if successful, False otherwise
        """
        if not batch:
            return True

        try:
            # Upload in smaller batches to avoid size limits
            batch_size = 100
            for i in range(0, len(batch), batch_size):
                sub_batch = batch[i:i + batch_size]
                result = self.search_client.upload_documents(documents=sub_batch)
                
                # Check if all documents succeeded
                failed_count = sum(1 for r in result if not r.succeeded)
                if failed_count > 0:
                    logger.warning(f"Failed to upload {failed_count} documents in batch")
                    return False
            
            logger.info(f"Successfully uploaded {len(batch)} documents")
            return True
            
        except Exception as e:
            logger.info(f"Error uploading batch: {str(e)}")
            raise

    def insert_document(
        self, 
        user_id: str, 
        session_id: str, 
        filename: str, 
        file_stream, 
        file_id: Optional[str] = None
    ) -> str:
        """
        Enhanced document insertion with comprehensive validation and metadata tracking.
        
        Args:
            user_id: User ID
            session_id: Session ID
            filename: Name of the file
            model_name: Model name for processing
            file_stream: File stream object
            file_id: Optional file ID (generated if not provided)
            
        Returns:
            Status string ("success" or "failed")
        """
        try:
            logger.info(f"Inserting document: user_id={user_id}, session_id={session_id}, filename={filename}")
            
            # Generate file_id if not provided
            if not file_id:
                raise ValueError("File id is not present in the request body")
            
            # Validate file
            validation_result = self._validate_file(file_stream, filename)
            if not validation_result["is_valid"]:
                logger.info(f"File validation failed: {validation_result['error_message']}")
                raise ValueError("failed to valide the file: " + validation_result["error_message"])
            
            # Read file content
            file_binary = file_stream.read()
            file_stream.seek(0)  # Reset stream position
            
            # Extract content with metadata
            extracted_content = self._extract_content_with_metadata(
                file_binary, filename, validation_result["file_type"]
            )
            content_chunks, file_details_string = extracted_content["chunks"], extracted_content["file_details_string"]
            
            if not content_chunks:
                logger.info("No content extracted from file")
                raise ValueError("Found no content to extract from the document")
            
            # Process all content chunks
            all_documents = []
            
            for page_content in content_chunks:
                # Split content into smaller chunks if needed
                if len(page_content["content"]) > 3000:  # Large content needs chunking
                    if validation_result["file_type"] not in ['csv', 'xlsx', 'xls']:
                        text_chunks = self._split_text_into_chunks(page_content["content"])
                    else:
                        text_chunks = [page_content["content"]]
                else:
                    text_chunks = [page_content["content"]]
                
                # Create documents for each chunk
                for chunk_idx, chunk_text in enumerate(text_chunks):
                    
                    sheet_name = page_content.get('sheet_name')
                    if sheet_name is not None:
                        clean_sheet_name = re.sub(r'[^A-Za-z0-9_]', '', str(sheet_name).replace(" ", "_"))
                        chunk_id = f"{file_id}-{page_content.get('page_number', 1)}-{clean_sheet_name}-{chunk_idx}"
                    else:
                        chunk_id = f"{file_id}-{page_content.get('page_number', 1)}-{chunk_idx}"
                    
                    document = {
                        "id": chunk_id,
                        "user_id": str(user_id),
                        "session_id": str(session_id),
                        "file_id": str(file_id),
                        "chunk_id": chunk_id,
                        "file_name": filename,
                        "page_number": page_content.get("page_number", 1),
                        "sheet_name": page_content.get("sheet_name"),
                        "content": chunk_text,
                        "type": "chunk",
                        "total_chunks": len(text_chunks),
                        "created_at": datetime.now().strftime("%Y-%m-%d"),  # Current UTC timestamp as string
                        "file_size": validation_result["file_size"],
                        "language": "en"  # Could be enhanced with language detection
                    }
                    
                    all_documents.append(document)
            
            if not all_documents:
                logger.info("No valid documents created after processing")
                raise ValueError("Failed to process document")
            
            logger.info(f"Created {len(all_documents)} documents for upload")
            
            # Upload documents
            success = self._upload_document_batch(all_documents)
            
            if success:
                logger.info(f"Successfully processed and uploaded {filename}")
                return "success", file_details_string
            else:
                logger.info(f"Failed to upload documents for {filename}")
                raise ValueError("failed to upload documents to Azure AI Search")
        except ValueError as ve:
            logger.info(f"ValueError processing document {filename}: {str(ve)}")
            raise ve
        except Exception as e:
            error_stack = traceback.format_exc()
            logger.info(f"Error processing document {filename}: {str(e)}\n{error_stack}")
            raise ValueError(f"Error processing document {filename}: {str(e)}\n{error_stack}")  

    def query_documents(
        self,
        query: str,
        user_id: str,
        session_id: str,
        top_k: int = 20,
        rerank_top_k: int = 20,
        file_id: Optional[str] = None,
        page_number: Optional[str] = None,
        sheet_name: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Enhanced query with semantic search and optional filtering.

        Args:
            query: Search query
            user_id: User ID
            session_id: Session ID
            top_k: Number of initial results
            rerank_top_k: Number of final results after reranking
            file_id: Optional file ID to filter results
            page_number: Optional page number to filter results
            sheet_name: Optional sheet name (for spreadsheets) to filter results

        Returns:
            List of search results with metadata
        """
        logger.info(f"Querying documents: user_id={user_id}, session_id={session_id}, query='{query}', file_id={file_id}, page_number={page_number}, sheet_name={sheet_name}")

        # Base filter
        filters = [f"user_id eq '{user_id}'", f"session_id eq '{session_id}'", "type eq 'chunk'"]

        if file_id:
            filters.append(f"file_id eq '{file_id}'")
        if (page_number is not None) and (page_number.strip() != ""):
            filters.append(f"page_number eq {page_number}")
        if sheet_name:
            filters.append(f"sheet_name eq '{sheet_name}'")

        base_filter = " and ".join(filters)

        all_results = []

        logger.info(f"Performing search with filter: {base_filter}")
        results = self.search_client.search(
            search_text=query,
            filter=base_filter,
            select=[
                "content", "file_name", "file_id", "chunk_id",
                "page_number", "sheet_name", "total_chunks", "type"
            ],
            top=top_k,
        )

        for result in results:
            result_dict = {
                "content": result["content"],
                "chunk_id": result["chunk_id"],
                "file_name": result["file_name"],
                "total_chunks": result["total_chunks"],
                "type": result["type"],
                "file_id": result["file_id"],
                "page_number": result.get("page_number"),
                "sheet_name": result.get("sheet_name"),
                "score": result.get("@search.score", 0.0),
                "reranker_score": result.get("@search.reranker_score", 0.0)
            }
            all_results.append(result_dict)

        logger.info(f"Semantic search returned {len(all_results)} results")
    
        # Deduplicate and rerank
        unique_results = {}
        for result in all_results:
            chunk_id = result["chunk_id"]
            if chunk_id not in unique_results:
                unique_results[chunk_id] = result
            else:
                existing = unique_results[chunk_id]
                curr_score = result.get("reranker_score", 0.0) or result.get("score", 0.0)
                prev_score = existing.get("reranker_score", 0.0) or existing.get("score", 0.0)
                if curr_score > prev_score:
                    unique_results[chunk_id] = result

        final_results = sorted(
            unique_results.values(),
            key=lambda x: x.get("reranker_score", 0.0) or x.get("score", 0.0),
            reverse=True
        )[:rerank_top_k]

        logger.info(f"Returning {len(final_results)} final results")

        return final_results


    def delete_documents(self, user_id: str, session_id: str, file_id: str) -> str:
        """
        Enhanced document deletion with proper error handling.
        
        Args:
            user_id: User ID
            session_id: Session ID
            file_id: File ID to delete
            
        Returns:
            Status string ("success" or "failed")
        """
        try:
            logger.info(f"Deleting documents: user_id={user_id}, file_id={file_id}")
            
            # Query documents to delete
            filter_query = f"user_id eq '{user_id}' and file_id eq '{file_id}'"
            results = self.search_client.search(search_text="*", filter=filter_query, select=["id"])
            
            # Collect document IDs
            document_ids = [doc["id"] for doc in results]
            
            if not document_ids:
                logger.warning("No documents found to delete")
                return "failed"
            
            logger.info(f"Found {len(document_ids)} documents to delete")
            
            # Delete documents in batches
            batch_size = 100
            for i in range(0, len(document_ids), batch_size):
                batch_ids = document_ids[i:i + batch_size]
                batch = [{"@search.action": "delete", "id": doc_id} for doc_id in batch_ids]
                
                result = self.search_client.upload_documents(documents=batch)
                
                # Check for failures
                failed_count = sum(1 for r in result if not r.succeeded)
                if failed_count > 0:
                    logger.warning(f"Failed to delete {failed_count} documents in batch")
            
            logger.info("Documents deleted successfully")
            return "success"
            
        except Exception as e:
            logger.info(f"Failed to delete documents for file_id {file_id}: {str(e)}")
            return "failed"

    def get_unique_file_names(self, user_id: str, session_id: str) -> List[str]:
        """
        Get unique file names for a user session.
        
        Args:
            user_id: User ID
            session_id: Session ID
            
        Returns:
            List of unique file names
        """
        try:
            filter_query = f"user_id eq '{user_id}' and session_id eq '{session_id}'"
            results = self.search_client.search(
                search_text="*", 
                filter=filter_query, 
                select=["file_name"],
                top=1000
            )
            
            unique_file_names = list(set(result["file_name"] for result in results))
            logger.info(f"Found {len(unique_file_names)} unique file names")
            return unique_file_names
            
        except Exception as e:
            logger.info(f"Error fetching unique file names: {str(e)}")
            return []


    def _rerank_results(self, results, query, top_k):
        """
        Rerank search results based on relevance scoring.
        
        Args:
            results: List of search results
            query: Original query
            top_k: Number of top results to return
        
        Returns:
            List of reranked results
        """
        if not results:
            return []
        
        # Simple reranking based on multiple factors
        def calculate_relevance_score(result):
            base_score = result.get("semantic_score", result.get("score", 0.0))
            
            # Boost semantic search results
            if result.get("search_type") == "semantic":
                base_score *= 1.2
            
            # Simple text relevance scoring
            content = result.get("content", "").lower()
            query_terms = query.lower().split()
            
            # Count query term matches
            term_matches = sum(1 for term in query_terms if term in content)
            term_boost = (term_matches / len(query_terms)) * 0.3 if query_terms else 0
            
            # Calculate final score
            final_score = base_score + term_boost
            
            return final_score
        
        # Sort by relevance score
        scored_results = []
        for result in results:
            relevance_score = calculate_relevance_score(result)
            result["relevance_score"] = relevance_score
            scored_results.append(result)
        
        # Sort by relevance score (descending)
        scored_results.sort(key=lambda x: x["relevance_score"], reverse=True)
        
        # Return top k results
        return scored_results[:top_k]

    
    # def rewrite_query_for_document_rag(
    #     self,
    #     current_question,
    #     previous_question,
    #     previous_answer,
    #     current_file_name,
    #     all_files_in_session,
    #     model_name,
    # ):
    #     # Step 1: Construct the LLM prompt
    #     prompt = (
    #         f"You are assisting in retrieving relevant document chunks to answer user questions in a Retrieval-Augmented Generation (RAG) system.\n"
    #         f"The user's current question is: '{current_question}'.\n"
    #         f"The previous question was: '{previous_question}'.\n"
    #         f"The previous answer provided was: '{previous_answer}'.\n\n"
    #         f"The current document under evaluation is: {current_file_name}.\n"
    #         f"Other documents available in the session are: {all_files_in_session}.\n"
    #         f"Each chunk in the document store includes the file name and chunk text.\n\n"
    #         f"Your tasks:\n"
    #         f"1. If the current document is relevant and contains helpful information to answer the user's question:\n"
    #         f"   - Rewrite the current question into a highly optimized, keyword-based search query.\n"
    #         f"   - Include important keywords, topics, entities, synonyms, and related terms.\n"
    #         f"   - Expand any abbreviations (e.g., LLM → Large Language Model).\n"
    #         f"   - Include the current file name to filter the results appropriately.\n"
    #         f"2. If the current document is not relevant to the user's question, return exactly: 'NO_SEARCH_REQUIRED'.\n\n"
    #         f"Important Instructions:\n"
    #         f"- Do NOT explain your reasoning.\n"
    #         f"- Only output the optimized keywords (space-separated) or 'NO_SEARCH_REQUIRED'.\n\n"
    #         f"### Examples ###\n"
    #         f"Example 1:\n"
    #         f"Current question: 'What is this data about'\n"
    #         f"Previous question: ''\n"
    #         f"Previous answer: ''\n"
    #         f"Optimized Query: '.pdf .docx .xlsx .pptx {current_file_name}'\n\n"
    #         f"Example 2:\n"
    #         f"Current question: 'Summarize GDPR compliance requirements.'\n"
    #         f"Previous question: 'What is GDPR?'\n"
    #         f"Previous answer: 'GDPR stands for General Data Protection Regulation, a law about data privacy.'\n"
    #         f"Optimized Query: 'GDPR compliance requirements data privacy legal regulations {current_file_name}'\n\n"
    #         f"Example 3:\n"
    #         f"Current question: 'Explain cybersecurity trends in 2025.'\n"
    #         f"Previous question: 'Overview of cybersecurity basics.'\n"
    #         f"Previous answer: 'Cybersecurity involves protecting systems and data from cyber threats.'\n"
    #         f"Optimized Query: 'cybersecurity trends 2025 cyber attacks data protection security technologies {current_file_name}'\n\n"
    #         f"Example 4:\n"
    #         f"Current question: 'What are the benefits of renewable energy?'\n"
    #         f"Previous question: 'Define renewable energy.'\n"
    #         f"Previous answer: 'Renewable energy refers to energy from natural sources like solar and wind.'\n"
    #         f"Optimized Query: 'renewable energy benefits solar power wind energy sustainability green energy {current_file_name}'\n\n"
    #         f"Example 5:\n"
    #         f"Current question: 'List top social media platforms.'\n"
    #         f"Previous question: 'What is social media?'\n"
    #         f"Previous answer: 'Social media refers to websites and applications that allow users to create and share content.'\n"
    #         f"Optimized Query: 'social media platforms Facebook Instagram Twitter LinkedIn {current_file_name}'\n\n"
    #         f"If the document is not relevant, return: 'NO_SEARCH_REQUIRED'.\n"
    #     )

    #     logger.info(f"Generated prompt for query rewriting: {prompt}")

    #     # Step 2: Call LLM
    #     messages = [{"role": "user", "content": prompt}]
    #     rewritten_query = llm_utils.invoke_llm(messages, model_name)

    #     logger.info(f"Rewritten query for RAG search: {rewritten_query}")

    #     # Step 3: Handle 'NO_SEARCH_REQUIRED'
    #     if rewritten_query.strip() == "NO_SEARCH_REQUIRED":
    #         return None

    #     return rewritten_query
    def insert_document_from_graph_url(
        self, user_id: str, session_id: str, filename: str, model_name: str, file_url
    ) -> Dict[str, Any]:
        """
        Insert a document directly from uploaded file (no blob needed).

        Args:
            user_id: User ID
            session_id: Session ID
            filename: Name of the file
            model_name: Model name
            file_stream: Flask FileStorage object from upload

        Returns:
            Dictionary with processing results
        """
        start_time = time.time()
        processing_timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        status = {
            "success": False,
            "total_chunks": 0,
            "processing_time_seconds": 0,
            "error": None,
            "document_id": f"{user_id}_{session_id}_{filename}",
        }

        try:
            logger.info(f"Inserting uploaded document for user_id={user_id}, session_id={session_id}, filename={filename}")

            if not user_id or not session_id or not filename:
                raise ValueError("Missing required parameters.")

            file_binary = get_sharepoint_utils().download_graph_file_as_binary(
                file_url
            )
            poller = self.document_analysis_client.begin_analyze_document(
                "prebuilt-read", file_binary
            )
            result = poller.result()

            # Extract and validate content
            document_text = result.content
            if not document_text or document_text.isspace():
                raise ValueError("No extractable content in document")

            logger.info(f"Extracted {len(document_text)} characters of text from document")

            start_time_split = time.time()
            chunks = self._split_text_into_chunks(document_text, model_name)
            logger.info(f"Text splitting completed in {time.time() - start_time_split:.2f} seconds")

            start_time_summary = time.time()
            summary = chunks[0]  # self._get_document_summary(chunks, {"file_name":"new file"}, model_name)
            logger.info(f"Summary generation completed in {time.time() - start_time_summary:.2f} seconds")

            start_time_metadata = time.time()
            extracted_metadatas = chunks  # self._extract_document_metadata(chunks, filename, model_name)
            logger.info(f"Metadata extraction completed in {time.time() - start_time_metadata:.2f} seconds")

            start_time_semantic = time.time()
            semantic_chunks = chunks
            logger.info(f"Semantic chunking completed in {time.time() - start_time_semantic:.2f} seconds")

            # Use deterministic batching to enable idempotent operations
            all_documents = []

            # 1. Add summary three times
            doc = {"content": summary, "type": "summary"}
            all_documents.append(doc)

            # 2. Add all extracted metadata strings once each
            for meta in extracted_metadatas:
                doc = {"content": meta, "type": "metadata"}
                all_documents.append(doc)

            # 3. Add normal chunks
            chunk_documents = [
                {"content": f"{filename} \n\n {chunk}", "type": "chunk"}
                for chunk in semantic_chunks
            ]
            all_documents.extend(chunk_documents)

            logger.info(f"all_documents:-> \n\n{all_documents}")

            doc_id = 0
            upload_success = True
            batches = []
            cleaned_file_name = re.sub(r"[^a-z]", "", filename.lower())
            # Organize into batches
            for current_document in all_documents:
                document = {
                    "id": f"{cleaned_file_name}_{doc_id}",
                    "file_name": filename,
                    "user_id": str(user_id),
                    "session_id": str(session_id),
                    "chunk_id": f"{cleaned_file_name}_{doc_id}",
                    "total_chunks": str(len(all_documents)),
                }
                document["content"] = current_document["content"]
                document["type"] = current_document["type"]
                doc_id += 1
                batches.append(document)

            self._upload_document_batch(batches)

            # Update status
            status["success"] = upload_success
            status["total_chunks"] = len(all_documents)
            status["extracted_metadata"] = bool(extracted_metadatas)
            status["has_summary"] = bool(summary)

            # Log success
            logger.info( f"Processed document {filename} with {len(all_documents)} chunks, ")

            return status

        except Exception as e:
            error_stack = traceback.format_exc()
            logger.info(f"Error processing document {filename}: {str(e)}\n{error_stack}" )

            # Update status
            status["success"] = False
            status["error"] = str(e)

            raise Exception(
                f"Error processing document: status:{status} Error:{str(e)}"
            )
        finally:
            # Record processing time
            processing_time = time.time() - start_time
            status["processing_time_seconds"] = processing_time
            logger.info( f"Document processing completed in {processing_time:.2f} seconds" )

    def insert_document_from_download_url(
        self,
        user_id: str,
        session_id: str,
        filename: str,
        model_name: str,
        download_url: str,
    ) -> Dict[str, Any]:
        """
        Insert a document directly from a direct download URL (no authentication needed).
        This is useful for shared files that provide a direct download URL.

        Args:
            user_id: User ID
            session_id: Session ID
            filename: Name of the file
            model_name: Model name
            download_url: Direct download URL that doesn't require authentication

        Returns:
            Dictionary with processing results
        """
        start_time = time.time()
        processing_timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        status = {
            "success": False,
            "total_chunks": 0,
            "processing_time_seconds": 0,
            "error": None,
            "document_id": f"{user_id}_{session_id}_{filename}",
        }

        try:
            logger.info( f"Inserting document from download URL for user_id={user_id}, session_id={session_id}, filename={filename}" )

            if not user_id or not session_id or not filename or not download_url:
                raise ValueError("Missing required parameters.")

            # Download file content directly from URL (no auth needed)
            response = requests.get(download_url)
            if response.status_code != 200:
                raise Exception(
                    f"Failed to download file. Status: {response.status_code}, Message: {response.text}"
                )

            file_binary = io.BytesIO(response.content)

            # Process document with Form Recognizer
            poller = self.document_analysis_client.begin_analyze_document(
                "prebuilt-read", file_binary
            )
            result = poller.result()

            # Extract and validate content
            document_text = result.content
            if not document_text or document_text.isspace():
                raise ValueError("No extractable content in document")

            logger.info( f"Extracted {len(document_text)} characters of text from document" )

            start_time_split = time.time()
            chunks = self._split_text_into_chunks(document_text, model_name)
            logger.info( f"Text splitting completed in {time.time() - start_time_split:.2f} seconds" )

            start_time_summary = time.time()
            summary = chunks[0]
            logger.info( f"Summary generation completed in {time.time() - start_time_summary:.2f} seconds" )

            start_time_metadata = time.time()
            extracted_metadatas = chunks
            logger.info( f"Metadata extraction completed in {time.time() - start_time_metadata:.2f} seconds" )

            start_time_semantic = time.time()
            semantic_chunks = chunks
            logger.info( f"Semantic chunking completed in {time.time() - start_time_semantic:.2f} seconds" )

            # Use deterministic batching to enable idempotent operations
            all_documents = []

            # 1. Add summary three times
            doc = {"content": summary, "type": "summary"}
            all_documents.append(doc)

            # 2. Add all extracted metadata strings once each
            for meta in extracted_metadatas:
                doc = {"content": meta, "type": "metadata"}
                all_documents.append(doc)

            # 3. Add normal chunks
            chunk_documents = [
                {"content": f"{filename} \n\n {chunk}", "type": "chunk"}
                for chunk in semantic_chunks
            ]
            all_documents.extend(chunk_documents)

            logger.info("\n" * 5)
            logger.info(f"all_documents:-> \n\n{all_documents}")
            logger.info("\n" * 5)

            doc_id = 0
            upload_success = True
            batches = []
            cleaned_file_name = re.sub(r"[^a-z]", "", filename.lower())

            # Organize into batches
            for current_document in all_documents:
                document = {
                    "id": f"{cleaned_file_name}_{doc_id}",
                    "file_name": filename,
                    "user_id": str(user_id),
                    "session_id": str(session_id),
                    "chunk_id": f"{cleaned_file_name}_{doc_id}",
                    "total_chunks": str(len(all_documents)),
                }
                document["content"] = current_document["content"]
                document["type"] = current_document["type"]
                doc_id += 1
                batches.append(document)

            self._upload_document_batch(batches)

            # Update status
            status["success"] = True
            status["total_chunks"] = len(all_documents)
            status["extracted_metadata"] = bool(extracted_metadatas)
            status["has_summary"] = bool(summary)

            # Log success
            logger.info(f"Processed document {filename} with {len(all_documents)} chunks")

            return len(all_documents)

        except Exception as e:
            error_stack = traceback.format_exc()
            logger.info( f"Error processing document {filename}: {str(e)}\n{error_stack}" )

            # Update status
            status["success"] = False
            status["error"] = str(e)

            raise Exception(
                f"Error processing document: status:{status} Error:{str(e)}"
            )
        finally:
            # Record processing time
            processing_time = time.time() - start_time
            status["processing_time_seconds"] = processing_time
            logger.info( f"Document processing completed in {processing_time:.2f} seconds" )

            return status["total_chunks"]



azure_search = AzureAiSearchUtilities()