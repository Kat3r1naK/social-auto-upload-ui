"""Avatar failures are optional; local DOM fixtures do not certify live platforms."""
import asyncio
import base64
import io
import json
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from PIL import Image
from patchright.async_api import async_playwright
from utils.account_avatar import (
    PROFILE_CONTROLS, attach_account_avatar, browser_state, read_profile_image,
)

arguments = types.ModuleType("sau_commands.arguments")
arguments.resolve_account_file = lambda *_: Path("session.json")


class AvatarTests(unittest.IsolatedAsyncioTestCase):
    async def test_only_successful_account_operations_attempt_capture(self):
        for action, ok, expected in [("login", True, 1), ("check", True, 1),
                                     ("login", False, 0), ("publish", True, 0), ("schema", True, 0)]:
            with self.subTest(action=action, ok=ok), patch(
                "utils.account_avatar.read_account_avatar", new_callable=AsyncMock,
                return_value="encoded-image",
            ) as capture, patch.dict("sys.modules", {"sau_commands.arguments": arguments}):
                result = await attach_account_avatar(
                    {"action": action, "platform": "xiaohongshu", "account": "account"},
                    {"ok": ok, "message": "original"},
                )
                self.assertEqual(capture.await_count, expected)
                self.assertEqual(result.get("avatar"), "encoded-image" if expected else None)
                self.assertEqual(result["ok"], ok)
                self.assertEqual(result["message"], "original")

    async def test_capture_errors_and_timeouts_do_not_fail_login(self):
        for error in (RuntimeError("page unavailable"), asyncio.TimeoutError()):
            with patch("utils.account_avatar.read_account_avatar", new_callable=AsyncMock, side_effect=error), \
                    patch.dict("sys.modules", {"sau_commands.arguments": arguments}):
                result = await attach_account_avatar(
                    {"action": "login", "platform": "xiaohongshu", "account": "account"},
                    {"ok": True, "message": "login completed"},
                )
                self.assertEqual(result, {"ok": True, "message": "login completed"})

    async def test_capture_uses_unique_loaded_account_control_not_feed_avatar(self):
        root = Path(__file__).resolve().parents[1]
        metadata = root / ".venv/Lib/site-packages/patchright/driver/package/browsers.json"
        revision = next(item["revision"] for item in json.loads(metadata.read_text())["browsers"]
                        if item["name"] == "chromium")
        chrome = root / f"desktop/runtime/browsers/chromium-{revision}/chrome-win64/chrome.exe"
        async with async_playwright() as engine:
            browser = await engine.chromium.launch(executable_path=str(chrome), headless=True)
            try:
                page = await browser.new_page(device_scale_factor=2)
                image = io.BytesIO()
                Image.new("RGB", (64, 64), "blue").save(image, format="PNG")
                own = "data:image/png;base64," + base64.b64encode(image.getvalue()).decode()
                await page.set_content(f'<img class="feed-avatar" src="missing-feed.png">'
                                       f'<div class="user-info"><img class="user_avatar" '
                                       f'width="40" height="40" src="{own}"></div>')
                encoded = await read_profile_image(page, PROFILE_CONTROLS["xiaohongshu"][1])
                with Image.open(io.BytesIO(base64.b64decode(encoded))) as actual:
                    self.assertEqual(actual.size, (128, 128))
                    self.assertEqual(actual.getpixel((64, 64))[:3], (0, 0, 255))
                # Ambiguous account controls must never silently choose the first person.
                await page.locator(".user-info").evaluate("el => el.after(el.cloneNode(true))")
                with patch.object(page, "wait_for_function", new_callable=AsyncMock):
                    self.assertIsNone(await read_profile_image(page, PROFILE_CONTROLS["xiaohongshu"][1]))
            finally:
                await browser.close()


class AvatarStateTests(unittest.TestCase):
    def test_biliup_cookie_conversion_preserves_saved_session(self):
        with tempfile.TemporaryDirectory() as folder:
            account_file = Path(folder) / "session.json"
            source = {"cookie_info": {"cookies": [{"name": "SESSDATA", "value": "test"}]}}
            account_file.write_text(json.dumps(source))
            state = browser_state("bilibili", account_file)
            self.assertEqual(state["cookies"][0]["domain"], ".bilibili.com")
            self.assertEqual(json.loads(account_file.read_text()), source)


if __name__ == "__main__":
    unittest.main()
