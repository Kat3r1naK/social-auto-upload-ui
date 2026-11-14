"""Prepare the existing upstream biliup runtime in the desktop resource directory."""
import sys
from pathlib import Path

from worker import configure

root = Path(__file__).resolve().parents[2]
directory = root / 'desktop/runtime/tool-preparation'
directory.mkdir(parents=True, exist_ok=True)
configure(directory, directory)
from uploader.bilibili_uploader import runtime

runtime.get_biliup_runtime_root = lambda: root / 'desktop/runtime/tools/biliup'
binary = runtime.ensure_biliup_binary(force_check=False)
print(f'Prepared biliup: {binary} ({runtime.read_local_biliup_version()})')
