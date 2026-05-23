"""Email notification service — sends via SMTP."""
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from ..config import settings

logger = logging.getLogger(__name__)


def send_email(to: str, subject: str, body: str) -> bool:
    """Send a plain-text email. Returns True on success."""
    if not settings.SMTP_HOST or settings.SMTP_HOST == "smtp.example.com":
        logger.warning("SMTP not configured, skipping email to %s", to)
        return False

    try:
        msg = MIMEMultipart()
        msg["From"] = settings.SMTP_FROM
        msg["To"] = to
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain", "utf-8"))

        if settings.SMTP_PORT == 465:
            with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                if settings.SMTP_USER:
                    server.login(settings.SMTP_USER, settings.SMTP_PASS)
                server.sendmail(settings.SMTP_FROM, to, msg.as_string())
        else:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.starttls()
                if settings.SMTP_USER:
                    server.login(settings.SMTP_USER, settings.SMTP_PASS)
                server.sendmail(settings.SMTP_FROM, to, msg.as_string())
        return True
    except Exception as e:
        logger.error("Failed to send email to %s: %s", to, e)
        return False


def send_approval_notification(to_email: str, dept_name: str, score: float):
    """Notify department that their assessment was approved."""
    subject = f"[{settings.APP_NAME}] {dept_name} 评级已通过"
    body = f"""\
{dept_name} 的三甲评审评级已通过审核。

总分: {score} 分
状态: ✅ 已通过

请登录系统查看详情。

--
{settings.APP_NAME}
"""
    return send_email(to_email, subject, body)


def send_rejection_notification(to_email: str, dept_name: str, score: float, feedback: str):
    """Notify department that their assessment was rejected."""
    subject = f"[{settings.APP_NAME}] {dept_name} 评级已退回"
    body = f"""\
{dept_name} 的三甲评审评级已被退回，需要整改后重新提交。

总分: {score} 分
状态: ❌ 已退回
退回意见: {feedback}

请登录系统查看详情并进行整改。

--
{settings.APP_NAME}
"""
    return send_email(to_email, subject, body)
