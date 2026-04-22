import os
from agents import (
    Agent,
    HandoffInputData,
    ItemHelpers,
    OpenAIChatCompletionsModel,
    Runner,
    add_trace_processor,
    function_tool,
    handoff,
    set_default_openai_client,
    set_tracing_disabled,
    set_tracing_export_api_key,
    trace,
    RunContextWrapper
)
import json
import matplotlib.pyplot as plt
import pandas as pd
import json
import uuid
import tempfile
import logging
import os
from matplotlib.patches import FancyBboxPatch
import numpy as np
import os
import tempfile
from werkzeug.datastructures import FileStorage
from pandasql import sqldf
import pandas as pd
from io import StringIO
from custom_logger import logger
from utils.azure_utils import azure_blob_utils
from utils.azure_ai_search_utils import azure_search
from custom_agents.wrapper import UserInfo
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import uuid
import tempfile
import matplotlib.pyplot as plt
import tempfile
import os
import json

from typing import Optional, Union, List, Dict, Any

@function_tool
def search_document(
    wrapper: RunContextWrapper[UserInfo],
    query: str,
    file_id: Optional[str] = None,
    page_number: Optional[Union[str, int]] = None,
    top_k: int = 20
) -> str:
    """
    Search documents in Azure AI Search for regular chunks (non-Excel data).

    Args:
        wrapper: Context wrapper containing user information
        query: Search query string
        file_id: Optional file identifier
        page_number: Optional page number (can be string or int)
        top_k: Number of top results to return (default: 20)

    Returns:
        JSON string containing search results
    """
    logger.info(f"search_document called with query: {query}, file_id: {file_id}, page_number: {page_number}, top_k: {top_k}")

    # Validate and sanitize inputs
    try:
        # Ensure query is not empty
        if not query or not query.strip():
            logger.error("Empty query provided")
            return json.dumps({
                "error": "Query cannot be empty",
                "tool_type": "document_reader",
                "results": []
            })

        # Sanitize file_id
        if file_id is not None and (not isinstance(file_id, str) or not file_id.strip()):
            file_id = None

        # Sanitize and convert page_number
        if page_number is not None:
            if isinstance(page_number, int):
                page_number = str(page_number) if page_number > 0 else None
            elif isinstance(page_number, str):
                try:
                    # Try to convert string to int to validate it's a valid number
                    page_num = int(page_number.strip())
                    page_number = str(page_num) if page_num > 0 else None
                except (ValueError, AttributeError):
                    logger.warning(f"Invalid page_number format: {page_number}")
                    page_number = None
            else:
                page_number = None

        # Validate top_k - force to 20 unless extremely simple query
        if not isinstance(top_k, int) or top_k <= 0:
            top_k = 20

        # Build the keyword arguments for azure_search.query_documents dynamically
        search_kwargs = {
            "query": query.strip(),
            "user_id": wrapper.context.user_id,
            "session_id": wrapper.context.session_id,
            "top_k": top_k,
            "rerank_top_k": 20,
        }

        # Only add optional parameters if they have valid values
        if file_id:
            search_kwargs["file_id"] = file_id
        if page_number:
            search_kwargs["page_number"] = page_number

        # Execute the search
        results = azure_search.query_documents(**search_kwargs)

        logger.info(f"Search completed successfully. Found {len(results) if isinstance(results, list) else 'unknown'} results")
        logger.debug(json.dumps(results, indent=2))

        return json.dumps({
            "tool_type": "document_reader",
            "agent_used": "Relay Document Analyst Agent",
            "tool_text": query.strip(),
            "results": results
        })

    except Exception as e:
        logger.error(f"Error in search_document: {str(e)}", exc_info=True)
        return json.dumps({
            "error": f"Search failed: {str(e)}",
            "tool_type": "document_reader",
            "tool_text": query,
            "file_id": file_id,
            "page_number": page_number,
            "results": []
        })

