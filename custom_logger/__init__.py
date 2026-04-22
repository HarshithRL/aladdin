# import logging
# import os
# from logging.handlers import TimedRotatingFileHandler
# from datetime import datetime
# from opencensus.ext.azure.log_exporter import AzureLogHandler

# if not os.path.exists("logs"):
#     os.makedirs("logs")

# # Create a detailed log format with only the file name
# log_format = (
#     "%(asctime)s - %(levelname)s - %(filename)s - %(funcName)s - "
#     "%(lineno)d - %(message)s"
# )

# # Get the current date
# current_date = datetime.now().strftime("%Y-%m-%d")

# # Create a file handler that creates a new file every day
# file_handler = TimedRotatingFileHandler(f"logs/app_{current_date}.log", when="midnight", interval=1)
# file_handler.suffix = "%Y-%m-%d"
# file_handler.setFormatter(logging.Formatter(log_format))

# # Create a stream handler
# stream_handler = logging.StreamHandler()
# stream_handler.setFormatter(logging.Formatter(log_format))

# # Configure the root logger
# logging.basicConfig(level=logging.INFO, handlers=[
#     file_handler, 
#     stream_handler
# ])


# noisy_loggers = [
#     "azure",
#     "azure.core.pipeline",
#     "azure.core.pipeline.policies.http_logging_policy",
#     "azure.core.pipeline.transport._base",
#     "azure.openai",
#     "werkzeug",
#     "flask",
# ]

# for name in noisy_loggers:
#     logging.getLogger(name).setLevel(logging.WARNING)
#     logging.getLogger(name).disabled = True

# logger = logging.getLogger()
# logger.setLevel(logging.INFO)

import logging
import os
import sys
from logging.handlers import TimedRotatingFileHandler
from datetime import datetime
from opencensus.ext.azure.log_exporter import AzureLogHandler

if not os.path.exists("logs"):
    os.makedirs("logs")

# Create a detailed log format with only the file name
log_format = (
    "%(asctime)s - %(levelname)s - %(filename)s - %(funcName)s - "
    "%(lineno)d - %(message)s"
)

# Get the current date
current_date = datetime.now().strftime("%Y-%m-%d")

# --- File handler (UTF-8 safe) ---
file_handler = TimedRotatingFileHandler(
    f"logs/app_{current_date}.log", when="midnight", interval=1, encoding="utf-8"
)
file_handler.suffix = "%Y-%m-%d"
file_handler.setFormatter(logging.Formatter(log_format))

# --- Stream handler (force UTF-8 safe write) ---
class SafeStreamHandler(logging.StreamHandler):
    def emit(self, record):
        try:
            super().emit(record)
        except UnicodeEncodeError:
            msg = self.format(record)
            safe_msg = msg.encode("utf-8", "replace").decode("utf-8")
            self.stream.write(safe_msg + self.terminator)
            self.flush()

stream_handler = SafeStreamHandler(sys.stdout)
stream_handler.setFormatter(logging.Formatter(log_format))

# --- Configure the root logger ---
logging.basicConfig(level=logging.INFO, handlers=[file_handler, stream_handler])

# --- Silence noisy loggers ---
noisy_loggers = [
    "azure",
    "azure.core.pipeline",
    "azure.core.pipeline.policies.http_logging_policy",
    "azure.core.pipeline.transport._base",
    "azure.openai",
    "werkzeug",
    "flask",
]
for name in noisy_loggers:
    logging.getLogger(name).setLevel(logging.WARNING)
    logging.getLogger(name).disabled = True

logger = logging.getLogger()
logger.setLevel(logging.INFO)