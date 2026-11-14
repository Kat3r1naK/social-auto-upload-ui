"""Offline smoke test for packaged full Chromium, without any headless-shell install."""
import asyncio
import importlib


async def main():
    for driver in ('patchright', 'playwright'):
        api = importlib.import_module(driver + '.async_api')
        async with api.async_playwright() as engine:
            browser = await engine.chromium.launch(channel='chromium', headless=True)
            try:
                page = await browser.new_page()
                await page.set_content('<main>SAU offline runtime check</main>')
                assert await page.locator('main').inner_text() == 'SAU offline runtime check'
                print(driver + ': full Chromium headless mode OK')
            finally:
                await browser.close()


if __name__ == '__main__':
    asyncio.run(main())
