"""企业微信/钉钉 Webhook 通知服务"""
import os
import json
from urllib.request import Request, urlopen


def _get_webhook_urls():
    return {
        "wecom": os.getenv("WECOM_WEBHOOK", ""),
        "dingtalk": os.getenv("DINGTALK_WEBHOOK", ""),
    }


def send_notification(title, content, msg_type="reject"):
    """向配置的 Webhook 发送通知"""
    urls = _get_webhook_urls()
    results = {}

    # 企业微信
    if urls["wecom"]:
        try:
            body = json.dumps({
                "msgtype": "markdown",
                "markdown": {"content": f"## {title}\n{content}"}
            }).encode()
            req = Request(urls["wecom"], data=body, headers={"Content-Type": "application/json"})
            urlopen(req, timeout=5)
            results["wecom"] = True
        except Exception as e:
            results["wecom"] = str(e)

    # 钉钉
    if urls["dingtalk"]:
        try:
            body = json.dumps({
                "msgtype": "markdown",
                "markdown": {"title": title, "text": f"## {title}\n{content}"}
            }).encode()
            req = Request(urls["dingtalk"], data=body, headers={"Content-Type": "application/json"})
            urlopen(req, timeout=5)
            results["dingtalk"] = True
        except Exception as e:
            results["dingtalk"] = str(e)

    return results
