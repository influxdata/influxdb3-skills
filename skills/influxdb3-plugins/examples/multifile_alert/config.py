"""Argument parsing for the multifile_alert plugin."""
from dataclasses import dataclass


@dataclass(frozen=True)
class AlertConfig:
    table: str
    field: str
    threshold: float

    @classmethod
    def from_args(cls, args):
        """Parse trigger arguments with sane defaults.

        Trigger arguments are always Mapping[str, str]. Cast to the right type here.
        """
        args = args or {}
        return cls(
            table=args.get("table", "sensors_demo"),
            field=args.get("field", "temp"),
            threshold=float(args.get("threshold", "75.0")),
        )
