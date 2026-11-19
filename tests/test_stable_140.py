import hashlib
import json
import pathlib
import re
import subprocess
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
RELEASE_COMMIT = '756eb5e26ed2ab49383b7eb5c22e6781d5df62a6'


class TitleDeckReleaseChecks(unittest.TestCase):
    def test_manifest_version(self):
        package = json.loads((ROOT / 'package.json').read_text())
        manifest = json.loads((ROOT / 'plugin.json').read_text())
        self.assertEqual(package['version'], manifest['version'])

    def test_sha256_manifest(self):
        content = (ROOT / 'docs/RELEASE_SOURCE_SHA256_1.4.0.md').read_text()
        pairs = re.findall(r'\| `([^`]+)` \| `([0-9a-f]{64})` \|', content)
        self.assertEqual(len(pairs), 11)
        if not (ROOT / '.git').exists():
            self.skipTest('Release commit is unavailable in a source archive')
        commit = subprocess.run(
            ['git', 'cat-file', '-e', RELEASE_COMMIT + '^{commit}'], cwd=ROOT, capture_output=True,
        )
        if commit.returncode:
            self.skipTest('Fetch Git history to check official release hashes')
        for name, digest in pairs:
            blob = subprocess.check_output(['git', 'show', f'{RELEASE_COMMIT}:{name}'], cwd=ROOT)
            self.assertEqual(hashlib.sha256(blob).hexdigest(), digest, name)
