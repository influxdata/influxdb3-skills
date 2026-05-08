"""BROKEN plugin: uses batch.rows / batch.table_name (attribute access).

Symptom (when wired up as a WAL trigger): plugin logs show
  AttributeError: 'dict' object has no attribute 'rows'

Why: the runtime hands plain dicts to process_writes, even though the
upstream type docs describe a TableBatch class. Use dict access instead.

The fix is in `fixed.py`. Quirk reference: `quirks.md` entry 3.
"""


def process_writes(influxdb3_local, table_batches, args=None):
    for batch in table_batches:
        # WRONG: batch is a dict, not an object with attributes.
        n = len(batch.rows)                                 # AttributeError
        influxdb3_local.info(f"got {n} rows from {batch.table_name}")  # AttributeError