@function_tool
def search_excel(
    wrapper: RunContextWrapper[UserInfo],
    pandas_sql_query: str,
    file_id: str,
    sheet_name: Optional[str] = None
) -> str:
    """
    Search Excel files using pandas SQL queries on dataframes.
    This tool also returns the original dataframe content for potential charting.

    Args:
        wrapper: Context wrapper containing user information
        pandas_sql_query: SQL query to execute on the dataframe (use 'df' as table name)
        file_id: File identifier for the Excel file
        sheet_name: Optional sheet name for Excel files

    Returns:
        JSON string containing query results, and the original dataframe content.
    """
    logger.info(f"search_excel called with pandas_sql_query: {pandas_sql_query}, file_id: {file_id}, sheet_name: {sheet_name}")

    try:
        # Validate inputs
        if not pandas_sql_query or not pandas_sql_query.strip():
            logger.error("Empty pandas SQL query provided")
            return json.dumps({
                "error": "Pandas SQL query cannot be empty",
                "tool_type": "excel_reader",
                "results": []
            })

        if not file_id or not file_id.strip():
            logger.error("Empty file_id provided")
            return json.dumps({
                "error": "File ID cannot be empty",
                "tool_type": "excel_reader",
                "results": []
            })

        # Sanitize sheet_name
        if sheet_name is not None and (not isinstance(sheet_name, str) or not sheet_name.strip()):
            sheet_name = None

        # First, search for Excel chunks containing the dataframe
        search_kwargs = {
            "query": "*",  # Generic query to find Excel chunks
            "user_id": wrapper.context.user_id,
            "session_id": wrapper.context.session_id,
            "file_id": file_id,
            "top_k": 50,  # Get more results to find the right sheet
            "rerank_top_k": 20,
        }

        if sheet_name:
            search_kwargs["sheet_name"] = sheet_name

        # Execute the search to get chunks
        chunks = azure_search.query_documents(**search_kwargs)

        # Find the chunk with the dataframe content
        dataframe_content = None
        for chunk in chunks:
            if isinstance(chunk, dict) and 'content' in chunk:
                content = chunk['content']
                if sheet_name:
                    chunk_sheet = chunk.get('sheet_name', '')
                    if chunk_sheet and chunk_sheet.strip() and chunk_sheet != "None":
                        if chunk_sheet == sheet_name:
                            dataframe_content = content
                            break
                else:
                    chunk_sheet = chunk.get('sheet_name', '')
                    if chunk_sheet and chunk_sheet.strip() and chunk_sheet != "None":
                        dataframe_content = content
                        break

        if not dataframe_content:
            logger.error("No dataframe content found for the specified file and sheet")
            return json.dumps({
                "error": "No dataframe content found for the specified file and sheet",
                "tool_type": "excel_reader",
                "results": []
            })

        # Recreate the dataframe from the string content
        try:
            df = pd.read_json(StringIO(dataframe_content), orient='records')
            logger.info(f"THIS IS THE ONE I GET FROM AZURE: {df.columns}")
        except Exception as parse_error:
            logger.error(f"Error parsing dataframe content: {str(parse_error)}")
            return json.dumps({
                "error": f"Error parsing dataframe content: {str(parse_error)}",
                "tool_type": "excel_reader",
                "results": []
            })

        # Execute the pandas SQL query
        try:
            local_env = {'df': df}
            result_df = sqldf(pandas_sql_query.strip(), local_env)
            results = result_df.to_dict('records')

            logger.info(f"Excel search completed successfully. Found {len(results)} results")
            logger.debug(json.dumps(results, indent=2, default=str))

            return json.dumps({
                "tool_type": "excel_reader",
                "agent_used": "Relay Document Analyst Agent",
                "tool_text": pandas_sql_query.strip(),
                "file_id": file_id,
                "sheet_name": sheet_name,
                "results": results
            })

        except Exception as sql_error:
            logger.error(f"Error executing pandas SQL query: {str(sql_error)}")
            return json.dumps({
                "error": f"Error executing pandas SQL query: {str(sql_error)}",
                "tool_type": "excel_reader",
                "tool_text": pandas_sql_query,
                "file_id": file_id,
                "sheet_name": sheet_name,
                "results": []
            })

    except Exception as e:
        logger.error(f"Error in search_excel: {str(e)}", exc_info=True)
        return json.dumps({
            "error": f"Excel search failed: {str(e)}",
            "tool_type": "excel_reader",
            "tool_text": pandas_sql_query,
            "file_id": file_id,
            "sheet_name": sheet_name,
            "results": []
        })
    

