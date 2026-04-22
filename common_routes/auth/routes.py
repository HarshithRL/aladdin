from flask import render_template, request, redirect, url_for, session, flash
from . import auth_bp
from utils.user_login_utils import UserLoginUtilities
from custom_logger import logger
from utils.account_sql_utils import AccountSQLUtilities

user_login_utils = UserLoginUtilities()
account_utils = AccountSQLUtilities()

@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        email = request.form.get("email")
        password = request.form.get("password")
        
        success, message = user_login_utils.verify_user(email, password)
        
        if success:
            session.clear()
            session["user_is_logged_in"] = True
            session["user_id"] = email  # using email as user_id for now
            session["email"] = email
            # Default name to part of email if not available elsewhere
            session["user"] = email.split("@")[0] 
            
            # Check if admin
            session["is_admin_user"] = account_utils.is_admin_user(email)
            
            # Retrieve or generate Entra ID (required by some utils)
            user_account = account_utils.get_user_by_email(email)
            if user_account and user_account.get("microsoft_entra_user_id"):
                session["entra_id_user_id"] = user_account["microsoft_entra_user_id"]
            else:
                # Fallback to a generated UUID if real Entra ID is missing
                import uuid
                session["entra_id_user_id"] = str(uuid.uuid4())
                
            session.permanent = True
            
            return redirect(url_for("home"))
        else:
            flash(message, "error")
            return render_template("auth/login.html", error=message)

    return render_template("auth/login.html")

@auth_bp.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "POST":
        email = request.form.get("email")
        password = request.form.get("password")
        confirm_password = request.form.get("confirm_password")
        
        if password != confirm_password:
            return render_template("auth/signup.html", error="Passwords do not match.")

        success, message = user_login_utils.signup_user(email, password)
        
        if success:
            flash("Account created successfully. Please login.", "success")
            return redirect(url_for("auth.login"))
        else:
            return render_template("auth/signup.html", error=message)

    return render_template("auth/signup.html")

@auth_bp.route("/logout")
def logout():
    session.clear()
    flash("You have been logged out.", "info")
    return redirect(url_for("auth.login"))
