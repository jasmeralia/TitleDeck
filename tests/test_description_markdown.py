"""Regression coverage for the schema 1 Markdown description contract."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import main


class DescriptionMarkdown(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.settings = Path(temp.name) / 'titledeck.json'
        patcher = patch.object(main, 'settings_path', return_value=self.settings)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.plugin = main.Plugin()

    async def test_legacy_import_and_metadata_round_trip_through_backup(self):
        legacy = {'schema': 1, 'aliases': {'10': 'Title'}, 'descriptions': {'10': '*literal*'}}
        self.settings.write_text(json.dumps(legacy))
        self.assertEqual(main.load_state()['description_formats'], {})
        await self.plugin.save_description('3500000123', '**Genres:** Adventure', 'markdown')
        await self.plugin.create_backup()
        exported = await self.plugin.export_aliases()
        saved = json.loads(exported)
        self.assertEqual(saved['description_formats'], {'3500000123': 'markdown'})
        self.assertEqual(saved['descriptions']['10'], '*literal*')
        await self.plugin.save_description('3500000123', 'Plain again')
        self.assertEqual(main.load_state()['description_formats'], {})
        self.assertEqual(await self.plugin.restore_backup(), saved)
        await self.plugin.restore_original_game('3500000123')
        self.assertEqual(main.load_state()['description_formats'], {})
        self.assertEqual(await self.plugin.import_aliases(exported), saved)

    async def test_import_validates_formats_atomically_and_changes_only_incoming_entries(self):
        await self.plugin.save_description('332', '**one**', 'markdown')
        await self.plugin.save_description('333', '**two**', 'markdown')
        previous = self.settings.read_bytes()
        for invalid in ({'999': 'markdown'}, {'332': 'html'}, {'332': None}, ['markdown']):
            with self.assertRaises(ValueError):
                await self.plugin.import_aliases(json.dumps({
                    'schema': 1, 'aliases': {}, 'descriptions': {'332': 'replacement'},
                    'description_formats': invalid,
                }))
            self.assertEqual(self.settings.read_bytes(), previous)
        result = await self.plugin.import_aliases(json.dumps({
            'schema': 1, 'aliases': {}, 'descriptions': {'332': '**literal now**'},
        }))
        self.assertEqual(result['description_formats'], {'333': 'markdown'})
        result = await self.plugin.delete_description('333')
        self.assertEqual(result['description_formats'], {})
        self.assertEqual(result['descriptions'], {'332': '**literal now**'})
