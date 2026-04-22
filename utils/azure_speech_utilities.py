import io
import json
import logging
import os
import subprocess
import threading
import time
import uuid

import azure.cognitiveservices.speech as speechsdk
import requests
from moviepy import VideoFileClip
# from pydub import AudioSegment

from config import get_config
from custom_logger import logger
from utils.azure_utils import AzureBlobUtilities
from utils.session_items_utils import session_items_utils

config = get_config()
azure_utils = AzureBlobUtilities()


class AzureSpeechUtilities:
    def __init__(self):
        logger.info("Initializing AzureSpeechUtilities")
        self.speech_key = config["AZURE_SPEECH_SERVICE"]["KEY"]
        self.speech_region = config["AZURE_SPEECH_SERVICE"]["REGION"]

    def extract_audio(self, video_path):
        """Extracts audio from a video file using FFmpeg and returns a WAV audio stream"""
        logger.info(f"Extracting audio from video file: {video_path}")
        audio_output = f"{video_path}.wav"

        # Run FFmpeg to extract audio from video
        command = [
            "ffmpeg",
            "-i",
            video_path,
            "-acodec",
            "pcm_s16le",
            "-ar",
            "16000",
            "-ac",
            "1",
            "-f",
            "wav",
            audio_output,
            "-y",
        ]
        logger.info(f"Running FFmpeg command: {' '.join(command)}")
        subprocess.run(
            command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True
        )

        # Read the extracted audio file into a stream
        logger.info(f"Reading extracted audio file: {audio_output}")
        with open(audio_output, "rb") as audio_file:
            audio_stream = io.BytesIO(audio_file.read())

        # Clean up temporary audio file
        logger.info(f"Removing temporary audio file: {audio_output}")
        os.remove(audio_output)

        return audio_stream

    def extract_audio_old(self, video_path):
        """Extract audio from video file using moviepy and return as WAV audio stream."""
        logger.info(f"Extracting audio using moviepy from video file: {video_path}")
        audio_output = f"{video_path}.wav"

        try:
            clip = VideoFileClip(video_path)
            clip.audio.write_audiofile(
                audio_output, fps=16000, nbytes=2, codec="pcm_s16le"
            )
            clip.close()

            logger.info(f"Reading extracted audio file: {audio_output}")
            with open(audio_output, "rb") as audio_file:
                audio_stream = io.BytesIO(audio_file.read())
                audio_stream.seek(0)  # Reset to start

            logger.info(f"Removing temporary audio file: {audio_output}")
            # os.remove(audio_output)

            return audio_stream

        except Exception as e:
            logger.error(f"Error during audio extraction: {str(e)}")
            raise e

    def process_video_file(self, user_id, session_id, video_path):
        """Handles full process: Extract audio -> Transcribe"""
        logger.info(f"Starting process_video_file for user_id: {user_id}, session_id: {session_id}, video_path: {video_path}")

        logger.info("Step 1: Extracting audio from video file")
        audio_stream = self.extract_audio(video_path)
        logger.info("Step 1 completed: Audio extracted successfully")

        logger.info("Step 2: Transcribing audio in chunks")
        transcription = self.transcribe_audio_in_chunks(
            user_id, session_id, audio_stream
        )
        logger.info(f"Step 2 completed: Audio transcription completed. Transcript: {transcription}")

        logger.info(f"Process completed for video file: {video_path}. Full transcription result obtained.")
        return transcription

    def transcribe_audio_in_chunks(
        self, user_id, session_id, audio_stream, chunk_length_ms=300000
    ):  # 5 minutes chunks
        """Splits audio into chunks and transcribes each"""
        log_prefix = "[AzureSpeechUtilities]"
        temp_audio_path = (
            f"./uploads/{user_id}/{session_id}/full_audio_{uuid.uuid4()}.wav"
        )
        try:
            logger.info(f"{log_prefix} Writing full audio to temp path: {temp_audio_path}")
            with open(temp_audio_path, "wb") as f:
                f.write(audio_stream.getbuffer())
        except Exception as e:
            logger.error(f"{log_prefix} Error writing full audio to temp path: {e}")
            return None

        try:
            audio = None #AudioSegment.from_wav(temp_audio_path)
            # os.remove(temp_audio_path)  # Clean up full audio file
        except Exception as e:
            logger.error(f"{log_prefix} Error loading or removing temp audio file: {e}")
            return None

        logger.info(f"{log_prefix} Splitting audio into chunks of {chunk_length_ms / 60000} minutes")
        full_transcript = ""
        try:
            chunks = [
                audio[i : i + chunk_length_ms]
                for i in range(0, len(audio), chunk_length_ms)
            ]
            total_chunks = len(chunks)
        except Exception as e:
            logger.error(f"{log_prefix} Error calculating total chunks: {e}")
            return None

        for i, chunk in enumerate(audio[::chunk_length_ms]):
            chunk_path = (
                f"./uploads/{user_id}/{session_id}/chunk_{i}_{uuid.uuid4()}.wav"
            )
            try:
                chunk.export(chunk_path, format="wav")
                logger.info(f"{log_prefix} Exported chunk {i} to {chunk_path}")
            except Exception as e:
                logger.error(f"{log_prefix} Error exporting chunk {i}: {e}")
                return None

            try:
                blob_url = azure_utils.upload_audio_to_blob(chunk_path)
                logger.info(f"{log_prefix} Uploaded chunk {i} to Blob Storage at: {blob_url}")
            except Exception as e:
                logger.error(
                    f"{log_prefix} Error uploading chunk {i} to Blob Storage: {e}"
                )
                return None

            try:
                chunk_transcription = self._transcribe_blob(blob_url, i)
                if not chunk_transcription:
                    logger.error(f"{log_prefix} Transcription failed for chunk {i}")
                    return None
                full_transcript += f"\n\nChunk {i+1}:\n{chunk_transcription}"
            except Exception as e:
                logger.error(f"{log_prefix} Error transcribing chunk {i}: {e}")
                return None

            try:
                pass
                # os.remove(chunk_path)  # Clean up
                logger.info(f"{log_prefix} Removed chunk file {chunk_path}")
            except Exception as e:
                logger.warning(
                    f"{log_prefix} Could not remove chunk file {chunk_path}: {e}"
                )

            try:
                completed_percentage = int(((i + 1) / total_chunks) * 100)
                session_item_details = (
                    session_items_utils.get_last_session_item_details(session_id)
                )
                session_item_details["status"] = (
                    f"{session_item_details['status']} ({completed_percentage}%)"
                )
                session_items_utils.update_last_session_item_details(
                    session_id, session_item_details
                )
                logger.info(f"{log_prefix} Updated session item details for chunk {i}")
            except Exception as e:
                logger.error(
                    f"{log_prefix} Error updating session item details for chunk {i}: {e}"
                )

        return full_transcript if full_transcript.strip() else None

    def _transcribe_blob(self, blob_url, chunk_number):
        """Handles Azure Batch Transcription API call for a single chunk"""
        log_prefix = f"[AzureSpeechUtilities] Chunk {chunk_number}"
        transcription_id = str(uuid.uuid4())
        transcription_url = f"https://{self.speech_region}.api.cognitive.microsoft.com/speechtotext/v3.1/transcriptions"
        headers = {
            "Ocp-Apim-Subscription-Key": self.speech_key,
            "Content-Type": "application/json",
        }

        transcription_payload = {
            "displayName": f"Transcription-{transcription_id}",
            "description": "Speaker Diarization",
            "locale": "en-US",
            "contentUrls": [blob_url],
            "properties": {
                "diarizationEnabled": True,
                "wordLevelTimestampsEnabled": True,
                "punctuationMode": "DictatedAndAutomatic",
            },
        }

        logger.info(f"{log_prefix} Submitting transcription request")
        response = requests.post(
            transcription_url, headers=headers, json=transcription_payload
        )

        if response.status_code not in [200, 201, 202]:
            logger.error(
                f"{log_prefix} Transcription request failed: {response.status_code}, {response.text}"
            )
            return None

        transcription_location = response.headers["Location"]
        logger.info(f"{log_prefix} Polling transcription result")

        # Poll for completion
        while True:
            poll_response = requests.get(transcription_location, headers=headers)
            poll_data = poll_response.json()
            status = poll_data["status"]

            if status in ["Succeeded", "Failed"]:
                break

            time.sleep(10)

        if status == "Failed":
            logger.error(f"{log_prefix} Transcription failed: {poll_data}")
            return None

        # Fetch result
        files_url = poll_data["links"]["files"]
        files_response = requests.get(files_url, headers=headers)
        files_data = files_response.json()

        transcript_text = ""

        for file in files_data["values"]:
            result_file_url = file["links"]["contentUrl"]
            result_file = requests.get(result_file_url, headers=headers).json()
            combined = self.extract_speaker_transcript(result_file)
            transcript_text += combined

        logger.info(f"{log_prefix} Completed transcription")
        return transcript_text if transcript_text.strip() else None

    def extract_speaker_transcript(self, result_file):
        """Extracts speaker-separated transcript from Azure result file"""
        transcript = ""
        if "combinedRecognizedPhrases" in result_file:
            for phrase in result_file["combinedRecognizedPhrases"]:
                speaker = phrase.get("speaker", "Unknown")
                text = phrase.get("display", "")
                transcript += f"Speaker {speaker}: {text}\n"
        return transcript