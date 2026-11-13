"""FIXED plugin: uses batch["rows"] / batch["table_name"] (dict access).

The runtime hands plain dicts; access via key. Reference:
`references/runtime-api.md`, "`table_batches` shape".
"""


def process_writes(influxdb3_local, table_batches, args=None):
    for batch in table_batches:
        # CORRECT: batch is a dict.
        rows = batch["rows"]
        table_name = batch["table_name"]
        n = len(rows)
        influxdb3_local.info(f"got {n} rows from {table_name}")