@function_tool
def create_chart(
    wrapper: RunContextWrapper, # Assuming RunContextWrapper is available
    data_records: str,
    chart_type: str = "bar",
    chart_title: Optional[str] = None,
    x_column: Optional[str] = None,
    y_column: Optional[str] = None,
    file_id: Optional[str] = None,
    sheet_name: Optional[str] = None
) -> str:
    """
    Create a chart from provided data records with a 'White & Moody' aesthetic.

    Args:
        wrapper: Context wrapper containing user information.
        data_records: JSON string that you get when you use df.to_json(orient='records').
        chart_type: Chart type ('bar', 'line', 'pie', 'scatter', 'histogram').
        chart_title: Optional chart title.
        x_column: X-axis column name.
        y_column: Y-axis column name.
        file_id: Optional file ID for context.
        sheet_name: Optional sheet name for context.
    Returns:
        JSON string containing chart URL, chart type, preview, and dataframe recreation code.
    """

    logger.info(f"create_chart called with chart_type: {chart_type}, x_column: {x_column}, y_column: {y_column}")

    if not data_records:
        return json.dumps({
            "error": "No data records provided for chart creation.",
            "tool_type": "chart_creator",
            "chart_url": None,
            "dataframe_recreation_code": None
        })

    try:
        result_df = pd.read_json(StringIO(data_records), orient='records')
        logger.info(f"Columns: {list(result_df.columns)}")
        logger.info(f"Number of rows: {len(result_df)}")
        logger.info(f"Number of columns: {len(result_df.columns)}")
        logger.info(f"Sample data:\n{result_df.head().to_dict(orient='records')}")
    except Exception as e:
        logger.error(f"Failed to parse data_records: {e}")
        return json.dumps({
            "error": f"Invalid data_records format. Expected JSON string of list of dicts. Details: {str(e)}",
            "tool_type": "chart_creator",
            "chart_url": None,
            "dataframe_recreation_code": None
        })

    # Validate chart_type
    valid_chart_types = ['bar', 'line', 'pie', 'scatter', 'histogram']
    if chart_type not in valid_chart_types:
        logger.warning(f"Invalid chart_type '{chart_type}' provided. Defaulting to 'bar'.")
        chart_type = 'bar' # Default to bar chart

    # --- White & Moody Style Settings ---
    light_bg = '#F5F7FA' # Very light gray for overall figure background
    plot_bg = '#FFFFFF'  # Pure white for the main plot area
    dark_text_color = '#34495E' # Deep blue-gray for main text (title, bold labels)
    light_text_color = '#7F8C8D' # Muted gray for axes labels, ticks
    
    # Accent colors - vibrant but not overly saturated, for data elements
    accent_palette = [
        '#3498DB',  # Strong Blue (primary accent, like the main bars)
        '#2ECC71',  # Emerald Green
        '#E74C3C',  # Pomegranate Red
        '#9B59B6',  # Amethyst
        '#F1C40F',  # Sunshine Yellow
        '#1ABC9C',  # Turquoise
        '#95A5A6',  # Asbestos (muted gray for subtle elements)
        '#D35400'   # Pumpkin Orange
    ]
    
    grid_color = '#E0E0E0' # Very light, subtle grid lines
    line_edge_color = '#BDC3C7' # Slightly darker gray for subtle borders/edges

    # Apply Matplotlib RCParams for consistent styling
    plt.style.use('seaborn-v0_8-white') # Clean base style
    plt.rcParams['font.family'] = 'sans-serif'
    plt.rcParams['font.sans-serif'] = ['Roboto', 'Open Sans', 'Arial', 'Helvetica Neue']
    plt.rcParams['axes.facecolor'] = plot_bg
    plt.rcParams['figure.facecolor'] = light_bg
    plt.rcParams['savefig.facecolor'] = light_bg
    plt.rcParams['text.color'] = dark_text_color
    plt.rcParams['axes.labelcolor'] = light_text_color
    plt.rcParams['xtick.color'] = light_text_color
    plt.rcParams['ytick.color'] = light_text_color
    plt.rcParams['grid.color'] = grid_color
    plt.rcParams['grid.linestyle'] = '--'
    plt.rcParams['grid.linewidth'] = 0.8
    plt.rcParams['axes.edgecolor'] = grid_color # Subtle border for plot area
    plt.rcParams['axes.linewidth'] = 0.5 # Thin border

    # Generate unique filename
    chart_filename = f"chart_{uuid.uuid4().hex[:8]}.png"

    # Create figure and axis using the object-oriented interface
    fig, ax = plt.subplots(figsize=(10, 6), dpi=100)

    # Set chart title
    if chart_title:
        ax.set_title(chart_title, fontsize=18, fontweight='bold', color=dark_text_color, loc='center', pad=20)
    else:
        title_suffix = ""
        if file_id:
            title_suffix += f" from {file_id}"
        if sheet_name:
            title_suffix += f" (Sheet: {sheet_name})"
        ax.set_title(f"Generated Chart{title_suffix}", fontsize=18, fontweight='bold', color=dark_text_color, loc='center', pad=20)

    try:
        if chart_type == "bar":
            if x_column and y_column and x_column in result_df.columns and y_column in result_df.columns:
                x_data = result_df[x_column]
                y_data = result_df[y_column]
            else:
                numeric_cols = result_df.select_dtypes(include=['number']).columns
                non_numeric_cols = result_df.select_dtypes(exclude=['number']).columns
                if len(non_numeric_cols) > 0 and len(numeric_cols) > 0:
                    x_column = non_numeric_cols[0]
                    y_column = numeric_cols[0]
                    x_data = result_df[x_column]
                    y_data = result_df[y_column]
                    logger.info(f"Auto-selected '{x_column}' and '{y_column}' for bar chart.")
                else:
                    raise ValueError("Insufficient or inappropriate columns for bar chart (need one categorical, one numeric).")

            bar_width = 0.7 # Adjust bar width for spacing

            # Custom rounded bars with multi-colors
            for i, (x_val, y_val) in enumerate(zip(range(len(x_data)), y_data)): # Use index for x-positioning of bars
                color = accent_palette[i % len(accent_palette)] # Cycle through colors
                rect = FancyBboxPatch(
                    (x_val - bar_width / 2, 0), # x, y bottom-left
                    bar_width,             # width
                    y_val,                 # height
                    boxstyle="round,pad=0.2,rounding_size=0.1", # Rounded corners
                    fc=color,              # Face color
                    ec=line_edge_color,    # Subtle edge color
                    alpha=0.9,             # Slightly transparent
                    mutation_scale=0.5
                )
                ax.add_patch(rect)
            
            ax.set_xticks(range(len(x_data)))
            ax.set_xticklabels(x_data) # Set actual labels
            ax.set_xlabel(x_column, fontsize=12, labelpad=10)
            ax.set_ylabel(y_column, fontsize=12, labelpad=10)
            ax.set_ylim(bottom=0, top=max(y_data) * 1.1) # Ensure bars start from 0
            ax.grid(axis='y', alpha=0.7) # Only horizontal grid

        elif chart_type == "line":
            if x_column and y_column and x_column in result_df.columns and y_column in result_df.columns:
                x_data = result_df[x_column]
                y_data = result_df[y_column]
            else:
                # Auto-detect for line chart: try first two columns if suitable
                if len(result_df.columns) >= 2:
                    x_column = result_df.columns[0]
                    y_column = result_df.columns[1]
                    x_data = result_df[x_column]
                    y_data = result_df[y_column]
                    logger.info(f"Auto-selected '{x_column}' and '{y_column}' for line chart.")
                else:
                    raise ValueError("Insufficient columns for line chart (need at least two columns).")

            ax.plot(x_data, y_data,
                    marker='o', markersize=8, linestyle='-', linewidth=2.5,
                    color=accent_palette[0], alpha=0.9,
                    markerfacecolor=plot_bg, markeredgecolor=accent_palette[0], markeredgewidth=1.5)
            ax.set_xlabel(x_column, fontsize=12, labelpad=10)
            ax.set_ylabel(y_column, fontsize=12, labelpad=10)
            ax.grid(True, alpha=0.7)

        elif chart_type == "pie":
            if x_column and y_column and x_column in result_df.columns and y_column in result_df.columns:
                labels_data = result_df[x_column]
                values_data = result_df[y_column]
            else:
                numeric_cols = result_df.select_dtypes(include=['number']).columns
                non_numeric_cols = result_df.select_dtypes(exclude=['number']).columns
                if len(non_numeric_cols) > 0 and len(numeric_cols) > 0:
                    x_column = non_numeric_cols[0]
                    y_column = numeric_cols[0]
                    labels_data = result_df[x_column]
                    values_data = result_df[y_column]
                    logger.info(f"Auto-selected '{x_column}' and '{y_column}' for pie chart.")
                else:
                    raise ValueError("Insufficient or inappropriate columns for pie chart (need one categorical, one numeric).")

            pie_colors = accent_palette[:len(labels_data)] # Use as many colors as needed
            if len(labels_data) > len(accent_palette):  # Fallback if more slices than defined colors
                cmap = plt.cm.get_cmap('Paired')
                pie_colors = [cmap(i / len(labels_data)) for i in range(len(labels_data))]

            
            ax.pie(values_data, labels=labels_data,
                    autopct='%1.1f%%', colors=pie_colors,
                    wedgeprops={'edgecolor': plot_bg, 'linewidth': 2.5}, # Prominent white separation
                    pctdistance=0.85, # Push percentages closer to center
                    textprops={'fontsize': 11, 'color': dark_text_color, 'fontweight': 'bold'})
            ax.set_aspect('equal') # Ensure circular pie
            ax.legend(
                loc='upper left', # Changed to upper left for better external anchoring
                bbox_to_anchor=(1.05, 1), # Moved slightly to the right of the plot area
                frameon=False,
                fontsize=10,
                labelcolor=light_text_color
            )
            fig.tight_layout(rect=[0, 0, 0.8, 1])  # Give space on the right for legend

        elif chart_type == "scatter":
            if x_column and y_column and x_column in result_df.columns and y_column in result_df.columns:
                x_data = result_df[x_column]
                y_data = result_df[y_column]
            else:
                numeric_cols = result_df.select_dtypes(include=['number']).columns
                if len(numeric_cols) >= 2:
                    x_column = numeric_cols[0]
                    y_column = numeric_cols[1]
                    x_data = result_df[x_column]
                    y_data = result_df[y_column]
                    logger.info(f"Auto-selected '{x_column}' and '{y_column}' for scatter plot.")
                else:
                    raise ValueError("Insufficient or inappropriate columns for scatter plot (need at least two numeric columns).")

            ax.scatter(x_data, y_data,
                       color=accent_palette[1], s=120, alpha=0.8,
                       edgecolor=line_edge_color, linewidth=1.5) # Subtle edge
            ax.set_xlabel(x_column, fontsize=12, labelpad=10)
            ax.set_ylabel(y_column, fontsize=12, labelpad=10)
            ax.grid(True, alpha=0.7)

        elif chart_type == "histogram":
            if y_column and y_column in result_df.columns:
                data_for_hist = result_df[y_column]
            else:
                numeric_cols = result_df.select_dtypes(include=['number']).columns
                if len(numeric_cols) > 0:
                    y_column = numeric_cols[0]
                    data_for_hist = result_df[y_column]
                    logger.info(f"Auto-selected '{y_column}' for histogram.")
                else:
                    raise ValueError("No numeric columns found for histogram.")

            ax.hist(data_for_hist, bins=15,
                    color=accent_palette[0], alpha=0.9,
                    edgecolor=line_edge_color, linewidth=0.5) # Soft edge
            ax.set_xlabel(y_column, fontsize=12, labelpad=10)
            ax.set_ylabel('Frequency', fontsize=12, labelpad=10)
            ax.grid(axis='y', alpha=0.7)

        else: # This case should ideally not be reached due to initial validation
            raise ValueError("Unsupported chart type after validation.")

        # Common plot adjustments
        for spine in ax.spines.values():
            spine.set_visible(False) # Remove outer spines for a clean look

        ax.tick_params(axis='x', length=0) # Remove tick marks
        ax.tick_params(axis='y', length=0) # Remove tick marks

        # Rotate x-axis labels if too many or long
        if chart_type in ['bar', 'line', 'histogram'] and len(ax.get_xticklabels()) > 5:
             plt.setp(ax.get_xticklabels(), rotation=45, ha='right')

        plt.tight_layout() # Adjust layout to prevent labels/titles from overlapping

        # Save chart to a temporary PNG file
        tmp_file_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp_file:
                plt.savefig(tmp_file.name, dpi=300, bbox_inches='tight')
                tmp_file_path = tmp_file.name

            chart_url = None
            # Prepare file for upload
            with open(tmp_file_path, 'rb') as f:
                uploadable_file = FileStorage(stream=f, filename=chart_filename, content_type='image/png')

                # Upload to blob storage
                chart_url = azure_blob_utils.upload_file(
                    file=uploadable_file,
                    user_id=wrapper.context.user_id,
                    session_id=wrapper.context.session_id,
                    folder="relaychat"
                )
            logger.info(f"Chart uploaded successfully: {chart_url}")
        finally:
            # Always clean up the temp file if it was created
            if tmp_file_path and os.path.exists(tmp_file_path):
                os.unlink(tmp_file_path)

        plt.close(fig) # Close the figure to free up memory

        return json.dumps({
            "tool_type": "chart_creator",
            "agent_used": "Relay Document Analyst Agent",
            "chart_type": chart_type,
            "chart_url": chart_url,
        })

    except Exception as chart_gen_error:
        logger.error(f"Error during chart generation: {str(chart_gen_error)}", exc_info=True)
        # Ensure figure is closed on error
        if 'fig' in locals() and fig:
            plt.close(fig)
        return json.dumps({
            "error": f"Error during chart generation: {str(chart_gen_error)}",
            "tool_type": "chart_creator",
            "chart_url": None,
            "dataframe_recreation_code": None
        })

