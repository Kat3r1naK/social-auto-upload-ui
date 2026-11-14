"""Run non-network regression tests with an isolated desktop configuration."""
import sys
import tempfile
import unittest
import shutil
from pathlib import Path
from worker import configure

with tempfile.TemporaryDirectory(prefix='sau-core-test-') as folder:
    configure(Path(folder), Path(folder))
    root = Path(__file__).resolve().parents[2]
    (Path(folder) / 'examples').mkdir()
    (Path(folder) / 'videos').mkdir()
    shutil.copyfile(root / 'examples/article.md', Path(folder) / 'examples/article.md')
    shutil.copyfile(root / 'videos/demo1.png', Path(folder) / 'videos/demo1.png')
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tests'))
    names = [
        'test_article_render.ArticleRenderTests',
        'test_facebook_uploader.FacebookCaptionTests',
        'test_facebook_uploader.FacebookCliTests',
        'test_facebook_uploader.FacebookStorageStateTests',
        'test_instagram_uploader.InstagramContractTests',
    ]
    result = unittest.TextTestRunner(verbosity=1).run(unittest.defaultTestLoader.loadTestsFromNames(names))
    sys.exit(0 if result.wasSuccessful() else 1)
