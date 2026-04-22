from flask import Blueprint, request, jsonify, session
from utils.account_sql_utils import AccountSQLUtilities
from custom_logger import logger

account_utils = AccountSQLUtilities()
from . import settings_bp

@settings_bp.route('/preferences', methods=['GET', 'POST'])
def user_preferences():
    logger.info('Entered /settings/preferences route')
    user_id = session.get('user_id')
    logger.info(f'user_id from session: {user_id}')
    if not user_id:
        logger.info('No user_id in session, returning 401')
        return jsonify({'error': 'Not logged in'}), 401

    if request.method == 'GET':
        logger.info('GET request received')
        user = account_utils.get_user_by_user_id(user_id)
        if not user:
            logger.info('User not found, returning 404')
            return jsonify({'error': 'User not found'}), 404
        
        # Log the raw values and their types
        logger.info(f'Raw preference values from DB: dark={user.get("is_dark_mode_enabled")}, type={type(user.get("is_dark_mode_enabled"))}')
        logger.info(f'Raw preference values from DB: emojis={user.get("is_emojis_enabled")}, type={type(user.get("is_emojis_enabled"))}')
        logger.info(f'Raw preference values from DB: ack={user.get("is_acknowledgement_enabled")}, type={type(user.get("is_acknowledgement_enabled"))}')
        
        return jsonify({
            'is_dark_mode_enabled': bool(user.get('is_dark_mode_enabled', 0)),
            'is_emojis_enabled': bool(user.get('is_emojis_enabled', 1)),
            'is_acknowledgement_enabled': bool(user.get('is_acknowledgement_enabled', 1)),
        })

    # POST: update preferences
    logger.info('POST request received')
    data = request.json
    logger.info(f'Received data: {data}')
    logger.info(f'Data types in request: {[(k, type(v)) for k, v in data.items()]}')
    
    try:
        # Only update preferences that are actually in the request data
        preferences_to_update = {}
        valid_preferences = ['is_dark_mode_enabled', 'is_emojis_enabled', 'is_acknowledgement_enabled']
        
        for pref in valid_preferences:
            if pref in data:
                preferences_to_update[pref] = data[pref]
        
        account_utils.set_user_preferences(user_id, **preferences_to_update)
        logger.info('User preferences updated successfully')
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f'Error updating user preferences: {e}')
        return jsonify({'success': False, 'error': str(e)}), 500 
    
@settings_bp.route('/theme', methods=['POST'])
def update_dark_mode_status():
    try:
        logger.info('Entered /settings/theme route')
        user_id = session.get('user_id')  # Fetch user ID from session
        data = request.get_json()  # Get JSON payload from the request
        is_dark_mode = data.get("is_dark_mode_enabled")  # Extract preference value
        logger.info(f"is_dark_mode: {is_dark_mode}")
        
        # Ensure the value is a valid boolean
        if is_dark_mode is None or not isinstance(is_dark_mode, bool):
            raise ValueError("Invalid value for is_dark_mode_enabled")
        is_dark_mode = 1 if is_dark_mode else 0
        
        # Update the database
        account_utils.update_dark_mode_status(user_id, is_dark_mode=is_dark_mode)
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f'Error updating dark mode: {e}')
        return jsonify({'success': False, 'error': str(e)}), 500

@settings_bp.route('/emojis', methods=['POST'])
def update_emoji_preference():
    try:
        logger.info('Entered /settings/emojis route')
        user_id = session.get('user_id')  # Fetch user ID from session
        data = request.get_json()  # Get JSON payload from the request
        is_emojis_enabled = data.get("is_emojis_enabled")  # Extract preference value
        logger.info(f"is_emojis_enabled: {is_emojis_enabled}")

        # Ensure the value is a valid boolean
        if is_emojis_enabled is None or not isinstance(is_emojis_enabled, bool):
            raise ValueError("Invalid value for is_emojis_enabled")
        is_emojis_enabled = 1 if is_emojis_enabled else 0

        # Update the database
        account_utils.update_emoji_preference(user_id, is_emojis_enabled=is_emojis_enabled)
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f'Error updating emoji preference: {e}')
        return jsonify({'success': False, 'error': str(e)}), 500

@settings_bp.route('/acknowledgments', methods=['POST'])
def update_acknowledgment_preference():
    try:
        logger.info('Entered /settings/acknowledgments route')
        user_id = session.get('user_id')  # Fetch user ID from session
        data = request.get_json()  # Get JSON payload from the request
        is_acknowledgement_enabled = data.get("is_acknowledgement_enabled")  # Extract preference value
        logger.info(f"is_acknowledgement_enabled: {is_acknowledgement_enabled}")

        # Ensure the value is a valid boolean
        if is_acknowledgement_enabled is None or not isinstance(is_acknowledgement_enabled, bool):
            raise ValueError("Invalid value for is_acknowledgement_enabled")
        is_acknowledgement_enabled = 1 if is_acknowledgement_enabled else 0

        # Update the database
        account_utils.update_acknowledgment_preference(user_id, is_acknowledgement_enabled=is_acknowledgement_enabled)
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f'Error updating acknowledgment preference: {e}')
        return jsonify({'success': False, 'error': str(e)}), 500

@settings_bp.route('/get_dark_mode_status', methods=['GET', 'POST'])
def get_dark_mode_status():
    try:
        logger.info('Entered /settings/preferences route')
        user_id = session.get('user_id')
        status = account_utils.get_dark_mode_status(user_id)
        return jsonify({'success': True, 'status': status})
    except Exception as e:
        logger.error(f'Error updating user preferences: {e}')
        return jsonify({'success': False, 'error': str(e)}), 500 